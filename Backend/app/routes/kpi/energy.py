from fastapi import APIRouter, Query
from typing import Optional, Dict, Any, List
from psycopg.rows import dict_row
from app.db import get_conn

from ._common import logger, LOCAL_TZ, _log_scope, _log_rows

router = APIRouter(prefix="/energy", tags=["kpi"])

@router.get("/runtime", summary="Distribución mensual de horas ON por bandas horarias")
def runtime(
    month: str = Query(
        ...,
        pattern=r"^\d{4}-\d{2}$",
        description="Mes en formato YYYY-MM (ej: '2025-11')",
    ),
    company_id: Optional[int] = Query(
        None,
        description="Scope de empresa; si se omite, agrupa todas las empresas",
    ),
    location_id: Optional[int] = Query(
        None,
        description="Ubicación (location_id) para filtrar bombas",
    ),
    tz: str = Query(
        LOCAL_TZ,
        description="Zona horaria para distribuir las horas (default AMBA)",
    ),
    band_set_id: Optional[int] = Query(
        None,
        description="ID de energy_band_set; si se omite se usan las reglas por defecto",
    ),
):
    _log_scope(
        "/energy/runtime",
        company_id=company_id,
        location_id=location_id,
        extra={"month": month, "tz": tz, "band_set_id": band_set_id},
    )

    sql = """
      SELECT key, label, hours
      FROM kpi.energy_runtime_distribution_month_events(
        %(m)s::text,
        %(loc)s::bigint,
        %(company)s::bigint,
        %(tz)s::text,
        %(set)s::bigint
      )
    """

    params: Dict[str, Any] = {
        "m": month,
        "loc": location_id,
        "company": company_id,
        "tz": tz,
        "set": band_set_id,
    }

    with get_conn() as con, con.cursor(row_factory=dict_row) as cur:
        logger.debug("[KPI] /energy/runtime ejecutando SQL con params=%s", params)
        cur.execute(sql, params)
        rows: List[dict] = cur.fetchall() or []
        _log_rows("/energy/runtime", rows)

    total = float(sum(float(r.get("hours") or 0.0) for r in rows))
    buckets = [
        {
            "key": r["key"],
            "label": r["label"],
            "hours": float(r["hours"] or 0.0),
        }
        for r in rows
    ]

    return {
        "month": month,
        "total_hours": total,
        "buckets": buckets,
    }
