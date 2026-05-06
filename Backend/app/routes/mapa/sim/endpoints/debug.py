# app/routes/mapa/sim/endpoints/debug.py
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.db import get_conn

from ..repositories import (
    read_debug_node_counts,
    read_debug_pipe_counts,
    read_debug_source_counts,
    read_debug_sources,
)
from ..utils import safe_rollback
from ..valves import read_valves

router = APIRouter()


# ============================================================
# Debug sources
# GET /mapa/sim/debug_sources
# ============================================================

@router.get("/sim/debug_sources")
def debug_sources():
    """
    Muestra las fuentes hidráulicas que usa la simulación.

    Sale de:
      "MapasAgua"."v_sim_sources_live"
    """
    with get_conn() as conn, conn.cursor() as cur:
        try:
            items = read_debug_sources(cur)
        except Exception as e:
            safe_rollback(conn)
            raise HTTPException(500, f"debug_sources falló: {e}")

    return {
        "count": len(items),
        "items": items,
    }


# ============================================================
# Debug network
# GET /mapa/sim/debug_network
# ============================================================

@router.get("/sim/debug_network")
def debug_network():
    """
    Diagnóstico rápido:
    - cañerías totales
    - cañerías conectadas
    - nodos
    - fuentes
    - válvulas
    """
    with get_conn() as conn, conn.cursor() as cur:
        try:
            pipes = read_debug_pipe_counts(cur)
            nodes = read_debug_node_counts(cur)
            sources = read_debug_source_counts(cur)

            valve_node_open, valve_pipe_open, valves_total = read_valves(cur, conn)

        except Exception as e:
            safe_rollback(conn)
            raise HTTPException(500, f"debug_network falló: {e}")

    return {
        "pipes": pipes,
        "nodes": nodes,
        "sources": sources,
        "valves": {
            "valves_total": valves_total,
            "valves_on_nodes": len(valve_node_open),
            "valves_on_pipes": len(valve_pipe_open),
            "closed_node_valves": sum(1 for v in valve_node_open.values() if v is False),
            "closed_pipe_valves": sum(1 for v in valve_pipe_open.values() if v is False),
        },
    }
