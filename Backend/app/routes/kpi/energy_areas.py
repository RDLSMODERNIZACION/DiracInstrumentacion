from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from typing import Any, Dict, Literal, Optional
from datetime import datetime, timezone
from psycopg.rows import dict_row

from app.db import get_conn

router = APIRouter(
    prefix="/energy_areas",
    tags=["energy_areas", "kpi", "energy"],
)


# ------------------------------------------------------------
# Helpers
# ------------------------------------------------------------

def month_bounds_utc(month: str):
    """
    month: 'YYYY-MM'
    returns (start_ts, end_ts) as UTC timestamptz
    """
    try:
        year = int(month[0:4])
        mon = int(month[5:7])
        start = datetime(year, mon, 1, tzinfo=timezone.utc)
        if mon == 12:
            end = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
        else:
            end = datetime(year, mon + 1, 1, tzinfo=timezone.utc)
        return start, end
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid month format. Use YYYY-MM")


def has_column(cur, schema: str, table: str, column: str) -> bool:
    cur.execute(
        """
        select exists (
          select 1
          from information_schema.columns
          where table_schema = %(schema)s
            and table_name = %(table)s
            and column_name = %(column)s
        ) as ok
        """,
        {"schema": schema, "table": table, "column": column},
    )
    row = cur.fetchone()
    return bool(row["ok"]) if row else False


def ensure_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


# ------------------------------------------------------------
# GET /energy_areas
# Lista áreas energéticas
# ------------------------------------------------------------
@router.get("")
def list_energy_areas(
    company_id: Optional[int] = Query(None, description="Filtra por empresa"),
    active_only: bool = Query(True, description="Si true, devuelve solo áreas activas"),
):
    sql = """
        select
            ea.id,
            ea.name,
            ea.company_id,
            ea.contracted_power_kw,
            ea.active,
            ea.created_at,
            count(distinct l.id)::int as locations_count,
            count(distinct na.id)::int as analyzers_count
        from public.energy_areas ea
        left join public.locations l
            on l.area_id = ea.id
        left join public.network_analyzers na
            on na.location_id = l.id
           and na.active = true
        where 1=1
    """
    params: Dict[str, Any] = {}

    if company_id is not None:
        sql += " and ea.company_id = %(company_id)s"
        params["company_id"] = company_id

    if active_only:
        sql += " and ea.active = true"

    sql += """
        group by
            ea.id, ea.name, ea.company_id, ea.contracted_power_kw, ea.active, ea.created_at
        order by ea.name
    """

    with get_conn() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, params)
            rows = cur.fetchall() or []

    return rows


# ------------------------------------------------------------
# GET /energy_areas/{area_id}
# Detalle del área con localidades y analizadores
# ------------------------------------------------------------
@router.get("/{area_id}")
def get_energy_area(area_id: int):
    if area_id <= 0:
        raise HTTPException(status_code=400, detail="Invalid area_id")

    with get_conn() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            # Área
            cur.execute(
                """
                select
                    ea.id,
                    ea.name,
                    ea.company_id,
                    ea.contracted_power_kw,
                    ea.active,
                    ea.created_at
                from public.energy_areas ea
                where ea.id = %(area_id)s
                """,
                {"area_id": area_id},
            )
            area = cur.fetchone()

            if not area:
                raise HTTPException(status_code=404, detail="Energy area not found")

            # Localidades del área
            cur.execute(
                """
                select
                    l.id,
                    l.name,
                    l.company_id,
                    l.service_type,
                    l.active,
                    l.created_at,
                    l.area_id
                from public.locations l
                where l.area_id = %(area_id)s
                order by l.name
                """,
                {"area_id": area_id},
            )
            locations = cur.fetchall() or []

            # Analizadores del área
            cur.execute(
                """
                select
                    na.id,
                    na.name,
                    na.location_id,
                    l.name as location_name,
                    na.model,
                    na.ip,
                    na.port,
                    na.unit_id,
                    na.active,
                    na.created_at
                from public.network_analyzers na
                join public.locations l
                  on l.id = na.location_id
                where l.area_id = %(area_id)s
                order by l.name, na.name
                """,
                {"area_id": area_id},
            )
            analyzers = cur.fetchall() or []

    return {
        "area": area,
        "locations": locations,
        "analyzers": analyzers,
    }

# ------------------------------------------------------------
# GET /energy_areas/{area_id}/month_kpis
# KPIs mensuales agregados por área
# ------------------------------------------------------------
@router.get("/{area_id}/month_kpis")
def get_energy_area_month_kpis(
    area_id: int,
    month: str = Query(..., description="YYYY-MM"),
):
    """
    KPIs mensuales agregados por área.

    Notas:
    - kWh se suma entre analizadores.
    - kW pico/medio del área se calcula desde kpi.analyzers_1h sumando kw_avg horario.
    - PF promedio del área:
        * si existe q_kvar_avg en 1h, se calcula desde P y Q agregados.
        * si no existe, hace promedio ponderado por kW.
    """

    if area_id <= 0:
        raise HTTPException(status_code=400, detail="Invalid area_id")

    start_ts, end_ts = month_bounds_utc(month)

    with get_conn() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                select
                    ea.id,
                    ea.name,
                    ea.company_id,
                    ea.contracted_power_kw,
                    ea.active,
                    ea.created_at
                from public.energy_areas ea
                where ea.id = %(area_id)s
                """,
                {"area_id": area_id},
            )
            area = cur.fetchone()

            if not area:
                raise HTTPException(status_code=404, detail="Energy area not found")

            has_q_1d_avg = has_column(cur, "kpi", "analyzers_1d", "q_kvar_avg")
            has_q_1d_max = has_column(cur, "kpi", "analyzers_1d", "q_kvar_max")
            has_q_1h_avg = has_column(cur, "kpi", "analyzers_1h", "q_kvar_avg")
            has_q_1h_max = has_column(cur, "kpi", "analyzers_1h", "q_kvar_max")

            # --------------------------------
            # SUMMARY - energía total del mes
            # --------------------------------
            summary_q_day_sql = (
                "avg(d.q_kvar_avg) as reactive_kvar_avg, max(d.q_kvar_max) as reactive_kvar_max,"
                if (has_q_1d_avg and has_q_1d_max)
                else """
                null::numeric as reactive_kvar_avg,
                null::numeric as reactive_kvar_max,
            """
            )

            cur.execute(
                f"""
                with daily_area as (
                    select
                        d.day_ts,
                        sum(d.kwh_est) as kwh_est,
                        sum(d.kw_avg)  as kw_avg,
                        sum(d.kw_max)  as kw_max,
                        sum(d.samples)::int as samples
                        {", sum(d.q_kvar_avg) as q_kvar_avg" if has_q_1d_avg else ""}
                        {", sum(d.q_kvar_max) as q_kvar_max" if has_q_1d_max else ""}
                    from kpi.analyzers_1d d
                    join public.network_analyzers na
                      on na.id = d.analyzer_id
                    join public.locations l
                      on l.id = na.location_id
                    where l.area_id = %(area_id)s
                      and d.day_ts >= %(start_date)s
                      and d.day_ts < %(end_date)s
                    group by d.day_ts
                )
                select
                    max(d.kw_max)       as max_kw_daily_sum,
                    avg(d.kw_avg)       as avg_kw_daily_sum,
                    sum(d.kwh_est)      as kwh_est,
                    {summary_q_day_sql}
                    sum(d.samples)::int as samples
                from daily_area d
                """,
                {
                    "area_id": area_id,
                    "start_date": start_ts.date(),
                    "end_date": end_ts.date(),
                },
            )
            summary_day = cur.fetchone() or {}

            # --------------------------------
            # SUMMARY - potencia del área desde 1h
            # más representativa que sumar máximos diarios
            # --------------------------------
            if has_q_1h_avg:
                pf_area_hour_sql = """
                    case
                        when sqrt(power(sum(h.kw_avg), 2) + power(sum(h.q_kvar_avg), 2)) > 0
                        then abs(sum(h.kw_avg)) / sqrt(power(sum(h.kw_avg), 2) + power(sum(h.q_kvar_avg), 2))
                        else null
                    end as pf_area
                """
            else:
                pf_area_hour_sql = """
                    case
                        when sum(abs(h.kw_avg)) > 0
                        then sum(h.pf_avg * abs(h.kw_avg)) / sum(abs(h.kw_avg))
                        else null
                    end as pf_area
                """

            cur.execute(
                f"""
                with hourly_area as (
                    select
                        h.hour_ts,
                        sum(h.kw_avg) as kw_area
                        {", sum(h.q_kvar_avg) as q_kvar_area" if has_q_1h_avg else ""}
                        {", " + pf_area_hour_sql}
                    from kpi.analyzers_1h h
                    join public.network_analyzers na
                      on na.id = h.analyzer_id
                    join public.locations l
                      on l.id = na.location_id
                    where l.area_id = %(area_id)s
                      and h.hour_ts >= %(start_ts)s
                      and h.hour_ts < %(end_ts)s
                    group by h.hour_ts
                )
                select
                    max(kw_area) as max_kw,
                    avg(kw_area) as avg_kw,
                    avg(pf_area) as avg_pf
                from hourly_area
                """,
                {
                    "area_id": area_id,
                    "start_ts": start_ts,
                    "end_ts": end_ts,
                },
            )
            summary_hour = cur.fetchone() or {}

            summary = {
                "max_kw": summary_hour.get("max_kw"),
                "avg_kw": summary_hour.get("avg_kw"),
                "kwh_est": summary_day.get("kwh_est"),
                "avg_pf": summary_hour.get("avg_pf"),
                "reactive_kvar_avg": summary_day.get("reactive_kvar_avg"),
                "reactive_kvar_max": summary_day.get("reactive_kvar_max"),
                "samples": summary_day.get("samples"),
                "contracted_power_kw": area.get("contracted_power_kw"),
            }

            # --------------------------------
            # DAILY - agregado por área
            # --------------------------------
            daily_select_q = []
            if has_q_1d_avg:
                daily_select_q.append("sum(d.q_kvar_avg) as reactive_kvar_avg")
            else:
                daily_select_q.append("null::numeric as reactive_kvar_avg")

            if has_q_1d_max:
                daily_select_q.append("sum(d.q_kvar_max) as reactive_kvar_max")
            else:
                daily_select_q.append("null::numeric as reactive_kvar_max")

            daily_q_sql = ",\n                    ".join(daily_select_q)

            cur.execute(
                f"""
                select
                    d.day_ts as day,
                    sum(d.kw_max) as max_kw,
                    sum(d.kw_avg) as avg_kw,
                    sum(d.kwh_est) as kwh_est,
                    case
                        when sum(abs(d.kw_avg)) > 0
                        then sum(d.pf_avg * abs(d.kw_avg)) / sum(abs(d.kw_avg))
                        else null
                    end as avg_pf,
                    min(d.pf_min) as min_pf,
                    {daily_q_sql},
                    sum(d.samples)::int as samples
                from kpi.analyzers_1d d
                join public.network_analyzers na
                  on na.id = d.analyzer_id
                join public.locations l
                  on l.id = na.location_id
                where l.area_id = %(area_id)s
                  and d.day_ts >= %(start_date)s
                  and d.day_ts < %(end_date)s
                group by d.day_ts
                order by d.day_ts
                """,
                {
                    "area_id": area_id,
                    "start_date": start_ts.date(),
                    "end_date": end_ts.date(),
                },
            )
            daily = cur.fetchall() or []

            # --------------------------------
            # HOURLY - agregado por área
            # --------------------------------
            hourly_select_q = []
            if has_q_1h_avg:
                hourly_select_q.append("sum(h.q_kvar_avg) as reactive_kvar_avg")
                pf_hour_sql = """
                    case
                        when sqrt(power(sum(h.kw_avg), 2) + power(sum(h.q_kvar_avg), 2)) > 0
                        then abs(sum(h.kw_avg)) / sqrt(power(sum(h.kw_avg), 2) + power(sum(h.q_kvar_avg), 2))
                        else null
                    end as avg_pf
                """
            else:
                hourly_select_q.append("null::numeric as reactive_kvar_avg")
                pf_hour_sql = """
                    case
                        when sum(abs(h.kw_avg)) > 0
                        then sum(h.pf_avg * abs(h.kw_avg)) / sum(abs(h.kw_avg))
                        else null
                    end as avg_pf
                """

            if has_q_1h_max:
                hourly_select_q.append("sum(h.q_kvar_max) as reactive_kvar_max")
            else:
                hourly_select_q.append("null::numeric as reactive_kvar_max")

            hourly_q_sql = ",\n                    ".join(hourly_select_q)

            cur.execute(
                f"""
                select
                    extract(hour from h.hour_ts)::int as hour,
                    avg(sum(h.kw_avg)) over (partition by extract(hour from h.hour_ts)) as avg_kw,
                    max(sum(h.kw_avg)) over (partition by extract(hour from h.hour_ts)) as max_kw,
                    {pf_hour_sql},
                    {hourly_q_sql},
                    sum(h.samples)::int as samples
                from kpi.analyzers_1h h
                join public.network_analyzers na
                  on na.id = h.analyzer_id
                join public.locations l
                  on l.id = na.location_id
                where l.area_id = %(area_id)s
                  and h.hour_ts >= %(start_ts)s
                  and h.hour_ts < %(end_ts)s
                group by h.hour_ts
                order by h.hour_ts
                """,
                {
                    "area_id": area_id,
                    "start_ts": start_ts,
                    "end_ts": end_ts,
                },
            )
            hourly_rows = cur.fetchall() or []

            hourly_map: Dict[int, Dict[str, Any]] = {}
            for row in hourly_rows:
                hour = int(row["hour"])
                prev = hourly_map.get(hour)
                if not prev:
                    hourly_map[hour] = {
                        "hour": hour,
                        "avg_kw": row.get("avg_kw"),
                        "max_kw": row.get("max_kw"),
                        "avg_pf": row.get("avg_pf"),
                        "reactive_kvar_avg": row.get("reactive_kvar_avg"),
                        "reactive_kvar_max": row.get("reactive_kvar_max"),
                        "samples": row.get("samples"),
                    }
                else:
                    prev["samples"] = (prev.get("samples") or 0) + (row.get("samples") or 0)

            hourly = [hourly_map[h] for h in sorted(hourly_map.keys())]

    return {
        "area_id": area_id,
        "month": month,
        "area": area,
        "summary": summary,
        "daily": daily,
        "hourly": hourly,
    }


# ------------------------------------------------------------
# GET /energy_areas/{area_id}/history
# Histórico agregado por área
# ------------------------------------------------------------
@router.get("/{area_id}/history")
def get_energy_area_history(
    area_id: int,
    from_ts: datetime = Query(..., alias="from", description="ISO datetime"),
    to_ts: datetime = Query(..., alias="to", description="ISO datetime"),
    granularity: Literal["minute", "hour", "day"] = Query("day"),
    limit: int = Query(20000, ge=1, le=200000),
):
    if area_id <= 0:
        raise HTTPException(status_code=400, detail="Invalid area_id")

    from_ts = ensure_utc(from_ts)
    to_ts = ensure_utc(to_ts)

    if to_ts <= from_ts:
        raise HTTPException(status_code=400, detail="Invalid range: to must be > from")

    with get_conn() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                "select id, name, contracted_power_kw from public.energy_areas where id = %(area_id)s",
                {"area_id": area_id},
            )
            area = cur.fetchone()
            if not area:
                raise HTTPException(status_code=404, detail="Energy area not found")

            has_q_1h_avg = has_column(cur, "kpi", "analyzers_1h", "q_kvar_avg")
            has_q_1h_max = has_column(cur, "kpi", "analyzers_1h", "q_kvar_max")
            has_q_1d_avg = has_column(cur, "kpi", "analyzers_1d", "q_kvar_avg")
            has_q_1d_max = has_column(cur, "kpi", "analyzers_1d", "q_kvar_max")

            if granularity == "minute":
                ts_col = "minute_ts"
                select_cols = """
                    m.minute_ts as ts,
                    sum(m.kw_avg) as kw_avg,
                    sum(m.kw_max) as kw_max,
                    case
                        when sum(abs(m.kw_avg)) > 0
                        then sum(m.pf_avg * abs(m.kw_avg)) / sum(abs(m.kw_avg))
                        else null
                    end as pf_avg,
                    min(m.pf_min) as pf_min,
                    sum(m.v_ll_avg) as v_ll_avg,
                    sum(m.i_avg) as i_avg,
                    sum(m.samples)::int as samples
                """
                from_sql = """
                    from kpi.analyzers_1m m
                    join public.network_analyzers na on na.id = m.analyzer_id
                    join public.locations l on l.id = na.location_id
                """
                group_by = "m.minute_ts"
                order_by = "m.minute_ts"

            elif granularity == "hour":
                ts_col = "hour_ts"
                q_avg_sql = "sum(h.q_kvar_avg) as q_kvar_avg," if has_q_1h_avg else "null::numeric as q_kvar_avg,"
                q_max_sql = "sum(h.q_kvar_max) as q_kvar_max," if has_q_1h_max else "null::numeric as q_kvar_max,"
                select_cols = f"""
                    h.hour_ts as ts,
                    sum(h.kwh_est) as kwh_est,
                    sum(h.kw_avg) as kw_avg,
                    sum(h.kw_max) as kw_max,
                    case
                        when sum(abs(h.kw_avg)) > 0
                        then sum(h.pf_avg * abs(h.kw_avg)) / sum(abs(h.kw_avg))
                        else null
                    end as pf_avg,
                    min(h.pf_min) as pf_min,
                    {q_avg_sql}
                    {q_max_sql}
                    sum(h.samples)::int as samples
                """
                from_sql = """
                    from kpi.analyzers_1h h
                    join public.network_analyzers na on na.id = h.analyzer_id
                    join public.locations l on l.id = na.location_id
                """
                group_by = "h.hour_ts"
                order_by = "h.hour_ts"

            else:
                ts_col = "day_ts"
                q_avg_sql = "sum(d.q_kvar_avg) as q_kvar_avg," if has_q_1d_avg else "null::numeric as q_kvar_avg,"
                q_max_sql = "sum(d.q_kvar_max) as q_kvar_max," if has_q_1d_max else "null::numeric as q_kvar_max,"
                select_cols = f"""
                    d.day_ts as ts,
                    sum(d.kwh_est) as kwh_est,
                    sum(d.kw_avg) as kw_avg,
                    sum(d.kw_max) as kw_max,
                    case
                        when sum(abs(d.kw_avg)) > 0
                        then sum(d.pf_avg * abs(d.kw_avg)) / sum(abs(d.kw_avg))
                        else null
                    end as pf_avg,
                    min(d.pf_min) as pf_min,
                    {q_avg_sql}
                    {q_max_sql}
                    sum(d.samples)::int as samples
                """
                from_sql = """
                    from kpi.analyzers_1d d
                    join public.network_analyzers na on na.id = d.analyzer_id
                    join public.locations l on l.id = na.location_id
                """
                group_by = "d.day_ts"
                order_by = "d.day_ts"

            cur.execute(
                f"""
                select
                    {select_cols}
                {from_sql}
                where l.area_id = %(area_id)s
                  and {ts_col} >= %(from_ts)s
                  and {ts_col} <= %(to_ts)s
                group by {group_by}
                order by {order_by} asc
                limit %(limit)s
                """,
                {
                    "area_id": area_id,
                    "from_ts": from_ts,
                    "to_ts": to_ts,
                    "limit": limit,
                },
            )
            rows = cur.fetchall() or []

    if not rows:
        raise HTTPException(status_code=404, detail="No history for range")

    return {
        "area_id": area_id,
        "granularity": granularity,
        "from": from_ts,
        "to": to_ts,
        "area": area,
        "points": rows,
    }