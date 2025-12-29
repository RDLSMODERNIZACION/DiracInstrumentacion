# app/routes/mapa/simulacion.py
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Dict, Any, Optional, List, Tuple
import math

from app.db import get_conn

router = APIRouter()

# ----------------------------
# Models
# ----------------------------

class SimOptions(BaseModel):
    default_diam_mm: float = 75.0
    r_scale: float = 1.0
    closed_valve_blocks_node: bool = True
    # caída de head por "resistencia" (para que no explote)
    # head_drop = absQ * R * head_drop_scale
    head_drop_scale: float = 0.00001

class SimRunRequest(BaseModel):
    options: SimOptions = Field(default_factory=SimOptions)

class ConnectPipeBody(BaseModel):
    from_node: str
    to_node: str

# ----------------------------
# Helpers
# ----------------------------

def _fetchall_dict(cur):
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]

def _pipe_R(length_m: float, diam_mm: float, r_scale: float) -> float:
    # resistencia simple y estable: R ~ L / D^4 (D en m)
    L = max(0.1, float(length_m))
    D = max(0.001, float(diam_mm) / 1000.0)
    return (L / (D ** 4)) * float(r_scale)

# ----------------------------
# Debug
# ----------------------------

@router.get("/sim/debug_sources")
def debug_sources():
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("""SELECT node_id::text as node_id, head_m FROM "MapasAgua".sources""")
        items = _fetchall_dict(cur)
    return {"count": len(items), "items": items}

# ----------------------------
# Endpoints
# ----------------------------

@router.post("/sim/run")
def sim_run(body: SimRunRequest):
    """
    SIM SIMPLE (sin demands):
    - Parte de sources (head fijo)
    - Propaga por pipes abiertos (y nodos no bloqueados)
    - Asigna head estimado por pérdida acumulada
    - Calcula flujo simple inverso a resistencia (no físico exacto, pero estable)
    """
    with get_conn() as conn, conn.cursor() as cur:
        # Pipes
        cur.execute("""
            SELECT
              id::text as id,
              from_node::text as from_node,
              to_node::text as to_node,
              COALESCE(length_m, ST_Length(geom::geography)) AS length_m,
              COALESCE(diametro_mm, %s::int) AS diametro_mm,
              COALESCE(is_open, true) AS is_open,
              COALESCE(active, true) AS active
            FROM "MapasAgua".pipes
            WHERE COALESCE(active, true) = true
              AND COALESCE(type, 'WATER') = 'WATER'
        """, (int(body.options.default_diam_mm),))
        pipes = _fetchall_dict(cur)

        # Nodes
        cur.execute("""SELECT id::text as id, COALESCE(kind,'JUNCTION') as kind FROM "MapasAgua".nodes""")
        nodes = _fetchall_dict(cur)

        # Valves (opcional)
        valve_open: Dict[str, bool] = {}
        try:
            cur.execute("""SELECT node_id::text as node_id, is_open FROM "MapasAgua".valves""")
            for r in _fetchall_dict(cur):
                valve_open[r["node_id"]] = bool(r["is_open"])
        except Exception:
            valve_open = {}

        # Sources (obligatorio)
        cur.execute("""SELECT node_id::text as node_id, head_m FROM "MapasAgua".sources""")
        sources = _fetchall_dict(cur)

    if not sources:
        raise HTTPException(400, 'No hay sources en "MapasAgua".sources (node_id + head_m).')

    # node index
    node_kind = {n["id"]: (n.get("kind") or "JUNCTION") for n in nodes}

    # blocked nodes by closed valves
    blocked = set()
    if body.options.closed_valve_blocks_node:
        for nid, is_open in valve_open.items():
            if is_open is False:
                blocked.add(nid)

    # Build adjacency: node -> list of (nbr, pipe_id, R, length, diam)
    adj: Dict[str, List[Tuple[str, str, float, float, float]]] = {}
    for p in pipes:
        if not p.get("active", True):
            continue
        if not p.get("is_open", True):
            continue
        u = p.get("from_node")
        v = p.get("to_node")
        if not u or not v:
            continue
        if u in blocked or v in blocked:
            continue

        L = float(p.get("length_m") or 0.0)
        Dmm = float(p.get("diametro_mm") or body.options.default_diam_mm)
        R = _pipe_R(L, Dmm, body.options.r_scale)

        adj.setdefault(u, []).append((v, p["id"], R, L, Dmm))
        adj.setdefault(v, []).append((u, p["id"], R, L, Dmm))

    # Multi-source: start heads at fixed values; propagate best (max head)
    head: Dict[str, float] = {}
    fixed_sources = {}
    for s in sources:
        nid = s["node_id"]
        if nid in blocked:
            continue
        h = float(s["head_m"])
        fixed_sources[nid] = max(fixed_sources.get(nid, float("-inf")), h)

    if not fixed_sources:
        raise HTTPException(400, "Todas las sources están bloqueadas por válvula o inválidas.")

    # initialize queue with sources
    # We'll do a variant of "best-first" (max head first)
    import heapq
    pq = []
    for nid, h in fixed_sources.items():
        head[nid] = h
        heapq.heappush(pq, (-h, nid))

    # To compute flows: we'll pick a simple flow for each edge from higher-head to lower-head:
    # absQ = 1 / (1 + R/R0) scaled (stable)
    R0 = 500000.0  # escala para que no quede todo ~0
    pipe_out: Dict[str, Dict[str, Any]] = {}

    while pq:
        neg_h, u = heapq.heappop(pq)
        hu = -neg_h
        # skip outdated
        if head.get(u, float("-inf")) > hu + 1e-9:
            continue

        for (v, pid, R, L, Dmm) in adj.get(u, []):
            if v in blocked:
                continue

            # flujo simple (estable)
            absQ = 1.0 / (1.0 + (R / R0))

            # pérdida simple
            drop = absQ * R * float(body.options.head_drop_scale)
            hv = hu - drop

            # relax: quedarse con el head mayor (mejor alimentación)
            if hv > head.get(v, float("-inf")):
                head[v] = hv
                heapq.heappush(pq, (-hv, v))

            # guardamos pipe result (dirección por head)
            # OJO: como adj es bidireccional, nos quedamos con el mejor cálculo
            prev = pipe_out.get(pid)
            if prev is None or absQ > prev.get("abs_q_lps", -1):
                # definimos u->v como dirección "desde este relax"
                pipe_out[pid] = {
                    "q_lps": absQ,
                    "abs_q_lps": absQ,
                    "dir": 1,   # placeholder, lo corregimos abajo con heads finales
                    "dH_m": 0.0,
                    "R": R,
                    "length_m": L,
                    "diam_mm": Dmm,
                    "blocked": False,
                    "u": u,
                    "v": v,
                }

    # finalize pipes: set dir and dH based on final heads
    for pid, po in pipe_out.items():
        u = po["u"]
        v = po["v"]
        hu = head.get(u, 0.0)
        hv = head.get(v, 0.0)
        dH = hu - hv
        if dH >= 0:
            po["dir"] = 1
            po["dH_m"] = dH
            po["q_lps"] = po["abs_q_lps"]
        else:
            po["dir"] = -1
            po["dH_m"] = -dH
            po["q_lps"] = -po["abs_q_lps"]  # signo para indicar sentido
            # swap u/v for clarity? mantenemos u/v original, dir indica el sentido

    # output nodes: head only for reached nodes; unreached -> NaN
    nodes_out: Dict[str, Any] = {}
    for n in nodes:
        nid = n["id"]
        h = head.get(nid, float("nan"))
        nodes_out[nid] = {
            "head_m": h,
            "pressure_bar": (h / 10.197162129779) if math.isfinite(h) else float("nan"),
            "blocked": (nid in blocked),
            "kind": node_kind.get(nid, "JUNCTION"),
            "reached": bool(math.isfinite(h)),
        }

    return {
        "model": "SIMPLE",
        "nodes": nodes_out,
        "pipes": pipe_out,
        "meta": {
            "n_nodes": len(nodes),
            "n_pipes_used": len(pipe_out),
            "n_sources": len(fixed_sources),
            "pipes_count": len(pipes),
            "nodes_count": len(nodes),
            "sources_count": len(sources),
        }
    }

@router.patch("/pipes/{pipe_id}/connect")
def connect_pipe(pipe_id: str, body: ConnectPipeBody):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("""
            UPDATE "MapasAgua".pipes
            SET
              from_node = %s::uuid,
              to_node   = %s::uuid,
              updated_at = now()
            WHERE id = %s::uuid
        """, (body.from_node, body.to_node, pipe_id))
        if cur.rowcount == 0:
            raise HTTPException(404, "Pipe no encontrado")
        conn.commit()

    return {"ok": True, "pipe_id": pipe_id, "from_node": body.from_node, "to_node": body.to_node}
