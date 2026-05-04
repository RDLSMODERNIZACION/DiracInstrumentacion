# app/routes/mapa/diameters.py
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from app.db import get_conn

router = APIRouter(prefix="/diameters", tags=["mapa-diameters"])


def _fetchall_dict(cur):
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]


def _safe_rollback(conn):
    try:
        conn.rollback()
    except Exception:
        pass


@router.get("/transitions")
def get_diameter_transitions(
    min_delta_mm: float = Query(20, ge=0),
    min_ratio: float = Query(1.10, ge=1),
    severity: str | None = Query(None),
    limit: int = Query(2000, ge=1, le=10000),
):
    """
    Devuelve nodos donde se conectan cañerías con distintos diámetros.

    Sirve para marcar:
    - reducción de diámetro
    - conexión de troncal a ramal
    - unión de cañería grande a chica
    - posibles puntos críticos por cambio brusco de sección
    """
    with get_conn() as conn, conn.cursor() as cur:
        try:
            params = [min_delta_mm, min_ratio]
            where_extra = ""

            if severity:
                where_extra = " and severity = %s "
                params.append(severity.upper())

            params.append(limit)

            cur.execute(
                f"""
                select
                  node_id,
                  kind,
                  elev_m,
                  node_label,
                  lat,
                  lng,
                  pipes_count,
                  unique_pipes_count,
                  diameters_count,
                  min_diam_mm::double precision as min_diam_mm,
                  max_diam_mm::double precision as max_diam_mm,
                  delta_diam_mm::double precision as delta_diam_mm,
                  ratio_diam::double precision as ratio_diam,
                  severity,
                  transition_type,
                  diameters_mm,
                  pipes
                from "MapasAgua"."v_pipe_diameter_transitions"
                where delta_diam_mm >= %s
                  and ratio_diam >= %s
                  {where_extra}
                order by
                  case severity
                    when 'CRITICAL' then 1
                    when 'HIGH' then 2
                    when 'MEDIUM' then 3
                    else 4
                  end,
                  delta_diam_mm desc,
                  ratio_diam desc
                limit %s
                """,
                tuple(params),
            )

            items = _fetchall_dict(cur)

        except Exception as e:
            _safe_rollback(conn)
            raise HTTPException(500, f"get_diameter_transitions falló: {e}")

    return {
        "count": len(items),
        "items": items,
    }