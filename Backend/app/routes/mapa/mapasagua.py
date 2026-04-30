import json
from typing import Any

from fastapi import APIRouter, Query, HTTPException
from fastapi.responses import JSONResponse
from psycopg.types.json import Json

from app.db import get_conn

router = APIRouter(prefix="/mapasagua", tags=["mapasagua"])


# ============================================================
# Helpers
# ============================================================
def _feature_from_row(row):
    (
        pid,
        diam,
        material,
        typ,
        estado,
        flow_func,
        style,
        props,
        active,
        from_node,
        to_node,
        length_m,
        roughness,
        is_open,
        geometry_json,
    ) = row

    if not geometry_json:
        return None

    geom = json.loads(geometry_json)
    connected = bool(from_node and to_node and str(from_node) != str(to_node))

    return {
        "type": "Feature",
        "id": pid,
        "properties": {
            "id": pid,
            "diametro_mm": diam,
            "material": material,
            "type": typ,
            "estado": estado,
            "flow_func": flow_func,
            "style": style or {},
            "props": props or {},
            "active": bool(active),
            "from_node": from_node,
            "to_node": to_node,
            "connected": connected,
            "length_m": float(length_m) if length_m is not None else None,
            "roughness": float(roughness) if roughness is not None else None,
            "is_open": bool(is_open),
        },
        "geometry": geom,
    }


def _pipe_select_sql(where: str = "") -> str:
    return f"""
      select
        p.id::text as id,
        p.diametro_mm,
        p.material,
        p.type,
        p.estado,
        p.flow_func,
        p.style,
        p.props,
        coalesce(p.active, true) as active,
        p.from_node::text as from_node,
        p.to_node::text as to_node,
        coalesce(p.length_m, infraestructura.st_length(p.geom::geography)) as length_m,
        p.roughness,
        coalesce(p.is_open, true) as is_open,
        infraestructura.st_asgeojson(p.geom) as geometry_json
      from "MapasAgua".pipes p
      {where}
    """


# ============================================================
# GET pipes GeoJSON
# /mapa/mapasagua/pipes
# /mapa/mapasagua/pipes?min_lng=&min_lat=&max_lng=&max_lat=
# ============================================================
@router.get("/pipes")
def get_pipes(
    min_lng: float | None = Query(default=None),
    min_lat: float | None = Query(default=None),
    max_lng: float | None = Query(default=None),
    max_lat: float | None = Query(default=None),
):
    where = ""
    params: list[Any] = []

    if None not in (min_lng, min_lat, max_lng, max_lat):
        where = """
          where infraestructura.st_intersects(
            p.geom,
            infraestructura.st_makeenvelope(%s, %s, %s, %s, 4326)
          )
        """
        params.extend([min_lng, min_lat, max_lng, max_lat])

    sql = _pipe_select_sql(where)

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(sql, params)
        rows = cur.fetchall()

    features = []
    for row in rows:
        feat = _feature_from_row(row)
        if feat:
            features.append(feat)

    return JSONResponse({"type": "FeatureCollection", "features": features})


# ============================================================
# GET extent
# /mapa/mapasagua/pipes/extent
# ============================================================
@router.get("/pipes/extent")
def pipes_extent():
    sql = """
      select
        min(infraestructura.st_xmin(geom)) as min_lng,
        min(infraestructura.st_ymin(geom)) as min_lat,
        max(infraestructura.st_xmax(geom)) as max_lng,
        max(infraestructura.st_ymax(geom)) as max_lat
      from "MapasAgua".pipes
      where geom is not null
    """

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(sql)
        row = cur.fetchone()

    if not row or row[0] is None:
        return {
            "min_lng": None,
            "min_lat": None,
            "max_lng": None,
            "max_lat": None,
        }

    return {
        "min_lng": row[0],
        "min_lat": row[1],
        "max_lng": row[2],
        "max_lat": row[3],
    }


# ============================================================
# GET pipe por ID
# /mapa/mapasagua/pipes/{pipe_id}
# ============================================================
@router.get("/pipes/{pipe_id}")
def get_pipe(pipe_id: str):
    sql = _pipe_select_sql("where p.id::text = %s limit 1")

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(sql, [pipe_id])
        row = cur.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Pipe not found")

    feat = _feature_from_row(row)
    if not feat:
        raise HTTPException(status_code=404, detail="Pipe geometry not found")

    return JSONResponse(feat)


# ============================================================
# PATCH pipe propiedades
# /mapa/mapasagua/pipes/{pipe_id}
# ============================================================
@router.patch("/pipes/{pipe_id}")
def patch_pipe(pipe_id: str, body: dict[str, Any]):
    allowed = {
        "diametro_mm",
        "material",
        "type",
        "estado",
        "flow_func",
        "style",
        "props",
        "active",
        "is_open",
        "roughness",
        "from_node",
        "to_node",
    }

    unknown = [k for k in body.keys() if k not in allowed]
    if unknown:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown fields: {', '.join(unknown)}",
        )

    if not body:
        raise HTTPException(status_code=400, detail="Empty body")

    if "from_node" in body and "to_node" in body:
        if body.get("from_node") and body.get("to_node") and str(body["from_node"]) == str(body["to_node"]):
            raise HTTPException(
                status_code=400,
                detail="from_node y to_node no pueden ser iguales",
            )

    sets = []
    params: list[Any] = []

    for k in allowed:
        if k not in body:
            continue

        val = body[k]

        if k in ("style", "props") and isinstance(val, (dict, list)):
            sets.append(f"{k} = %s")
            params.append(Json(val))
        elif k in ("from_node", "to_node"):
            sets.append(f"{k} = %s::uuid")
            params.append(val)
        else:
            sets.append(f"{k} = %s")
            params.append(val)

    params.append(pipe_id)

    sql = f"""
      update "MapasAgua".pipes
      set {", ".join(sets)},
          length_m = coalesce(length_m, infraestructura.st_length(geom::geography)),
          updated_at = now()
      where id::text = %s
      returning
        id::text as id,
        diametro_mm,
        material,
        type,
        estado,
        flow_func,
        style,
        props,
        coalesce(active, true) as active,
        from_node::text as from_node,
        to_node::text as to_node,
        coalesce(length_m, infraestructura.st_length(geom::geography)) as length_m,
        roughness,
        coalesce(is_open, true) as is_open,
        infraestructura.st_asgeojson(geom) as geometry_json
    """

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(sql, params)
        row = cur.fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Pipe not found")

        conn.commit()

    feat = _feature_from_row(row)
    if not feat:
        raise HTTPException(status_code=404, detail="Pipe geometry not found")

    return JSONResponse(feat)


# ============================================================
# PATCH conectar pipe
# /mapa/mapasagua/pipes/{pipe_id}/connect
# ============================================================
@router.patch("/pipes/{pipe_id}/connect")
def connect_pipe_mapasagua(pipe_id: str, body: dict[str, Any]):
    from_node = body.get("from_node")
    to_node = body.get("to_node")

    if not from_node or not to_node:
        raise HTTPException(status_code=400, detail="Falta from_node o to_node")

    if str(from_node) == str(to_node):
        raise HTTPException(
            status_code=400,
            detail="from_node y to_node no pueden ser iguales",
        )

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT count(*)::int
            FROM "MapasAgua".nodes
            WHERE id::text IN (%s, %s)
            """,
            (from_node, to_node),
        )

        n = cur.fetchone()[0]

        if n < 2:
            raise HTTPException(
                status_code=400,
                detail="Uno o ambos nodos no existen",
            )

        cur.execute(
            """
            UPDATE "MapasAgua".pipes
            SET
              from_node = %s::uuid,
              to_node = %s::uuid,
              length_m = coalesce(length_m, infraestructura.st_length(geom::geography)),
              updated_at = now()
            WHERE id::text = %s
            RETURNING
              id::text as id,
              from_node::text as from_node,
              to_node::text as to_node,
              length_m::double precision as length_m
            """,
            (from_node, to_node, pipe_id),
        )

        row = cur.fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Pipe not found")

        conn.commit()

    return {
        "ok": True,
        "pipe_id": row[0],
        "from_node": row[1],
        "to_node": row[2],
        "length_m": row[3],
    }


# ============================================================
# PATCH geometry recorrido
# /mapa/mapasagua/pipes/{pipe_id}/geometry
# ============================================================
@router.patch("/pipes/{pipe_id}/geometry")
def patch_pipe_geometry(pipe_id: str, body: dict[str, Any]):
    geom = body.get("geometry") if isinstance(body, dict) and "geometry" in body else body

    if not isinstance(geom, dict):
        raise HTTPException(
            status_code=400,
            detail="geometry must be a GeoJSON object",
        )

    gtype = geom.get("type")

    if gtype not in ("LineString", "MultiLineString"):
        raise HTTPException(
            status_code=400,
            detail="geometry.type must be LineString or MultiLineString",
        )

    sql = """
      update "MapasAgua".pipes
      set
        geom = infraestructura.st_setsrid(
                infraestructura.st_geomfromgeojson(%s),
                4326
              ),
        length_m = infraestructura.st_length(
                infraestructura.st_setsrid(
                  infraestructura.st_geomfromgeojson(%s),
                  4326
                )::geography
              ),
        updated_at = now()
      where id::text = %s
      returning
        id::text as id,
        diametro_mm,
        material,
        type,
        estado,
        flow_func,
        style,
        props,
        coalesce(active, true) as active,
        from_node::text as from_node,
        to_node::text as to_node,
        coalesce(length_m, infraestructura.st_length(geom::geography)) as length_m,
        roughness,
        coalesce(is_open, true) as is_open,
        infraestructura.st_asgeojson(geom) as geometry_json
    """

    geom_json = json.dumps(geom)

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(sql, [geom_json, geom_json, pipe_id])
        row = cur.fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Pipe not found")

        conn.commit()

    feat = _feature_from_row(row)
    if not feat:
        raise HTTPException(status_code=404, detail="Pipe geometry not found")

    return JSONResponse(feat)


# ============================================================
# POST create pipe
# /mapa/mapasagua/pipes
# ============================================================
@router.post("/pipes")
def create_pipe(body: dict[str, Any]):
    geom = body.get("geometry")
    props = body.get("properties") or {}

    if not isinstance(geom, dict):
        raise HTTPException(status_code=400, detail="geometry is required")

    gtype = geom.get("type")

    if gtype not in ("LineString", "MultiLineString"):
        raise HTTPException(
            status_code=400,
            detail="geometry.type must be LineString or MultiLineString",
        )

    diametro_mm = props.get("diametro_mm")
    material = props.get("material")
    typ = props.get("type") or "WATER"
    estado = props.get("estado") or "OK"
    flow_func = props.get("flow_func") or "DISTRIBUCION"
    active = props.get("active", True)
    is_open = props.get("is_open", True)
    roughness = props.get("roughness")
    from_node = props.get("from_node")
    to_node = props.get("to_node")

    if from_node and to_node and str(from_node) == str(to_node):
        raise HTTPException(
            status_code=400,
            detail="from_node y to_node no pueden ser iguales",
        )

    props_json = props.get("props") or {}
    style_json = props.get("style") or {}

    sql = """
      insert into "MapasAgua".pipes
        (
          id,
          geom,
          diametro_mm,
          material,
          type,
          estado,
          flow_func,
          props,
          style,
          active,
          is_open,
          roughness,
          from_node,
          to_node,
          length_m,
          created_at,
          updated_at
        )
      values
        (
          gen_random_uuid(),
          infraestructura.st_setsrid(infraestructura.st_geomfromgeojson(%s), 4326),
          %s,
          %s,
          %s,
          %s,
          %s,
          %s::jsonb,
          %s::jsonb,
          %s,
          %s,
          %s,
          %s::uuid,
          %s::uuid,
          infraestructura.st_length(
            infraestructura.st_setsrid(
              infraestructura.st_geomfromgeojson(%s),
              4326
            )::geography
          ),
          now(),
          now()
        )
      returning
        id::text as id,
        diametro_mm,
        material,
        type,
        estado,
        flow_func,
        style,
        props,
        coalesce(active, true) as active,
        from_node::text as from_node,
        to_node::text as to_node,
        coalesce(length_m, infraestructura.st_length(geom::geography)) as length_m,
        roughness,
        coalesce(is_open, true) as is_open,
        infraestructura.st_asgeojson(geom) as geometry_json
    """

    geom_json = json.dumps(geom)

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            sql,
            [
                geom_json,
                diametro_mm,
                material,
                typ,
                estado,
                flow_func,
                json.dumps(props_json),
                json.dumps(style_json),
                active,
                is_open,
                roughness,
                from_node,
                to_node,
                geom_json,
            ],
        )

        row = cur.fetchone()
        conn.commit()

    feat = _feature_from_row(row)

    if not feat:
        raise HTTPException(
            status_code=500,
            detail="Pipe created but geometry could not be returned",
        )

    return JSONResponse(feat)


# ============================================================
# DELETE pipe
# /mapa/mapasagua/pipes/{pipe_id}
# ============================================================
@router.delete("/pipes/{pipe_id}")
def delete_pipe(pipe_id: str):
    sql = """
      delete from "MapasAgua".pipes
      where id::text = %s
      returning id::text
    """

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(sql, [pipe_id])
        row = cur.fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Pipe not found")

        conn.commit()

    return JSONResponse({"ok": True, "deleted_id": row[0]})