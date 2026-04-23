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


def _base_hourly_cte_sql(has_q_1h_avg: bool, has_q_1h_max: bool) -> str:
    if has_q_1h_avg:
        pf_area_hour_sql = """
            case
                when sqrt(power(sum(h.kw_avg), 2) + power(sum(h.q_kvar_avg), 2)) > 0
                then abs(sum(h.kw_avg)) / sqrt(power(sum(h.kw_avg), 2) + power(sum(h.q_kvar_avg), 2))
                else null
            end as pf_area
        """
        q_avg_sql = "sum(h.q_kvar_avg) as reactive_kvar_avg"
    else:
        pf_area_hour_sql = """
            case
                when sum(abs(h.kw_avg)) > 0
                then sum(h.pf_avg * abs(h.kw_avg)) / sum(abs(h.kw_avg))
                else null
            end as pf_area
        """
        q_avg_sql = "null::numeric as reactive_kvar_avg"

    if has_q_1h_max:
        q_max_sql = "sum(h.q_kvar_max) as reactive_kvar_max"
    else:
        q_max_sql = "null::numeric as reactive_kvar_max"

    return f"""
        base_hourly as (
            select
                h.hour_ts,
                date(h.hour_ts) as day_ts,
                extract(hour from h.hour_ts)::int as hour_of_day,
                sum(h.kwh_est) as kwh_est,
                sum(h.kw_avg) as kw_avg,
                {pf_area_hour_sql},
                {q_avg_sql},
                {q_max_sql},
                sum(h.samples)::int as samples
            from kpi.analyzers_1h h
            join public.network_analyzers na
              on na.id = h.analyzer_id
            join public.locations l
              on l.id = na.location_id
            where l.area_id = %(area_id)s
              and h.hour_ts >= %(from_ts)s
              and h.hour_ts < %(to_ts)s
            group by h.hour_ts
        )
    """


def _hourly_max_from_snapshots_cte_sql() -> str:
    return """
        raw_area as (
            select
                r.ts,
                date_trunc('hour', r.ts) as hour_ts,
                r.analyzer_id,
                r.p_kw,
                r.max_p_kw
            from public.network_analyzer_readings r
            join public.network_analyzers na
              on na.id = r.analyzer_id
            join public.locations l
              on l.id = na.location_id
            where l.area_id = %(area_id)s
              and r.ts >= %(from_ts)s
              and r.ts < %(to_ts)s
        ),
        leader_per_hour as (
            select distinct on (ra.hour_ts)
                ra.hour_ts,
                ra.ts as leader_ts,
                ra.analyzer_id as leader_analyzer_id,
                ra.max_p_kw as leader_max_p_kw
            from raw_area ra
            where ra.max_p_kw is not null or ra.p_kw is not null
            order by
                ra.hour_ts,
                ra.max_p_kw desc nulls last,
                ra.ts asc,
                ra.analyzer_id asc
        ),
        completed_hour_max as (
            select
                lph.hour_ts,
                lph.leader_ts,
                lph.leader_analyzer_id,
                sum(
                    case
                        when nearest.analyzer_id = lph.leader_analyzer_id
                            then coalesce(nearest.max_p_kw, nearest.p_kw, 0)
                        else coalesce(nearest.p_kw, nearest.max_p_kw, 0)
                    end
                ) as max_kw
            from leader_per_hour lph
            join lateral (
                select distinct on (ra2.analyzer_id)
                    ra2.analyzer_id,
                    ra2.ts,
                    ra2.p_kw,
                    ra2.max_p_kw
                from raw_area ra2
                where ra2.hour_ts = lph.hour_ts
                order by
                    ra2.analyzer_id,
                    abs(extract(epoch from (ra2.ts - lph.leader_ts))) asc,
                    ra2.ts asc
            ) nearest on true
            group by
                lph.hour_ts,
                lph.leader_ts,
                lph.leader_analyzer_id
        )
    """


def _period_energy_sql() -> str:
    return """
        with per_analyzer as (
            select
                r.analyzer_id,
                max(r.e_kwh_import)   - min(r.e_kwh_import)   as kwh_import_period,
                max(r.e_kvarh_import) - min(r.e_kvarh_import) as kvarh_import_period,
                max(r.e_kvah_import)  - min(r.e_kvah_import)  as kvah_import_period
            from public.network_analyzer_readings r
            join public.network_analyzers na
              on na.id = r.analyzer_id
            join public.locations l
              on l.id = na.location_id
            where l.area_id = %(area_id)s
              and r.ts >= %(from_ts)s
              and r.ts < %(to_ts)s
              and (
                    r.e_kwh_import is not null
                 or r.e_kvarh_import is not null
                 or r.e_kvah_import is not null
              )
            group by r.analyzer_id
        )
        select
            sum(kwh_import_period)   as period_kwh,
            sum(kvarh_import_period) as period_kvarh,
            sum(kvah_import_period)  as period_kvah
        from per_analyzer
    """


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

            has_q_1h_avg = has_column(cur, "kpi", "analyzers_1h", "q_kvar_avg")
            has_q_1h_max = has_column(cur, "kpi", "analyzers_1h", "q_kvar_max")

            ctes = ",\n".join([
                _base_hourly_cte_sql(has_q_1h_avg, has_q_1h_max).strip(),
                _hourly_max_from_snapshots_cte_sql().strip(),
            ])

            cur.execute(
                f"""
                with
                {ctes}
                select
                    max(chm.max_kw) as max_kw,
                    avg(bh.kw_avg) as avg_kw,
                    sum(bh.kwh_est) as kwh_est,
                    avg(bh.pf_area) as avg_pf,
                    min(bh.pf_area) as min_pf,
                    avg(bh.reactive_kvar_avg) as reactive_kvar_avg,
                    max(bh.reactive_kvar_max) as reactive_kvar_max,
                    sum(bh.samples)::int as samples
                from base_hourly bh
                left join completed_hour_max chm
                  on chm.hour_ts = bh.hour_ts
                """,
                {
                    "area_id": area_id,
                    "from_ts": start_ts,
                    "to_ts": end_ts,
                },
            )
            summary_db = cur.fetchone() or {}

            cur.execute(
                _period_energy_sql(),
                {
                    "area_id": area_id,
                    "from_ts": start_ts,
                    "to_ts": end_ts,
                },
            )
            energy_period = cur.fetchone() or {}

            summary = {
                "max_kw": summary_db.get("max_kw"),
                "avg_kw": summary_db.get("avg_kw"),
                "kwh_est": summary_db.get("kwh_est"),
                "period_kwh": energy_period.get("period_kwh"),
                "period_kvarh": energy_period.get("period_kvarh"),
                "period_kvah": energy_period.get("period_kvah"),
                "avg_pf": summary_db.get("avg_pf"),
                "min_pf": summary_db.get("min_pf"),
                "reactive_kvar_avg": summary_db.get("reactive_kvar_avg"),
                "reactive_kvar_max": summary_db.get("reactive_kvar_max"),
                "samples": summary_db.get("samples"),
                "contracted_power_kw": area.get("contracted_power_kw"),
            }

            cur.execute(
                f"""
                with
                {ctes}
                select
                    bh.day_ts as day,
                    max(chm.max_kw) as max_kw,
                    avg(bh.kw_avg) as avg_kw,
                    sum(bh.kwh_est) as kwh_est,
                    avg(bh.pf_area) as avg_pf,
                    min(bh.pf_area) as min_pf,
                    avg(bh.reactive_kvar_avg) as reactive_kvar_avg,
                    max(bh.reactive_kvar_max) as reactive_kvar_max,
                    sum(bh.samples)::int as samples
                from base_hourly bh
                left join completed_hour_max chm
                  on chm.hour_ts = bh.hour_ts
                group by bh.day_ts
                order by bh.day_ts
                """,
                {
                    "area_id": area_id,
                    "from_ts": start_ts,
                    "to_ts": end_ts,
                },
            )
            daily = cur.fetchall() or []

            cur.execute(
                f"""
                with
                {ctes}
                select
                    bh.hour_of_day as hour,
                    avg(bh.kw_avg) as avg_kw,
                    max(chm.max_kw) as max_kw,
                    avg(bh.pf_area) as avg_pf,
                    min(bh.pf_area) as min_pf,
                    avg(bh.reactive_kvar_avg) as reactive_kvar_avg,
                    max(bh.reactive_kvar_max) as reactive_kvar_max,
                    sum(bh.samples)::int as samples
                from base_hourly bh
                left join completed_hour_max chm
                  on chm.hour_ts = bh.hour_ts
                group by bh.hour_of_day
                order by bh.hour_of_day
                """,
                {
                    "area_id": area_id,
                    "from_ts": start_ts,
                    "to_ts": end_ts,
                },
            )
            hourly = cur.fetchall() or []

    return {
        "area_id": area_id,
        "month": month,
        "area": area,
        "summary": summary,
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

            has_q_1h_avg = has_column(cur, "kpi", "analyzers_1h", "q_kvar_avg")
            has_q_1h_max = has_column(cur, "kpi", "analyzers_1h", "q_kvar_max")

            if granularity == "minute":
                cur.execute(
                    """
                    select
                        date_trunc('minute', r.ts) as ts,
                        sum(r.p_kw) as kw_avg,
                        sum(r.max_p_kw) as kw_max,
                        null::numeric as pf_avg,
                        null::numeric as pf_min,
                        null::numeric as q_kvar_avg,
                        null::numeric as q_kvar_max,
                        count(*)::int as samples
                    from public.network_analyzer_readings r
                    join public.network_analyzers na on na.id = r.analyzer_id
                    join public.locations l on l.id = na.location_id
                    where l.area_id = %(area_id)s
                      and r.ts >= %(from_ts)s
                      and r.ts <= %(to_ts)s
                    group by date_trunc('minute', r.ts)
                    order by date_trunc('minute', r.ts) asc
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

            elif granularity == "hour":
                ctes = ",\n".join([
                    _base_hourly_cte_sql(has_q_1h_avg, has_q_1h_max).strip(),
                    _hourly_max_from_snapshots_cte_sql().strip(),
                ])

                cur.execute(
                    f"""
                    with
                    {ctes}
                    select
                        bh.hour_ts as ts,
                        bh.kwh_est,
                        bh.kw_avg,
                        chm.max_kw as kw_max,
                        bh.pf_area as pf_avg,
                        bh.pf_area as pf_min,
                        bh.reactive_kvar_avg as q_kvar_avg,
                        bh.reactive_kvar_max as q_kvar_max,
                        bh.samples
                    from base_hourly bh
                    left join completed_hour_max chm
                      on chm.hour_ts = bh.hour_ts
                    order by bh.hour_ts asc
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

            else:
                ctes = ",\n".join([
                    _base_hourly_cte_sql(has_q_1h_avg, has_q_1h_max).strip(),
                    _hourly_max_from_snapshots_cte_sql().strip(),
                ])

                cur.execute(
                    f"""
                    with
                    {ctes}
                    select
                        bh.day_ts as ts,
                        sum(bh.kwh_est) as kwh_est,
                        avg(bh.kw_avg) as kw_avg,
                        max(chm.max_kw) as kw_max,
                        avg(bh.pf_area) as pf_avg,
                        min(bh.pf_area) as pf_min,
                        avg(bh.reactive_kvar_avg) as q_kvar_avg,
                        max(bh.reactive_kvar_max) as q_kvar_max,
                        sum(bh.samples)::int as samples
                    from base_hourly bh
                    left join completed_hour_max chm
                      on chm.hour_ts = bh.hour_ts
                    group by bh.day_ts
                    order by bh.day_ts asc
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