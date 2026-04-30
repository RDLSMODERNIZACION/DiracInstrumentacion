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


def _as_float(value: Any, default: float) -> float:
    try:
        if value is None:
            return default
        n = float(value)
        if n != n:
            return default
        return n
    except Exception:
        return default


def _as_bool(value: Any, default: bool = False) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in ("1", "true", "yes", "si", "sí", "y")
    return bool(value)


def _as_int(value: Any, default: int, min_value: int, max_value: int) -> int:
    try:
        n = int(value)
    except Exception:
        n = default

    return max(min_value, min(max_value, n))


def _candidate_public(c: dict[str, Any]) -> dict[str, Any]:
    return {
        "pipe_id": c.get("pipe_id"),
        "distance_m": c.get("distance_m"),
        "fraction": c.get("fraction"),
        "len_a_m": c.get("len_a_m"),
        "len_b_m": c.get("len_b_m"),
        "from_node": c.get("from_node"),
        "to_node": c.get("to_node"),
        "diametro_mm": c.get("diametro_mm"),
        "material": c.get("material"),
        "flow_func": c.get("flow_func"),
        "closest_point": c.get("closest_point"),
        "action": c.get("action"),
    }


def _fetch_intersection_candidates(
    cur,
    *,
    lat: float,
    lng: float,
    tolerance_m: float,
    limit: int,
) -> list[dict[str, Any]]:
    """
    Busca cañerías cercanas al punto.
    Solo toma geometrías que se puedan linealizar como LineString.
    """
    sql = """
      with pt as (
        select infraestructura.st_setsrid(
          infraestructura.st_makepoint(%s, %s),
          4326
        ) as geom
      ),
      raw as (
        select
          p.id::text as pipe_id,
          p.from_node::text as from_node,
          p.to_node::text as to_node,
          p.diametro_mm,
          p.material,
          p.type,
          p.estado,
          p.flow_func,
          p.style,
          p.props,
          coalesce(p.active, true) as active,
          coalesce(p.is_open, true) as is_open,
          p.roughness,
          infraestructura.st_linemerge(p.geom) as line_geom,
          pt.geom as point_geom,
          infraestructura.st_distance(p.geom::geography, pt.geom::geography) as distance_m
        from "MapasAgua".pipes p
        cross join pt
        where
          p.geom is not null
          and coalesce(p.active, true) = true
          and infraestructura.st_dwithin(
            p.geom::geography,
            pt.geom::geography,
            greatest(%s::double precision, 0.05)
          )
      ),
      located as (
        select
          *,
          infraestructura.st_geometrytype(line_geom) as geom_type,
          infraestructura.st_linelocatepoint(line_geom, point_geom) as fraction,
          infraestructura.st_closestpoint(line_geom, point_geom) as closest_geom
        from raw
      ),
      measured as (
        select
          *,
          infraestructura.st_length(
            infraestructura.st_linesubstring(line_geom, 0, fraction)::geography
          ) as len_a_m,
          infraestructura.st_length(
            infraestructura.st_linesubstring(line_geom, fraction, 1)::geography
          ) as len_b_m,
          infraestructura.st_asgeojson(closest_geom) as closest_json
        from located
        where geom_type = 'ST_LineString'
      )
      select
        pipe_id,
        from_node,
        to_node,
        diametro_mm,
        material,
        type,
        estado,
        flow_func,
        style,
        props,
        active,
        is_open,
        roughness,
        distance_m::double precision,
        fraction::double precision,
        len_a_m::double precision,
        len_b_m::double precision,
        closest_json
      from measured
      order by distance_m asc, pipe_id asc
      limit %s
    """

    cur.execute(sql, [lng, lat, tolerance_m, limit])
    rows = cur.fetchall()

    candidates: list[dict[str, Any]] = []

    for row in rows:
        (
            pipe_id,
            from_node,
            to_node,
            diametro_mm,
            material,
            typ,
            estado,
            flow_func,
            style,
            props,
            active,
            is_open,
            roughness,
            distance_m,
            fraction,
            len_a_m,
            len_b_m,
            closest_json,
        ) = row

        closest_point = None
        if closest_json:
            try:
                closest_point = json.loads(closest_json)
            except Exception:
                closest_point = None

        candidates.append(
            {
                "pipe_id": pipe_id,
                "from_node": from_node,
                "to_node": to_node,
                "diametro_mm": diametro_mm,
                "material": material,
                "type": typ,
                "estado": estado,
                "flow_func": flow_func,
                "style": style or {},
                "props": props or {},
                "active": bool(active),
                "is_open": bool(is_open),
                "roughness": roughness,
                "distance_m": float(distance_m) if distance_m is not None else None,
                "fraction": float(fraction) if fraction is not None else None,
                "len_a_m": float(len_a_m) if len_a_m is not None else None,
                "len_b_m": float(len_b_m) if len_b_m is not None else None,
                "closest_point": closest_point,
            }
        )

    return candidates


def _find_existing_node_near(cur, *, lat: float, lng: float, tolerance_m: float) -> str | None:
    sql = """
      with pt as (
        select infraestructura.st_setsrid(
          infraestructura.st_makepoint(%s, %s),
          4326
        ) as geom
      )
      select n.id::text
      from "MapasAgua".nodes n
      cross join pt
      where
        n.geom is not null
        and infraestructura.st_dwithin(
          n.geom::geography,
          pt.geom::geography,
          greatest(%s::double precision, 0.05)
        )
      order by infraestructura.st_distance(n.geom::geography, pt.geom::geography) asc
      limit 1
    """

    cur.execute(sql, [lng, lat, tolerance_m])
    row = cur.fetchone()

    return row[0] if row else None


def _create_intersection_node(cur, *, lat: float, lng: float) -> str:
    """
    Crea un nodo JUNCTION en el punto elegido.
    Si tu tabla nodes tiene más columnas obligatorias, agregalas acá.
    """
    sql = """
      insert into "MapasAgua".nodes
        (
          id,
          kind,
          geom,
          elev_m,
          props,
          created_at,
          updated_at
        )
      values
        (
          gen_random_uuid(),
          'JUNCTION',
          infraestructura.st_setsrid(
            infraestructura.st_makepoint(%s, %s),
            4326
          ),
          null,
          %s::jsonb,
          now(),
          now()
        )
      returning id::text
    """

    cur.execute(
        sql,
        [
            lng,
            lat,
            json.dumps(
                {
                    "label": "Nodo cruce",
                    "created_by": "connect_intersection",
                }
            ),
        ],
    )

    row = cur.fetchone()

    if not row:
        raise HTTPException(status_code=500, detail="No se pudo crear el nodo de cruce")

    return row[0]


def _update_pipe_endpoint_to_node(
    cur,
    *,
    pipe_id: str,
    node_id: str,
    endpoint: str,
) -> str:
    if endpoint not in ("from_node", "to_node"):
        raise ValueError("endpoint must be from_node or to_node")

    sql = f"""
      update "MapasAgua".pipes
      set
        {endpoint} = %s::uuid,
        props = coalesce(props, '{{}}'::jsonb) || %s::jsonb,
        updated_at = now()
      where id::text = %s
      returning id::text
    """

    cur.execute(
        sql,
        [
            node_id,
            json.dumps(
                {
                    "intersection_connected": True,
                    "intersection_node": node_id,
                    "intersection_action": f"updated_{endpoint}",
                }
            ),
            pipe_id,
        ],
    )

    row = cur.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail=f"Pipe {pipe_id} not found")

    return row[0]


def _insert_split_pipe(
    cur,
    *,
    pipe_id: str,
    start_fraction: float,
    end_fraction: float,
    from_node: str | None,
    to_node: str | None,
    split_node_id: str,
    split_part: str,
) -> str:
    sql = """
      with src as (
        select
          p.*,
          infraestructura.st_linemerge(p.geom) as line_geom
        from "MapasAgua".pipes p
        where p.id::text = %s
        for update
      ),
      new_geom as (
        select
          infraestructura.st_linesubstring(
            line_geom,
            %s::double precision,
            %s::double precision
          ) as geom
        from src
      )
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
      select
        gen_random_uuid(),
        new_geom.geom,
        src.diametro_mm,
        src.material,
        src.type,
        src.estado,
        src.flow_func,
        coalesce(src.props, '{}'::jsonb) || %s::jsonb,
        coalesce(src.style, '{}'::jsonb),
        true,
        coalesce(src.is_open, true),
        src.roughness,
        %s::uuid,
        %s::uuid,
        infraestructura.st_length(new_geom.geom::geography),
        now(),
        now()
      from src, new_geom
      where
        new_geom.geom is not null
        and infraestructura.st_length(new_geom.geom::geography) > 0.05
      returning id::text
    """

    cur.execute(
        sql,
        [
            pipe_id,
            start_fraction,
            end_fraction,
            json.dumps(
                {
                    "split_from_pipe": pipe_id,
                    "split_node": split_node_id,
                    "split_part": split_part,
                    "created_by": "connect_intersection",
                }
            ),
            from_node,
            to_node,
        ],
    )

    row = cur.fetchone()

    if not row:
        raise HTTPException(
            status_code=400,
            detail=f"No se pudo crear el tramo {split_part} para pipe {pipe_id}",
        )

    return row[0]


def _inactivate_original_pipe(cur, *, pipe_id: str, split_node_id: str) -> str:
    sql = """
      update "MapasAgua".pipes
      set
        active = false,
        props = coalesce(props, '{}'::jsonb) || %s::jsonb,
        updated_at = now()
      where id::text = %s
      returning id::text
    """

    cur.execute(
        sql,
        [
            json.dumps(
                {
                    "inactive_reason": "split_at_intersection",
                    "split_node": split_node_id,
                    "created_by": "connect_intersection",
                }
            ),
            pipe_id,
        ],
    )

    row = cur.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail=f"Pipe {pipe_id} not found")

    return row[0]


def _classify_split_action(candidate: dict[str, Any], min_segment_m: float) -> str:
    """
    Decide si se parte la cañería o si solo se conecta un extremo.
    """
    fraction = candidate.get("fraction")
    len_a = candidate.get("len_a_m")
    len_b = candidate.get("len_b_m")

    if fraction is None:
        return "skip"

    if len_a is not None and len_a < min_segment_m:
        return "update_from_node"

    if len_b is not None and len_b < min_segment_m:
        return "update_to_node"

    if fraction <= 0.000001:
        return "update_from_node"

    if fraction >= 0.999999:
        return "update_to_node"

    return "split"


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
# POST conectar cañerías en cruce
# /mapa/mapasagua/connect-intersection
# ============================================================
@router.post("/connect-intersection")
def connect_intersection(body: dict[str, Any]):
    lat = _as_float(body.get("lat"), None)
    lng = _as_float(body.get("lng"), None)

    if lat is None or lng is None:
        raise HTTPException(status_code=400, detail="Faltan lat/lng")

    tolerance_m = _as_float(body.get("tolerance_m"), 2.0)
    tolerance_m = max(0.2, min(25.0, tolerance_m))

    apply = _as_bool(body.get("apply"), False)

    limit = _as_int(body.get("limit"), 4, 2, 10)
    min_segment_m = _as_float(body.get("min_segment_m"), 0.5)
    min_segment_m = max(0.05, min(10.0, min_segment_m))

    with get_conn() as conn, conn.cursor() as cur:
        candidates = _fetch_intersection_candidates(
            cur,
            lat=lat,
            lng=lng,
            tolerance_m=tolerance_m,
            limit=limit,
        )

        selected = candidates[:limit]

        for c in selected:
            c["action"] = _classify_split_action(c, min_segment_m)

        selected_ids = [c["pipe_id"] for c in selected]

        base_response = {
            "ok": len(selected) >= 2,
            "apply_mode": apply,
            "lat": lat,
            "lng": lng,
            "tolerance_m": tolerance_m,
            "limit_used": limit,
            "candidates_found": len(candidates),
            "selected_targets": selected_ids,
            "selected_pipes": selected_ids,
            "created_nodes": 0,
            "node_id": None,
            "created_pipes": [],
            "split_pipes_created": 0,
            "original_pipes_inactivated": 0,
            "endpoint_pipes_updated": 0,
            "detail": {
                "min_segment_m": min_segment_m,
                "candidates": [_candidate_public(c) for c in candidates],
                "selected": [_candidate_public(c) for c in selected],
            },
        }

        if len(selected) < 2:
            base_response["message"] = (
                "No se encontraron al menos 2 cañerías cercanas. "
                "Probá tocar más cerca del cruce o aumentar la tolerancia."
            )
            return JSONResponse(base_response)

        if not apply:
            base_response["message"] = (
                "Preview: se encontraron cañerías suficientes. "
                "Ejecutá con apply=true para crear/reutilizar nodo y partir cañerías."
            )
            return JSONResponse(base_response)

        node_id = _find_existing_node_near(
            cur,
            lat=lat,
            lng=lng,
            tolerance_m=min(tolerance_m, 2.0),
        )

        created_nodes = 0

        if not node_id:
            node_id = _create_intersection_node(cur, lat=lat, lng=lng)
            created_nodes = 1

        created_pipes: list[str] = []
        original_inactivated: list[str] = []
        endpoint_updated: list[str] = []

        for c in selected:
            pipe_id = c["pipe_id"]
            action = c.get("action")
            fraction = c.get("fraction")

            if action == "update_from_node":
                updated = _update_pipe_endpoint_to_node(
                    cur,
                    pipe_id=pipe_id,
                    node_id=node_id,
                    endpoint="from_node",
                )
                endpoint_updated.append(updated)
                continue

            if action == "update_to_node":
                updated = _update_pipe_endpoint_to_node(
                    cur,
                    pipe_id=pipe_id,
                    node_id=node_id,
                    endpoint="to_node",
                )
                endpoint_updated.append(updated)
                continue

            if action != "split":
                continue

            if fraction is None:
                continue

            from_node = c.get("from_node")
            to_node = c.get("to_node")

            left_id = _insert_split_pipe(
                cur,
                pipe_id=pipe_id,
                start_fraction=0.0,
                end_fraction=float(fraction),
                from_node=from_node,
                to_node=node_id,
                split_node_id=node_id,
                split_part="A",
            )

            right_id = _insert_split_pipe(
                cur,
                pipe_id=pipe_id,
                start_fraction=float(fraction),
                end_fraction=1.0,
                from_node=node_id,
                to_node=to_node,
                split_node_id=node_id,
                split_part="B",
            )

            created_pipes.extend([left_id, right_id])

            old_id = _inactivate_original_pipe(
                cur,
                pipe_id=pipe_id,
                split_node_id=node_id,
            )
            original_inactivated.append(old_id)

        conn.commit()

    return JSONResponse(
        {
            "ok": True,
            "apply_mode": True,
            "lat": lat,
            "lng": lng,
            "tolerance_m": tolerance_m,
            "limit_used": limit,
            "node_id": node_id,
            "created_nodes": created_nodes,
            "candidates_found": len(candidates),
            "selected_targets": selected_ids,
            "selected_pipes": selected_ids,
            "created_pipes": created_pipes,
            "split_pipes_created": len(created_pipes),
            "original_pipes_inactivated": len(original_inactivated),
            "endpoint_pipes_updated": len(endpoint_updated),
            "message": "Cruce conectado correctamente.",
            "detail": {
                "min_segment_m": min_segment_m,
                "candidates": [_candidate_public(c) for c in candidates],
                "selected": [_candidate_public(c) for c in selected],
                "endpoint_updated": endpoint_updated,
                "original_pipes_inactivated": original_inactivated,
            },
        }
    )


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