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


def month_bounds_utc(month: str):
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


@router.get("/{area_id}")
def get_energy_area(area_id: int):
    if area_id <= 0:
        raise HTTPException(status_code=400, detail="Invalid area_id")

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

            cur.execute(
                """
                select
                    l.id,
                    l.name,
                    l.area_id
                from public.locations l
                where l.area_id = %(area_id)s
                order by l.name
                """,
                {"area_id": area_id},
            )
            locations = cur.fetchall() or []

            cur.execute(
                """
                select
                    na.id,
                    na.name,
                    na.location_id
                from public.network_analyzers na
                join public.locations l
                  on l.id = na.location_id
                where l.area_id = %(area_id)s
                order by na.name
                """,
                {"area_id": area_id},
            )
            analyzers = cur.fetchall() or []

    return {
        "area": area,
        "locations": locations,
        "analyzers": analyzers,
    }


@router.get("/{area_id}/month_kpis")
def get_energy_area_month_kpis(
    area_id: int,
    month: str = Query(..., description="YYYY-MM"),
):
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

            # 1d columns
            has_q_1d_avg = has_column(cur, "kpi", "analyzers_1d", "q_kvar_avg")
            has_q_1d_max = has_column(cur, "kpi", "analyzers_1d", "q_kvar_max")
            has_s_1d_avg = has_column(cur, "kpi", "analyzers_1d", "s_kva_avg")
            has_s_1d_max = has_column(cur, "kpi", "analyzers_1d", "s_kva_max")
            has_kvarh_est_1d = has_column(cur, "kpi", "analyzers_1d", "kvarh_est")
            has_kvah_est_1d = has_column(cur, "kpi", "analyzers_1d", "kvah_est")

            # 1h columns
            has_q_1h_avg = has_column(cur, "kpi", "analyzers_1h", "q_kvar_avg")
            has_q_1h_max = has_column(cur, "kpi", "analyzers_1h", "q_kvar_max")
            has_s_1h_avg = has_column(cur, "kpi", "analyzers_1h", "s_kva_avg")
            has_s_1h_max = has_column(cur, "kpi", "analyzers_1h", "s_kva_max")

            summary_reactive_avg_sql = (
                "avg(d.q_kvar_avg) as reactive_kvar_avg,"
                if has_q_1d_avg
                else "null::numeric as reactive_kvar_avg,"
            )
            summary_reactive_max_sql = (
                "max(d.q_kvar_max) as reactive_kvar_max,"
                if has_q_1d_max
                else "null::numeric as reactive_kvar_max,"
            )
            summary_apparent_avg_sql = (
                "avg(d.s_kva_avg) as apparent_kva_avg,"
                if has_s_1d_avg
                else "null::numeric as apparent_kva_avg,"
            )
            summary_apparent_max_sql = (
                "max(d.s_kva_max) as apparent_kva_max,"
                if has_s_1d_max
                else "null::numeric as apparent_kva_max,"
            )
            summary_kvarh_sql = (
                "sum(d.kvarh_est) as kvarh_est,"
                if has_kvarh_est_1d
                else "null::numeric as kvarh_est,"
            )
            summary_kvah_sql = (
                "sum(d.kvah_est) as kvah_est,"
                if has_kvah_est_1d
                else "null::numeric as kvah_est,"
            )

            cur.execute(
                f"""
                with daily_area as (
                    select
                        d.day_ts,
                        sum(d.kwh_est) as kwh_est,
                        avg(d.kw_avg) as kw_avg,
                        max(d.kw_max) as kw_max,
                        avg(d.pf_avg) as pf_avg,
                        min(d.pf_min) as pf_min,
                        sum(d.samples)::int as samples,
                        {summary_reactive_avg_sql}
                        {summary_reactive_max_sql}
                        {summary_apparent_avg_sql}
                        {summary_apparent_max_sql}
                        {summary_kvarh_sql}
                        {summary_kvah_sql}
                        1 as keep_row
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
                    max(kw_max) as max_kw,
                    avg(kw_avg) as avg_kw,
                    sum(kwh_est) as kwh_est,
                    avg(pf_avg) as avg_pf,
                    min(pf_min) as min_pf,
                    avg(reactive_kvar_avg) as reactive_kvar_avg,
                    max(reactive_kvar_max) as reactive_kvar_max,
                    avg(apparent_kva_avg) as apparent_kva_avg,
                    max(apparent_kva_max) as apparent_kva_max,
                    sum(kvarh_est) as kvarh_est,
                    sum(kvah_est) as kvah_est,
                    sum(samples)::int as samples
                from daily_area
                """,
                {
                    "area_id": area_id,
                    "start_date": start_ts.date(),
                    "end_date": end_ts.date(),
                },
            )
            summary = cur.fetchone() or {}

            daily_reactive_avg_sql = (
                "avg(d.q_kvar_avg) as reactive_kvar_avg,"
                if has_q_1d_avg
                else "null::numeric as reactive_kvar_avg,"
            )
            daily_reactive_max_sql = (
                "max(d.q_kvar_max) as reactive_kvar_max,"
                if has_q_1d_max
                else "null::numeric as reactive_kvar_max,"
            )
            daily_apparent_avg_sql = (
                "avg(d.s_kva_avg) as apparent_kva_avg,"
                if has_s_1d_avg
                else "null::numeric as apparent_kva_avg,"
            )
            daily_apparent_max_sql = (
                "max(d.s_kva_max) as apparent_kva_max,"
                if has_s_1d_max
                else "null::numeric as apparent_kva_max,"
            )
            daily_kvarh_sql = (
                "sum(d.kvarh_est) as kvarh_est,"
                if has_kvarh_est_1d
                else "null::numeric as kvarh_est,"
            )
            daily_kvah_sql = (
                "sum(d.kvah_est) as kvah_est,"
                if has_kvah_est_1d
                else "null::numeric as kvah_est,"
            )

            cur.execute(
                f"""
                select
                    d.day_ts as day,
                    max(d.kw_max) as max_kw,
                    avg(d.kw_avg) as avg_kw,
                    sum(d.kwh_est) as kwh_est,
                    avg(d.pf_avg) as avg_pf,
                    min(d.pf_min) as min_pf,
                    {daily_reactive_avg_sql}
                    {daily_reactive_max_sql}
                    {daily_apparent_avg_sql}
                    {daily_apparent_max_sql}
                    {daily_kvarh_sql}
                    {daily_kvah_sql}
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

            hourly_reactive_avg_sql = (
                "avg(hourly_area.q_kvar_avg) as reactive_kvar_avg,"
                if has_q_1h_avg
                else "null::numeric as reactive_kvar_avg,"
            )
            hourly_reactive_max_sql = (
                "max(hourly_area.q_kvar_max) as reactive_kvar_max,"
                if has_q_1h_max
                else "null::numeric as reactive_kvar_max,"
            )
            hourly_apparent_avg_sql = (
                "avg(hourly_area.s_kva_avg) as apparent_kva_avg,"
                if has_s_1h_avg
                else "null::numeric as apparent_kva_avg,"
            )
            hourly_apparent_max_sql = (
                "max(hourly_area.s_kva_max) as apparent_kva_max,"
                if has_s_1h_max
                else "null::numeric as apparent_kva_max,"
            )

            cur.execute(
                f"""
                with hourly_area as (
                    select
                        extract(hour from h.hour_ts)::int as hour,
                        avg(h.kw_avg) as kw_avg,
                        max(h.kw_max) as kw_max,
                        avg(h.pf_avg) as pf_avg,
                        min(h.pf_min) as pf_min,
                        {"avg(h.q_kvar_avg) as q_kvar_avg," if has_q_1h_avg else "null::numeric as q_kvar_avg,"}
                        {"max(h.q_kvar_max) as q_kvar_max," if has_q_1h_max else "null::numeric as q_kvar_max,"}
                        {"avg(h.s_kva_avg) as s_kva_avg," if has_s_1h_avg else "null::numeric as s_kva_avg,"}
                        {"max(h.s_kva_max) as s_kva_max," if has_s_1h_max else "null::numeric as s_kva_max,"}
                        sum(h.samples)::int as samples
                    from kpi.analyzers_1h h
                    join public.network_analyzers na
                      on na.id = h.analyzer_id
                    join public.locations l
                      on l.id = na.location_id
                    where l.area_id = %(area_id)s
                      and h.hour_ts >= %(start_ts)s
                      and h.hour_ts < %(end_ts)s
                    group by extract(hour from h.hour_ts)
                )
                select
                    hour,
                    avg(kw_avg) as avg_kw,
                    max(kw_max) as max_kw,
                    avg(pf_avg) as avg_pf,
                    min(pf_min) as min_pf,
                    {hourly_reactive_avg_sql}
                    {hourly_reactive_max_sql}
                    {hourly_apparent_avg_sql}
                    {hourly_apparent_max_sql}
                    sum(samples)::int as samples
                from hourly_area
                group by hour
                order by hour
                """,
                {
                    "area_id": area_id,
                    "start_ts": start_ts,
                    "end_ts": end_ts,
                },
            )
            hourly = cur.fetchall() or []

    return {
        "area_id": area_id,
        "month": month,
        "area": area,
        "summary": {
            **summary,
            "contracted_power_kw": area.get("contracted_power_kw"),
        },
        "daily": daily,
        "hourly": hourly,
    }


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

            has_q_1m_avg = has_column(cur, "kpi", "analyzers_1m", "q_kvar_avg")
            has_q_1m_max = has_column(cur, "kpi", "analyzers_1m", "q_kvar_max")
            has_s_1m_avg = has_column(cur, "kpi", "analyzers_1m", "s_kva_avg")
            has_s_1m_max = has_column(cur, "kpi", "analyzers_1m", "s_kva_max")
            has_kwh_delta_1m = has_column(cur, "kpi", "analyzers_1m", "kwh_delta")
            has_kvarh_delta_1m = has_column(cur, "kpi", "analyzers_1m", "kvarh_delta")
            has_kvah_delta_1m = has_column(cur, "kpi", "analyzers_1m", "kvah_delta")

            has_q_1h_avg = has_column(cur, "kpi", "analyzers_1h", "q_kvar_avg")
            has_q_1h_max = has_column(cur, "kpi", "analyzers_1h", "q_kvar_max")
            has_s_1h_avg = has_column(cur, "kpi", "analyzers_1h", "s_kva_avg")
            has_s_1h_max = has_column(cur, "kpi", "analyzers_1h", "s_kva_max")
            has_kvarh_est_1h = has_column(cur, "kpi", "analyzers_1h", "kvarh_est")
            has_kvah_est_1h = has_column(cur, "kpi", "analyzers_1h", "kvah_est")

            has_q_1d_avg = has_column(cur, "kpi", "analyzers_1d", "q_kvar_avg")
            has_q_1d_max = has_column(cur, "kpi", "analyzers_1d", "q_kvar_max")
            has_s_1d_avg = has_column(cur, "kpi", "analyzers_1d", "s_kva_avg")
            has_s_1d_max = has_column(cur, "kpi", "analyzers_1d", "s_kva_max")
            has_kvarh_est_1d = has_column(cur, "kpi", "analyzers_1d", "kvarh_est")
            has_kvah_est_1d = has_column(cur, "kpi", "analyzers_1d", "kvah_est")

            if granularity == "minute":
                ts_col = "m.minute_ts"
                select_cols = f"""
                    m.minute_ts as ts,
                    avg(m.kw_avg) as kw_avg,
                    max(m.kw_max) as kw_max,
                    avg(m.pf_avg) as pf_avg,
                    min(m.pf_min) as pf_min,
                    avg(m.v_ll_avg) as v_ll_avg,
                    avg(m.i_avg) as i_avg,
                    {"avg(m.q_kvar_avg) as q_kvar_avg," if has_q_1m_avg else "null::numeric as q_kvar_avg,"}
                    {"max(m.q_kvar_max) as q_kvar_max," if has_q_1m_max else "null::numeric as q_kvar_max,"}
                    {"avg(m.s_kva_avg) as s_kva_avg," if has_s_1m_avg else "null::numeric as s_kva_avg,"}
                    {"max(m.s_kva_max) as s_kva_max," if has_s_1m_max else "null::numeric as s_kva_max,"}
                    {"sum(m.kwh_delta) as kwh_delta," if has_kwh_delta_1m else "null::numeric as kwh_delta,"}
                    {"sum(m.kvarh_delta) as kvarh_delta," if has_kvarh_delta_1m else "null::numeric as kvarh_delta,"}
                    {"sum(m.kvah_delta) as kvah_delta," if has_kvah_delta_1m else "null::numeric as kvah_delta,"}
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
                ts_col = "h.hour_ts"
                select_cols = f"""
                    h.hour_ts as ts,
                    sum(h.kwh_est) as kwh_est,
                    avg(h.kw_avg) as kw_avg,
                    max(h.kw_max) as kw_max,
                    avg(h.pf_avg) as pf_avg,
                    min(h.pf_min) as pf_min,
                    {"avg(h.q_kvar_avg) as q_kvar_avg," if has_q_1h_avg else "null::numeric as q_kvar_avg,"}
                    {"max(h.q_kvar_max) as q_kvar_max," if has_q_1h_max else "null::numeric as q_kvar_max,"}
                    {"avg(h.s_kva_avg) as s_kva_avg," if has_s_1h_avg else "null::numeric as s_kva_avg,"}
                    {"max(h.s_kva_max) as s_kva_max," if has_s_1h_max else "null::numeric as s_kva_max,"}
                    {"sum(h.kvarh_est) as kvarh_est," if has_kvarh_est_1h else "null::numeric as kvarh_est,"}
                    {"sum(h.kvah_est) as kvah_est," if has_kvah_est_1h else "null::numeric as kvah_est,"}
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
                ts_col = "d.day_ts"
                select_cols = f"""
                    d.day_ts as ts,
                    sum(d.kwh_est) as kwh_est,
                    avg(d.kw_avg) as kw_avg,
                    max(d.kw_max) as kw_max,
                    avg(d.pf_avg) as pf_avg,
                    min(d.pf_min) as pf_min,
                    {"avg(d.q_kvar_avg) as q_kvar_avg," if has_q_1d_avg else "null::numeric as q_kvar_avg,"}
                    {"max(d.q_kvar_max) as q_kvar_max," if has_q_1d_max else "null::numeric as q_kvar_max,"}
                    {"avg(d.s_kva_avg) as s_kva_avg," if has_s_1d_avg else "null::numeric as s_kva_avg,"}
                    {"max(d.s_kva_max) as s_kva_max," if has_s_1d_max else "null::numeric as s_kva_max,"}
                    {"sum(d.kvarh_est) as kvarh_est," if has_kvarh_est_1d else "null::numeric as kvarh_est,"}
                    {"sum(d.kvah_est) as kvah_est," if has_kvah_est_1d else "null::numeric as kvah_est,"}
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