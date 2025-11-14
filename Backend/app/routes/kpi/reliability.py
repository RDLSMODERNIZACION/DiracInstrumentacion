# app/routes/kpi/reliability.py
from fastapi import APIRouter, Query
from typing import Optional, Dict, Any, List
from psycopg.rows import dict_row

from app.db import get_conn
from ._common import logger, LOCAL_TZ, _log_scope, _log_rows

router = APIRouter(prefix="/reliability", tags=["kpi"])


@router.get(
    "/location_timeline",
    summary="Timeline de conectividad (operación y confiabilidad) para una ubicación",
)
def location_timeline(
    company_id: Optional[int] = Query(
        None,
        description="Empresa (company_id). Si se omite, incluye todas las empresas."
    ),
    location_id: Optional[int] = Query(
        None,
        description="Ubicación (location_id). Si se omite, es un timeline global por empresa."
    ),
    days: int = Query(
        7,
        ge=1,
        le=30,
        description="Cantidad de días hacia atrás (default 7)."
    ),
    bucket_minutes: int = Query(
        60,
        ge=5,
        le=1440,
        description="Tamaño de bucket en minutos (default 60)."
    ),
    tz: str = Query(
        LOCAL_TZ,
        description="Zona horaria para agrupar y devolver la timeline."
    ),
):
    """
    Devuelve una línea de tiempo de conectividad para la ubicación (o empresa)
    en los últimos N días, con buckets de X minutos.

    Un bucket está "conectado" si tuvo al menos 1 muestra en kpi.v_kpi_stream
    (kind IN ('pump','tank')) en ese intervalo.
    """
    _log_scope(
        "/kpi/reliability/location_timeline",
        company_id=company_id,
        location_id=location_id,
        extra={"days": days, "bucket_minutes": bucket_minutes, "tz": tz},
    )

    sql = """
      SELECT
        bucket_start,
        bucket_end,
        has_data,
        sample_count
      FROM kpi.location_connectivity_timeline(
        %(company_id)s,
        %(location_id)s,
        %(days)s,
        %(bucket_minutes)s,
        %(tz)s
      )
    """

    params: Dict[str, Any] = {
        "company_id": company_id,
        "location_id": location_id,
        "days": days,
        "bucket_minutes": bucket_minutes,
        "tz": tz,
    }

    with get_conn() as con, con.cursor(row_factory=dict_row) as cur:
        logger.debug("[KPI] /kpi/reliability/location_timeline SQL params=%s", params)
        cur.execute(sql, params)
        rows: List[dict] = cur.fetchall() or []
        _log_rows("/kpi/reliability/location_timeline", rows)

    total_buckets = len(rows)
    connected_buckets = sum(1 for r in rows if r.get("has_data"))
    uptime_ratio = (connected_buckets / total_buckets) if total_buckets > 0 else None

    return {
        "company_id": company_id,
        "location_id": location_id,
        "days": days,
        "bucket_minutes": bucket_minutes,
        "tz": tz,
        "total_buckets": total_buckets,
        "connected_buckets": connected_buckets,
        "uptime_ratio": uptime_ratio,
        "timeline": rows,
    }
