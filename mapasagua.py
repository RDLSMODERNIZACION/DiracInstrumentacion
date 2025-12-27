import json
from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse

from app.db import get_conn

router = APIRouter(prefix="/mapasagua", tags=["mapasagua"])
s

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
    for (pid, diam, material, typ, estado, style, props, geometry_json) in rows:
        if not geometry_json:
            continue
        geom = json.loads(geometry_json)
        features.append(
            {
                "type": "Feature",
                "id": pid,
                "properties": {
                    "diametro_mm": diam,
                    "material": material,
                    "type": typ,
                    "estado": estado,
                    "style": style,
                    "props": props,
                },
                "geometry": geom,
            }
        )


    return JSONResponse({"type": "FeatureCollection", "features": features})
