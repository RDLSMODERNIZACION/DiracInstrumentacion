# app/routes/mapa/sim/valves.py
from __future__ import annotations

from typing import Dict

from .utils import fetchall_dict, safe_rollback


def read_valves(cur, conn) -> tuple[Dict[str, bool], Dict[str, bool], int]:
    """
    Lee válvulas de MapasAgua.valves.

    Regla importante:
      - Si la válvula tiene map_pipe_id, bloquea SOLO esa cañería.
      - Si NO tiene map_pipe_id y sí tiene map_node_id, bloquea el nodo completo.

    Esto permite que una válvula insertada en un punto exacto tenga:
      map_node_id = ubicación física de la válvula
      map_pipe_id = tramo que se corta
    sin bloquear todo el nodo.
    """
    valve_node_open: Dict[str, bool] = {}
    valve_pipe_open: Dict[str, bool] = {}
    valves_total = 0

    # Modelo nuevo
    try:
        cur.execute(
            """
            SELECT
                map_node_id::text AS node_id,
                map_pipe_id::text AS pipe_id,
                is_open
            FROM "MapasAgua".valves
            """
        )

        for r in fetchall_dict(cur):
            valves_total += 1
            is_open = bool(r.get("is_open"))

            pipe_id = r.get("pipe_id")
            node_id = r.get("node_id")

            # Prioridad: si tiene pipe_id, es válvula de cañería.
            # El node_id queda solo como posición física para dibujar la válvula.
            if pipe_id:
                valve_pipe_open[pipe_id] = is_open
                continue

            # Solo bloquea nodo si NO tiene pipe asociado.
            if node_id:
                valve_node_open[node_id] = is_open

        return valve_node_open, valve_pipe_open, valves_total

    except Exception:
        safe_rollback(conn)

    # Modelo viejo
    try:
        cur.execute(
            """
            SELECT
                node_id::text AS node_id,
                null::text AS pipe_id,
                is_open
            FROM "MapasAgua".valves
            """
        )

        for r in fetchall_dict(cur):
            valves_total += 1
            is_open = bool(r.get("is_open"))

            if r.get("node_id"):
                valve_node_open[r["node_id"]] = is_open

        return valve_node_open, valve_pipe_open, valves_total

    except Exception:
        safe_rollback(conn)
        return {}, {}, 0
