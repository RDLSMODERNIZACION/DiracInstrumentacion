import json
from typing import Any

from fastapi import APIRouter, Query, HTTPException
from fastapi.responses import JSONResponse

from psycopg.types.json import Json  # ✅ para jsonb con psycopg3

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
        geometry_json,
    ) = row

    if not geometry_json:
        return None

    geom = json.loads(geometry_json)
    return {
        "type": "Feature",
        "id": pid,
        "properties": {
            "diametro_mm": diam,
            "material": material,
            "type": typ,
            "estado": estado,
            "flow_func": flow_func,
            "style": style or {},
            "props": props or {},
        },
        "geometry": geom,
    }


# ============================================================
# GET pipes (GeoJSON, con bbox opcional)
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

    sql = f"""
      select
        p.id::text as id,
        p.diametro_mm,
        p.material,
        p.type,
        p.estado,
        p.flow_func,
        p.style,
        p.props,
        infraestructura.st_asgeojson(p.geom) as geometry_json
      from "MapasAgua".pipes p
      {where}
    """

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
        return {"min_lng": None, "min_lat": None, "max_lng": None, "max_lat": None}

    return {
        "min_lng": row[0],
        "min_lat": row[1],
        "max_lng": row[2],
        "max_lat": row[3],
    }


# ============================================================
# GET pipe por ID
# ============================================================
@router.get("/pipes/{pipe_id}")
def get_pipe(pipe_id: str):
    sql = """
      select
        p.id::text as id,
        p.diametro_mm,
        p.material,
        p.type,
        p.estado,
        p.flow_func,
        p.style,
        p.props,
        infraestructura.st_asgeojson(p.geom) as geometry_json
      from "MapasAgua".pipes p
      where p.id::text = %s
      limit 1
    """
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
# PATCH pipe (propiedades)
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
    }

    unknown = [k for k in body.keys() if k not in allowed]
    if unknown:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown fields: {', '.join(unknown)}",
        )

    if not body:
        raise HTTPException(status_code=400, detail="Empty body")

    sets = []
    params: list[Any] = []

    for k in allowed:
        if k in body:
            val = body[k]
            if k in ("style", "props") and isinstance(val, (dict, list)):
                val = Json(val)
            sets.append(f"{k} = %s")
            params.append(val)

    params.append(pipe_id)

    sql = f"""
      update "MapasAgua".pipes
      set {", ".join(sets)}, updated_at = now()
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
# PATCH geometry (recorrido)
# ============================================================
@router.patch("/pipes/{pipe_id}/geometry")
def patch_pipe_geometry(pipe_id: str, body: dict[str, Any]):
    geom = body.get("geometry") if isinstance(body, dict) and "geometry" in body else body

    if not isinstance(geom, dict):
        raise HTTPException(status_code=400, detail="geometry must be a GeoJSON object")

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
        infraestructura.st_asgeojson(geom) as geometry_json
    """

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(sql, [json.dumps(geom), pipe_id])
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

    props_json = props.get("props") or {}
    style_json = props.get("style") or {}

    sql = """
      insert into "MapasAgua".pipes
        (id, geom, diametro_mm, material, type, estado, flow_func, props, style, created_at, updated_at)
      values
        (
          gen_random_uuid(),
          infraestructura.st_setsrid(infraestructura.st_geomfromgeojson(%s), 4326),
          %s, %s, %s, %s, %s,
          %s::jsonb, %s::jsonb,
          now(), now()
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
        infraestructura.st_asgeojson(geom) as geometry_json
    """

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            sql,
            [
                json.dumps(geom),
                diametro_mm,
                material,
                typ,
                estado,
                flow_func,
                json.dumps(props_json),
                json.dumps(style_json),
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
# DELETE pipe (BORRADO REAL)
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
