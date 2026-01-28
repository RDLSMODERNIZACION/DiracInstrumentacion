from fastapi import APIRouter, HTTPException, Body
from typing import Optional, Dict, Any
from datetime import datetime

from psycopg.rows import dict_row
from app.db import get_conn

router = APIRouter(
    prefix="/components/network_analyzers",
    tags=["network_analyzers"],
)

# ------------------------------------------------------------
# POST /components/network_analyzers/{analyzer_id}/snapshot
# Inserta una lectura completa del analizador
# ------------------------------------------------------------
@router.post("/{analyzer_id}/snapshot")
def insert_snapshot(
    analyzer_id: int,
    payload: Dict[str, Any] = Body(...)
):
    """
    Inserta un snapshot completo del analizador de red (ABB M4M, etc).
    Espera valores instantáneos y opcionalmente energía.
    """

    ts = payload.get("ts")
    if ts:
        try:
            ts = datetime.fromisoformat(ts.replace("Z", "+00:00"))
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid ts format")
    else:
        ts = datetime.utcnow()

    energy = payload.get("energy", {}) or {}

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

                    "v_l1l2": payload.get("V_L1L2"),
                    "v_l3l2": payload.get("V_L3L2"),
                    "v_l1l3": payload.get("V_L1L3"),

                    "i_l1": payload.get("I_L1"),
                    "i_l2": payload.get("I_L2"),
                    "i_l3": payload.get("I_L3"),

                    "hz": payload.get("Hz"),

                    "p_w": payload.get("P_W"),
                    "p_kw": payload.get("P_kW"),

                    "q_var": payload.get("Q_var"),
                    "q_kvar": payload.get("Q_kVAr"),

                    "s_va": payload.get("S_VA"),
                    "s_kva": payload.get("S_kVA"),

                    "pf": payload.get("PF"),
                    "quadrant": payload.get("quadrant"),

                    "e_kwh_import": energy.get("kWh_import"),
                    "e_kwh_export": energy.get("kWh_export"),
                    "e_kvarh_import": energy.get("kVArh_import"),
                    "e_kvarh_export": energy.get("kVArh_export"),
                    "e_kvah": energy.get("kVAh"),

                    "raw": payload.get("raw"),
                    "source": payload.get("source", "network_analyzer"),
                }
            )
            row_id = cur.fetchone()[0]
            conn.commit()

    return {"ok": True, "id": row_id}


# ------------------------------------------------------------
# GET /components/network_analyzers/{analyzer_id}/latest
# Devuelve la última lectura del analizador
# ------------------------------------------------------------
@router.get("/{analyzer_id}/latest")
def get_latest_snapshot(analyzer_id: int):
    with get_conn() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                select *
                from public.network_analyzer_readings
                where analyzer_id = %(analyzer_id)s
                order by ts desc
                limit 1
                """,
                {"analyzer_id": analyzer_id}
            )
            row = cur.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="No readings found")

    return row
