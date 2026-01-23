from typing import List, Dict
from psycopg.rows import dict_row
from app.db import get_conn


def get_signals_by_manifold(manifold_id: int) -> List[Dict]:
    sql = """
        SELECT
            id,
            manifold_id,
            signal_type,
            node_id,
            tag,
            unit,
            scale_mult,
            scale_add,
            min_value,
            max_value,
            updated_at
        FROM public.manifold_signals
        WHERE manifold_id = %s
        ORDER BY signal_type;
    """

    with get_conn() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, (manifold_id,))
            return cur.fetchall()


def upsert_signals_by_manifold(
    manifold_id: int,
    signals: List[Dict]
) -> List[Dict]:

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

    out = []

    with get_conn() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            for s in signals:
                cur.execute(sql, {
                    "manifold_id": manifold_id,
                    "signal_type": s["signal_type"],   # pressure | flow
                    "node_id": s.get("node_id"),
                    "tag": s.get("tag"),
                    "unit": s.get("unit"),
                    "scale_mult": s.get("scale_mult"),
                    "scale_add": s.get("scale_add"),
                    "min_value": s.get("min_value"),
                    "max_value": s.get("max_value"),
                })
                out.append(cur.fetchone())
        conn.commit()

    return out
