# app/routes/kpi/tanques.py
import os
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional, List, Any
from uuid import UUID

from fastapi import APIRouter, Query, HTTPException
from psycopg.rows import dict_row

from app.db import get_conn

from ._common import (
    logger,
    LOCAL_TZ,
    _ft_defaults,
    _log_scope,
    _log_rows,
    _log_distinct_company_of_locations,
    _as_float,
    _as_int,
    _as_bool,
    _compute_alarm,
)

router = APIRouter(prefix="/kpi", tags=["kpi-tanques"])

TANKS_TABLE = (os.getenv("TANKS_TABLE") or "public.tanks").strip()
LOCATIONS_TABLE = (os.getenv("LOCATIONS_TABLE") or "public.locations").strip()
TANK_INGEST_TABLE = (os.getenv("TANK_INGEST_TABLE") or "public.tank_ingest").strip()

# Vistas existentes
TANKS_WITH_CONFIG_VIEW = (
    os.getenv("TANKS_WITH_CONFIG_VIEW") or "kpi.v_tanks_with_config"
).strip()

# Vistas operativas
OP_TANK_LEVEL_1M = (
    os.getenv("OP_TANK_LEVEL_1M") or "kpi.v_operation_tank_level_1m"
).strip()

OP_TANK_SUMMARY_24H = (
    os.getenv("OP_TANK_SUMMARY_24H") or "kpi.v_operation_tank_summary_24h"
).strip()

# Tabla de eventos críticos
TANK_CRITICAL_EVENTS = (
    os.getenv("TANK_CRITICAL_EVENTS") or "kpi.tank_critical_events"
).strip()


def _jsonable(v):
    if v is None:
        return None
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    if isinstance(v, Decimal):
        return float(v)
    if isinstance(v, UUID):
        return str(v)
    if isinstance(v, timedelta):
        return str(v)
    return v


def _clean_row(row: dict) -> dict:
    return {k: _jsonable(v) for k, v in row.items()}


def _clean_rows(rows) -> List[dict]:
    return [_clean_row(dict(r)) for r in rows or []]


def _bounds_utc_minute(
    date_from: Optional[datetime],
    date_to: Optional[datetime],
) -> tuple[datetime, datetime]:
    """
    Devuelve from/to en UTC redondeados a minuto.
    Por defecto: últimas 24 hs.
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

    df = date_from.replace(second=0, microsecond=0)
    dt = date_to.replace(second=0, microsecond=0)

    if df >= dt:
        raise HTTPException(status_code=400, detail="'from' debe ser menor que 'to'")

    return df, dt


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


def _validate_bucket(bucket: str) -> str:
    bucket = (bucket or "1min").strip()

    if bucket not in ("1min", "5min", "15min", "1h", "1d"):
        raise HTTPException(status_code=400, detail="bucket inválido")

    return bucket


def _bucket_expr_sql(col: str, bucket: str) -> str:
    bucket = _validate_bucket(bucket)

    if bucket == "1min":
        return f"date_trunc('minute', {col})"

    if bucket == "5min":
        return (
            f"date_trunc('hour', {col}) "
            f"+ ((extract(minute from {col})::int / 5) * 5) * interval '1 min'"
        )

    if bucket == "15min":
        return (
            f"date_trunc('hour', {col}) "
            f"+ ((extract(minute from {col})::int / 15) * 15) * interval '1 min'"
        )

    if bucket == "1h":
        return f"date_trunc('hour', {col})"

    if bucket == "1d":
        return (
            f"date_trunc('day', {col} at time zone '{LOCAL_TZ}') "
            f"at time zone '{LOCAL_TZ}'"
        )

    return f"date_trunc('minute', {col})"


def _duration_label_sql(expr: str) -> str:
    return f"""
        case
            when {expr} is null then null
            when {expr} < 60 then round({expr}) || ' seg'
            when {expr} < 3600 then round({expr} / 60.0, 1) || ' min'
            else round({expr} / 3600.0, 1) || ' h'
        end
    """


# -------------------------------------------------------------------
# Últimos niveles + config / listado liviano
# -------------------------------------------------------------------
@router.get("/tanks/latest", summary="Tanques para selector o estado live")
def list_tanks_latest(
    company_id: Optional[int] = Query(None, description="Filtra por empresa"),
    location_id: Optional[int] = Query(None, description="Filtra por localidad específica"),
    include_live: bool = Query(False, description="Si true, agrega nivel/config/alarma/online"),
):
    _log_scope(
        "/tanks/latest",
        company_id=company_id,
        location_id=location_id,
        include_live=include_live,
    )

    # ---------- MODO LIVIANO: ideal para selectores ----------
    if not include_live:
        sql = f"""
        select
          t.id as tank_id,
          t.name,
          t.location_id,
          l.name as location_name
        from {TANKS_TABLE} t
        join {LOCATIONS_TABLE} l on l.id = t.location_id
        where (%s::bigint is null or l.company_id = %s::bigint)
          and (%s::bigint is null or l.id = %s::bigint)
        order by t.id
        """
        params: List[Any] = [company_id, company_id, location_id, location_id]

        with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
            logger.debug(
                "[KPI] /tanks/latest LIVIANO SQL WHERE company_id=%s, location_id=%s",
                company_id,
                location_id,
            )
            cur.execute(sql, tuple(params))
            rows = cur.fetchall()
            _log_rows("/tanks/latest[lite]", rows)
            _log_distinct_company_of_locations(cur, "/tanks/latest[lite]", company_id, rows)

        return [
            {
                "tank_id": r["tank_id"],
                "name": r["name"],
                "location_id": r["location_id"],
                "location_name": r["location_name"],
            }
            for r in rows
        ]

    # ---------- MODO PESADO: live/config ----------
    sql = f"""
    select
      v.tank_id,
      v.name,
      v.location_id,
      v.location_name,
      v.low_pct,
      v.low_low_pct,
      v.high_pct,
      v.high_high_pct,
      v.updated_by,
      v.updated_at,
      v.level_pct,
      v.age_sec,
      v.online,
      v.alarma
    from {TANKS_WITH_CONFIG_VIEW} v
    join {LOCATIONS_TABLE} l on l.id = v.location_id
    where (%s::bigint is null or l.company_id = %s::bigint)
      and (%s::bigint is null or l.id = %s::bigint)
    order by v.tank_id
    """
    params: List[Any] = [company_id, company_id, location_id, location_id]

    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        logger.debug(
            "[KPI] /tanks/latest PESADO SQL WHERE company_id=%s, location_id=%s",
            company_id,
            location_id,
        )
        cur.execute(sql, tuple(params))
        rows = cur.fetchall()
        _log_rows("/tanks/latest[full]", rows)
        _log_distinct_company_of_locations(cur, "/tanks/latest[full]", company_id, rows)

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

        out.append(
            {
                "tank_id": r["tank_id"],
                "name": r["name"],
                "location_id": r["location_id"],
                "location_name": r["location_name"],
                "low_pct": _as_float(r.get("low_pct")),
                "low_low_pct": _as_float(r.get("low_low_pct")),
                "high_pct": _as_float(r.get("high_pct")),
                "high_high_pct": _as_float(r.get("high_high_pct")),
                "updated_by": r["updated_by"],
                "updated_at": r["updated_at"],
                "level_pct": _as_float(r.get("level_pct")),
                "age_sec": _as_int(r.get("age_sec")),
                "online": _as_bool(r.get("online")),
                "alarma": str(alarm_txt),
            }
        )

    return out


# -------------------------------------------------------------------
# Promedio horario de nivel legacy
# -------------------------------------------------------------------
@router.get("/graphs/tanks/level_avg", summary="Promedio horario de nivel en [from,to)")
def tanks_level_avg(
    date_from: Optional[datetime] = Query(None, alias="from"),
    date_to: Optional[datetime] = Query(None, alias="to"),
    location_id: Optional[int] = Query(None),
    entity_id: Optional[int] = Query(None),
    company_id: Optional[int] = Query(None),
):
    df, dt = _ft_defaults(date_from, date_to)

    _log_scope(
        "/graphs/tanks/level_avg",
        from_=df,
        to=dt,
        company_id=company_id,
        location_id=location_id,
        entity_id=entity_id,
    )

    sql = f"""
    with bounds as (
      select %s::timestamptz as from_ts, %s::timestamptz as to_ts
    ),
    s_locs as (
      select id
      from {LOCATIONS_TABLE}
      where (%s::bigint is null or company_id = %s::bigint)
      {"and id = %s::bigint" if location_id is not None else ""}
    ),
    hours as (
      select generate_series(
        date_trunc('hour', (select from_ts from bounds)),
        date_trunc('hour', (select to_ts from bounds)) - interval '1 hour',
        interval '1 hour'
      ) as hour_utc
    ),
    levels as (
      select
        date_trunc('hour', v.ts) as hour_utc,
        (v.value)::float as val
      from kpi.v_kpi_stream v
      join s_locs on s_locs.id = v.location_id
      where v.kind = 'tank'
        and v.metric = 'level_pct'
        and v.ts >= (select from_ts from bounds)
        and v.ts < (select to_ts from bounds)
        {"and v.entity_id = %s::bigint" if entity_id is not None else ""}
    ),
    agg as (
      select
        hour_utc,
        avg(val)::float as avg_level_pct
      from levels
      group by hour_utc
    )
    select
      to_char((h.hour_utc at time zone '{LOCAL_TZ}'), 'HH24:00') as local_hour,
      a.avg_level_pct
    from hours h
    left join agg a using (hour_utc)
    order by 1;
    """

    params: List[Any] = [df, dt, company_id, company_id]

    if location_id is not None:
        params.append(location_id)

    if entity_id is not None:
        params.append(entity_id)

    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        logger.debug(
            "[KPI] /graphs/tanks/level_avg ejecutando SQL WHERE company_id=%s, location_id=%s, entity_id=%s",
            company_id,
            location_id,
            entity_id,
        )
        cur.execute(sql, tuple(params))
        rows = cur.fetchall()
        _log_rows("/graphs/tanks/level_avg", rows)
        return rows


# -------------------------------------------------------------------
# Operación PRO - Resumen 24h de tanques
# -------------------------------------------------------------------
@router.get("/tanques/operation/summary-24h")
@router.get("/tanks/operation/summary-24h")
def operation_tanks_summary_24h(
    company_id: Optional[int] = Query(None),
    location_id: Optional[int] = Query(None),
    tank_ids: Optional[str] = Query(None, description="CSV de tank_id"),
    only_problems: bool = Query(False),
    limit: int = Query(200, ge=1, le=1000),
):
    """
    Resumen operativo de tanques últimas 24h.

    Optimizado:
      - No usa kpi.v_operation_tank_summary_24h.
      - Calcula directo desde public.tank_ingest.
      - Usa kpi.v_tanks_with_config solo para umbrales/config/online.
    """
    ids = _parse_ids(tank_ids)

    dt = datetime.now(timezone.utc).replace(second=0, microsecond=0)
    df = dt - timedelta(hours=24)
    online_from = dt - timedelta(minutes=5)

    sql_items = f"""
        with scope as (
            select
                t.id as tank_id,
                t.name as tank_name,
                t.location_id,
                l.name as location_name
            from {TANKS_TABLE} t
            left join {LOCATIONS_TABLE} l
              on l.id = t.location_id
            where (%(company_id)s::bigint is null or l.company_id = %(company_id)s::bigint)
              and (%(location_id)s::bigint is null or t.location_id = %(location_id)s::bigint)
              and (%(tank_ids)s::int[] is null or t.id = any(%(tank_ids)s::int[]))
        ),

        levels as (
            select
                ti.tank_id,
                ti.created_at,
                ti.level_pct::numeric as level_pct
            from {TANK_INGEST_TABLE} ti
            join scope s
              on s.tank_id = ti.tank_id
            where ti.created_at >= %(df)s
              and ti.created_at < %(dt)s
        ),

        agg as (
            select
                tank_id,

                min(level_pct) as min_24h,
                (array_agg(created_at order by level_pct asc, created_at asc))[1] as min_24h_at,

                max(level_pct) as max_24h,
                (array_agg(created_at order by level_pct desc, created_at asc))[1] as max_24h_at,

                round(avg(level_pct), 2) as avg_24h,
                count(*)::int as samples_24h
            from levels
            group by tank_id
        ),

        latest as (
            select distinct on (ti.tank_id)
                ti.tank_id,
                ti.level_pct::numeric as current_level,
                ti.created_at as last_level_at
            from {TANK_INGEST_TABLE} ti
            join scope s
              on s.tank_id = ti.tank_id
            where ti.created_at < %(dt)s
            order by ti.tank_id, ti.created_at desc, ti.id desc
        ),

        cfg as (
            select
                c.tank_id,
                c.low_pct,
                c.low_low_pct,
                c.high_pct,
                c.high_high_pct,
                c.age_sec,
                c.online,
                c.alarma
            from {TANKS_WITH_CONFIG_VIEW} c
            join scope s
              on s.tank_id = c.tank_id
        ),

        enriched as (
            select
                s.tank_id,
                s.tank_name,
                s.location_id,
                s.location_name,

                latest.current_level,
                latest.last_level_at,

                agg.min_24h,
                agg.min_24h_at,

                agg.max_24h,
                agg.max_24h_at,

                agg.avg_24h,
                coalesce(agg.samples_24h, 0)::int as samples_24h,

                cfg.low_pct,
                cfg.low_low_pct,
                cfg.high_pct,
                cfg.high_high_pct,

                case
                    when cfg.age_sec is not null then cfg.age_sec
                    when latest.last_level_at is not null then
                        extract(epoch from (%(dt)s::timestamptz - latest.last_level_at))::int
                    else null
                end as age_sec,

                coalesce(
                    cfg.online,
                    latest.last_level_at is not null and latest.last_level_at >= %(online_from)s,
                    false
                ) as online,

                coalesce(cfg.alarma, 'normal') as alarma

            from scope s
            left join latest
              on latest.tank_id = s.tank_id
            left join agg
              on agg.tank_id = s.tank_id
            left join cfg
              on cfg.tank_id = s.tank_id
        )

        select
            e.*,

            case
                when e.online = false then 'sin comunicación'
                when e.alarma is not null and e.alarma <> 'normal' then e.alarma
                when e.min_24h is not null and e.low_low_pct is not null and e.min_24h <= e.low_low_pct then 'mínimo crítico'
                when e.min_24h is not null and e.low_pct is not null and e.min_24h <= e.low_pct then 'mínimo bajo'
                when e.max_24h is not null and e.high_high_pct is not null and e.max_24h >= e.high_high_pct then 'máximo crítico'
                when e.max_24h is not null and e.high_pct is not null and e.max_24h >= e.high_pct then 'máximo alto'
                else 'normal'
            end as estado_operativo,

            case
                when e.online = false then 'critical'
                when e.alarma is not null and e.alarma <> 'normal' then 'critical'
                when e.min_24h is not null and e.low_low_pct is not null and e.min_24h <= e.low_low_pct then 'critical'
                when e.max_24h is not null and e.high_high_pct is not null and e.max_24h >= e.high_high_pct then 'critical'
                when e.min_24h is not null and e.low_pct is not null and e.min_24h <= e.low_pct then 'warning'
                when e.max_24h is not null and e.high_pct is not null and e.max_24h >= e.high_pct then 'warning'
                else 'normal'
            end as severity

        from enriched e
        order by
            case
                when e.online = false then 1
                when e.alarma is not null and e.alarma <> 'normal' then 2
                when e.min_24h is not null and e.low_low_pct is not null and e.min_24h <= e.low_low_pct then 3
                when e.max_24h is not null and e.high_high_pct is not null and e.max_24h >= e.high_high_pct then 4
                when e.min_24h is not null and e.low_pct is not null and e.min_24h <= e.low_pct then 5
                when e.max_24h is not null and e.high_pct is not null and e.max_24h >= e.high_pct then 6
                else 9
            end asc,
            e.location_name asc nulls last,
            e.tank_name asc nulls last
    """

    sql_active_events = f"""
        select
            count(*)::int as active_events
        from {TANK_CRITICAL_EVENTS} e
        left join {LOCATIONS_TABLE} l
          on l.id = e.location_id
        where e.status = 'active'
          and (%(company_id)s::bigint is null or l.company_id = %(company_id)s::bigint)
          and (%(location_id)s::bigint is null or e.location_id = %(location_id)s::bigint)
          and (%(tank_ids)s::int[] is null or e.tank_id = any(%(tank_ids)s::int[]))
    """

    params = {
        "company_id": company_id,
        "location_id": location_id,
        "tank_ids": ids,
        "df": df,
        "dt": dt,
        "online_from": online_from,
    }

    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(sql_items, params)
        rows_all = _clean_rows(cur.fetchall())

        cur.execute(sql_active_events, params)
        active_events_row = cur.fetchone() or {}
        active_events = int(active_events_row.get("active_events") or 0)

    def _num(v: Any, default: float = 0.0) -> float:
        if v is None:
            return default
        try:
            return float(v)
        except Exception:
            return default

    def _is_problem(r: dict) -> bool:
        return (
            r.get("estado_operativo") != "normal"
            or bool(r.get("online")) is False
            or (r.get("alarma") is not None and r.get("alarma") != "normal")
        )

    def _score(r: dict) -> int:
        severity = str(r.get("severity") or "").lower()
        estado = str(r.get("estado_operativo") or "").lower()

        if not r.get("online"):
            return 0
        if severity == "critical":
            return 1
        if "crítico" in estado or "critico" in estado:
            return 2
        if severity == "warning":
            return 3
        if estado != "normal":
            return 4
        return 9

    rows_items = rows_all

    if only_problems:
        rows_items = [r for r in rows_items if _is_problem(r)]

    rows_items = sorted(
        rows_items,
        key=lambda r: (
            _score(r),
            str(r.get("location_name") or ""),
            str(r.get("tank_name") or ""),
        ),
    )[:limit]

    online_rows = [r for r in rows_all if bool(r.get("online"))]
    offline_rows = [r for r in rows_all if not bool(r.get("online"))]

    min_values = [r.get("min_24h") for r in rows_all if r.get("min_24h") is not None]
    max_values = [r.get("max_24h") for r in rows_all if r.get("max_24h") is not None]
    avg_values = [r.get("avg_24h") for r in rows_all if r.get("avg_24h") is not None]

    summary = {
        "tanks_total": len(rows_all),
        "tanks_online": len(online_rows),
        "tanks_offline": len(offline_rows),

        "tanks_in_alarm": sum(
            1
            for r in rows_all
            if r.get("alarma") is not None and r.get("alarma") != "normal"
        ),

        "low_critical_count": sum(
            1
            for r in rows_all
            if r.get("min_24h") is not None
            and r.get("low_low_pct") is not None
            and _num(r.get("min_24h")) <= _num(r.get("low_low_pct"))
        ),

        "low_count": sum(
            1
            for r in rows_all
            if r.get("min_24h") is not None
            and r.get("low_pct") is not None
            and _num(r.get("min_24h")) <= _num(r.get("low_pct"))
        ),

        "high_critical_count": sum(
            1
            for r in rows_all
            if r.get("max_24h") is not None
            and r.get("high_high_pct") is not None
            and _num(r.get("max_24h")) >= _num(r.get("high_high_pct"))
        ),

        "high_count": sum(
            1
            for r in rows_all
            if r.get("max_24h") is not None
            and r.get("high_pct") is not None
            and _num(r.get("max_24h")) >= _num(r.get("high_pct"))
        ),

        "min_level_24h": min([_num(v) for v in min_values]) if min_values else None,
        "max_level_24h": max([_num(v) for v in max_values]) if max_values else None,
        "avg_level_24h": (
            round(sum(_num(v) for v in avg_values) / len(avg_values), 2)
            if avg_values
            else None
        ),

        "active_events": active_events,
    }

    return {
        "ok": True,
        "window": {
            "from": df.isoformat(),
            "to": dt.isoformat(),
            "last_hours": 24,
        },
        "summary": summary,
        "count": len(rows_items),
        "items": rows_items,
    }


# -------------------------------------------------------------------
# Operación PRO - Nivel por tanque cada 1 minuto / bucket
# -------------------------------------------------------------------
@router.get("/tanques/operation/level-1m")
@router.get("/tanks/operation/level-1m")
def operation_tanks_level_1m(
    company_id: Optional[int] = Query(None),
    location_id: Optional[int] = Query(None),
    tank_ids: Optional[str] = Query(None, description="CSV de tank_id"),
    date_from: Optional[datetime] = Query(None, alias="from"),
    date_to: Optional[datetime] = Query(None, alias="to"),
    bucket: str = Query("1min", pattern="^(1min|5min|15min|1h|1d)$"),
    aggregate: bool = Query(False, description="Si true devuelve serie agregada de todos los tanques"),
    limit: int = Query(200000, ge=1, le=300000),
):
    df, dt = _bounds_utc_minute(date_from, date_to)
    ids = _parse_ids(tank_ids)
    bucket = _validate_bucket(bucket)
    bucket_expr = _bucket_expr_sql("v.minute_ts", bucket)

    if aggregate:
        sql = f"""
            with filtered as (
                select
                    v.*
                from {OP_TANK_LEVEL_1M} v
                left join {LOCATIONS_TABLE} l
                  on l.id = v.location_id
                where v.minute_ts >= %(df)s
                  and v.minute_ts <= %(dt)s
                  and (%(company_id)s::bigint is null or l.company_id = %(company_id)s::bigint)
                  and (%(location_id)s::bigint is null or v.location_id = %(location_id)s::bigint)
                  and (%(tank_ids)s::int[] is null or v.tank_id = any(%(tank_ids)s::int[]))
            ),
            bucketed as (
                select
                    {bucket_expr} as bucket_ts,
                    avg(level_avg)::numeric(10,2) as level_avg,
                    min(level_min)::numeric(10,2) as level_min,
                    max(level_max)::numeric(10,2) as level_max,
                    sum(samples)::int as samples,
                    count(distinct tank_id)::int as tanks_count
                from filtered v
                group by bucket_ts
            )
            select
                bucket_ts as minute_ts,
                extract(epoch from bucket_ts)::bigint * 1000 as ts_ms,
                bucket_ts at time zone '{LOCAL_TZ}' as local_minute_ts,
                level_avg,
                level_min,
                level_max,
                samples,
                tanks_count
            from bucketed
            order by bucket_ts asc
            limit %(limit)s
        """
    else:
        sql = f"""
            with filtered as (
                select
                    v.*,
                    cfg.low_pct,
                    cfg.low_low_pct,
                    cfg.high_pct,
                    cfg.high_high_pct,
                    cfg.online,
                    cfg.alarma
                from {OP_TANK_LEVEL_1M} v
                left join {TANKS_WITH_CONFIG_VIEW} cfg
                  on cfg.tank_id = v.tank_id
                left join {LOCATIONS_TABLE} l
                  on l.id = v.location_id
                where v.minute_ts >= %(df)s
                  and v.minute_ts <= %(dt)s
                  and (%(company_id)s::bigint is null or l.company_id = %(company_id)s::bigint)
                  and (%(location_id)s::bigint is null or v.location_id = %(location_id)s::bigint)
                  and (%(tank_ids)s::int[] is null or v.tank_id = any(%(tank_ids)s::int[]))
            ),
            bucketed as (
                select
                    {bucket_expr} as bucket_ts,
                    tank_id,
                    max(tank_name) as tank_name,
                    max(location_id) as location_id,
                    max(location_name) as location_name,

                    avg(level_avg)::numeric(10,2) as level_avg,
                    min(level_min)::numeric(10,2) as level_min,
                    max(level_max)::numeric(10,2) as level_max,
                    sum(samples)::int as samples,

                    max(low_pct) as low_pct,
                    max(low_low_pct) as low_low_pct,
                    max(high_pct) as high_pct,
                    max(high_high_pct) as high_high_pct,
                    bool_or(online) as online,
                    max(alarma) as alarma

                from filtered v
                group by
                    bucket_ts,
                    tank_id
            )
            select
                bucket_ts as minute_ts,
                extract(epoch from bucket_ts)::bigint * 1000 as ts_ms,
                bucket_ts at time zone '{LOCAL_TZ}' as local_minute_ts,

                tank_id,
                tank_name,
                location_id,
                location_name,

                level_avg,
                level_min,
                level_max,
                samples,

                low_pct,
                low_low_pct,
                high_pct,
                high_high_pct,
                online,
                alarma,

                case
                    when online = false then 'sin comunicación'
                    when alarma is not null and alarma <> 'normal' then alarma
                    when level_min is not null and low_low_pct is not null and level_min <= low_low_pct then 'mínimo crítico'
                    when level_min is not null and low_pct is not null and level_min <= low_pct then 'mínimo bajo'
                    when level_max is not null and high_high_pct is not null and level_max >= high_high_pct then 'máximo crítico'
                    when level_max is not null and high_pct is not null and level_max >= high_pct then 'máximo alto'
                    else 'normal'
                end as estado_operativo

            from bucketed
            order by
                bucket_ts asc,
                location_name asc nulls last,
                tank_name asc nulls last
            limit %(limit)s
        """

    params = {
        "df": df,
        "dt": dt,
        "company_id": company_id,
        "location_id": location_id,
        "tank_ids": ids,
        "limit": limit,
    }

    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(sql, params)
        rows = cur.fetchall() or []

    items = _clean_rows(rows)

    response = {
        "ok": True,
        "bucket": bucket,
        "aggregate": aggregate,
        "window": {"from": df.isoformat(), "to": dt.isoformat()},
        "count": len(items),
        "items": items,
    }

    if aggregate:
        response["timestamps"] = [r["ts_ms"] for r in items]
        response["level_avg"] = [r["level_avg"] for r in items]
        response["level_min"] = [r["level_min"] for r in items]
        response["level_max"] = [r["level_max"] for r in items]

    return response


# -------------------------------------------------------------------
# Operación PRO - Eventos críticos de tanques
# -------------------------------------------------------------------
@router.get("/tanques/operation/events")
@router.get("/tanks/operation/events")
def operation_tank_events(
    company_id: Optional[int] = Query(None),
    location_id: Optional[int] = Query(None),
    tank_ids: Optional[str] = Query(None, description="CSV de tank_id"),
    date_from: Optional[datetime] = Query(None, alias="from"),
    date_to: Optional[datetime] = Query(None, alias="to"),
    event_type: Optional[str] = Query(None, pattern="^(low|low_low|high|high_high)$"),
    status: Optional[str] = Query(None, pattern="^(active|normalized)$"),
    only_active: bool = Query(False),
    limit: int = Query(500, ge=1, le=5000),
):
    df, dt = _bounds_utc_minute(date_from, date_to)
    ids = _parse_ids(tank_ids)

    effective_duration_expr = """
        coalesce(
            e.duration_seconds,
            extract(epoch from (coalesce(e.ended_at, now()) - e.started_at))::int
        )
    """

    sql = f"""
        select
            e.id,

            e.started_at as event_ts,
            extract(epoch from e.started_at)::bigint * 1000 as event_ts_ms,

            e.tank_id,
            t.name as tank_name,
            e.location_id,
            l.name as location_name,

            e.event_type,

            case
                when e.event_type = 'low' then 'Nivel bajo'
                when e.event_type = 'low_low' then 'Nivel bajo crítico'
                when e.event_type = 'high' then 'Nivel alto'
                when e.event_type = 'high_high' then 'Nivel alto crítico'
                else e.event_type
            end as event_label,

            e.configured_limit,
            e.detected_value,

            e.started_at,
            e.ended_at,

            e.started_at at time zone '{LOCAL_TZ}' as started_local,
            e.ended_at at time zone '{LOCAL_TZ}' as ended_local,

            {effective_duration_expr}::int as duration_seconds,
            {_duration_label_sql(effective_duration_expr)} as duration_label,

            e.status,

            case
                when e.status = 'active' then 'Activo'
                when e.status = 'normalized' then 'Normalizado'
                else e.status
            end as status_label,

            (e.ended_at is null or e.status = 'active') as is_open,

            case
                when e.event_type in ('low_low', 'high_high') then 'critical'
                when e.event_type in ('low', 'high') then 'warning'
                else 'normal'
            end as severity,

            e.created_at,
            e.raw

        from {TANK_CRITICAL_EVENTS} e
        left join {TANKS_TABLE} t
          on t.id = e.tank_id
        left join {LOCATIONS_TABLE} l
          on l.id = e.location_id

        where e.started_at < %(dt)s
          and coalesce(e.ended_at, now()) >= %(df)s

          and (%(company_id)s::bigint is null or l.company_id = %(company_id)s::bigint)
          and (%(location_id)s::bigint is null or e.location_id = %(location_id)s::bigint)
          and (%(tank_ids)s::int[] is null or e.tank_id = any(%(tank_ids)s::int[]))
          and (%(event_type)s::text is null or e.event_type = %(event_type)s::text)
          and (%(status)s::text is null or e.status = %(status)s::text)
          and (%(only_active)s::boolean = false or e.status = 'active')

        order by e.started_at desc
        limit %(limit)s
    """

    params = {
        "df": df,
        "dt": dt,
        "company_id": company_id,
        "location_id": location_id,
        "tank_ids": ids,
        "event_type": event_type,
        "status": status,
        "only_active": only_active,
        "limit": limit,
    }

    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(sql, params)
        rows = cur.fetchall() or []

    return {
        "ok": True,
        "window": {"from": df.isoformat(), "to": dt.isoformat()},
        "count": len(rows),
        "items": _clean_rows(rows),
    }