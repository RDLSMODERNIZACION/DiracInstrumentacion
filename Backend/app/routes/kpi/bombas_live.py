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

PUMP_CONNECTED_WINDOW_MIN = int(os.getenv("PUMP_CONNECTED_WINDOW_MIN", "5"))

# ✅ KPI bombas: resolución fija (24h) -> 5min
FORCED_BUCKET = os.getenv("KPI_PUMPS_BUCKET", "5min").strip()


def _bounds_utc_minute(date_from: Optional[datetime], date_to: Optional[datetime]) -> Tuple[datetime, datetime]:
    """
    Normaliza el rango [from, to] a UTC, redondeando a minuto.
    Por defecto últimas 24 hs si no se pasa nada.
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


def _bucket_interval_sql(bucket: str) -> str:
    if bucket == "5min":
        return "interval '5 minutes'"
    if bucket == "15min":
        return "interval '15 minutes'"
    if bucket == "1h":
        return "interval '1 hour'"
    if bucket == "1d":
        return "interval '1 day'"
    if bucket == "1min":
        return "interval '1 minute'"
    raise HTTPException(status_code=400, detail="bucket inválido")


def _bucket_seconds(bucket: str) -> int:
    if bucket == "1min":
        return 60
    if bucket == "5min":
        return 300
    if bucket == "15min":
        return 900
    if bucket == "1h":
        return 3600
    if bucket == "1d":
        return 86400
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
    # se mantiene por compatibilidad, pero se fuerza por env / default
    bucket: str = Query("1min", pattern="^(1min|5min|15min|1h|1d)$"),
    agg_mode: str = Query("avg", pattern="^(avg|max)$"),
    connected_only: bool = Query(True),
):
    """
    KPI Bombas:
    - Ventana típica 24h
    - Bucket forzado (default 5min) por performance

    Devuelve:
      timestamps (ms), is_on (conteo ON por bucket),
      pumps_total, pumps_connected, window y bucket efectivo.
    """
    df, dt = _bounds_utc_minute(date_from, date_to)
    ids = _parse_ids(pump_ids)

    # ✅ bucket forzado (default 5min)
    bucket = FORCED_BUCKET or "5min"
    if bucket not in ("1min", "5min", "15min", "1h", "1d"):
        raise HTTPException(status_code=500, detail="KPI_PUMPS_BUCKET inválido en ENV")

    b_interval = _bucket_interval_sql(bucket)
    b_secs = _bucket_seconds(bucket)

    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        # 1) Scope bombas
        if ids:
            scope_ids_all = ids
        else:
            cur.execute(
                f"""
                WITH params AS (
                  SELECT
                    %s::bigint AS company_id,
                    %s::bigint AS location_id
                )
                SELECT p.id AS pump_id
                FROM {PUMPS_TABLE} p
                JOIN {LOCATIONS_TABLE} l ON l.id = p.location_id
                CROSS JOIN params
                WHERE (params.company_id IS NULL OR l.company_id = params.company_id)
                  AND (params.location_id IS NULL OR l.id = params.location_id)
                """,
                (company_id, location_id),
            )
            scope_ids_all = [int(r["pump_id"]) for r in cur.fetchall()]

        pumps_total_all = len(scope_ids_all)
        if pumps_total_all == 0:
            return {
                "timestamps": [],
                "is_on": [],
                "bucket": bucket,
                "agg_mode": agg_mode,
                "pumps_total": 0,
                "pumps_connected": 0,
                "window": {"from": df.isoformat(), "to": dt.isoformat()},
            }

        # 2) Bombas conectadas (🔥 optimizado con LATERAL + índice)
        recent_from = dt - timedelta(minutes=PUMP_CONNECTED_WINDOW_MIN)

        cur.execute(
            f"""
            WITH scope AS (
              SELECT unnest(%s::int[]) AS pump_id
            )
            SELECT
              s.pump_id,
              h.hb_ts,
              CASE
                WHEN h.plc_state = 'run'  THEN true
                WHEN h.plc_state = 'stop' THEN false
                ELSE h.relay
              END AS is_on
            FROM scope s
            LEFT JOIN LATERAL (
              SELECT h.hb_ts, h.plc_state, h.relay
              FROM {HB_SOURCE} h
              WHERE h.pump_id = s.pump_id
                AND h.hb_ts <= %s
              ORDER BY h.hb_ts DESC
              LIMIT 1
            ) h ON true;
            """,
            (scope_ids_all, dt),
        )
        last_rows = cur.fetchall()

        connected_set = {
            int(r["pump_id"])
            for r in last_rows
            if r.get("hb_ts") is not None and r["hb_ts"] >= recent_from
        }

        scope_ids = scope_ids_all if not connected_only else [pid for pid in scope_ids_all if pid in connected_set]
        if not scope_ids:
            return {
                "timestamps": [],
                "is_on": [],
                "bucket": bucket,
                "agg_mode": agg_mode,
                "pumps_total": pumps_total_all,
                "pumps_connected": len(connected_set),
                "window": {"from": df.isoformat(), "to": dt.isoformat()},
            }

        # 3) Timeline TURBO (bucket > 1min) usando intervalos + solapamiento
        #    Nota: si algún día forzás bucket=1min, podés agregar el camino minutes.
        if agg_mode == "avg":
            cur.execute(
                f"""
                WITH bounds AS (
                  SELECT %s::timestamptz AS df, %s::timestamptz AS dt
                ),
                scope AS (
                  SELECT unnest(%s::int[]) AS pump_id
                ),
                buckets AS (
                  SELECT
                    gs AS b_start,
                    gs + {b_interval} AS b_end
                  FROM generate_series(
                    (SELECT df FROM bounds),
                    (SELECT dt FROM bounds),
                    {b_interval}
                  ) gs
                ),
                baseline AS (
                  SELECT DISTINCT ON (h.pump_id)
                         h.pump_id,
                         h.hb_ts,
                         CASE
                           WHEN h.plc_state = 'run'  THEN true
                           WHEN h.plc_state = 'stop' THEN false
                           ELSE h.relay
                         END AS is_on
                  FROM {HB_SOURCE} h
                  JOIN scope s ON s.pump_id = h.pump_id
                  WHERE h.hb_ts < (SELECT df FROM bounds)
                  ORDER BY h.pump_id, h.hb_ts DESC
                ),
                hb_in AS (
                  SELECT
                    h.pump_id,
                    h.hb_ts,
                    CASE
                      WHEN h.plc_state = 'run'  THEN true
                      WHEN h.plc_state = 'stop' THEN false
                      ELSE h.relay
                    END AS is_on
                  FROM {HB_SOURCE} h
                  JOIN scope s ON s.pump_id = h.pump_id
                  WHERE h.hb_ts >= (SELECT df FROM bounds)
                    AND h.hb_ts <= (SELECT dt FROM bounds)
                ),
                hb_all AS (
                  SELECT * FROM baseline
                  UNION ALL
                  SELECT * FROM hb_in
                ),
                hb_intervals AS (
                  SELECT
                    pump_id,
                    hb_ts,
                    LEAD(hb_ts) OVER (PARTITION BY pump_id ORDER BY hb_ts) AS next_ts,
                    is_on
                  FROM hb_all
                ),
                hb_intervals_fixed AS (
                  SELECT
                    pump_id,
                    hb_ts,
                    COALESCE(next_ts, (SELECT dt FROM bounds)) AS next_ts,
                    is_on
                  FROM hb_intervals
                  WHERE hb_ts < (SELECT dt FROM bounds)
                ),
                overlap AS (
                  SELECT
                    b.b_start,
                    GREATEST(i.hb_ts, b.b_start) AS o_start,
                    LEAST(i.next_ts, b.b_end)   AS o_end,
                    i.is_on
                  FROM buckets b
                  JOIN hb_intervals_fixed i
                    ON i.hb_ts < b.b_end
                   AND i.next_ts > b.b_start
                ),
                per_bucket AS (
                  SELECT
                    b_start,
                    SUM(
                      CASE WHEN is_on
                           THEN EXTRACT(EPOCH FROM (o_end - o_start))
                           ELSE 0
                      END
                    )::float AS on_seconds_sum
                  FROM overlap
                  WHERE o_end > o_start
                  GROUP BY b_start
                )
                SELECT
                  EXTRACT(EPOCH FROM b_start)::bigint*1000 AS ts_ms,
                  (on_seconds_sum / %s::float) AS val
                FROM per_bucket
                ORDER BY ts_ms;
                """,
                (df, dt, scope_ids, b_secs),
            )
            rows = cur.fetchall()
        else:
            # max: puntos de cambio + bordes de bucket
            cur.execute(
                f"""
                WITH bounds AS (
                  SELECT %s::timestamptz AS df, %s::timestamptz AS dt
                ),
                scope AS (
                  SELECT unnest(%s::int[]) AS pump_id
                ),
                buckets AS (
                  SELECT
                    gs AS b_start,
                    gs + {b_interval} AS b_end
                  FROM generate_series(
                    (SELECT df FROM bounds),
                    (SELECT dt FROM bounds),
                    {b_interval}
                  ) gs
                ),
                baseline AS (
                  SELECT DISTINCT ON (h.pump_id)
                         h.pump_id,
                         h.hb_ts,
                         CASE
                           WHEN h.plc_state = 'run'  THEN true
                           WHEN h.plc_state = 'stop' THEN false
                           ELSE h.relay
                         END AS is_on
                  FROM {HB_SOURCE} h
                  JOIN scope s ON s.pump_id = h.pump_id
                  WHERE h.hb_ts < (SELECT df FROM bounds)
                  ORDER BY h.pump_id, h.hb_ts DESC
                ),
                hb_in AS (
                  SELECT
                    h.pump_id,
                    h.hb_ts,
                    CASE
                      WHEN h.plc_state = 'run'  THEN true
                      WHEN h.plc_state = 'stop' THEN false
                      ELSE h.relay
                    END AS is_on
                  FROM {HB_SOURCE} h
                  JOIN scope s ON s.pump_id = h.pump_id
                  WHERE h.hb_ts >= (SELECT df FROM bounds)
                    AND h.hb_ts <= (SELECT dt FROM bounds)
                ),
                hb_all AS (
                  SELECT * FROM baseline
                  UNION ALL
                  SELECT * FROM hb_in
                ),
                hb_intervals AS (
                  SELECT
                    pump_id,
                    hb_ts,
                    LEAD(hb_ts) OVER (PARTITION BY pump_id ORDER BY hb_ts) AS next_ts,
                    is_on
                  FROM hb_all
                ),
                hb_intervals_fixed AS (
                  SELECT
                    pump_id,
                    hb_ts,
                    COALESCE(next_ts, (SELECT dt FROM bounds) + interval '1 second') AS next_ts,
                    is_on
                  FROM hb_intervals
                ),
                change_points AS (
                  SELECT DISTINCT hb_ts AS t FROM hb_in
                  UNION SELECT b_start AS t FROM buckets
                  UNION SELECT b_end   AS t FROM buckets
                  UNION SELECT (SELECT dt FROM bounds) AS t
                ),
                points AS (
                  SELECT t
                  FROM change_points
                  WHERE t >= (SELECT df FROM bounds)
                    AND t <= (SELECT dt FROM bounds)
                ),
                on_at_point AS (
                  SELECT
                    p.t,
                    SUM(CASE WHEN i.is_on THEN 1 ELSE 0 END)::float AS on_count
                  FROM points p
                  JOIN hb_intervals_fixed i
                    ON p.t >= i.hb_ts
                   AND p.t <  i.next_ts
                  GROUP BY p.t
                ),
                per_bucket_max AS (
                  SELECT
                    b.b_start,
                    MAX(a.on_count) AS v
                  FROM buckets b
                  JOIN on_at_point a
                    ON a.t >= b.b_start
                   AND a.t <  b.b_end
                  GROUP BY b.b_start
                )
                SELECT
                  EXTRACT(EPOCH FROM b_start)::bigint*1000 AS ts_ms,
                  v AS val
                FROM per_bucket_max
                ORDER BY ts_ms;
                """,
                (df, dt, scope_ids),
            )
            rows = cur.fetchall()

    return {
        "timestamps": [int(r["ts_ms"]) for r in rows],
        "is_on": [None if r["val"] is None else float(r["val"]) for r in rows],
        "bucket": bucket,
        "agg_mode": agg_mode,
        "pumps_total": pumps_total_all,
        "pumps_connected": len(connected_set),
        "window": {"from": df.isoformat(), "to": dt.isoformat()},
    }
