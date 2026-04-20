from fastapi import APIRouter, Query, HTTPException
from datetime import datetime, timezone
from psycopg.rows import dict_row

from app.db import get_conn

router = APIRouter(
    prefix="/analyzers",
    tags=["kpi", "energy", "analyzers"],
)


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


@router.get("/{analyzer_id}/month_kpis")
def get_analyzer_month_kpis(
    analyzer_id: int,
    month: str = Query(..., description="YYYY-MM"),
):
    """
    Devuelve KPIs mensuales de energía para un analizador en un mes.
    Si las columnas de reactiva no existen todavía en KPI, devuelve null y no rompe.
    """

    start_ts, end_ts = month_bounds_utc(month)

    with get_conn() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            # ---------------------------
            # ANALYZER INFO
            # ---------------------------
            cur.execute(
                """
                select
                  id,
                  name,
                  location_id,
                  model,
                  active,
                  contracted_power_kw
                from public.network_analyzers
                where id = %(analyzer_id)s
                """,
                {"analyzer_id": analyzer_id},
            )
            analyzer = cur.fetchone()
            if not analyzer:
                raise HTTPException(status_code=404, detail="Analyzer not found")

            has_q_1d_avg = has_column(cur, "kpi", "analyzers_1d", "q_kvar_avg")
            has_q_1d_max = has_column(cur, "kpi", "analyzers_1d", "q_kvar_max")
            has_q_1h_avg = has_column(cur, "kpi", "analyzers_1h", "q_kvar_avg")
            has_q_1h_max = has_column(cur, "kpi", "analyzers_1h", "q_kvar_max")

            summary_reactive_avg_sql = "avg(q_kvar_avg) as reactive_kvar_avg," if has_q_1d_avg else "null::numeric as reactive_kvar_avg,"
            summary_reactive_max_sql = "max(q_kvar_max) as reactive_kvar_max," if has_q_1d_max else "null::numeric as reactive_kvar_max,"

            daily_reactive_avg_sql = "q_kvar_avg as reactive_kvar_avg," if has_q_1d_avg else "null::numeric as reactive_kvar_avg,"
            daily_reactive_max_sql = "q_kvar_max as reactive_kvar_max," if has_q_1d_max else "null::numeric as reactive_kvar_max,"

            hourly_reactive_avg_sql = "avg(q_kvar_avg) as reactive_kvar_avg," if has_q_1h_avg else "null::numeric as reactive_kvar_avg,"
            hourly_reactive_max_sql = "max(q_kvar_max) as reactive_kvar_max," if has_q_1h_max else "null::numeric as reactive_kvar_max,"

            # ---------------------------
            # SUMMARY
            # ---------------------------
            cur.execute(
                f"""
                select
                  max(kw_max)       as max_kw,
                  avg(kw_avg)       as avg_kw,
                  sum(kwh_est)      as kwh_est,
                  avg(pf_avg)       as avg_pf,
                  min(pf_min)       as min_pf,
                  {summary_reactive_avg_sql}
                  {summary_reactive_max_sql}
                  sum(samples)::int as samples
                from kpi.analyzers_1d
                where analyzer_id = %(analyzer_id)s
                  and day_ts >= %(start_date)s
                  and day_ts < %(end_date)s
                """,
                {
                    "analyzer_id": analyzer_id,
                    "start_date": start_ts.date(),
                    "end_date": end_ts.date(),
                },
            )
            summary = cur.fetchone() or {}

            # ---------------------------
            # DAILY
            # ---------------------------
            cur.execute(
                f"""
                select
                  day_ts  as day,
                  kw_max  as max_kw,
                  kw_avg  as avg_kw,
                  kwh_est as kwh_est,
                  pf_avg  as avg_pf,
                  pf_min  as min_pf,
                  {daily_reactive_avg_sql}
                  {daily_reactive_max_sql}
                  samples
                from kpi.analyzers_1d
                where analyzer_id = %(analyzer_id)s
                  and day_ts >= %(start_date)s
                  and day_ts < %(end_date)s
                order by day_ts
                """,
                {
                    "analyzer_id": analyzer_id,
                    "start_date": start_ts.date(),
                    "end_date": end_ts.date(),
                },
            )
            daily = cur.fetchall() or []

            # ---------------------------
            # HOURLY PROFILE
            # ---------------------------
            cur.execute(
                f"""
                select
                  extract(hour from hour_ts)::int as hour,
                  avg(kw_avg)                    as avg_kw,
                  max(kw_max)                    as max_kw,
                  avg(pf_avg)                    as avg_pf,
                  min(pf_min)                    as min_pf,
                  {hourly_reactive_avg_sql}
                  {hourly_reactive_max_sql}
                  sum(samples)::int              as samples
                from kpi.analyzers_1h
                where analyzer_id = %(analyzer_id)s
                  and hour_ts >= %(start_ts)s
                  and hour_ts < %(end_ts)s
                group by 1
                order by 1
                """,
                {
                    "analyzer_id": analyzer_id,
                    "start_ts": start_ts,
                    "end_ts": end_ts,
                },
            )
            hourly = cur.fetchall() or []

    return {
        "analyzer_id": analyzer_id,
        "month": month,
        "analyzer": analyzer,
        "summary": summary,
        "daily": daily,
        "hourly": hourly,
    }