# app/routes/kpi/bombas_live.py
import os
from datetime import datetime, timedelta, timezone
from typing import Optional, List, Tuple

from fastapi import APIRouter, Query, HTTPException, Header
from psycopg.rows import dict_row

from app.db import get_conn

router = APIRouter(prefix="/kpi/bombas", tags=["kpi-bombas"])

PUMPS_TABLE = (os.getenv("PUMPS_TABLE") or "public.pumps").strip()
LOCATIONS_TABLE = (os.getenv("LOCATIONS_TABLE") or "public.locations").strip()

# Fuente para detectar conectividad (último HB por bomba)
HB_SOURCE = (os.getenv("PUMP_HB_SOURCE") or "kpi.v_pump_hb_clean").strip()

# Fuente agregada por minuto (✅ reduce 5s HB -> 1min por bomba)
PUMP_STATE_1M = (os.getenv("PUMP_STATE_1M") or "kpi.mv_pump_state_1m").strip()

PUMP_CONNECTED_WINDOW_MIN = int(os.getenv("PUMP_CONNECTED_WINDOW_MIN", "5"))

# KPI bombas: resolución fija (24h) -> 5min
FORCED_BUCKET = os.getenv("KPI_PUMPS_BUCKET", "5min").strip()

# Seguridad refresh
ADMIN_REFRESH_TOKEN = (os.getenv("ADMIN_REFRESH_TOKEN") or "").strip()

# Advisory lock key (cualquier int64 fijo)
REFRESH_LOCK_KEY = 987654321


def _bounds_utc_minute(
    date_from: Optional[datetime],
    date_to: Optional[datetime],
) -> Tuple[datetime, datetime, datetime]:
    """
    Devuelve:
      - df_floor: from en UTC redondeado a minuto
      - dt_floor: to en UTC redondeado a minuto (para series)
      - now_utc: ahora real UTC (para conectividad, sin truncar)
    Por defecto últimas 24 hs.
    """
    now_utc = datetime.now(timezone.utc)

    if date_to is None:
        date_to = now_utc
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

    dt_floor = date_to.replace(second=0, microsecond=0)
    df_floor = date_from.replace(second=0, microsecond=0)

    if df_floor >= dt_floor:
        raise HTTPException(status_code=400, detail="'from' debe ser menor que 'to'")

    return df_floor, dt_floor, now_utc


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


@router.post("/refresh")
def refresh_mv_pump_state_1m(x_token: str = Header(default="", alias="X-Token")):
    """
    Refresca la MV kpi.mv_pump_state_1m.
    - protegido por token (ADMIN_REFRESH_TOKEN)
    - usa advisory lock para no solapar refresh
    - intenta CONCURRENTLY; si falla, cae a refresh normal
    """
    if not ADMIN_REFRESH_TOKEN:
        raise HTTPException(status_code=500, detail="ADMIN_REFRESH_TOKEN no configurado")
    if x_token != ADMIN_REFRESH_TOKEN:
        raise HTTPException(status_code=401, detail="unauthorized")

    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        # evitar solapes
        cur.execute("SELECT pg_try_advisory_lock(%s) AS ok;", (REFRESH_LOCK_KEY,))
        ok = bool(cur.fetchone()["ok"])
        if not ok:
            return {"ok": True, "skipped": True, "reason": "refresh already running"}

        try:
            # intentar concurrently (requiere índice UNIQUE)
            try:
                cur.execute(f"REFRESH MATERIALIZED VIEW CONCURRENTLY {PUMP_STATE_1M};")
                mode = "concurrently"
            except Exception as e:
                # fallback: refresh normal
                cur.execute(f"REFRESH MATERIALIZED VIEW {PUMP_STATE_1M};")
                mode = "normal_fallback"

            # devolver lag para debug
            cur.execute(
                f"""
                SELECT
                  max(minute_ts) AS last_minute,
                  now() - max(minute_ts) AS lag
                FROM {PUMP_STATE_1M};
                """
            )
            r = cur.fetchone() or {}
            return {
                "ok": True,
                "mode": mode,
                "last_minute": (r.get("last_minute").isoformat() if r.get("last_minute") else None),
                "lag": str(r.get("lag")) if r.get("lag") is not None else None,
            }
        finally:
            cur.execute("SELECT pg_advisory_unlock(%s);", (REFRESH_LOCK_KEY,))


@router.get("/live")
def pumps_live(
    company_id: Optional[int] = Query(None),
    location_id: Optional[int] = Query(None),
    pump_ids: Optional[str] = Query(None, description="CSV de pump_id"),
    date_from: Optional[datetime] = Query(None, alias="from"),
    date_to: Optional[datetime] = Query(None, alias="to"),
    # se mantiene por compatibilidad, pero se fuerza por env / default
    bucket: str = Query("1min", pattern="^(1min|5min|15min|1h|1d)$"),
    agg_mode: str = Query("avg", pattern="^(avg|max)$"),
    connected_only: bool = Query(True),
):
    """
    KPI Bombas (24h):
    - bucket forzado (default 5min)
    - usa fuente agregada por minuto (kpi.mv_pump_state_1m) para evitar recorrer HB cada 5s
    - calcula conectadas con último HB por bomba (LATERAL + índice)
    """
    df, dt, now_utc = _bounds_utc_minute(date_from, date_to)
    ids = _parse_ids(pump_ids)

    # bucket forzado
    bucket = FORCED_BUCKET or "5min"
    if bucket != "5min":
        bucket = "5min"

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

        # 2) Bombas conectadas (usar now_utc real, NO dt truncado)
        recent_from = now_utc - timedelta(minutes=PUMP_CONNECTED_WINDOW_MIN)

        cur.execute(
            f"""
            WITH scope AS (
              SELECT unnest(%s::int[]) AS pump_id
            )
            SELECT
              s.pump_id,
              h.hb_ts
            FROM scope s
            LEFT JOIN LATERAL (
              SELECT h.hb_ts
              FROM {HB_SOURCE} h
              WHERE h.pump_id = s.pump_id
                AND h.hb_ts <= %s
              ORDER BY h.hb_ts DESC
              LIMIT 1
            ) h ON true;
            """,
            (scope_ids_all, now_utc),
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

        # 3) Timeline usando mv_pump_state_1m (1 fila / bomba / minuto)
        if agg_mode not in ("avg", "max"):
            raise HTTPException(status_code=400, detail="agg_mode inválido")

        if agg_mode == "avg":
            # avg real dentro del bucket: (sum ON por minuto) promediado en los 5 minutos
            cur.execute(
                f"""
                WITH bounds AS (
                  SELECT %s::timestamptz AS df, %s::timestamptz AS dt
                ),
                scope AS (
                  SELECT unnest(%s::int[]) AS pump_id
                ),
                per_min AS (
                  SELECT
                    m.minute_ts,
                    CASE WHEN m.is_on THEN 1 ELSE 0 END AS on_int
                  FROM {PUMP_STATE_1M} m
                  JOIN scope s ON s.pump_id = m.pump_id
                  WHERE m.minute_ts >= (SELECT df FROM bounds)
                    AND m.minute_ts <= (SELECT dt FROM bounds)
                ),
                per_min_sum AS (
                  SELECT minute_ts, SUM(on_int)::float AS on_count
                  FROM per_min
                  GROUP BY minute_ts
                ),
                per_5m AS (
                  SELECT
                    date_trunc('hour', minute_ts)
                      + ((extract(minute from minute_ts)::int / 5) * 5) * interval '1 min'
                      AS bucket_ts,
                    AVG(on_count) AS v
                  FROM per_min_sum
                  GROUP BY bucket_ts
                )
                SELECT
                  extract(epoch FROM bucket_ts)::bigint * 1000 AS ts_ms,
                  v AS val
                FROM per_5m
                ORDER BY bucket_ts;
                """,
                (df, dt, scope_ids),
            )
        else:
            cur.execute(
                f"""
                WITH bounds AS (
                  SELECT %s::timestamptz AS df, %s::timestamptz AS dt
                ),
                scope AS (
                  SELECT unnest(%s::int[]) AS pump_id
                ),
                per_min AS (
                  SELECT
                    m.minute_ts,
                    CASE WHEN m.is_on THEN 1 ELSE 0 END AS on_int
                  FROM {PUMP_STATE_1M} m
                  JOIN scope s ON s.pump_id = m.pump_id
                  WHERE m.minute_ts >= (SELECT df FROM bounds)
                    AND m.minute_ts <= (SELECT dt FROM bounds)
                ),
                per_min_sum AS (
                  SELECT minute_ts, SUM(on_int)::float AS on_count
                  FROM per_min
                  GROUP BY minute_ts
                ),
                per_5m AS (
                  SELECT
                    date_trunc('hour', minute_ts)
                      + ((extract(minute from minute_ts)::int / 5) * 5) * interval '1 min'
                      AS bucket_ts,
                    MAX(on_count) AS v
                  FROM per_min_sum
                  GROUP BY bucket_ts
                )
                SELECT
                  extract(epoch FROM bucket_ts)::bigint * 1000 AS ts_ms,
                  v AS val
                FROM per_5m
                ORDER BY bucket_ts;
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
