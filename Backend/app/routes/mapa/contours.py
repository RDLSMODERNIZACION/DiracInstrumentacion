# app/routes/mapa/contours.py
from __future__ import annotations

import json
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse

from app.db import get_conn


router = APIRouter(prefix="/contours", tags=["mapa"])


def _fetchall_dict(cur):
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]


def _fetchone_dict(cur):
    row = cur.fetchone()
    if not row:
        return None
    cols = [d[0] for d in cur.description]
    return dict(zip(cols, row))


def _safe_float(v: Any) -> Optional[float]:
    if v is None:
        return None

    try:
        return float(v)
    except Exception:
        return None


def _extract_elev_m(props: dict[str, Any]) -> Optional[float]:
    """
    Intenta leer la cota desde nombres típicos de archivos GIS/CAD:
    elev_m, elevation, ELEV, ELEVATION, cota, CONTOUR, height, z.
    """
    if not isinstance(props, dict):
        return None

    keys = [
        "elev_m",
        "elevation",
        "ELEVATION",
        "elev",
        "ELEV",
        "cota",
        "COTA",
        "contour",
        "CONTOUR",
        "height",
        "HEIGHT",
        "z",
        "Z",
    ]

    for k in keys:
        if k in props:
            val = _safe_float(props.get(k))
            if val is not None:
                return val

    return None


def _feature_from_row(row: dict[str, Any]) -> dict[str, Any]:
    geom = row.get("geometry")

    if isinstance(geom, str):
        geom = json.loads(geom)

    return {
        "type": "Feature",
        "id": row["id"],
        "properties": {
            "id": row["id"],
            "elev_m": row["elev_m"],
            "props": row.get("props") or {},
        },
        "geometry": geom,
    }


# ============================================================
# GET /mapa/contours/debug
# Diagnóstico rápido
# ============================================================
@router.get("/debug")
def contours_debug():
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT
                count(*)::int AS total,
                min(elev_m)::double precision AS min_elev_m,
                max(elev_m)::double precision AS max_elev_m
            FROM "MapasAgua".contours
            """
        )

        summary = _fetchone_dict(cur)

    return summary or {
        "total": 0,
        "min_elev_m": None,
        "max_elev_m": None,
    }


# ============================================================
# GET /mapa/contours
# Devuelve curvas como GeoJSON
# Soporta bbox:
# /mapa/contours?min_lng=&min_lat=&max_lng=&max_lat=
# ============================================================
@router.get("")
def list_contours(
    min_lng: Optional[float] = Query(default=None),
    min_lat: Optional[float] = Query(default=None),
    max_lng: Optional[float] = Query(default=None),
    max_lat: Optional[float] = Query(default=None),
    limit: int = Query(default=5000, ge=1, le=50000),
):
    where = []
    params: list[Any] = []

    if None not in (min_lng, min_lat, max_lng, max_lat):
        where.append(
            """
            infraestructura.st_intersects(
                geom,
                infraestructura.st_makeenvelope(%s, %s, %s, %s, 4326)
            )
            """
        )
        params.extend([min_lng, min_lat, max_lng, max_lat])

    where_sql = f"WHERE {' AND '.join(where)}" if where else ""

    sql = f"""
        SELECT
            id::text AS id,
            elev_m::double precision AS elev_m,
            props,
            infraestructura.st_asgeojson(geom) AS geometry
        FROM "MapasAgua".contours
        {where_sql}
        ORDER BY elev_m, id
        LIMIT %s
    """

    params.append(limit)

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(sql, params)
        rows = _fetchall_dict(cur)

    features = [_feature_from_row(r) for r in rows]

    return JSONResponse(
        {
            "type": "FeatureCollection",
            "features": features,
        }
    )


# ============================================================
# GET /mapa/contours/sample?lat=&lng=
# Devuelve la curva más cercana y su cota
# Esto NO interpola todavía. Es aproximación visual/semi-real.
# ============================================================
@router.get("/sample")
def sample_nearest_contour(
    lat: float = Query(...),
    lng: float = Query(...),
    max_distance_m: float = Query(default=300.0, ge=1, le=10000),
):
    sql = """
        WITH p AS (
            SELECT infraestructura.st_setsrid(
                infraestructura.st_makepoint(%s, %s),
                4326
            ) AS geom
        )
        SELECT
            c.id::text AS id,
            c.elev_m::double precision AS elev_m,
            c.props,
            infraestructura.st_distance(c.geom::geography, p.geom::geography)::double precision AS distance_m,
            infraestructura.st_asgeojson(c.geom) AS geometry
        FROM "MapasAgua".contours c
        CROSS JOIN p
        WHERE infraestructura.st_dwithin(
            c.geom::geography,
            p.geom::geography,
            %s
        )
        ORDER BY c.geom <-> p.geom
        LIMIT 1
    """

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(sql, (lng, lat, max_distance_m))
        row = _fetchone_dict(cur)

    if not row:
        return {
            "found": False,
            "lat": lat,
            "lng": lng,
            "max_distance_m": max_distance_m,
            "elev_m": None,
            "distance_m": None,
        }

    return {
        "found": True,
        "lat": lat,
        "lng": lng,
        "max_distance_m": max_distance_m,
        "contour_id": row["id"],
        "elev_m": row["elev_m"],
        "distance_m": row["distance_m"],
        "props": row.get("props") or {},
    }


# ============================================================
# POST /mapa/contours/geojson
# Carga curvas desde GeoJSON.
#
# Acepta:
# - FeatureCollection
# - Feature
#
# Cada Feature debe tener elevación en properties:
# elev_m, elevation, ELEV, cota, CONTOUR, etc.
# ============================================================
@router.post("/geojson")
def import_contours_geojson(body: dict[str, Any]):
    if not isinstance(body, dict):
        raise HTTPException(status_code=400, detail="Body debe ser GeoJSON")

    body_type = body.get("type")

    if body_type == "FeatureCollection":
        features = body.get("features") or []
    elif body_type == "Feature":
        features = [body]
    else:
        raise HTTPException(
            status_code=400,
            detail="GeoJSON debe ser FeatureCollection o Feature",
        )

    if not isinstance(features, list) or not features:
        raise HTTPException(status_code=400, detail="GeoJSON sin features")

    rows_to_insert: list[tuple[float, str, str]] = []
    skipped_no_elev = 0
    skipped_no_geom = 0

    for f in features:
        if not isinstance(f, dict):
            continue

        geom = f.get("geometry")
        props = f.get("properties") or {}

        if not geom:
            skipped_no_geom += 1
            continue

        elev_m = _extract_elev_m(props)

        if elev_m is None:
            skipped_no_elev += 1
            continue

        rows_to_insert.append(
            (
                elev_m,
                json.dumps(geom),
                json.dumps(props, ensure_ascii=False),
            )
        )

    if not rows_to_insert:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "No hay features válidas para insertar",
                "skipped_no_elev": skipped_no_elev,
                "skipped_no_geom": skipped_no_geom,
            },
        )

    inserted = 0

    with get_conn() as conn, conn.cursor() as cur:
        for elev_m, geom_json, props_json in rows_to_insert:
            cur.execute(
                """
                INSERT INTO "MapasAgua".contours (
                    id,
                    elev_m,
                    geom,
                    props,
                    created_at
                )
                VALUES (
                    gen_random_uuid(),
                    %s,
                    infraestructura.st_setsrid(
                        infraestructura.st_geomfromgeojson(%s),
                        4326
                    ),
                    %s::jsonb,
                    now()
                )
                """,
                (
                    elev_m,
                    geom_json,
                    props_json,
                ),
            )
            inserted += 1

        conn.commit()

    return {
        "ok": True,
        "features_received": len(features),
        "inserted": inserted,
        "skipped_no_elev": skipped_no_elev,
        "skipped_no_geom": skipped_no_geom,
    }


# ============================================================
# POST /mapa/contours/fill-node-elevations
# Asigna elev_m a nodos usando la curva más cercana.
# Modo seguro:
# - preview=true no modifica nada
# - preview=false actualiza nodes.elev_m
# ============================================================
@router.post("/fill-node-elevations")
def fill_node_elevations(
    preview: bool = Query(default=True),
    max_distance_m: float = Query(default=300.0, ge=1, le=10000),
):
    """
    Ojo: esto usa la curva más cercana, no interpola.
    Sirve como primera aproximación.
    """

    if preview:
        sql = """
            WITH nearest AS (
                SELECT
                    n.id,
                    n.elev_m AS current_elev_m,
                    c.elev_m AS new_elev_m,
                    infraestructura.st_distance(n.geom::geography, c.geom::geography) AS distance_m
                FROM "MapasAgua".nodes n
                JOIN LATERAL (
                    SELECT c2.id, c2.elev_m, c2.geom
                    FROM "MapasAgua".contours c2
                    WHERE infraestructura.st_dwithin(
                        c2.geom::geography,
                        n.geom::geography,
                        %s
                    )
                    ORDER BY c2.geom <-> n.geom
                    LIMIT 1
                ) c ON true
                WHERE n.elev_m IS NULL
            )
            SELECT
                count(*)::int AS nodes_that_would_update,
                min(new_elev_m)::double precision AS min_new_elev_m,
                max(new_elev_m)::double precision AS max_new_elev_m,
                avg(distance_m)::double precision AS avg_distance_m
            FROM nearest
        """

        with get_conn() as conn, conn.cursor() as cur:
            cur.execute(sql, (max_distance_m,))
            row = _fetchone_dict(cur)

        return {
            "preview": True,
            "max_distance_m": max_distance_m,
            **(row or {}),
        }

    sql = """
        WITH nearest AS (
            SELECT
                n.id,
                c.elev_m AS new_elev_m
            FROM "MapasAgua".nodes n
            JOIN LATERAL (
                SELECT c2.id, c2.elev_m, c2.geom
                FROM "MapasAgua".contours c2
                WHERE infraestructura.st_dwithin(
                    c2.geom::geography,
                    n.geom::geography,
                    %s
                )
                ORDER BY c2.geom <-> n.geom
                LIMIT 1
            ) c ON true
            WHERE n.elev_m IS NULL
        ),
        upd AS (
            UPDATE "MapasAgua".nodes n
            SET elev_m = nearest.new_elev_m
            FROM nearest
            WHERE n.id = nearest.id
            RETURNING n.id
        )
        SELECT count(*)::int AS updated_nodes
        FROM upd
    """

    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(sql, (max_distance_m,))
        row = _fetchone_dict(cur)
        conn.commit()

    return {
        "preview": False,
        "max_distance_m": max_distance_m,
        **(row or {"updated_nodes": 0}),
    }