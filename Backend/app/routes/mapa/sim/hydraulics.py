# app/routes/mapa/sim/hydraulics.py
from __future__ import annotations

from typing import Dict, List, Tuple
import heapq


def pipe_R(length_m: float, diam_mm: float, r_scale: float) -> float:
    """
    Resistencia simplificada:
      R ~ L / D^4

    L = longitud en metros
    D = diámetro en metros

    Es una aproximación estable para visualización.
    """
    L = max(0.1, float(length_m or 0.0))
    D = max(0.001, float(diam_mm or 75.0) / 1000.0)
    return (L / (D ** 4)) * float(r_scale or 1.0)


def propagate_from_single_source(
    start_node: str,
    start_head: float,
    adj: Dict[str, List[Tuple[str, str, float, float, float]]],
    blocked: set[str],
    R0: float,
    head_drop_scale: float,
) -> Dict[str, float]:
    """
    Propaga una sola fuente por toda la red.
    Sirve para saber qué fuentes también llegan a cada nodo,
    aunque no sean la fuente dominante.
    """
    heads: Dict[str, float] = {}

    if start_node in blocked:
        return heads

    heads[start_node] = start_head
    pq: List[Tuple[float, str]] = [(-start_head, start_node)]

    while pq:
        neg_h, u = heapq.heappop(pq)
        hu = -neg_h

        if heads.get(u, float("-inf")) > hu + 1e-9:
            continue

        for v, _pid, R, _Lm, _Dmm in adj.get(u, []):
            if v in blocked:
                continue

            abs_q = 1.0 / (1.0 + (R / R0))
            drop = abs_q * R * head_drop_scale
            hv = hu - drop

            if hv > heads.get(v, float("-inf")):
                heads[v] = hv
                heapq.heappush(pq, (-hv, v))

    return heads
