# app/routes/mapa/simulacion.py
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Tuple
import math
import heapq

from app.db import get_conn

router = APIRouter()


# ============================================================
# Models
# ============================================================

class SimOptions(BaseModel):
    default_diam_mm: float = 75.0
    r_scale: float = 1.0
    closed_valve_blocks_node: bool = True

    # Caída de head por resistencia.
    # Esto NO es EPANET; es una simulación simple/visual para ver continuidad,
    # sentido aproximado de circulación y presión estimada.
    head_drop_scale: float = 0.00001

    # Escala para calcular absQ = 1 / (1 + R/R0)
    # Si ves caudales visuales muy bajos, se puede subir.
    R0: float = 500000.0


class SimRunRequest(BaseModel):
    options: SimOptions = Field(default_factory=SimOptions)


class ConnectPipeBody(BaseModel):
    from_node: str
    to_node: str


# ============================================================
# Helpers
# ============================================================

def _fetchall_dict(cur):
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]


def _safe_rollback(conn):
    try:
        conn.rollback()
    except Exception:
        pass


def _pipe_R(length_m: float, diam_mm: float, r_scale: float) -> float:
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


def _pressure_from_head(
    head_m: float | None,
    elev_m: float | None,
) -> tuple[float | None, float | None]:
    """
    Presión correcta cuando tenemos cota:

      pressure_mca = head_m - elev_m
      pressure_bar = pressure_mca / 10.197162129779

    Si elev_m todavía no está cargada, mantenemos compatibilidad:
      pressure_mca = head_m

    Esto evita romper la simulación mientras todavía no tenemos curvas de nivel.
    """
    if head_m is None:
        return None, None

    h = float(head_m)

    if not math.isfinite(h):
        return None, None

    if elev_m is None:
        pressure_mca = h
    else:
        pressure_mca = h - float(elev_m)

    return pressure_mca, pressure_mca / 10.197162129779


# ============================================================
# Debug sources
# GET /mapa/sim/debug_sources
# ============================================================

@router.get("/sim/debug_sources")
def debug_sources():
    with get_conn() as conn, conn.cursor() as cur:
        try:
            cur.execute(
                """
                SELECT
                    s.id::text AS id,
                    s.node_id::text AS node_id,
                    s.head_m::double precision AS head_m,
                    s.props,
                    n.kind,
                    n.elev_m::double precision AS elev_m,
                    COALESCE(n.props->>'label', s.props->>'label', '') AS label,
                    ST_X(n.geom)::double precision AS lng,
                    ST_Y(n.geom)::double precision AS lat
                FROM "MapasAgua".sources s
                JOIN "MapasAgua".nodes n
                    ON n.id = s.node_id
                ORDER BY label, s.id
                """
            )
            items = _fetchall_dict(cur)
        except Exception as e:
            _safe_rollback(conn)
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
    Diagnóstico rápido para saber por qué no simula:
    - cañerías totales
    - cañerías conectadas
    - cañerías sin conectar
    - nodos
    - fuentes
    """
    with get_conn() as conn, conn.cursor() as cur:
        try:
            cur.execute(
                """
                SELECT
                    count(*)::int AS pipes_total,
                    count(*) FILTER (
                        WHERE from_node IS NOT NULL
                          AND to_node IS NOT NULL
                          AND from_node <> to_node
                    )::int AS pipes_connected,
                    count(*) FILTER (
                        WHERE from_node IS NULL
                           OR to_node IS NULL
                           OR from_node = to_node
                    )::int AS pipes_unconnected,
                    count(*) FILTER (
                        WHERE COALESCE(active, true) = true
                          AND COALESCE(is_open, true) = true
                    )::int AS pipes_open_active
                FROM "MapasAgua".pipes
                """
            )
            pipes = _fetchall_dict(cur)[0]

            cur.execute(
                """
                SELECT
                    count(*)::int AS nodes_total,
                    count(*) FILTER (WHERE elev_m IS NOT NULL)::int AS nodes_with_elev
                FROM "MapasAgua".nodes
                """
            )
            nodes = _fetchall_dict(cur)[0]

            cur.execute(
                """
                SELECT
                    count(*)::int AS sources_total
                FROM "MapasAgua".sources
                """
            )
            sources = _fetchall_dict(cur)[0]

        except Exception as e:
            _safe_rollback(conn)
            raise HTTPException(500, f"debug_network falló: {e}")

    return {
        "pipes": pipes,
        "nodes": nodes,
        "sources": sources,
    }


# ============================================================
# Run simulation
# POST /mapa/sim/run
# ============================================================

@router.post("/sim/run")
def sim_run(body: SimRunRequest):
    """
    SIM SIMPLE:
    - Parte de sources con head fijo.
    - Propaga por cañerías activas, abiertas y conectadas.
    - Usa elev_m para calcular presión estimada:
        pressure_mca = head_m - elev_m
    - Si todavía no hay elev_m, usa head_m como presión para no romper.
    - Devuelve pipes con sentido y caudal visual aproximado.
    """
    with get_conn() as conn, conn.cursor() as cur:
        # ----------------------------------------------------
        # Pipes
        # ----------------------------------------------------
        try:
            cur.execute(
                """
                SELECT
                    id::text AS id,
                    from_node::text AS from_node,
                    to_node::text AS to_node,
                    COALESCE(length_m, ST_Length(geom::geography))::double precision AS length_m,
                    COALESCE(diametro_mm, %s::int)::double precision AS diametro_mm,
                    COALESCE(is_open, true) AS is_open,
                    COALESCE(active, true) AS active,
                    COALESCE(type, 'WATER') AS type
                FROM "MapasAgua".pipes
                WHERE COALESCE(active, true) = true
                  AND COALESCE(type, 'WATER') = 'WATER'
                """,
                (int(body.options.default_diam_mm),),
            )
            pipes = _fetchall_dict(cur)
        except Exception as e:
            _safe_rollback(conn)
            raise HTTPException(500, f"Error leyendo pipes: {e}")

        # ----------------------------------------------------
        # Nodes
        # ----------------------------------------------------
        try:
            cur.execute(
                """
                SELECT
                    id::text AS id,
                    COALESCE(kind, 'JUNCTION') AS kind,
                    elev_m::double precision AS elev_m,
                    COALESCE(props->>'label', '') AS label
                FROM "MapasAgua".nodes
                """
            )
            nodes = _fetchall_dict(cur)
        except Exception as e:
            _safe_rollback(conn)
            raise HTTPException(500, f"Error leyendo nodes: {e}")

        # ----------------------------------------------------
        # Valves opcional
        # Si la tabla no existe, no frenamos la simulación.
        # ----------------------------------------------------
        valve_open: Dict[str, bool] = {}

        try:
            cur.execute(
                """
                SELECT
                    node_id::text AS node_id,
                    is_open
                FROM "MapasAgua".valves
                """
            )

            for r in _fetchall_dict(cur):
                valve_open[r["node_id"]] = bool(r["is_open"])

        except Exception:
            _safe_rollback(conn)
            valve_open = {}

        # ----------------------------------------------------
        # Sources
        # ----------------------------------------------------
        try:
            cur.execute(
                """
                SELECT
                    s.node_id::text AS node_id,
                    s.head_m::double precision AS head_m,
                    COALESCE(n.props->>'label', s.props->>'label', '') AS label
                FROM "MapasAgua".sources s
                JOIN "MapasAgua".nodes n
                    ON n.id = s.node_id
                """
            )
            sources = _fetchall_dict(cur)
        except Exception as e:
            _safe_rollback(conn)
            raise HTTPException(500, f"Error leyendo sources: {e}")

    if not sources:
        raise HTTPException(
            400,
            'No hay sources en "MapasAgua".sources. Se necesita al menos un node_id + head_m.',
        )

    node_kind = {
        n["id"]: (n.get("kind") or "JUNCTION")
        for n in nodes
    }

    node_elev = {
        n["id"]: n.get("elev_m")
        for n in nodes
    }

    node_label = {
        n["id"]: n.get("label")
        for n in nodes
    }

    # --------------------------------------------------------
    # Nodos bloqueados por válvula cerrada
    # --------------------------------------------------------
    blocked = set()

    if body.options.closed_valve_blocks_node:
        for nid, is_open in valve_open.items():
            if is_open is False:
                blocked.add(nid)

    # --------------------------------------------------------
    # Armar grafo de cañerías
    # node -> [(neighbor, pipe_id, R, length_m, diam_mm)]
    # --------------------------------------------------------
    adj: Dict[str, List[Tuple[str, str, float, float, float]]] = {}

    unconnected_count = 0
    closed_count = 0
    blocked_count = 0

    for p in pipes:
        if not p.get("active", True):
            continue

        if not p.get("is_open", True):
            closed_count += 1
            continue

        u = p.get("from_node")
        v = p.get("to_node")

        if not u or not v or u == v:
            unconnected_count += 1
            continue

        if u in blocked or v in blocked:
            blocked_count += 1
            continue

        Lm = float(p.get("length_m") or 0.0)
        Dmm = float(p.get("diametro_mm") or body.options.default_diam_mm)

        R = _pipe_R(
            length_m=Lm,
            diam_mm=Dmm,
            r_scale=body.options.r_scale,
        )

        adj.setdefault(u, []).append((v, p["id"], R, Lm, Dmm))
        adj.setdefault(v, []).append((u, p["id"], R, Lm, Dmm))

    # --------------------------------------------------------
    # Sources con head fijo
    # Si hay más de una fuente en un nodo, usamos la mayor.
    # --------------------------------------------------------
    head: Dict[str, float] = {}
    fixed_sources: Dict[str, float] = {}

    for s in sources:
        nid = s["node_id"]

        if nid in blocked:
            continue

        try:
            h = float(s["head_m"])
        except Exception:
            continue

        if not math.isfinite(h):
            continue

        fixed_sources[nid] = max(
            fixed_sources.get(nid, float("-inf")),
            h,
        )

    if not fixed_sources:
        raise HTTPException(
            400,
            "Todas las sources están bloqueadas, no tienen head_m válido o no existen.",
        )

    # --------------------------------------------------------
    # Propagación best-first desde head mayor
    # --------------------------------------------------------
    pq: List[Tuple[float, str]] = []

    for nid, h in fixed_sources.items():
        head[nid] = h
        heapq.heappush(pq, (-h, nid))

    R0 = float(body.options.R0) if body.options.R0 else 500000.0
    head_drop_scale = float(body.options.head_drop_scale)

    pipe_out: Dict[str, Dict[str, Any]] = {}

    while pq:
        neg_h, u = heapq.heappop(pq)
        hu = -neg_h

        # Saltar entradas viejas
        if head.get(u, float("-inf")) > hu + 1e-9:
            continue

        for v, pid, R, Lm, Dmm in adj.get(u, []):
            if v in blocked:
                continue

            abs_q = 1.0 / (1.0 + (R / R0))
            drop = abs_q * R * head_drop_scale
            hv = hu - drop

            if hv > head.get(v, float("-inf")):
                head[v] = hv
                heapq.heappush(pq, (-hv, v))

            prev = pipe_out.get(pid)

            if prev is None or abs_q > prev.get("abs_q_lps", -1):
                pipe_out[pid] = {
                    "q_lps": abs_q,
                    "abs_q_lps": abs_q,
                    "dir": 1,
                    "dH_m": 0.0,
                    "R": float(R),
                    "length_m": float(Lm),
                    "diam_mm": float(Dmm),
                    "blocked": False,
                    "u": u,
                    "v": v,
                }

    # --------------------------------------------------------
    # Finalizar pipes: sentido real según heads finales
    # --------------------------------------------------------
    for pid, po in pipe_out.items():
        u = po["u"]
        v = po["v"]

        hu = head.get(u)
        hv = head.get(v)

        reached_u = hu is not None and math.isfinite(float(hu))
        reached_v = hv is not None and math.isfinite(float(hv))

        if not (reached_u and reached_v):
            po["blocked"] = True
            po["q_lps"] = 0.0
            po["abs_q_lps"] = 0.0
            po["dH_m"] = None
            continue

        hu = float(hu)
        hv = float(hv)

        dH = hu - hv

        if dH >= 0:
            po["dir"] = 1
            po["dH_m"] = dH
            po["q_lps"] = po["abs_q_lps"]
        else:
            po["dir"] = -1
            po["dH_m"] = -dH
            po["q_lps"] = -po["abs_q_lps"]

    # --------------------------------------------------------
    # Salida de nodos
    # --------------------------------------------------------
    nodes_out: Dict[str, Any] = {}

    for n in nodes:
        nid = n["id"]
        h = head.get(nid)
        elev_m = node_elev.get(nid)

        reached = h is not None and math.isfinite(float(h))

        if not reached:
            nodes_out[nid] = {
                "head_m": None,
                "elev_m": elev_m,
                "pressure_mca": None,
                "pressure_bar": None,
                "blocked": nid in blocked,
                "kind": node_kind.get(nid, "JUNCTION"),
                "label": node_label.get(nid),
                "reached": False,
            }
            continue

        pressure_mca, pressure_bar = _pressure_from_head(float(h), elev_m)

        nodes_out[nid] = {
            "head_m": float(h),
            "elev_m": elev_m,
            "pressure_mca": pressure_mca,
            "pressure_bar": pressure_bar,
            "blocked": nid in blocked,
            "kind": node_kind.get(nid, "JUNCTION"),
            "label": node_label.get(nid),
            "reached": True,
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

            "pipes_unconnected": unconnected_count,
            "pipes_closed": closed_count,
            "pipes_blocked_by_valve": blocked_count,

            "demands_ignored": True,
            "pressure_formula": "pressure_mca = head_m - elev_m",
        },
    }


# ============================================================
# Connect pipe
# PATCH /mapa/pipes/{pipe_id}/connect
# ============================================================

@router.patch("/pipes/{pipe_id}/connect")
def connect_pipe(pipe_id: str, body: ConnectPipeBody):
    if not body.from_node or not body.to_node:
        raise HTTPException(400, "Falta from_node o to_node")

    if body.from_node == body.to_node:
        raise HTTPException(400, "from_node y to_node no pueden ser iguales")

    with get_conn() as conn, conn.cursor() as cur:
        try:
            # Validar nodos
            cur.execute(
                """
                SELECT count(*)::int
                FROM "MapasAgua".nodes
                WHERE id::text IN (%s, %s)
                """,
                (
                    body.from_node,
                    body.to_node,
                ),
            )

            n = cur.fetchone()[0]

            if n < 2:
                raise HTTPException(
                    400,
                    "Uno o ambos nodos no existen",
                )

            # Guardar conexión
            cur.execute(
                """
                UPDATE "MapasAgua".pipes
                SET
                    from_node = %s::uuid,
                    to_node = %s::uuid,
                    length_m = COALESCE(length_m, ST_Length(geom::geography)),
                    updated_at = now()
                WHERE id = %s::uuid
                RETURNING
                    id::text AS id,
                    from_node::text AS from_node,
                    to_node::text AS to_node,
                    length_m::double precision AS length_m
                """,
                (
                    body.from_node,
                    body.to_node,
                    pipe_id,
                ),
            )

            row = cur.fetchone()

            if not row:
                raise HTTPException(404, "Pipe no encontrado")

            conn.commit()

        except HTTPException:
            _safe_rollback(conn)
            raise
        except Exception as e:
            _safe_rollback(conn)
            raise HTTPException(500, f"connect_pipe falló: {e}")

    return {
        "ok": True,
        "pipe_id": row[0],
        "from_node": row[1],
        "to_node": row[2],
        "length_m": row[3],
    }