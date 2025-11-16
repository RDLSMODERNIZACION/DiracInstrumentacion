# app/routes/kpi/bombas_live.py
import os
from fastapi import APIRouter, Query, HTTPException
from psycopg.rows import dict_row
from typing import Optional, List, Tuple
from datetime import datetime, timedelta, timezone
from app.db import get_conn

router = APIRouter(prefix="/kpi/bombas", tags=["kpi-bombas"])

PUMPS_TABLE     = (os.getenv("PUMPS_TABLE") or "public.pumps").strip()
LOCATIONS_TABLE = (os.getenv("LOCATIONS_TABLE") or "public.locations").strip()
HB_SOURCE       = (os.getenv("PUMP_HB_SOURCE") or "kpi.v_pump_hb_clean").strip()

# Ventana para considerar una bomba "conectada" (en minutos, respecto de 'to')
PUMP_CONNECTED_WINDOW_MIN = int(os.getenv("PUMP_CONNECTED_WINDOW_MIN", "5"))


def _bounds_utc_minute(date_from: Optional[datetime], date_to: Optional[datetime]) -> Tuple[datetime, datetime]:
    """
    Normaliza el rango [from, to] a UTC, redondeando a minuto, y
    usando por defecto las últimas 24 hs si no se pasa nada.
    """
    if date_to is None:
        date_to = datetime.now(timezone.utc)
    if date_from is None:
        date_from = date_to - timedelta(hours=24)

    if date_to.tzinfo is None:
        date_to = date_to.replace(tzinfo=timezone.utc)
    else:
        date_to = date_to.astimezone(timezone.utc)

    if date_from.tzinfo is None:
        date_from = date_from.replace(tzinfo=timezone.utc)
    else:
        date_from = date_from.astimezone(timezone.utc)

    date_to = date_to.replace(second=0, microsecond=0)
    date_from = date_from.replace(second=0, microsecond=0)

    if date_from >= date_to:
        raise HTTPException(status_code=400, detail="'from' debe ser menor que 'to'")

    return date_from, date_to


def _bucket_expr_sql(bucket: str) -> str:
    if bucket == "1min":
        return "m"
    if bucket == "5min":
        return "date_trunc('hour', m) + ((extract(minute from m)::int/5 )*5 )*interval '1 min'"
    if bucket == "15min":
        return "date_trunc('hour', m) + ((extract(minute from m)::int/15)*15)*interval '1 min'"
    if bucket == "1h":
        return "date_trunc('hour', m)"
    if bucket == "1d":
        return "date_trunc('day', m)"
    raise HTTPException(status_code=400, detail="bucket inválido")


def _parse_ids(csv: Optional[str]) -> Optional[List[int]]:
    if not csv:
        return None
    out: List[int] = []
    for t in csv.split(","):
        t = t.strip()
        if not t:
            continue
        try:
            out.append(int(t))
        except Exception:
            pass
    return out or None


@router.get("/live")
def pumps_live(
    company_id: Optional[int] = Query(None),
    location_id: Optional[int] = Query(None),
    pump_ids: Optional[str]    = Query(None, description="CSV de pump_id"),
    date_from: Optional[datetime] = Query(None, alias="from"),
    date_to:   Optional[datetime] = Query(None, alias="to"),
    bucket: str = Query("1min", pattern="^(1min|5min|15min|1h|1d)$"),
    agg_mode: str = Query("avg", pattern="^(avg|max)$"),
    connected_only: bool = Query(True),
):
    """
    Devuelve un timeline de cuántas bombas están ON (relay = true) en cada bucket,
    junto con:
      - pumps_total: cantidad total de bombas en el scope (empresa / localidad / ids)
      - pumps_connected: bombas actualmente conectadas (último HB reciente)
    """
    df, dt = _bounds_utc_minute(date_from, date_to)
    ids = _parse_ids(pump_ids)

    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        # 1) Scope de bombas por empresa / localidad / ids
        if ids:
            scope_ids_all = ids
        else:
            cur.execute(
                f"""
                WITH params AS (SELECT
                  %(company_id)s::bigint AS company_id,
                  %(location_id)s::bigint AS location_id)
                SELECT p.id AS pump_id
                FROM {PUMPS_TABLE} p
                JOIN {LOCATIONS_TABLE} l ON l.id = p.location_id
                CROSS JOIN params
                WHERE (params.company_id IS NULL OR l.company_id = params.company_id)
                  AND (params.location_id IS NULL OR l.id = params.location_id)
                """,
                {"company_id": company_id, "location_id": location_id},
            )
            scope_ids_all = [int(r["pump_id"]) for r in cur.fetchall()]

        pumps_total_all = len(scope_ids_all)
        if not pumps_total_all:
            return {
                "timestamps": [],
                "is_on": [],
                "pumps_total": 0,
                "pumps_connected": 0,
                "window": {"from": df.isoformat(), "to": dt.isoformat()},
            }

        # 2) Bombas "conectadas" según su ÚLTIMO heartbeat
        #    - buscamos el último hb_ts de cada bomba hasta 'dt'
        #    - la consideramos conectada si hb_ts >= dt - PUMP_CONNECTED_WINDOW_MIN
        recent_from = dt - timedelta(minutes=PUMP_CONNECTED_WINDOW_MIN)

        cur.execute(
            f"""
            WITH last_hb AS (
              SELECT DISTINCT ON (h.pump_id)
                     h.pump_id,
                     h.hb_ts,
                     h.relay
              FROM {HB_SOURCE} h
              WHERE h.pump_id = ANY(%(ids)s::int[])
                AND h.hb_ts <= %(dt)s
              ORDER BY h.pump_id, h.hb_ts DESC
            )
            SELECT pump_id, hb_ts, relay
            FROM last_hb;
            """,
            {"ids": scope_ids_all, "dt": dt},
        )
        last_rows = cur.fetchall()

        connected_set = {
            int(r["pump_id"])
            for r in last_rows
            if r["hb_ts"] is not None and r["hb_ts"] >= recent_from
        }

        # Scope para la serie de tiempo:
        #  - connected_only=True  -> solo bombas conectadas "ahora"
        #  - connected_only=False -> todas las bombas del scope
        scope_ids = scope_ids_all if not connected_only else [pid for pid in scope_ids_all if pid in connected_set]

        if not scope_ids:
            # No hay bombas conectadas en este momento (o ninguna matchea el filtro),
            # devolvemos timeline vacío pero igual informamos totales.
            return {
                "timestamps": [],
                "is_on": [],
                "pumps_total": pumps_total_all,
                "pumps_connected": len(connected_set),
                "window": {"from": df.isoformat(), "to": dt.isoformat()},
            }

        # 3) Timeline (baseline + edges) desde la vista/MV limpia
        cur.execute(
            f"""
            WITH bounds AS (
              SELECT %(df)s::timestamptz AS df, %(dt)s::timestamptz AS dt
            ),
            scope AS (
              SELECT unnest(%(ids)s::int[]) AS pump_id
            ),
            baseline AS (
              -- último estado conocido antes de df para cada bomba
              SELECT DISTINCT ON (h.pump_id)
                     h.pump_id, h.hb_ts AS ts, h.relay
              FROM {HB_SOURCE} h
              JOIN scope s ON s.pump_id = h.pump_id
              WHERE h.hb_ts < (SELECT df FROM bounds)
              ORDER BY h.pump_id, h.hb_ts DESC
            ),
            window_hb AS (
              -- heartbeats en una ventana extendida para capturar transiciones
              SELECT h.pump_id, h.hb_ts, h.relay,
                     lag(h.relay) OVER (PARTITION BY h.pump_id ORDER BY h.hb_ts) AS prev
              FROM {HB_SOURCE} h
              JOIN scope s ON s.pump_id = h.pump_id
              JOIN bounds b ON h.hb_ts <= b.dt AND h.hb_ts >= b.df - interval '48 hours'
            ),
            edges AS (
              -- solo puntos donde cambia el estado (prev != relay)
              SELECT pump_id, hb_ts AS ts, relay
              FROM window_hb
              WHERE prev IS DISTINCT FROM relay
            ),
            timeline AS (
              -- timeline de cambios + baseline en df
              SELECT pump_id, ts, relay FROM edges
              UNION ALL
              SELECT pump_id, (SELECT df FROM bounds) AS ts, COALESCE(relay,false) AS relay
              FROM scope
              LEFT JOIN baseline USING (pump_id)
            ),
            minutes AS (
              -- minutos dentro de [df, dt]
              SELECT generate_series((SELECT df FROM bounds),(SELECT dt FROM bounds), interval '1 minute') AS m
            ),
            intervals AS (
              -- intervalos donde la bomba estuvo en determinado estado
              SELECT
                pump_id,
                GREATEST(ts, (SELECT df FROM bounds)) AS t_from,
                LEAST(
                  LEAD(ts,1,(SELECT dt FROM bounds)) OVER (PARTITION BY pump_id ORDER BY ts),
                  (SELECT dt FROM bounds)
                ) AS t_to,
                relay
              FROM timeline
            ),
            events AS (
              -- marcamos +1 al inicio y -1 al final de cada tramo ON
              SELECT date_trunc('minute', t_from + interval '59 seconds') AS m, +1::int AS delta
              FROM intervals
              WHERE relay = true AND t_to > t_from
              UNION ALL
              SELECT date_trunc('minute', t_to   + interval '59 seconds') AS m, -1::int AS delta
              FROM intervals
              WHERE relay = true AND t_to > t_from
            ),
            deltas AS (
              SELECT m, SUM(delta)::int AS delta
              FROM events
              GROUP BY m
            ),
            running AS (
              -- conteo acumulado de bombas ON por minuto
              SELECT minutes.m,
                     SUM(COALESCE(deltas.delta,0)) OVER (ORDER BY minutes.m) AS on_count
              FROM minutes
              LEFT JOIN deltas USING (m)
              ORDER BY minutes.m
            ),
            bucketed AS (
              -- agregamos por bucket
              SELECT
                { _bucket_expr_sql(bucket) } AS b,
                CASE
                  WHEN %(agg_mode)s = 'max' THEN MAX(on_count)::float
                  ELSE AVG(on_count)::float
                END AS v
              FROM running
              GROUP BY 1
            )
            SELECT extract(epoch FROM b)::bigint*1000 AS ts_ms, v AS val
            FROM bucketed
            ORDER BY ts_ms;
            """,
            {"ids": scope_ids, "df": df, "dt": dt, "agg_mode": agg_mode},
        )
        rows = cur.fetchall()

    return {
        "timestamps": [int(r["ts_ms"]) for r in rows],
        "is_on":      [None if r["val"] is None else float(r["val"]) for r in rows],
        "pumps_total": pumps_total_all,
        # bombas actualmente conectadas (último HB reciente)
        "pumps_connected": len(connected_set),
        "window": {"from": df.isoformat(), "to": dt.isoformat()},
    }
