from __future__ import annotations

from fastapi import APIRouter, HTTPException, Body, Query
from typing import Dict, Any, Literal, Optional
from datetime import datetime, timezone

from psycopg.rows import dict_row
from app.db import get_conn

router = APIRouter(
    prefix="/components/network_analyzers",
    tags=["network_analyzers"],
)

# -------------------------------
# Helpers
# -------------------------------

def parse_ts(v: Any) -> datetime:
    """
    Acepta:
    - None -> now UTC
    - ISO string con Z o con offset
    - datetime (naive -> se asume UTC)
    """
    if v is None or v == "":
        return datetime.now(timezone.utc)

    if isinstance(v, datetime):
        if v.tzinfo is None:
            return v.replace(tzinfo=timezone.utc)
        return v

    if isinstance(v, str):
        s = v.strip()
        # soporta "Z"
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        try:
            dt = datetime.fromisoformat(s)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid ts format (expected ISO8601)")
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt

    raise HTTPException(status_code=400, detail="Invalid ts type (expected ISO string or datetime)")


def to_float(v: Any) -> Optional[float]:
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        s = v.strip().replace(",", ".")
        if s == "":
            return None
        try:
            return float(s)
        except Exception:
            return None
    return None


def norm_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Normaliza las keys típicas que llegan del ABB / Node-RED y hace coerción numérica.
    No exige todo: inserta null si falta.
    """
    energy = payload.get("energy", {}) or {}

    def g(key: str) -> Any:
        return payload.get(key)

    def eg(key: str) -> Any:
        return energy.get(key)

    return {
        "v_l1l2": to_float(g("V_L1L2")),
        "v_l3l2": to_float(g("V_L3L2")),
        "v_l1l3": to_float(g("V_L1L3")),

        "i_l1": to_float(g("I_L1")),
        "i_l2": to_float(g("I_L2")),
        "i_l3": to_float(g("I_L3")),

        "hz": to_float(g("Hz")),

        "p_w": to_float(g("P_W")),
        "p_kw": to_float(g("P_kW")),

        "q_var": to_float(g("Q_var")),
        "q_kvar": to_float(g("Q_kVAr")),

        "s_va": to_float(g("S_VA")),
        "s_kva": to_float(g("S_kVA")),

        "pf": to_float(g("PF")),
        "quadrant": payload.get("quadrant"),

        "e_kwh_import": to_float(eg("kWh_import")),
        "e_kwh_export": to_float(eg("kWh_export")),
        "e_kvarh_import": to_float(eg("kVArh_import")),
        "e_kvarh_export": to_float(eg("kVArh_export")),
        "e_kvah": to_float(eg("kVAh")),

        "raw": payload.get("raw"),
        "source": payload.get("source", "network_analyzer"),
    }


# ------------------------------------------------------------
# POST /components/network_analyzers/{analyzer_id}/snapshot
# Inserta una lectura completa del analizador
# ------------------------------------------------------------
@router.post("/{analyzer_id}/snapshot")
def insert_snapshot(
    analyzer_id: int,
    payload: Dict[str, Any] = Body(...),
):
    """
    Inserta un snapshot completo del analizador de red (ABB M4M, etc).
    Espera valores instantáneos y opcionalmente energía.

    - ts: ISO8601 (con Z o offset). Si no viene -> now UTC.
    - Guarda null si falta algún campo.
    """
    if analyzer_id <= 0:
        raise HTTPException(status_code=400, detail="Invalid analyzer_id")

    ts = parse_ts(payload.get("ts"))
    n = norm_payload(payload)

    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                insert into public.network_analyzer_readings (
                    analyzer_id,
                    ts,

                    v_l1l2, v_l3l2, v_l1l3,
                    i_l1, i_l2, i_l3,
                    hz,

                    p_w, p_kw,
                    q_var, q_kvar,
                    s_va, s_kva,

                    pf,
                    quadrant,

                    e_kwh_import,
                    e_kwh_export,
                    e_kvarh_import,
                    e_kvarh_export,
                    e_kvah,

                    raw,
                    source
                ) values (
                    %(analyzer_id)s,
                    %(ts)s,

                    %(v_l1l2)s, %(v_l3l2)s, %(v_l1l3)s,
                    %(i_l1)s, %(i_l2)s, %(i_l3)s,
                    %(hz)s,

                    %(p_w)s, %(p_kw)s,
                    %(q_var)s, %(q_kvar)s,
                    %(s_va)s, %(s_kva)s,

                    %(pf)s,
                    %(quadrant)s,

                    %(e_kwh_import)s,
                    %(e_kwh_export)s,
                    %(e_kvarh_import)s,
                    %(e_kvarh_export)s,
                    %(e_kvah)s,

                    %(raw)s,
                    %(source)s
                )
                returning id
                """,
                {
                    "analyzer_id": analyzer_id,
                    "ts": ts,

                    **n,
                },
            )
            row_id = cur.fetchone()[0]
            conn.commit()

    return {"ok": True, "id": row_id, "ts": ts}


# ------------------------------------------------------------
# GET /components/network_analyzers/{analyzer_id}/latest
# Devuelve la última lectura del analizador
# ------------------------------------------------------------
@router.get("/{analyzer_id}/latest")
def get_latest_snapshot(
    analyzer_id: int,
    fields: Literal["lite", "full"] = Query("lite"),
):
    """
    fields=lite -> solo lo necesario para la pantalla live (más rápido)
    fields=full -> devuelve la fila completa
    """
    if analyzer_id <= 0:
        raise HTTPException(status_code=400, detail="Invalid analyzer_id")

    select_sql = """
        select id, analyzer_id, ts, p_kw, pf, source
        from public.network_analyzer_readings
        where analyzer_id = %(analyzer_id)s
        order by ts desc
        limit 1
    """ if fields == "lite" else """
        select *
        from public.network_analyzer_readings
        where analyzer_id = %(analyzer_id)s
        order by ts desc
        limit 1
    """

    with get_conn() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(select_sql, {"analyzer_id": analyzer_id})
            row = cur.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="No readings found")

    return row


# ------------------------------------------------------------
# GET /components/network_analyzers/{analyzer_id}/history
# Histórico agregado desde tablas KPI
# ------------------------------------------------------------
@router.get("/{analyzer_id}/history")
def get_history(
    analyzer_id: int,
    from_ts: datetime = Query(..., alias="from", description="ISO datetime, ej 2026-01-30T00:00:00Z"),
    to_ts: datetime = Query(..., alias="to", description="ISO datetime, ej 2026-01-30T23:59:59Z"),
    granularity: Literal["minute", "hour", "day"] = Query("minute"),
    limit: int = Query(20000, ge=1, le=200000),
):
    """
    Devuelve histórico desde:
    - kpi.analyzers_1m (minute)
    - kpi.analyzers_1h (hour)
    - kpi.analyzers_1d (day)

    Respuesta uniforme:
    { analyzer_id, granularity, from, to, points: [...] }
    """
    if analyzer_id <= 0:
        raise HTTPException(status_code=400, detail="Invalid analyzer_id")

    # normaliza/asegura tz (si llega naive, asumimos UTC)
    if from_ts.tzinfo is None:
        from_ts = from_ts.replace(tzinfo=timezone.utc)
    if to_ts.tzinfo is None:
        to_ts = to_ts.replace(tzinfo=timezone.utc)

    if to_ts <= from_ts:
        raise HTTPException(status_code=400, detail="Invalid range: to must be > from")

    if granularity == "minute":
        table = "kpi.analyzers_1m"
        ts_col = "minute_ts"
        select_cols = """
            analyzer_id,
            minute_ts as ts,
            kw_avg, kw_max,
            pf_avg, pf_min,
            v_ll_avg, i_avg,
            samples
        """
        order = "minute_ts"
    elif granularity == "hour":
        table = "kpi.analyzers_1h"
        ts_col = "hour_ts"
        select_cols = """
            analyzer_id,
            hour_ts as ts,
            kwh_est,
            kw_avg, kw_max,
            pf_avg, pf_min,
            samples
        """
        order = "hour_ts"
    else:
        table = "kpi.analyzers_1d"
        ts_col = "day_ts"
        select_cols = """
            analyzer_id,
            day_ts as ts,
            kwh_est,
            kw_avg, kw_max,
            pf_avg, pf_min,
            samples
        """
        order = "day_ts"

    with get_conn() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                f"""
                select {select_cols}
                from {table}
                where analyzer_id = %(analyzer_id)s
                  and {ts_col} >= %(from_ts)s
                  and {ts_col} <= %(to_ts)s
                order by {order} asc
                limit %(limit)s
                """,
                {
                    "analyzer_id": analyzer_id,
                    "from_ts": from_ts,
                    "to_ts": to_ts,
                    "limit": limit,
                },
            )
            rows = cur.fetchall()

    if not rows:
        # opcional: 404 para que el front distinga "sin historia"
        raise HTTPException(status_code=404, detail="No history for range")

    return {
        "analyzer_id": analyzer_id,
        "granularity": granularity,
        "from": from_ts,
        "to": to_ts,
        "points": rows,
    }
