# app/routes/kpi/tanques.py
from fastapi import APIRouter, Query
from psycopg.rows import dict_row
from app.db import get_conn
from datetime import datetime
from typing import Optional, List, Any

from ._common import (
    logger, LOCAL_TZ, _ft_defaults, _log_scope, _log_rows, _log_distinct_company_of_locations,
    _as_float, _as_int, _as_bool, _compute_alarm
)

router = APIRouter(prefix="/kpi", tags=["kpi-tanques"])

# ---- Últimos niveles + config ----
@router.get("/tanks/latest", summary="Últimos niveles y config de tanques (kpi.v_tanks_with_config)")
def list_tanks_latest(
    company_id: Optional[int] = Query(None, description="Filtra por empresa"),
    location_id: Optional[int] = Query(None, description="Filtra por localidad específica")
):
    _log_scope("/tanks/latest", company_id=company_id, location_id=location_id)
    sql = """
    SELECT
      v.tank_id, v.name, v.location_id, v.location_name,
      v.low_pct, v.low_low_pct, v.high_pct, v.high_high_pct,
      v.updated_by, v.updated_at, v.level_pct, v.age_sec, v.online, v.alarma
    FROM kpi.v_tanks_with_config v
    JOIN public.locations l ON l.id = v.location_id
    WHERE (%s::bigint IS NULL OR l.company_id = %s::bigint)
    """
    params: List[Any] = [company_id, company_id]
    if location_id is not None:
        sql += " AND l.id = %s::bigint"
        params.append(location_id)
    sql += " ORDER BY v.tank_id"

    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        logger.debug("[KPI] /tanks/latest ejecutando SQL (firma) WHERE company_id=%s, location_id=%s",
                     company_id, location_id)
        cur.execute(sql, tuple(params))
        rows = cur.fetchall()
        _log_rows("/tanks/latest", rows)
        _log_distinct_company_of_locations(cur, "/tanks/latest", company_id, rows)

    out = []
    for r in rows:
        alarm_txt = r.get("alarma")
        if alarm_txt is None:
            alarm_txt = _compute_alarm(
                r.get("level_pct"),
                r.get("low_low_pct"),
                r.get("low_pct"),
                r.get("high_pct"),
                r.get("high_high_pct"),
            )
        out.append({
            "tank_id":        r["tank_id"],
            "name":           r["name"],
            "location_id":    r["location_id"],
            "location_name":  r["location_name"],
            "low_pct":        _as_float(r.get("low_pct")),
            "low_low_pct":    _as_float(r.get("low_low_pct")),
            "high_pct":       _as_float(r.get("high_pct")),
            "high_high_pct":  _as_float(r.get("high_high_pct")),
            "updated_by":     r["updated_by"],
            "updated_at":     r["updated_at"],
            "level_pct":      _as_float(r.get("level_pct")),
            "age_sec":        _as_int(r.get("age_sec")),
            "online":         _as_bool(r.get("online")),
            "alarma":         str(alarm_txt),
        })
    return out

# ---- Promedio horario de nivel ----
@router.get("/graphs/tanks/level_avg", summary="Promedio horario de nivel en [from,to)")
def tanks_level_avg(
    date_from: Optional[datetime] = Query(None, alias="from"),
    date_to:   Optional[datetime] = Query(None, alias="to"),
    location_id: Optional[int] = Query(None),
    entity_id:  Optional[int] = Query(None),
    company_id: Optional[int] = Query(None),
):
    df, dt = _ft_defaults(date_from, date_to)
    _log_scope("/graphs/tanks/level_avg", from_=df, to=dt, company_id=company_id,
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
    levels AS (
      SELECT date_trunc('hour', v.ts) AS hour_utc, (v.value)::float AS val
      FROM kpi.v_kpi_stream v
      JOIN s_locs ON s_locs.id = v.location_id
      WHERE v.kind='tank' AND v.metric='level_pct'
        AND v.ts >= (SELECT from_ts FROM bounds) AND v.ts < (SELECT to_ts FROM bounds)
        { "AND v.entity_id = %s::bigint" if entity_id is not None else "" }
    ),
    agg AS (
      SELECT hour_utc, avg(val)::float AS avg_level_pct
      FROM levels
      GROUP BY hour_utc
    )
    SELECT to_char((h.hour_utc AT TIME ZONE '{LOCAL_TZ}'), 'HH24:00') AS local_hour,
           a.avg_level_pct
    FROM hours h
    LEFT JOIN agg a USING (hour_utc)
    ORDER BY 1;
    """
    params: List[Any] = [df, dt, company_id, company_id]
    if location_id is not None: params.append(location_id)
    if entity_id   is not None: params.append(entity_id)

    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        logger.debug("[KPI] /graphs/tanks/level_avg ejecutando SQL (firma) WHERE company_id=%s, location_id=%s, entity_id=%s",
                     company_id, location_id, entity_id)
        cur.execute(sql, tuple(params))
        rows = cur.fetchall()
        _log_rows("/graphs/tanks/level_avg", rows)
        return rows
