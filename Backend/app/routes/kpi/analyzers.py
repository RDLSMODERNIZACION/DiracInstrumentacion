# app/routes/kpi/analyzers.py

from fastapi import APIRouter, Query, HTTPException
from datetime import datetime, timezone
from psycopg.rows import dict_row

from app.db import get_conn

router = APIRouter(
    prefix="/analyzers",
    tags=["kpi", "energy", "analyzers"],
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


# ------------------------------------------------------------
# GET /kpi/analyzers/{analyzer_id}/month_kpis
# KPIs mensuales desde tablas agregadas (kpi.analyzers_1d / 1h)
# ------------------------------------------------------------
@router.get("/{analyzer_id}/month_kpis")
def get_analyzer_month_kpis(
    analyzer_id: int,
    month: str = Query(..., description="YYYY-MM"),
):
    """
    Devuelve KPIs de energía para un analizador en un mes:
    - summary: max_kw, avg_kw, kwh_est, avg_pf, min_pf, samples
    - daily:   max_kw / avg_kw / kwh_est por día
    - hourly:  perfil horario promedio (avg_kw, max_kw)
    """

    start_ts, end_ts = month_bounds_utc(month)

    with get_conn() as conn:
        with conn.cursor(row_factory=dict_row) as cur:

            # ---------------------------
            # SUMMARY (desde 1d)
            # ---------------------------
            cur.execute(
                """
                select
                  max(kw_max)          as max_kw,
                  avg(kw_avg)          as avg_kw,
                  sum(kwh_est)         as kwh_est,
                  avg(pf_avg)          as avg_pf,
                  min(pf_min)          as min_pf,
                  sum(samples)::int    as samples
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
            # DAILY (gráfico max diaria)
            # ---------------------------
            cur.execute(
                """
                select
                  day_ts                as day,
                  kw_max                as max_kw,
                  kw_avg                as avg_kw,
                  kwh_est               as kwh_est,
                  pf_avg                as avg_pf,
                  pf_min                as min_pf,
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
            # HOURLY PROFILE (perfil horario)
            # ---------------------------
            cur.execute(
                """
                select
                  extract(hour from hour_ts)::int as hour,
                  avg(kw_avg)                    as avg_kw,
                  max(kw_max)                    as max_kw,
                  avg(pf_avg)                    as avg_pf,
                  min(pf_min)                    as min_pf,
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
        "summary": summary,
        "daily": daily,
        "hourly": hourly,
    }
