# app/services/sim_solver.py
from __future__ import annotations
from typing import Dict, Any, List, Tuple
import math


def _solve_linear_system(A: List[List[float]], b: List[float]) -> List[float]:
    """
    Gaussian elimination with partial pivoting.
    A: NxN, b: N
    returns x
    """
    n = len(A)
    # Augment matrix
    M = [row[:] + [b[i]] for i, row in enumerate(A)]

    for col in range(n):
        # pivot
        pivot = col
        max_abs = abs(M[col][col])
        for r in range(col + 1, n):
            v = abs(M[r][col])
            if v > max_abs:
                max_abs = v
                pivot = r
        if max_abs < 1e-12:
            raise ValueError("Matriz singular (red desconectada o sin anclaje de fuentes).")

        if pivot != col:
            M[col], M[pivot] = M[pivot], M[col]

        # normalize pivot row
        piv = M[col][col]
        inv = 1.0 / piv
        for c in range(col, n + 1):
            M[col][c] *= inv

        # eliminate below
        for r in range(col + 1, n):
            factor = M[r][col]
            if abs(factor) < 1e-18:
                continue
            for c in range(col, n + 1):
                M[r][c] -= factor * M[col][c]

    # back substitution
    x = [0.0] * n
    for r in range(n - 1, -1, -1):
        s = M[r][n]
        for c in range(r + 1, n):
            s -= M[r][c] * x[c]
        x[r] = s
    return x


def _pipe_resistance(length_m: float, diam_mm: float, r_scale: float) -> float:
    # R ~ L / D^4 , D en metros
    L = max(0.1, float(length_m))
    D = max(0.001, float(diam_mm) / 1000.0)
    return (L / (D ** 4)) * float(r_scale)


def run_linear_simulation(
    nodes_rows: List[Dict[str, Any]],
    pipes_rows: List[Dict[str, Any]],
    valves_rows: List[Dict[str, Any]],
    sources_rows: List[Dict[str, Any]],
    demands_rows: List[Dict[str, Any]],
    options: Dict[str, Any],
) -> Dict[str, Any]:
    default_diam_mm = float(options.get("default_diam_mm", 75.0))
    ignore_unconnected = bool(options.get("ignore_unconnected", True))
    closed_valve_blocks_node = bool(options.get("closed_valve_blocks_node", True))
    min_pressure_m = float(options.get("min_pressure_m", 0.0))
    r_scale = float(options.get("r_scale", 1.0))

    # Build node index
    node_ids = [str(r["id"]) for r in nodes_rows]
    idx = {nid: i for i, nid in enumerate(node_ids)}
    kind = {str(r["id"]): (r.get("kind") or "JUNCTION") for r in nodes_rows}
    n = len(node_ids)

    # Valve openness map
    valve_open = {}
    for r in valves_rows:
        valve_open[str(r["node_id"])] = bool(r["is_open"])

    blocked_nodes = set()
    if closed_valve_blocks_node:
        for nid, is_open in valve_open.items():
            if is_open is False:
                blocked_nodes.add(nid)

    # Sources (fixed heads)
    source_head = {}
    for r in sources_rows:
        nid = str(r["node_id"])
        head = float(r["head_m"])
        source_head[nid] = max(source_head.get(nid, float("-inf")), head)

    if not source_head:
        raise ValueError("No hay sources. Creá al menos una fuente (node_id + head_m).")

    # Demands (outflow) in L/s
    demand_lps = {}
    for r in demands_rows:
        nid = str(r["node_id"])
        demand_lps[nid] = demand_lps.get(nid, 0.0) + float(r["demand_lps"])

    # Initialize G matrix and b vector
    G = [[0.0 for _ in range(n)] for __ in range(n)]
    b = [0.0 for _ in range(n)]

    # Demands subtract injection
    for nid, q in demand_lps.items():
        if nid in idx:
            b[idx[nid]] -= q

    used_pipes = []

    for p in pipes_rows:
        pid = str(p["id"])
        u = p.get("from_node")
        v = p.get("to_node")
        u = str(u) if u is not None else None
        v = str(v) if v is not None else None

        if ignore_unconnected and (u is None or v is None):
            continue
        if u not in idx or v not in idx:
            continue

        if not bool(p.get("active", True)):
            continue
        if not bool(p.get("is_open", True)):
            continue
        if u in blocked_nodes or v in blocked_nodes:
            continue

        L = float(p.get("length_m") or 0.0)
        Dmm = float(p.get("diametro_mm") or default_diam_mm)
        R = _pipe_resistance(L, Dmm, r_scale=r_scale)
        g = 1.0 / max(R, 1e-12)

        iu = idx[u]
        iv = idx[v]

        G[iu][iu] += g
        G[iv][iv] += g
        G[iu][iv] -= g
        G[iv][iu] -= g

        used_pipes.append((pid, u, v, g, R, L, Dmm))

    # Apply fixed head constraints for sources
    fixed_indices = {}
    for nid, head in source_head.items():
        if nid in idx and nid not in blocked_nodes:
            fixed_indices[idx[nid]] = float(head)

    if not fixed_indices:
        raise ValueError("No hay sources válidas (todas bloqueadas o inexistentes).")

    # Impose constraints
    for k, head in fixed_indices.items():
        for c in range(n):
            G[k][c] = 0.0
            G[c][k] = 0.0
        G[k][k] = 1.0
        b[k] = head

    # Solve
    H = _solve_linear_system(G, b)

    # Output nodes
    nodes_out = {}
    for nid in node_ids:
        i = idx[nid]
        head_m = float(H[i])
        pressure_bar = head_m / 10.197162129779  # 1 bar ~ 10.197 mH2O
        nodes_out[nid] = {
            "head_m": head_m,
            "pressure_bar": pressure_bar,
            "blocked": (nid in blocked_nodes),
            "kind": kind.get(nid, "JUNCTION"),
        }

    # Output pipes
    pipes_out = {}
    for (pid, u, v, g, R, L, Dmm) in used_pipes:
        du = idx[u]
        dv = idx[v]
        dH = float(H[du] - H[dv])
        Q = g * dH  # “L/s” en escala del modelo lineal

        blocked = False
        if min_pressure_m > 0:
            if nodes_out[u]["head_m"] < min_pressure_m and nodes_out[v]["head_m"] < min_pressure_m:
                blocked = True
                Q = 0.0

        pipes_out[pid] = {
            "q_lps": float(Q),
            "abs_q_lps": float(abs(Q)),
            "dir": 1 if Q >= 0 else -1,  # 1: from->to, -1: to->from
            "dH_m": float(dH),
            "R": float(R),
            "length_m": float(L),
            "diam_mm": float(Dmm),
            "blocked": blocked,
            "u": u,
            "v": v,
        }

    return {
        "model": "LINEAR",
        "nodes": nodes_out,
        "pipes": pipes_out,
        "meta": {
            "n_nodes": n,
            "n_pipes_used": len(used_pipes),
            "n_sources": len(fixed_indices),
        },
    }
