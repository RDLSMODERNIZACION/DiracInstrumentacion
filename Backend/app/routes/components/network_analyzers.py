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


def to_int(v: Any) -> Optional[int]:
    if v is None:
        return None
    if isinstance(v, bool):
        return int(v)
    if isinstance(v, int):
        return v
    if isinstance(v, float):
        return int(v)
    if isinstance(v, str):
        s = v.strip()
        if s == "":
            return None
        try:
            return int(float(s))
        except Exception:
            return None
    return None


def norm_payload(payload: Dict[str, Any]) -> Dict[str, Any]:
    energy = payload.get("energy", {}) or {}
    stats = payload.get("stats", {}) or {}
    avg = stats.get("avg", {}) or {}
    max_ = stats.get("max", {}) or {}

    def g(key: str) -> Any:
        return payload.get(key)

    def eg(key: str) -> Any:
        return energy.get(key)

    def ag(key: str) -> Any:
        return avg.get(key)

    def mg(key: str) -> Any:
        return max_.get(key)

    return {
        # instantáneos
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
        "quadrant": to_int(g("quadrant")),

        # energías
        "e_kwh_import": to_float(eg("active_import_kWh")),
        "e_kwh_export": to_float(eg("active_export_kWh")),
        "e_kwh_net": to_float(eg("active_net_kWh")),

        "e_kvarh_import": to_float(eg("reactive_import_kVArh")),
        "e_kvarh_export": to_float(eg("reactive_export_kVArh")),
        "e_kvarh_net": to_float(eg("reactive_net_kVArh")),

        "e_kvah_import": to_float(eg("apparent_import_kVAh")),
        "e_kvah_export": to_float(eg("apparent_export_kVAh")),
        "e_kvah_net": to_float(eg("apparent_net_kVAh")),

        # compatibilidad con esquema viejo
        "e_kvah": to_float(eg("apparent_import_kVAh")),

        # promedios
        "avg_p_w": to_float(ag("avg_P_W")),
        "avg_p_kw": to_float(ag("avg_P_kW")),
        "avg_q_var": to_float(ag("avg_Q_var")),
        "avg_q_kvar": to_float(ag("avg_Q_kVAr")),
        "avg_s_va": to_float(ag("avg_S_VA")),
        "avg_s_kva": to_float(ag("avg_S_kVA")),

        # máximos
        "max_p_w": to_float(mg("max_P_W")),
        "max_p_kw": to_float(mg("max_P_kW")),
        "max_q_var": to_float(mg("max_Q_var")),
        "max_q_kvar": to_float(mg("max_Q_kVAr")),
        "max_s_va": to_float(mg("max_S_VA")),
        "max_s_kva": to_float(mg("max_S_kVA")),

        "raw": payload.get("raw"),
        "source": payload.get("source", "network_analyzer"),
    }


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


# ------------------------------------------------------------
# GET /components/network_analyzers
# ------------------------------------------------------------
@router.get("")
def list_network_analyzers(
    location_id: Optional[int] = Query(None, description="Filtra por ubicación"),
    company_id: Optional[int] = Query(None, description="Filtra por empresa"),
    active_only: bool = Query(True, description="Si true, devuelve solo analizadores activos"),
):
    sql = """
        select
            na.id,
            na.name,
            na.location_id,
            l.name as location_name,
            l.company_id,
            na.model,
            na.ip,
            na.port,
            na.unit_id,
            na.active,
            na.created_at,
            na.contracted_power_kw
        from public.network_analyzers na
        left join public.locations l on l.id = na.location_id
        where 1=1
    """
    params: Dict[str, Any] = {}

    if location_id is not None:
        sql += " and na.location_id = %(location_id)s"
        params["location_id"] = location_id

    if company_id is not None:
        sql += " and l.company_id = %(company_id)s"
        params["company_id"] = company_id

    if active_only:
        sql += " and na.active = true"

    sql += " order by na.id"

    with get_conn() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, params)
            rows = cur.fetchall() or []

    return rows


# ------------------------------------------------------------
# POST /components/network_analyzers/{analyzer_id}/snapshot
# ------------------------------------------------------------
@router.post("/{analyzer_id}/snapshot")
def insert_snapshot(
    analyzer_id: int,
    payload: Dict[str, Any] = Body(...),
):
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
                    e_kwh_net,

                    e_kvarh_import,
                    e_kvarh_export,
                    e_kvarh_net,

                    e_kvah_import,
                    e_kvah_export,
                    e_kvah_net,

                    e_kvah,

                    avg_p_w,
                    avg_p_kw,
                    avg_q_var,
                    avg_q_kvar,
                    avg_s_va,
                    avg_s_kva,

                    max_p_w,
                    max_p_kw,
                    max_q_var,
                    max_q_kvar,
                    max_s_va,
                    max_s_kva,

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
                    %(e_kwh_net)s,

                    %(e_kvarh_import)s,
                    %(e_kvarh_export)s,
                    %(e_kvarh_net)s,

                    %(e_kvah_import)s,
                    %(e_kvah_export)s,
                    %(e_kvah_net)s,

                    %(e_kvah)s,

                    %(avg_p_w)s,
                    %(avg_p_kw)s,
                    %(avg_q_var)s,
                    %(avg_q_kvar)s,
                    %(avg_s_va)s,
                    %(avg_s_kva)s,

                    %(max_p_w)s,
                    %(max_p_kw)s,
                    %(max_q_var)s,
                    %(max_q_kvar)s,
                    %(max_s_va)s,
                    %(max_s_kva)s,

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
# ------------------------------------------------------------
@router.get("/{analyzer_id}/latest")
def get_latest_snapshot(
    analyzer_id: int,
    fields: Literal["lite", "full"] = Query("lite"),
):
    if analyzer_id <= 0:
        raise HTTPException(status_code=400, detail="Invalid analyzer_id")

    select_sql = """
        select
            id,
            analyzer_id,
            ts,
            p_kw,
            q_kvar,
            pf,
            e_kwh_import,
            e_kvarh_import,
            e_kvah_import,
            avg_p_kw,
            max_p_kw,
            source
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
# ------------------------------------------------------------
@router.get("/{analyzer_id}/history")
def get_history(
    analyzer_id: int,
    from_ts: datetime = Query(..., alias="from", description="ISO datetime, ej 2026-01-30T00:00:00Z"),
    to_ts: datetime = Query(..., alias="to", description="ISO datetime, ej 2026-01-30T23:59:59Z"),
    granularity: Literal["minute", "hour", "day"] = Query("minute"),
    limit: int = Query(20000, ge=1, le=200000),
):
    if analyzer_id <= 0:
        raise HTTPException(status_code=400, detail="Invalid analyzer_id")

    if from_ts.tzinfo is None:
        from_ts = from_ts.replace(tzinfo=timezone.utc)
    if to_ts.tzinfo is None:
        to_ts = to_ts.replace(tzinfo=timezone.utc)

    if to_ts <= from_ts:
        raise HTTPException(status_code=400, detail="Invalid range: to must be > from")

    with get_conn() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            has_q_1h_avg = has_column(cur, "kpi", "analyzers_1h", "q_kvar_avg")
            has_q_1h_max = has_column(cur, "kpi", "analyzers_1h", "q_kvar_max")
            has_q_1d_avg = has_column(cur, "kpi", "analyzers_1d", "q_kvar_avg")
            has_q_1d_max = has_column(cur, "kpi", "analyzers_1d", "q_kvar_max")

            if granularity == "minute":
                table = "kpi.analyzers_1m"
                ts_col = "minute_ts"
                select_cols = """
                    analyzer_id,
                    minute_ts as ts,
                    kw_avg,
                    kw_max,
                    pf_avg,
                    pf_min,
                    v_ll_avg,
                    i_avg,
                    samples
                """
                order = "minute_ts"

            elif granularity == "hour":
                table = "kpi.analyzers_1h"
                ts_col = "hour_ts"
                q_avg_sql = "q_kvar_avg" if has_q_1h_avg else "null::numeric as q_kvar_avg"
                q_max_sql = "q_kvar_max" if has_q_1h_max else "null::numeric as q_kvar_max"
                select_cols = f"""
                    analyzer_id,
                    hour_ts as ts,
                    kwh_est,
                    kw_avg,
                    kw_max,
                    pf_avg,
                    pf_min,
                    {q_avg_sql},
                    {q_max_sql},
                    samples
                """
                order = "hour_ts"

            else:
                table = "kpi.analyzers_1d"
                ts_col = "day_ts"
                q_avg_sql = "q_kvar_avg" if has_q_1d_avg else "null::numeric as q_kvar_avg"
                q_max_sql = "q_kvar_max" if has_q_1d_max else "null::numeric as q_kvar_max"
                select_cols = f"""
                    analyzer_id,
                    day_ts as ts,
                    kwh_est,
                    kw_avg,
                    kw_max,
                    pf_avg,
                    pf_min,
                    {q_avg_sql},
                    {q_max_sql},
                    samples
                """
                order = "day_ts"

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
        raise HTTPException(status_code=404, detail="No history for range")

    return {
        "analyzer_id": analyzer_id,
        "granularity": granularity,
        "from": from_ts,
        "to": to_ts,
        "points": rows,
    }