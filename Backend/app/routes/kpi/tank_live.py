# app/routes/kpi/tank_live.py
import os
from fastapi import APIRouter, Query, HTTPException
from psycopg.rows import dict_row
from typing import Optional, Dict, Any, List, Tuple
from datetime import datetime, timedelta, timezone
from app.db import get_conn

router = APIRouter(prefix="/kpi/tanques", tags=["kpi-tanques-live"])

TANKS_TABLE     = (os.getenv("TANKS_TABLE") or "public.tanks").strip()
LOCATIONS_TABLE = (os.getenv("LOCATIONS_TABLE") or "public.locations").strip()
LV_SOURCE       = (os.getenv("TANK_LEVELS_SOURCE") or "kpi.v_tank_levels_clean").strip()
# opcional: MV por tanque-hora (bucket 1h directo); si no existe, deja en vacío
LV_HOURLY_MV    = os.getenv("TANK_LEVELS_HOURLY_MV", "").strip()

def _bounds_utc_minute(f: Optional[datetime], t: Optional[datetime]):
    if t is None: t = datetime.now(timezone.utc)
    if f is None: f = t - timedelta(hours=24)
    if t.tzinfo is None: t = t.replace(tzinfo=timezone.utc)
    else: t = t.astimezone(timezone.utc)
    if f.tzinfo is None: f = f.replace(tzinfo=timezone.utc)
    else: f = f.astimezone(timezone.utc)
    f = f.replace(second=0, microsecond=0)
    t = t.replace(second=0, microsecond=0)
    if f >= t: raise HTTPException(status_code=400, detail="'from' debe ser menor que 'to'")
    return f, t

def _bucket_expr_sql(bucket: str) -> str:
    if bucket=="1min":  return "m"
    if bucket=="5min":  return "date_trunc('hour', m) + ((extract(minute from m)::int/5 )*5 )*interval '1 min'"
    if bucket=="15min": return "date_trunc('hour', m) + ((extract(minute from m)::int/15)*15)*interval '1 min'"
    if bucket=="1h":    return "date_trunc('hour', m)"
    if bucket=="1d":    return "date_trunc('day', m)"
    raise HTTPException(status_code=400, detail="bucket inválido")

def _parse_ids(csv: Optional[str]) -> Optional[List[int]]:
    if not csv: return None
    out: List[int] = []
    for t in csv.split(","):
        t = t.strip()
        if not t: continue
        try: out.append(int(t))
        except: pass
    return out or None

@router.get("/live")
def tanks_live_24h(
    company_id: Optional[int] = Query(None),
    location_id: Optional[int] = Query(None),
    tank_ids: Optional[str]    = Query(None),
    date_from: Optional[datetime] = Query(None, alias="from"),
    date_to:   Optional[datetime] = Query(None, alias="to"),
    agg: str    = Query("avg", pattern="^(avg|last)$"),
    carry: bool = Query(True),
    connected_only: bool = Query(True),
    bucket: str  = Query("1min", pattern="^(1min|5min|15min|1h|1d)$"),
):
    df, dt = _bounds_utc_minute(date_from, date_to)
    ids = _parse_ids(tank_ids)

    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        # scope de tanques
        if ids:
            scope_ids_all = ids
        else:
            cur.execute(
                f"""
                WITH params AS (SELECT %(company_id)s::bigint AS company_id, %(location_id)s::bigint AS location_id)
                SELECT t.id AS tank_id
                FROM {TANKS_TABLE} t
                JOIN {LOCATIONS_TABLE} l ON l.id = t.location_id
                CROSS JOIN params
                WHERE (params.company_id IS NULL OR l.company_id = params.company_id)
                  AND (params.location_id IS NULL OR l.id = params.location_id)
                """,
                {"company_id": company_id, "location_id": location_id},
            )
            scope_ids_all = [int(r["tank_id"]) for r in cur.fetchall()]

        if not scope_ids_all:
            return {"timestamps": [], "level_percent": [], "tanks_total": 0, "tanks_connected": 0,
                    "window": {"from": df.isoformat(), "to": dt.isoformat()}}

        # conectados en ventana
        cur.execute(
            f"""
            SELECT DISTINCT c.tank_id
            FROM {LV_SOURCE} c
            WHERE c.tank_id = ANY(%(ids)s::int[])
              AND c.ts >= %(df)s AND c.ts <= %(dt)s
            """,
            {"ids": scope_ids_all, "df": df, "dt": dt},
        )
        connected_set = {int(r["tank_id"]) for r in cur.fetchall()}
        scope_ids = scope_ids_all if not connected_only else [tid for tid in scope_ids_all if tid in connected_set]
        if not scope_ids:
            return {"timestamps": [], "level_percent": [], "tanks_total": len(scope_ids_all), "tanks_connected": 0,
                    "window": {"from": df.isoformat(), "to": dt.isoformat()}}

        # Elegir fuente: MV por hora si existe y bucket es 1h/1d y NO pediste lista explícita con "last"
        use_mv = bool(LV_HOURLY_MV) and bucket in ("1h","1d") and not (ids and agg=="last")

        if use_mv:
            # Agrupo por bucket desde MV horaria por tanque, y luego promedios de tanques del scope
            bucket_expr = "date_trunc('day', bucket)" if bucket=="1d" else "bucket"
            cur.execute(
                f"""
                WITH h AS (
                  SELECT
                    {bucket_expr} AS b,
                    tank_id,
                    level_avg::float AS val
                  FROM {LV_HOURLY_MV}
                  WHERE bucket >= %(df)s AND bucket <= %(dt)s
                    AND tank_id = ANY(%(ids)s::int[])
                ),
                by_bucket AS (
                  SELECT b, AVG(val)::float AS v
                  FROM h
                  GROUP BY b
                )
                SELECT extract(epoch FROM b)::bigint*1000 AS ts_ms, v
                FROM by_bucket
                ORDER BY ts_ms;
                """,
                {"df": df, "dt": dt, "ids": scope_ids},
            )
            rows = cur.fetchall()
            return {
                "timestamps": [int(r["ts_ms"]) for r in rows],
                "level_percent": [None if r["v"] is None else float(r["v"]) for r in rows],
                "tanks_total": len(scope_ids_all),
                "tanks_connected": len(connected_set),
                "window": {"from": df.isoformat(), "to": dt.isoformat()},
            }

        # Camino normal desde vista limpia por minuto, con LOCF y bucket en SQL
        bucket_expr = _bucket_expr_sql(bucket)
        # Dentro de cada minuto: avg|last
        minute_agg_sql = "avg(c.level_pct)::float" if agg=="avg" else \
                         "((array_agg(c.level_pct ORDER BY c.ts DESC))[1])"

        # Serie minuto a minuto por tanque
        cur.execute(
            f"""
            WITH bounds AS (
              SELECT %(df)s::timestamptz AS df, %(dt)s::timestamptz AS dt
            ),
            minutes AS (
              SELECT generate_series((SELECT df FROM bounds),(SELECT dt FROM bounds), interval '1 minute') AS m
            ),
            per_min AS (
              SELECT date_trunc('minute', c.ts) AS m, c.tank_id, {minute_agg_sql} AS val
              FROM {LV_SOURCE} c
              WHERE c.tank_id = ANY(%(ids)s::int[])
                AND c.ts >= %(df)s AND c.ts <= %(dt)s
              GROUP BY 1,2
            ),
            baseline AS (
              SELECT DISTINCT ON (c.tank_id) c.tank_id, c.level_pct::float AS val
              FROM {LV_SOURCE} c
              WHERE c.tank_id = ANY(%(ids)s::int[]) AND c.ts < %(df)s
              ORDER BY c.tank_id, c.ts DESC
            ),
            -- LOCF por tanque
            filled AS (
              SELECT
                pm.tank_id,
                minutes.m,
                COALESCE(pm.val,
                  last_value(pm.val) OVER (PARTITION BY pm.tank_id ORDER BY minutes.m
                                           RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW),
                  (SELECT val FROM baseline b WHERE b.tank_id = pm.tank_id)
                ) AS v
              FROM minutes
              CROSS JOIN (SELECT DISTINCT tank_id FROM (SELECT unnest(%(ids)s::int[]) AS tank_id) s) tks
              LEFT JOIN per_min pm ON pm.m = minutes.m AND pm.tank_id = tks.tank_id
            ),
            bucketed AS (
              SELECT
                {bucket_expr} AS b,
                AVG(v)::float AS v
              FROM filled
              GROUP BY 1
            )
            SELECT extract(epoch FROM b)::bigint*1000 AS ts_ms, v
            FROM bucketed
            ORDER BY ts_ms;
            """,
            {"ids": scope_ids, "df": df, "dt": dt},
        )
        rows = cur.fetchall()

    return {
        "timestamps": [int(r["ts_ms"]) for r in rows],
        "level_percent": [None if r["v"] is None else float(r["v"]) for r in rows],
        "tanks_total": len(scope_ids_all),
        "tanks_connected": len(connected_set),
        "window": {"from": df.isoformat(), "to": dt.isoformat()},
    }
