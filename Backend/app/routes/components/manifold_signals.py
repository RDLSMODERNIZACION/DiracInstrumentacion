from typing import List, Dict, Any
from fastapi import APIRouter, HTTPException
from psycopg.rows import dict_row
from app.db import get_conn

router = APIRouter(prefix="/dirac/admin", tags=["admin-manifold-signals"])


# ---------------------------
# Helpers
# ---------------------------
def _norm_signal_type(v: Any) -> str:
    st = (v or "").strip().lower()
    if st not in ("pressure", "flow"):
        raise HTTPException(status_code=400, detail="signal_type debe ser 'pressure' o 'flow'")
    return st


def _to_float(v: Any, field: str) -> float:
    if v is None:
        raise HTTPException(status_code=400, detail=f"{field} es requerido")
    try:
        return float(v)
    except Exception:
        raise HTTPException(status_code=400, detail=f"{field} debe ser numérico")


# ---------------------------
# GET: Config + última lectura
# ---------------------------
def _get_signals_by_manifold(manifold_id: int) -> List[Dict[str, Any]]:
    sql = """
        SELECT
            s.id,
            s.manifold_id,
            s.signal_type,
            s.node_id,
            s.tag,
            s.unit,
            s.scale_mult,
            s.scale_add,
            s.min_value,
            s.max_value,
            s.updated_at,

            r.value      AS value,
            r.created_at AS ts

        FROM public.manifold_signals s
        LEFT JOIN LATERAL (
            SELECT value, created_at, id
            FROM public.manifold_signal_readings r
            WHERE r.manifold_signal_id = s.id
            ORDER BY r.created_at DESC, r.id DESC
            LIMIT 1
        ) r ON TRUE

        WHERE s.manifold_id = %s
        ORDER BY s.signal_type;
    """
    with get_conn() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, (manifold_id,))
            return cur.fetchall()


# ---------------------------
# PUT: upsert config de señales
# ---------------------------
def _upsert_signals_by_manifold(
    manifold_id: int,
    signals: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    if not signals:
        return []

    sql = """
        INSERT INTO public.manifold_signals (
            manifold_id,
            signal_type,
            node_id,
            tag,
            unit,
            scale_mult,
            scale_add,
            min_value,
            max_value
        )
        VALUES (
            %(manifold_id)s,
            %(signal_type)s,
            %(node_id)s,
            %(tag)s,
            %(unit)s,
            COALESCE(%(scale_mult)s, 1),
            COALESCE(%(scale_add)s, 0),
            %(min_value)s,
            %(max_value)s
        )
        ON CONFLICT (manifold_id, signal_type)
        DO UPDATE SET
            node_id    = EXCLUDED.node_id,
            tag        = EXCLUDED.tag,
            unit       = EXCLUDED.unit,
            scale_mult = EXCLUDED.scale_mult,
            scale_add  = EXCLUDED.scale_add,
            min_value  = EXCLUDED.min_value,
            max_value  = EXCLUDED.max_value,
            updated_at = now()
        RETURNING *;
    """

    out: List[Dict[str, Any]] = []

    with get_conn() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            for s in signals:
                st = _norm_signal_type(s.get("signal_type"))

                cur.execute(
                    sql,
                    {
                        "manifold_id": manifold_id,
                        "signal_type": st,
                        "node_id": s.get("node_id"),
                        "tag": s.get("tag"),
                        "unit": s.get("unit"),
                        "scale_mult": s.get("scale_mult"),
                        "scale_add": s.get("scale_add"),
                        "min_value": s.get("min_value"),
                        "max_value": s.get("max_value"),
                    },
                )
                out.append(cur.fetchone())

        conn.commit()

    return out


# ---------------------------
# POST: insertar lectura por manifold_id + signal_type  ✅ (recomendado)
# ---------------------------
@router.post("/manifolds/{manifold_id}/readings")
def insert_manifold_reading(manifold_id: int, payload: Dict[str, Any]):
    """
    Body:
    {
      "signal_type": "pressure" | "flow",
      "value": 7.2,
      "ts": "2026-01-25T20:40:00Z"   (opcional)
    }
    """
    st = _norm_signal_type(payload.get("signal_type"))
    raw_value = _to_float(payload.get("value"), "value")
    ts = payload.get("ts")  # opcional (si None -> now())

    sql_find = """
        SELECT id, unit, COALESCE(scale_mult, 1) AS scale_mult, COALESCE(scale_add, 0) AS scale_add
        FROM public.manifold_signals
        WHERE manifold_id = %s AND signal_type = %s
        LIMIT 1;
    """

    sql_ins = """
        INSERT INTO public.manifold_signal_readings (manifold_signal_id, value, created_at)
        VALUES (%s, %s, COALESCE(%s::timestamptz, now()))
        RETURNING id, manifold_signal_id, value, created_at;
    """

    with get_conn() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql_find, (manifold_id, st))
            sig = cur.fetchone()
            if not sig:
                raise HTTPException(
                    status_code=404,
                    detail="No existe esa señal para el manifold. Configurala primero con PUT /manifolds/{id}/signals",
                )

            scaled_value = (raw_value * float(sig["scale_mult"])) + float(sig["scale_add"])

            cur.execute(sql_ins, (sig["id"], scaled_value, ts))
            out = cur.fetchone()

        conn.commit()

    return {
        "ok": True,
        "manifold_id": manifold_id,
        "signal_type": st,
        "unit": sig["unit"],
        "raw_value": raw_value,
        "stored_value": out["value"],
        "ts": out["created_at"],
        "reading": out,
    }


# ---------------------------
# POST: insertar lectura directo por manifold_signal_id (opcional)
# ---------------------------
@router.post("/signals/{manifold_signal_id}/readings")
def insert_signal_reading(manifold_signal_id: int, payload: Dict[str, Any]):
    """
    Body:
    {
      "value": 7.2,
      "ts": "2026-01-25T20:40:00Z"  (opcional)
    }
    """
    raw_value = _to_float(payload.get("value"), "value")
    ts = payload.get("ts")

    sql_sig = """
        SELECT id, unit, COALESCE(scale_mult, 1) AS scale_mult, COALESCE(scale_add, 0) AS scale_add
        FROM public.manifold_signals
        WHERE id = %s
        LIMIT 1;
    """

    sql_ins = """
        INSERT INTO public.manifold_signal_readings (manifold_signal_id, value, created_at)
        VALUES (%s, %s, COALESCE(%s::timestamptz, now()))
        RETURNING id, manifold_signal_id, value, created_at;
    """

    with get_conn() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql_sig, (manifold_signal_id,))
            sig = cur.fetchone()
            if not sig:
                raise HTTPException(status_code=404, detail="manifold_signal_id inexistente")

            scaled_value = (raw_value * float(sig["scale_mult"])) + float(sig["scale_add"])

            cur.execute(sql_ins, (sig["id"], scaled_value, ts))
            out = cur.fetchone()

        conn.commit()

    return {
        "ok": True,
        "manifold_signal_id": manifold_signal_id,
        "unit": sig["unit"],
        "raw_value": raw_value,
        "stored_value": out["value"],
        "ts": out["created_at"],
        "reading": out,
    }


# ---------------------------
# Routes existentes
# ---------------------------
@router.get("/manifolds/{manifold_id}/signals")
def read_manifold_signals(manifold_id: int):
    return _get_signals_by_manifold(manifold_id)


@router.put("/manifolds/{manifold_id}/signals")
def save_manifold_signals(manifold_id: int, signals: List[Dict[str, Any]]):
    return _upsert_signals_by_manifold(manifold_id, signals)
