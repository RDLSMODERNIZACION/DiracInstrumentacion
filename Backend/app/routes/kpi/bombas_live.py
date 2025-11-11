# app/routes/kpi/bombas_live.py
import os
from fastapi import APIRouter, Query, HTTPException
from psycopg.rows import dict_row
from typing import Optional, Dict, Any, List, Tuple
from datetime import datetime, timedelta, timezone
from app.db import get_conn

router = APIRouter(prefix="/kpi/bombas", tags=["kpi-bombas"])

# Defaults a tus tablas reales en public.*; si cambian, sobreescribí por ENV.
PUMPS_TABLE = (os.getenv("PUMPS_TABLE") or "public.pumps").strip()
LOCATIONS_TABLE = (os.getenv("LOCATIONS_TABLE") or "public.locations").strip()

# ---------------- helpers de tiempo ----------------
def _bounds_24h(date_from: Optional[datetime], date_to: Optional[datetime]) -> Tuple[datetime, datetime]:
    if date_to is None:
        date_to = datetime.now(timezone.utc)
    if date_from is None:
        date_from = date_to - timedelta(hours=24)
    if date_to.tzinfo is None:   date_to   = date_to.replace(tzinfo=timezone.utc)
    else:                        date_to   = date_to.astimezone(timezone.utc)
    if date_from.tzinfo is None: date_from = date_from.replace(tzinfo=timezone.utc)
    else:                        date_from = date_from.astimezone(timezone.utc)
    # redondeo a minuto
    date_to   = date_to.replace(second=0, microsecond=0)
    date_from = date_from.replace(second=0, microsecond=0)
    return date_from, date_to

def _ceil_minute(ts: datetime) -> datetime:
    if ts.second == 0 and ts.microsecond == 0:
        return ts
    return (ts.replace(second=0, microsecond=0) + timedelta(minutes=1))

def _parse_ids(csv: Optional[str]) -> Optional[List[int]]:
    if not csv: return None
    out: List[int] = []
    for tok in csv.split(","):
        tok = tok.strip()
        if not tok: continue
        try: out.append(int(tok))
        except: pass
    return out or None

# ---------------- endpoint ----------------
@router.get("/live")
def pumps_live_24h(
    company_id: Optional[int] = Query(None, description="Scope por empresa"),
    location_id: Optional[int] = Query(None, description="Filtra por ubicación"),
    pump_ids: Optional[str] = Query(None, description="CSV opcional de pump_id(s)"),
    date_from: Optional[datetime] = Query(None, alias="from"),
    date_to:   Optional[datetime] = Query(None, alias="to"),
):
    """
    Serie por minuto con la CANTIDAD de bombas encendidas (carry-forward).
    * Si pasás pump_ids => NO toca public.pumps/public.locations (robusto).
    * hb_ts/relay de kpi.pump_heartbeat_parsed se castean explícitamente.
    """
    df, dt = _bounds_24h(date_from, date_to)
    ids = _parse_ids(pump_ids)

    try:
        with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:

            # ---- 1) Scope de bombas ----
            if ids:
                scope_ids = ids
            else:
                if company_id is not None or location_id is not None:
                    # ⚠️ Tipamos parámetros con un CTE 'params' para evitar "could not determine data type"
                    cur.execute(
                        f"""
                        WITH params AS (
                          SELECT
                            %(company_id)s::bigint AS company_id,
                            %(location_id)s::bigint AS location_id
                        )
                        SELECT p.id AS pump_id
                        FROM {PUMPS_TABLE} p
                        JOIN {LOCATIONS_TABLE} l ON l.id = p.location_id
                        CROSS JOIN params
                        WHERE (params.company_id IS NULL OR l.company_id = params.company_id)
                          AND (params.location_id IS NULL OR l.id = params.location_id)
                        """,
                        {"company_id": company_id, "location_id": location_id},
                    )
                    scope_ids = [int(r["pump_id"]) for r in cur.fetchall()]
                else:
                    # sin filtros: tomar bombas con actividad en ±48h
                    cur.execute(
                        """
                        WITH bounds AS (
                          SELECT %(df)s::timestamptz AS start_utc, %(dt)s::timestamptz AS end_utc
                        )
                        SELECT DISTINCT h.pump_id
                        FROM kpi.pump_heartbeat_parsed h, bounds b
                        WHERE (h.hb_ts)::timestamptz >= (b.start_utc - interval '48 hours')
                          AND (h.hb_ts)::timestamptz <= b.end_utc
                        """,
                        {"df": df, "dt": dt},
                    )
                    scope_ids = [int(r["pump_id"]) for r in cur.fetchall()]

            if not scope_ids:
                return {
                    "timestamps": [],
                    "is_on": [],
                    "pumps_total": 0,
                    "pumps_connected": 0,
                    "window": {"from": df.isoformat(), "to": dt.isoformat()},
                }

            # ---- 2) Baseline por bomba (último estado antes de df) ----
            cur.execute(
                """
                SELECT DISTINCT ON (h.pump_id)
                       h.pump_id,
                       (h.relay)::boolean AS relay
                FROM kpi.pump_heartbeat_parsed h
                JOIN (SELECT unnest(%(ids)s::int[]) AS pump_id) s ON s.pump_id = h.pump_id
                WHERE (h.hb_ts)::timestamptz < %(df)s
                ORDER BY h.pump_id, (h.hb_ts)::timestamptz DESC
                """,
                {"ids": scope_ids, "df": df},
            )
            baseline_rows = cur.fetchall()
            baseline = {int(r["pump_id"]): bool(r["relay"]) for r in baseline_rows}

            # ---- 3) Heartbeats en [df, dt] con CAST explícito ----
            cur.execute(
                """
                SELECT h.pump_id,
                       (h.hb_ts)::timestamptz AS ts,
                       (h.relay)::boolean     AS relay
                FROM kpi.pump_heartbeat_parsed h
                JOIN (SELECT unnest(%(ids)s::int[]) AS pump_id) s ON s.pump_id = h.pump_id
                WHERE (h.hb_ts)::timestamptz >= %(df)s
                  AND (h.hb_ts)::timestamptz <= %(dt)s
                ORDER BY h.pump_id, ts
                """,
                {"ids": scope_ids, "df": df, "dt": dt},
            )
            rows = cur.fetchall()

        # ---- 4) Carry-forward en Python → intervalos ON [start,end) por bomba ----
        from collections import defaultdict, OrderedDict

        by_pump: Dict[int, List[Dict[str, Any]]] = defaultdict(list)
        for r in rows:
            by_pump[int(r["pump_id"])].append({"ts": r["ts"], "relay": bool(r["relay"])})

        # eventos de +1/-1 por minuto
        events: Dict[datetime, int] = defaultdict(int)

        for pid in scope_ids:
            state = bool(baseline.get(pid, False))  # baseline en df
            cur_start: Optional[datetime] = df if state else None

            for r in by_pump.get(pid, []):
                t: datetime = r["ts"]
                v: bool = r["relay"]
                if v == state:
                    continue
                if state is True:
                    # cerrar intervalo ON [cur_start, t)
                    inc = _ceil_minute(cur_start)
                    dec = _ceil_minute(t)
                    if inc < _ceil_minute(dt):
                        events[inc] += 1
                        events[dec] -= 1
                    cur_start = None
                else:
                    # abrir intervalo ON
                    cur_start = t
                state = v

            if state is True and cur_start is not None:
                inc = _ceil_minute(cur_start)
                dec = _ceil_minute(dt)
                if inc < _ceil_minute(dt):
                    events[inc] += 1
                    events[dec] -= 1

        # ---- 5) Grilla por minuto + prefix sum ----
        minutes = []
        cur = df
        while cur <= dt:
            minutes.append(cur)
            cur += timedelta(minutes=1)

        run = 0
        evmap = OrderedDict(sorted(events.items()))
        out = []
        ev_iter = iter(evmap.items())
        try:
            next_ev_time, next_ev_val = next(ev_iter)
        except StopIteration:
            next_ev_time, next_ev_val = None, 0

        for m in minutes:
            while next_ev_time is not None and next_ev_time <= m:
                run += next_ev_val
                try:
                    next_ev_time, next_ev_val = next(ev_iter)
                except StopIteration:
                    next_ev_time, next_ev_val = None, 0
            out.append(run)

        pumps_total = len(scope_ids)
        pumps_connected = len({int(r["pump_id"]) for r in rows})

        return {
            "timestamps": [int(m.timestamp() * 1000) for m in minutes],
            "is_on": out,
            "pumps_total": pumps_total,
            "pumps_connected": pumps_connected,
            "window": {"from": df.isoformat(), "to": dt.isoformat()},
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"backend error: {e}")
