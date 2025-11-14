# app/routes/kpi/energy.py
from fastapi import APIRouter, Query
from typing import Optional
from psycopg.rows import dict_row
from app.db import get_conn

router = APIRouter(prefix="/energy", tags=["kpi"])

@router.get("/runtime")
def runtime(
    month: str = Query(..., pattern=r"^\d{4}-\d{2}$"),
    location_id: Optional[int] = Query(None),
    tz: str = "America/Argentina/Buenos_Aires",
    band_set_id: Optional[int] = Query(None),
):
    sql = """
      select key,label,hours
      from kpi.energy_runtime_distribution_month_events(%(m)s,%(loc)s,%(tz)s,%(set)s)
    """
    with get_conn() as con, con.cursor(row_factory=dict_row) as cur:
        cur.execute(sql, {"m": month, "loc": location_id, "tz": tz, "set": band_set_id})
        rows = cur.fetchall() or []
        total = float(sum((r.get("hours") or 0.0) for r in rows))
        return {
            "month": month,
            "total_hours": total,
            "buckets": [
                {"key": r["key"], "label": r["label"], "hours": float(r["hours"] or 0.0)}
                for r in rows
            ],
        }
