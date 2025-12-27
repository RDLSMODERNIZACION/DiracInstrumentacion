import json
from typing import Any

from fastapi import APIRouter, Query, HTTPException
from fastapi.responses import JSONResponse

from psycopg.types.json import Json  # ✅ para jsonb con psycopg3

from app.db import get_conn

router = APIRouter(prefix="/mapasagua", tags=["mapasagua"])


def _feature_from_row(row):
    (pid, diam, material, typ, estado, style, props, geometry_json) = row
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
            "style": style or {},
            "props": props or {},
        },
        "geometry": geom,
    }


@router.get("/pipes")
def get_pipes(
    min_lng: float | None = Query(default=None),
    min_lat: float | None = Query(default=None),
    max_lng: float | None = Query(default=None),
    max_lat: float | None = Query(default=None),
):
    where = "where p.active = true"
    params: list[float] = []

    # bbox opcional
    if None not in (min_lng, min_lat, max_lng, max_lat):
        where += """
          and infraestructura.st_intersects(
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


@router.get("/pipes/extent")
def pipes_extent():
    sql = """
      select
        min(infraestructura.st_xmin(geom)) as min_lng,
        min(infraestructura.st_ymin(geom)) as min_lat,
        max(infraestructura.st_xmax(geom)) as max_lng,
        max(infraestructura.st_ymax(geom)) as max_lat
      from "MapasAgua".pipes
      where active = true and geom is not null
    """
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(sql)
        row = cur.fetchone()

    if not row or row[0] is None:
        return {"min_lng": None, "min_lat": None, "max_lng": None, "max_lat": None}

    return {"min_lng": row[0], "min_lat": row[1], "max_lng": row[2], "max_lat": row[3]}


# ==========================
# ✅ GET por ID (Feature)
# ==========================
@router.get("/pipes/{pipe_id}")
def get_pipe(pipe_id: str):
    sql = """
      select
        p.id::text as id,
        p.diametro_mm,
        p.material,
        p.type,
        p.estado,
        p.style,
        p.props,
        infraestructura.st_asgeojson(p.geom) as geometry_json
      from "MapasAgua".pipes p
      where p.active = true and p.id::text = %s
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


# ==========================
# ✅ PATCH update por ID
# ==========================
@router.patch("/pipes/{pipe_id}")
def patch_pipe(
    pipe_id: str,
    body: dict[str, Any],
):
    """
    Body permitido (cualquiera opcional):
      {
        "diametro_mm": 110,
        "material": "PEAD",
        "type": "WATER",
        "estado": "OK",
        "style": { ... },   # json/jsonb
        "props": { ... }    # json/jsonb
      }
    """
    allowed = {"diametro_mm", "material", "type", "estado", "style", "props"}

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

    # armamos SET dinámico
    for k in allowed:
        if k in body:
            val = body[k]

            # ✅ jsonb: psycopg3 necesita Json() para dict/list
            if k in ("style", "props") and isinstance(val, (dict, list)):
                val = Json(val)

            sets.append(f"{k} = %s")
            params.append(val)

    params.append(pipe_id)

    sql = f"""
      update "MapasAgua".pipes
      set {", ".join(sets)}
      where active = true and id::text = %s
      returning
        id::text as id,
        diametro_mm,
        material,
        type,
        estado,
        style,
        props,
        infraestructura.st_asgeojson(geom) as geometry_json
    """

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(sql, params)
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Pipe not found or inactive")
        try:
            conn.commit()
        except Exception:
            pass

    feat = _feature_from_row(row)
    if not feat:
        raise HTTPException(status_code=404, detail="Pipe geometry not found")

    return JSONResponse(feat)
