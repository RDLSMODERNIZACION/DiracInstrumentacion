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
    Presión cuando tenemos cota:

      pressure_mca = head_m - elev_m
      pressure_bar = pressure_mca / 10.197162129779

    Si elev_m todavía no está cargada, mantenemos compatibilidad:
      pressure_mca = head_m
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


def _source_label(s: dict[str, Any]) -> str:
    return (
        s.get("label")
        or s.get("source_name")
        or s.get("asset_name")
        or s.get("source_type")
        or "Fuente"
    )


def _pressure_kind_from_source_type(source_type: str | None) -> str:
    """
    Clasificación visual para el front:
      REAL   = presión medida por manómetro/manifold
      TANK   = carga por tanque/nivel/cota
      MANUAL = source manual antigua
      CALC   = nodo calculado, sin fuente propia
    """
    if source_type == "PRESSURE_MEASURE":
        return "REAL"

    if source_type == "TANK_HEAD":
        return "TANK"

    if source_type == "MANUAL_SOURCE":
        return "MANUAL"

    return "CALC"


def _pipe_pressure_kind(kind_u: str | None, kind_v: str | None) -> str:
    ku = kind_u or "CALC"
    kv = kind_v or "CALC"

    if ku == kv:
        return ku

    # Si un extremo es real/tanque/manual y el otro calculado, el tramo es mixto.
    return "MIXED"


def _safe_float(v: Any) -> float | None:
    if v is None:
        return None

    try:
        n = float(v)
    except Exception:
        return None

    if not math.isfinite(n):
        return None

    return n


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

    Esa vista combina:
      - MapasAgua.sources
      - Tanques reales como SOURCE_HEAD
      - Manómetros / manifolds como PRESSURE_MEASURE
    """
    with get_conn() as conn, conn.cursor() as cur:
        try:
            cur.execute(
                """
                SELECT
                    source_id::text AS id,
                    source_type,
                    asset_link_id::text AS asset_link_id,
                    asset_type,
                    asset_id,
                    source_name AS label,
                    node_id::text AS node_id,
                    head_m::double precision AS head_m,
                    node_elev_m::double precision AS elev_m,
                    pressure_bar_real::double precision AS pressure_bar_real,
                    level_pct::double precision AS level_pct,
                    tank_height_m::double precision AS tank_height_m,
                    water_height_m::double precision AS water_height_m,
                    online,
                    age_sec::double precision AS age_sec,
                    live_status,
                    props
                FROM "MapasAgua"."v_sim_sources_live"
                WHERE enabled = true
                  AND head_m IS NOT NULL
                  AND node_id IS NOT NULL
                ORDER BY source_type, source_name, source_id
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
    - fuentes hidráulicas vivas
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
                    count(*) FILTER (WHERE elev_m IS NOT NULL)::int AS nodes_with_elev,
                    count(*) FILTER (WHERE elev_m IS NULL)::int AS nodes_without_elev
                FROM "MapasAgua".nodes
                """
            )
            nodes = _fetchall_dict(cur)[0]

            cur.execute(
                """
                SELECT
                    count(*)::int AS sources_total,
                    count(*) FILTER (WHERE source_type = 'MANUAL_SOURCE')::int AS manual_sources,
                    count(*) FILTER (WHERE source_type = 'TANK_HEAD')::int AS tank_sources,
                    count(*) FILTER (WHERE source_type = 'PRESSURE_MEASURE')::int AS pressure_sources,
                    count(*) FILTER (WHERE live_status = 'ONLINE')::int AS online_sources,
                    count(*) FILTER (WHERE live_status = 'STALE')::int AS stale_sources,
                    count(*) FILTER (WHERE live_status = 'NO_DATA')::int AS no_data_sources
                FROM "MapasAgua"."v_sim_sources_live"
                WHERE enabled = true
                  AND head_m IS NOT NULL
                  AND node_id IS NOT NULL
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
    - Parte de fuentes con head fijo.
    - Las fuentes salen de "MapasAgua"."v_sim_sources_live":
        * MANUAL_SOURCE
        * TANK_HEAD
        * PRESSURE_MEASURE
    - Propaga por cañerías activas, abiertas y conectadas.
    - Usa elev_m para calcular presión estimada:
        pressure_mca = head_m - elev_m
    - Devuelve:
        * nodos con pressure_kind: REAL / TANK / MANUAL / CALC
        * pipes con pressure_bar_min/max/avg
        * pipes con pressure_kind: REAL / TANK / MANUAL / CALC / MIXED
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
        # Sources hidráulicas vivas
        # ----------------------------------------------------
        try:
            cur.execute(
                """
                SELECT
                    source_id::text AS id,
                    node_id::text AS node_id,
                    head_m::double precision AS head_m,
                    source_name AS label,
                    source_type,
                    asset_link_id::text AS asset_link_id,
                    asset_type,
                    asset_id,
                    pressure_bar_real::double precision AS pressure_bar_real,
                    level_pct::double precision AS level_pct,
                    tank_height_m::double precision AS tank_height_m,
                    water_height_m::double precision AS water_height_m,
                    online,
                    age_sec::double precision AS age_sec,
                    live_status,
                    props
                FROM "MapasAgua"."v_sim_sources_live"
                WHERE enabled = true
                  AND head_m IS NOT NULL
                  AND node_id IS NOT NULL
                """
            )
            sources = _fetchall_dict(cur)
        except Exception as e:
            _safe_rollback(conn)
            raise HTTPException(500, f"Error leyendo sources desde v_sim_sources_live: {e}")

    if not sources:
        raise HTTPException(
            400,
            'No hay fuentes hidráulicas en "MapasAgua"."v_sim_sources_live". '
            "Se necesita al menos una fuente manual, tanque o manómetro con nodo y cota.",
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
    # Guardamos la metadata de la fuente ganadora.
    # --------------------------------------------------------
    head: Dict[str, float] = {}
    fixed_sources: Dict[str, float] = {}
    fixed_source_meta: Dict[str, dict[str, Any]] = {}

    sources_valid: List[dict[str, Any]] = []
    sources_blocked = 0
    sources_invalid = 0

    for s in sources:
        nid = s.get("node_id")

        if not nid:
            sources_invalid += 1
            continue

        if nid in blocked:
            sources_blocked += 1
            continue

        h = _safe_float(s.get("head_m"))

        if h is None:
            sources_invalid += 1
            continue

        sources_valid.append(s)

        previous_h = fixed_sources.get(nid, float("-inf"))

        if h >= previous_h:
            source_type = s.get("source_type")
            pressure_kind = _pressure_kind_from_source_type(source_type)

            fixed_sources[nid] = h
            fixed_source_meta[nid] = {
                "source_id": s.get("id"),
                "source_type": source_type,
                "pressure_kind": pressure_kind,
                "asset_link_id": s.get("asset_link_id"),
                "asset_type": s.get("asset_type"),
                "asset_id": s.get("asset_id"),
                "label": _source_label(s),
                "head_m": h,
                "pressure_bar_real": s.get("pressure_bar_real"),
                "level_pct": s.get("level_pct"),
                "tank_height_m": s.get("tank_height_m"),
                "water_height_m": s.get("water_height_m"),
                "online": s.get("online"),
                "age_sec": s.get("age_sec"),
                "live_status": s.get("live_status"),
                "props": s.get("props"),
            }

    if not fixed_sources:
        raise HTTPException(
            400,
            "Todas las fuentes están bloqueadas, no tienen head_m válido o no existen.",
        )

    # --------------------------------------------------------
    # Propagación best-first desde head mayor
    # origin_source guarda de dónde salió la presión calculada
    # --------------------------------------------------------
    pq: List[Tuple[float, str]] = []
    origin_source: Dict[str, dict[str, Any]] = {}

    for nid, h in fixed_sources.items():
        head[nid] = h
        origin_source[nid] = fixed_source_meta[nid]
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
                origin_source[v] = origin_source.get(u, fixed_source_meta.get(u))
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
    # Finalizar pipes: sentido real y presión por tramo
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

            po["pressure_mca_u"] = None
            po["pressure_mca_v"] = None
            po["pressure_mca_avg"] = None
            po["pressure_mca_min"] = None
            po["pressure_mca_max"] = None

            po["pressure_bar_u"] = None
            po["pressure_bar_v"] = None
            po["pressure_bar_avg"] = None
            po["pressure_bar_min"] = None
            po["pressure_bar_max"] = None

            po["pressure_kind_u"] = None
            po["pressure_kind_v"] = None
            po["pressure_kind"] = None
            po["origin_source_u"] = origin_source.get(u)
            po["origin_source_v"] = origin_source.get(v)
            continue

        hu = float(hu)
        hv = float(hv)

        elev_u = node_elev.get(u)
        elev_v = node_elev.get(v)

        pressure_mca_u, pressure_bar_u = _pressure_from_head(hu, elev_u)
        pressure_mca_v, pressure_bar_v = _pressure_from_head(hv, elev_v)

        pressure_mcas = [
            x for x in [pressure_mca_u, pressure_mca_v]
            if x is not None and math.isfinite(float(x))
        ]

        pressure_bars = [
            x for x in [pressure_bar_u, pressure_bar_v]
            if x is not None and math.isfinite(float(x))
        ]

        if pressure_mcas:
            po["pressure_mca_u"] = float(pressure_mca_u) if pressure_mca_u is not None else None
            po["pressure_mca_v"] = float(pressure_mca_v) if pressure_mca_v is not None else None
            po["pressure_mca_avg"] = float(sum(pressure_mcas) / len(pressure_mcas))
            po["pressure_mca_min"] = float(min(pressure_mcas))
            po["pressure_mca_max"] = float(max(pressure_mcas))
        else:
            po["pressure_mca_u"] = None
            po["pressure_mca_v"] = None
            po["pressure_mca_avg"] = None
            po["pressure_mca_min"] = None
            po["pressure_mca_max"] = None

        if pressure_bars:
            po["pressure_bar_u"] = float(pressure_bar_u) if pressure_bar_u is not None else None
            po["pressure_bar_v"] = float(pressure_bar_v) if pressure_bar_v is not None else None
            po["pressure_bar_avg"] = float(sum(pressure_bars) / len(pressure_bars))
            po["pressure_bar_min"] = float(min(pressure_bars))
            po["pressure_bar_max"] = float(max(pressure_bars))
        else:
            po["pressure_bar_u"] = None
            po["pressure_bar_v"] = None
            po["pressure_bar_avg"] = None
            po["pressure_bar_min"] = None
            po["pressure_bar_max"] = None

        source_u = fixed_source_meta.get(u)
        source_v = fixed_source_meta.get(v)

        # Si el nodo no es fuente directa, su presión es calculada.
        pressure_kind_u = source_u.get("pressure_kind") if source_u else "CALC"
        pressure_kind_v = source_v.get("pressure_kind") if source_v else "CALC"

        po["pressure_kind_u"] = pressure_kind_u
        po["pressure_kind_v"] = pressure_kind_v
        po["pressure_kind"] = _pipe_pressure_kind(pressure_kind_u, pressure_kind_v)

        po["origin_source_u"] = origin_source.get(u)
        po["origin_source_v"] = origin_source.get(v)

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
        source = fixed_source_meta.get(nid)
        origin = origin_source.get(nid)

        if source:
            pressure_kind = source.get("pressure_kind") or "CALC"
        elif reached:
            pressure_kind = "CALC"
        else:
            pressure_kind = None

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

                "is_source": nid in fixed_sources,
                "pressure_kind": pressure_kind,
                "source": source,
                "origin_source": origin,
                "is_pressure_real": False,
                "is_pressure_theoretical": False,
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

            # Clasificación visual
            "is_source": nid in fixed_sources,
            "pressure_kind": pressure_kind,
            "source": source,
            "origin_source": origin,

            # Si es PRESSURE_MEASURE, el valor proviene de medición real.
            "is_pressure_real": pressure_kind == "REAL",
            # Si es nodo alcanzado pero no fuente directa, es calculado.
            "is_pressure_theoretical": pressure_kind == "CALC",
        }

    return {
        "model": "SIMPLE",
        "nodes": nodes_out,
        "pipes": pipe_out,
        "sources": list(fixed_source_meta.values()),
        "meta": {
            "n_nodes": len(nodes),
            "n_pipes_used": len(pipe_out),
            "n_sources": len(fixed_sources),

            "pipes_count": len(pipes),
            "nodes_count": len(nodes),
            "sources_count": len(sources),
            "sources_valid": len(sources_valid),
            "sources_invalid": sources_invalid,
            "sources_blocked": sources_blocked,

            "pipes_unconnected": unconnected_count,
            "pipes_closed": closed_count,
            "pipes_blocked_by_valve": blocked_count,

            "demands_ignored": True,
            "pressure_formula": "pressure_mca = head_m - elev_m",
            "sources_origin": '"MapasAgua"."v_sim_sources_live"',
            "pressure_kinds": {
                "REAL": "Punto con presión real medida por manómetro/manifold",
                "TANK": "Punto con carga por tanque, nivel y cota",
                "MANUAL": "Fuente manual",
                "CALC": "Presión teórica calculada por propagación",
                "MIXED": "Cañería entre fuentes/orígenes distintos",
            },
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