# app/routes/kpi/dashboard.py
from fastapi import APIRouter, Query
from psycopg.rows import dict_row
from app.db import get_conn
from datetime import datetime
from typing import Optional, List, Any

from ._common import (
    logger, LOCAL_TZ, _ft_defaults, _log_scope, _log_rows, _log_distinct_company_of_locations,
    _as_int, _as_bool,
)

router = APIRouter(prefix="/kpi", tags=["kpi"])

# ---- Ping / diagnóstico ----
@router.get("/ping", summary="Ping KPI (sin DB)")
def kpi_ping():
    return {"ok": True, "module": "kpi", "tz": LOCAL_TZ}

# ---- Estado de bombas (v_pumps_with_status) ----
@router.get("/pumps/status", summary="Estado de bombas (vista kpi.v_pumps_with_status)")
def list_pumps_status(
    company_id: Optional[int] = Query(None, description="Filtra por empresa"),
    location_id: Optional[int] = Query(None, description="Filtra por localidad específica")
):
    _log_scope("/pumps/status", company_id=company_id, location_id=location_id)
    sql = """
    SELECT
      v.pump_id, v.name, v.location_id, v.location_name, v.state,
      v.latest_event_id, v.age_sec, v.online, v.event_ts, v.latest_hb_id, v.hb_ts
    FROM kpi.v_pumps_with_status v
    JOIN public.locations l ON l.id = v.location_id
    WHERE (%s::bigint IS NULL OR l.company_id = %s::bigint)
    """
    params: List[Any] = [company_id, company_id]
    if location_id is not None:
        sql += " AND l.id = %s::bigint"
        params.append(location_id)
    sql += " ORDER BY v.pump_id"

    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        logger.debug("[KPI] /pumps/status ejecutando SQL (firma) WHERE company_id=%s, location_id=%s",
                     company_id, location_id)
        cur.execute(sql, tuple(params))
        rows = cur.fetchall()
        _log_rows("/pumps/status", rows)
        _log_distinct_company_of_locations(cur, "/pumps/status", company_id, rows)

    out = []
    for r in rows:
        out.append({
            "pump_id":         r["pump_id"],
            "name":            r["name"],
            "location_id":     r["location_id"],
            "location_name":   r["location_name"],
            "state":           r["state"],
            "latest_event_id": r["latest_event_id"],
            "age_sec":         _as_int(r.get("age_sec")),
            "online":          _as_bool(r.get("online")),
            "event_ts":        r["event_ts"],
            "latest_hb_id":    r["latest_hb_id"],
            "hb_ts":           r["hb_ts"],
        })
    return out

# ---- Buckets de horas locales entre from/to ----
@router.get("/graphs/buckets", summary="Devuelve buckets hora local entre from/to (default: últimas 24h)")
def buckets(
    date_from: Optional[datetime] = Query(None, alias="from"),
    date_to:   Optional[datetime] = Query(None, alias="to"),
):
    df, dt = _ft_defaults(date_from, date_to)
    logger.debug("[KPI] /graphs/buckets from=%s to=%s", df, dt)
    sql = f"""
    WITH bounds AS (
      SELECT %s::timestamptz AS from_utc, %s::timestamptz AS to_utc
    ),
    hours AS (
      SELECT generate_series(
        date_trunc('hour', (from_utc AT TIME ZONE '{LOCAL_TZ}')),
        date_trunc('hour', (to_utc   AT TIME ZONE '{LOCAL_TZ}')) - interval '1 hour',
        interval '1 hour'
      ) AS local_hour_ts
      FROM bounds
    )
    SELECT to_char(local_hour_ts, 'HH24:00') AS local_hour
    FROM hours
    ORDER BY local_hour_ts;
    """
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(sql, (df, dt))
        rows = cur.fetchall()
        _log_rows("/graphs/buckets", rows)
        return rows

# ---- Bombas activas por hora ----
@router.get("/graphs/pumps/active", summary="Bombas activas por hora en [from,to)")
def pumps_active(
    date_from: Optional[datetime] = Query(None, alias="from"),
    date_to:   Optional[datetime] = Query(None, alias="to"),
    location_id: Optional[int] = Query(None),
    company_id: Optional[int] = Query(None),
):
    df, dt = _ft_defaults(date_from, date_to)
    _log_scope("/graphs/pumps/active", from_=df, to=dt, company_id=company_id, location_id=location_id)

    sql = f"""
    WITH bounds AS (
      SELECT %s::timestamptz AS from_ts, %s::timestamptz AS to_ts
    ),
    s_locs AS (
      SELECT id FROM public.locations
      WHERE (%s::bigint IS NULL OR company_id = %s::bigint)
      { "AND id = %s::bigint" if location_id is not None else "" }
    ),
    hours AS (
      SELECT generate_series(
        date_trunc('hour', (SELECT from_ts FROM bounds)),
        date_trunc('hour', (SELECT to_ts   FROM bounds)) - interval '1 hour',
        interval '1 hour'
      ) AS hour_utc
    ),
    v AS (
      SELECT entity_id AS pump_id, ts, value, location_id,
             lead(ts) OVER (PARTITION BY entity_id ORDER BY ts) AS next_ts
      FROM kpi.v_kpi_stream
      WHERE kind='pump' AND metric='state'
        AND ts >= (SELECT from_ts FROM bounds) - interval '6 hours'
        AND ts <  (SELECT to_ts   FROM bounds) + interval '6 hours'
    ),
    ev AS (
      SELECT v.pump_id, v.ts, v.next_ts
      FROM v JOIN s_locs ON s_locs.id = v.location_id
      WHERE v.value = '1' OR v.value = 1
    ),
    intervals AS (
      SELECT pump_id, ts AS start_ts, COALESCE(next_ts, now()) AS end_ts
      FROM ev
    ),
    counts AS (
      SELECT h.hour_utc, count(DISTINCT i.pump_id) AS pumps_count
      FROM hours h
      LEFT JOIN intervals i
        ON i.start_ts < h.hour_utc + interval '1 hour'
       AND i.end_ts   > h.hour_utc
      GROUP BY h.hour_utc
    )
    SELECT to_char((hour_utc AT TIME ZONE '{LOCAL_TZ}'), 'HH24:00') AS local_hour,
           COALESCE(pumps_count, 0) AS pumps_count
    FROM counts
    ORDER BY 1;
    """
    params: List[Any] = [df, dt, company_id, company_id]
    if location_id is not None:
        params.append(location_id)

    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        logger.debug("[KPI] /graphs/pumps/active ejecutando SQL (firma) WHERE company_id=%s, location_id=%s",
                     company_id, location_id)
        cur.execute(sql, tuple(params))
        rows = cur.fetchall()
        _log_rows("/graphs/pumps/active", rows)
        return rows

# ---- Arranques por hora ----
@router.get("/graphs/pumps/starts", summary="Arranques por hora en [from,to)")
def pumps_starts(
    date_from: Optional[datetime] = Query(None, alias="from"),
    date_to:   Optional[datetime] = Query(None, alias="to"),
    location_id: Optional[int] = Query(None),
    entity_id:  Optional[int] = Query(None),
    company_id: Optional[int] = Query(None),
):
    df, dt = _ft_defaults(date_from, date_to)
    _log_scope("/graphs/pumps/starts", from_=df, to=dt, company_id=company_id,
               location_id=location_id, entity_id=entity_id)

    sql = f"""
    WITH bounds AS (
      SELECT %s::timestamptz AS from_ts, %s::timestamptz AS to_ts
    ),
    s_locs AS (
      SELECT id FROM public.locations
      WHERE (%s::bigint IS NULL OR company_id = %s::bigint)
      { "AND id = %s::bigint" if location_id is not None else "" }
    ),
    hours AS (
      SELECT generate_series(
        date_trunc('hour', (SELECT from_ts FROM bounds)),
        date_trunc('hour', (SELECT to_ts   FROM bounds)) - interval '1 hour',
        interval '1 hour'
      ) AS hour_utc
    ),
    starts AS (
      SELECT date_trunc('hour', v.ts) AS hour_utc, 1 AS one
      FROM kpi.v_kpi_stream v
      JOIN s_locs ON s_locs.id = v.location_id
      WHERE v.kind='pump' AND v.metric='state' AND v.event='start'
        AND v.ts >= (SELECT from_ts FROM bounds) AND v.ts < (SELECT to_ts FROM bounds)
        { "AND v.entity_id = %s::bigint" if entity_id is not None else "" }
    ),
    agg AS (
      SELECT hour_utc, COALESCE(sum(one),0) AS starts FROM starts GROUP BY hour_utc
    )
    SELECT to_char((h.hour_utc AT TIME ZONE '{LOCAL_TZ}'), 'HH24:00') AS local_hour,
           COALESCE(a.starts,0) AS starts
    FROM hours h
    LEFT JOIN agg a USING (hour_utc)
    ORDER BY 1;
    """
    params: List[Any] = [df, dt, company_id, company_id]
    if location_id is not None: params.append(location_id)
    if entity_id   is not None: params.append(entity_id)

    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        logger.debug("[KPI] /graphs/pumps/starts ejecutando SQL (firma) WHERE company_id=%s, location_id=%s, entity_id=%s",
                     company_id, location_id, entity_id)
        cur.execute(sql, tuple(params))
        rows = cur.fetchall()
        _log_rows("/graphs/pumps/starts", rows)
        return rows
