# app/routes/kpi/_common.py
import logging
from fastapi import HTTPException
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple, List, Any

logger = logging.getLogger("kpi")
LOCAL_TZ = "America/Argentina/Buenos_Aires"

# ==== helpers de tiempo ====
def _ft_defaults(date_from: Optional[datetime], date_to: Optional[datetime]) -> Tuple[datetime, datetime]:
    if date_to is None:
        date_to = datetime.now(timezone.utc)
    if date_from is None:
        date_from = date_to - timedelta(hours=24)

    if date_to.tzinfo is None:   date_to   = date_to.replace(tzinfo=timezone.utc)
    else:                        date_to   = date_to.astimezone(timezone.utc)
    if date_from.tzinfo is None: date_from = date_from.replace(tzinfo=timezone.utc)
    else:                        date_from = date_from.astimezone(timezone.utc)

    if date_from >= date_to:
        raise HTTPException(status_code=400, detail="'from' debe ser menor que 'to'")
    return date_from, date_to

# ==== helpers de formato ====
def _as_float(x): return float(x) if x is not None else None
def _as_int(x):   return int(x) if x is not None else None
def _as_bool(x):  return bool(x) if x is not None else None

def _compute_alarm(level_pct, low_low, low, high, high_high) -> str:
    if level_pct is None:
        return "normal"
    low_low   = float(low_low)   if low_low   is not None else 10.0
    low       = float(low)       if low       is not None else 25.0
    high      = float(high)      if high      is not None else 80.0
    high_high = float(high_high) if high_high is not None else 90.0
    x = float(level_pct)
    if x <= low_low or x >= high_high: return "critico"
    if x <= low     or x >= high:      return "alerta"
    return "normal"

def _log_scope(endpoint: str, **kwargs):
    logger.debug("[KPI] %s params=%s", endpoint, {k: v for k, v in kwargs.items() if v is not None})

def _log_rows(endpoint: str, rows: List[dict]):
    logger.debug("[KPI] %s rows=%d", endpoint, len(rows))

def _log_distinct_company_of_locations(cur, endpoint: str, company_id: Optional[int], rows: List[dict]):
    if company_id is None or not rows:
        return
    loc_ids = list({r.get("location_id") for r in rows if r.get("location_id") is not None})
    if not loc_ids:
        logger.debug("[KPI] %s sin location_id en filas (no se puede auditar company_id)", endpoint)
        return
    try:
        cur.execute("SELECT DISTINCT company_id FROM public.locations WHERE id = ANY(%s)", (loc_ids,))
        comps = [r["company_id"] for r in cur.fetchall()]
        logger.debug("[KPI] %s company_id_param=%s company_ids_result=%s", endpoint, company_id, comps)
        if any(c is not None and company_id is not None and c != company_id for c in comps):
            logger.warning("[KPI] %s ⚠️ mezclando empresas: solicitado=%s, result=%s", endpoint, company_id, comps)
    except Exception as e:
        logger.exception("[KPI] %s error auditando company_id de locations: %s", endpoint, e)

__all__ = [
    "logger", "LOCAL_TZ",
    "_ft_defaults", "_as_float", "_as_int", "_as_bool",
    "_compute_alarm", "_log_scope", "_log_rows", "_log_distinct_company_of_locations",
]
