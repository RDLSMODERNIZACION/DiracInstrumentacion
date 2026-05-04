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

    # Si una válvula está asociada a un nodo y está cerrada,
    # bloquea todas las cañerías conectadas a ese nodo.
    closed_valve_blocks_node: bool = True

    # Si una válvula está asociada a una cañería y está cerrada,
    # esa cañería no entra al grafo hidráulico.
    closed_valve_blocks_pipe: bool = True

    # Caída de head por resistencia.
    # Esto NO es EPANET; es una simulación simple/visual para ver continuidad,
    # sentido aproximado de circulación y presión estimada.
    head_drop_scale: float = 0.00001

    # Escala para calcular absQ = 1 / (1 + R/R0)
    # Si ves caudales visuales muy bajos, se puede subir.
    R0: float = 500000.0

    # Compatibilidad con llamadas viejas del front.
    ignore_unconnected: bool = True
    min_pressure_m: float = 0.0

    # Cuántas fuentes alternativas devolver por nodo/cañería.
    max_sources_reaching_per_node: int = 6


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
    Presión hidráulica:
      pressure_mca = head_m - elev_m
      pressure_bar = pressure_mca / 10.197162129779

    Si no hay elev_m, NO calculamos presión para evitar falsos valores
    tipo 670 mca / 65 bar.
    """
    if head_m is None or elev_m is None:
        return None, None

    h = _safe_float(head_m)
    z = _safe_float(elev_m)

    if h is None or z is None:
        return None, None

    pressure_mca = h - z
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


def _source_group_from_type(source_type: str | None) -> str:
    """
    Grupo operativo para detectar mezclas:
      TANK     = tanques
      PRESSURE = presión real medida
      MANUAL   = fuente fija manual
      OTHER
    """
    if source_type == "TANK_HEAD":
        return "TANK"

    if source_type == "PRESSURE_MEASURE":
        return "PRESSURE"

    if source_type == "MANUAL_SOURCE":
        return "MANUAL"

    return "OTHER"


def _is_pressure_like_group(group: str | None) -> bool:
    return group in {"PRESSURE", "MANUAL"}


def _pipe_pressure_kind(kind_u: str | None, kind_v: str | None) -> str:
    ku = kind_u or "CALC"
    kv = kind_v or "CALC"

    if ku == kv:
        return ku

    return "MIXED"


def _normalize_text(s: Any) -> str:
    return str(s or "").upper()


def _pipe_role_from_row(p: dict[str, Any]) -> str:
    """
    Clasificación simple de cañería para warnings operativos.
    """
    flow_func = _normalize_text(p.get("flow_func"))
    props = p.get("props") or {}

    if not isinstance(props, dict):
        props = {}

    label = _normalize_text(
        props.get("Layer")
        or props.get("layer")
        or props.get("name")
        or props.get("label")
        or ""
    )

    txt = f"{flow_func} {label}"

    if "IMPULS" in txt:
        return "IMPULSION"

    if any(x in txt for x in ["RAMAL", "SECUNDARIA", "SECUNDARIO", "SERVICIO", "DOMICILIARIA"]):
        return "RAMAL"

    if any(x in txt for x in ["DISTRIB", "ACUEDUCTO", "TRONCAL", "RED", "MALLA", "SALIDA"]):
        return "DISTRIBUCION"

    return "DISTRIBUCION"


def _source_meta_from_row(s: dict[str, Any], head_m: float) -> dict[str, Any]:
    source_type = s.get("source_type")
    pressure_kind = _pressure_kind_from_source_type(source_type)
    source_group = _source_group_from_type(source_type)

    return {
        "source_id": s.get("id"),
        "source_type": source_type,
        "source_group": source_group,
        "pressure_kind": pressure_kind,
        "asset_link_id": s.get("asset_link_id"),
        "asset_type": s.get("asset_type"),
        "asset_id": s.get("asset_id"),
        "label": _source_label(s),
        "head_m": head_m,
        "pressure_bar_real": s.get("pressure_bar_real"),
        "level_pct": s.get("level_pct"),
        "tank_height_m": s.get("tank_height_m"),
        "water_height_m": s.get("water_height_m"),
        "online": s.get("online"),
        "age_sec": s.get("age_sec"),
        "live_status": s.get("live_status"),
        "props": s.get("props"),
    }


def _classify_sources_reaching(items: list[dict[str, Any]]) -> tuple[str | None, list[str]]:
    """
    Clasifica mezcla de fuentes que llegan a un nodo/cañería.

    Devuelve:
      source_mix, warnings
    """
    if not items:
        return None, []

    groups = [x.get("source_group") for x in items]
    tank_count = sum(1 for g in groups if g == "TANK")
    pressure_count = sum(1 for g in groups if _is_pressure_like_group(g))
    manual_count = sum(1 for g in groups if g == "MANUAL")
    real_pressure_count = sum(1 for g in groups if g == "PRESSURE")

    warnings: list[str] = []

    if tank_count > 0 and pressure_count > 0:
        warnings.append("TANK_AND_PRESSURE_REACH_NODE")

        if manual_count > 0 and real_pressure_count == 0:
            warnings.append("TANK_AND_MANUAL_SOURCE_REACH_NODE")

        if real_pressure_count > 0:
            warnings.append("TANK_AND_REAL_PRESSURE_REACH_NODE")

        return "MIXED_TANK_PRESSURE", warnings

    if tank_count > 1:
        warnings.append("MULTIPLE_TANKS_REACH_NODE")
        return "MULTI_TANK", warnings

    if pressure_count > 1:
        warnings.append("MULTIPLE_PRESSURE_SOURCES_REACH_NODE")

        if manual_count > 0 and real_pressure_count > 0:
            warnings.append("REAL_AND_MANUAL_PRESSURE_REACH_NODE")

        return "MULTI_PRESSURE", warnings

    if tank_count == 1:
        return "TANK_ONLY", warnings

    if real_pressure_count == 1:
        return "PRESSURE_ONLY", warnings

    if manual_count == 1:
        return "MANUAL_ONLY", warnings

    return "OTHER", warnings


def _summarize_sources_reaching(
    items: list[dict[str, Any]],
    dominant_head: float | None,
    node_elev_m: float | None,
    max_items: int = 6,
) -> tuple[list[dict[str, Any]], int, str | None, list[str]]:
    """
    Prepara sources_reaching para salida JSON.
    """
    if not items:
        return [], 0, None, []

    sorted_items = sorted(
        items,
        key=lambda x: float(x.get("head_m") or -1e18),
        reverse=True,
    )

    source_mix, warnings = _classify_sources_reaching(sorted_items)

    out: list[dict[str, Any]] = []

    for x in sorted_items[:max_items]:
        h = _safe_float(x.get("head_m"))
        pressure_mca, pressure_bar = _pressure_from_head(h, node_elev_m)

        delta = None
        if dominant_head is not None and h is not None:
            delta = float(dominant_head - h)

        out.append({
            "source_id": x.get("source_id"),
            "source_type": x.get("source_type"),
            "source_group": x.get("source_group"),
            "pressure_kind": x.get("pressure_kind"),
            "asset_link_id": x.get("asset_link_id"),
            "asset_type": x.get("asset_type"),
            "asset_id": x.get("asset_id"),
            "label": x.get("label"),
            "head_m": h,
            "pressure_mca_at_node": pressure_mca,
            "pressure_bar_at_node": pressure_bar,
            "delta_to_dominant_m": delta,
            "pressure_bar_real": x.get("pressure_bar_real"),
            "level_pct": x.get("level_pct"),
            "online": x.get("online"),
            "live_status": x.get("live_status"),
        })

    return out, len(sorted_items), source_mix, warnings


def _merge_warnings(*parts: list[str]) -> list[str]:
    out: list[str] = []
    seen = set()

    for p in parts:
        for w in p or []:
            if w not in seen:
                seen.add(w)
                out.append(w)

    return out


def _propagate_from_single_source(
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


def _read_valves(cur, conn) -> tuple[Dict[str, bool], Dict[str, bool], int]:
    """
    Lee válvulas de MapasAgua.valves.

    Soporta dos modelos:
      Nuevo:
        map_node_id
        map_pipe_id
        is_open

      Viejo:
        node_id
        is_open

    Devuelve:
      valve_node_open: node_id -> is_open
      valve_pipe_open: pipe_id -> is_open
      valves_total
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

        for r in _fetchall_dict(cur):
            valves_total += 1
            is_open = bool(r.get("is_open"))

            if r.get("node_id"):
                valve_node_open[r["node_id"]] = is_open

            if r.get("pipe_id"):
                valve_pipe_open[r["pipe_id"]] = is_open

        return valve_node_open, valve_pipe_open, valves_total

    except Exception:
        _safe_rollback(conn)

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

        for r in _fetchall_dict(cur):
            valves_total += 1
            is_open = bool(r.get("is_open"))

            if r.get("node_id"):
                valve_node_open[r["node_id"]] = is_open

        return valve_node_open, valve_pipe_open, valves_total

    except Exception:
        _safe_rollback(conn)
        return {}, {}, 0


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
    Diagnóstico rápido:
    - cañerías totales
    - cañerías conectadas
    - nodos
    - fuentes
    - válvulas
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

            valve_node_open, valve_pipe_open, valves_total = _read_valves(cur, conn)

        except Exception as e:
            _safe_rollback(conn)
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


# ============================================================
# Run simulation
# POST /mapa/sim/run
# ============================================================

@router.post("/sim/run")
def sim_run(body: SimRunRequest):
    """
    SIM SIMPLE:
    - Parte de fuentes con head fijo.
    - Fuentes desde "MapasAgua"."v_sim_sources_live":
        * MANUAL_SOURCE
        * TANK_HEAD
        * PRESSURE_MEASURE
    - Válvula en nodo cerrada:
        bloquea el nodo.
    - Válvula en cañería cerrada:
        saca esa cañería del grafo.
    - Usa elev_m para calcular presión:
        pressure_mca = head_m - elev_m
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
                    COALESCE(type, 'WATER') AS type,
                    COALESCE(flow_func, '') AS flow_func,
                    COALESCE(props, '{}'::jsonb) AS props
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
        # Valves
        # ----------------------------------------------------
        valve_node_open, valve_pipe_open, valves_total = _read_valves(cur, conn)

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
    blocked: set[str] = set()

    if body.options.closed_valve_blocks_node:
        for nid, is_open in valve_node_open.items():
            if is_open is False:
                blocked.add(nid)

    # --------------------------------------------------------
    # Armar grafo de cañerías
    # node -> [(neighbor, pipe_id, R, length_m, diam_mm)]
    # --------------------------------------------------------
    adj: Dict[str, List[Tuple[str, str, float, float, float]]] = {}
    pipe_meta: Dict[str, dict[str, Any]] = {}

    unconnected_count = 0
    closed_count = 0
    closed_by_valve_count = 0
    blocked_count = 0

    for p in pipes:
        pid = p["id"]
        pipe_role = _pipe_role_from_row(p)

        pipe_meta[pid] = {
            "flow_func": p.get("flow_func"),
            "role": pipe_role,
            "props": p.get("props"),
            "diam_mm": p.get("diametro_mm"),
            "length_m": p.get("length_m"),
        }

        if not p.get("active", True):
            continue

        if not p.get("is_open", True):
            closed_count += 1
            continue

        if body.options.closed_valve_blocks_pipe and valve_pipe_open.get(pid) is False:
            closed_count += 1
            closed_by_valve_count += 1
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

        adj.setdefault(u, []).append((v, pid, R, Lm, Dmm))
        adj.setdefault(v, []).append((u, pid, R, Lm, Dmm))

    # --------------------------------------------------------
    # Sources con head fijo
    # Si hay más de una fuente en un nodo, usamos la mayor.
    # --------------------------------------------------------
    head: Dict[str, float] = {}
    fixed_sources: Dict[str, float] = {}
    fixed_source_meta: Dict[str, dict[str, Any]] = {}

    sources_valid: List[dict[str, Any]] = []
    sources_valid_meta: List[dict[str, Any]] = []
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

        meta = _source_meta_from_row(s, h)
        meta["node_id"] = nid

        sources_valid.append(s)
        sources_valid_meta.append(meta)

        previous_h = fixed_sources.get(nid, float("-inf"))

        if h >= previous_h:
            fixed_sources[nid] = h
            fixed_source_meta[nid] = meta

    if not fixed_sources:
        raise HTTPException(
            400,
            "Todas las fuentes están bloqueadas por válvulas, no tienen head_m válido o no existen.",
        )

    # --------------------------------------------------------
    # Propagación dominante
    # --------------------------------------------------------
    pq: List[Tuple[float, str]] = []
    origin_source: Dict[str, dict[str, Any]] = {}

    for nid, h in fixed_sources.items():
        head[nid] = h
        origin_source[nid] = fixed_source_meta[nid]
        heapq.heappush(pq, (-h, nid))

    R0 = float(body.options.R0) if body.options.R0 else 500000.0
    head_drop_scale = float(body.options.head_drop_scale)
    max_sources_reaching = max(1, int(body.options.max_sources_reaching_per_node or 6))

    pipe_out: Dict[str, Dict[str, Any]] = {}

    while pq:
        neg_h, u = heapq.heappop(pq)
        hu = -neg_h

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
                pm = pipe_meta.get(pid, {})

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
                    "flow_func": pm.get("flow_func"),
                    "pipe_role": pm.get("role"),
                    "valve_closed": False,
                }

    # --------------------------------------------------------
    # Propagar cada fuente individualmente
    # --------------------------------------------------------
    node_sources_reaching: Dict[str, list[dict[str, Any]]] = {}

    for sm in sources_valid_meta:
        start_node = sm.get("node_id")
        start_head = _safe_float(sm.get("head_m"))

        if not start_node or start_head is None:
            continue

        per_source_heads = _propagate_from_single_source(
            start_node=start_node,
            start_head=start_head,
            adj=adj,
            blocked=blocked,
            R0=R0,
            head_drop_scale=head_drop_scale,
        )

        for nid, h in per_source_heads.items():
            reached_meta = {
                **sm,
                "head_m": float(h),
            }

            node_sources_reaching.setdefault(nid, []).append(reached_meta)

    # --------------------------------------------------------
    # Resumen de fuentes por nodo
    # --------------------------------------------------------
    node_source_summary: Dict[str, dict[str, Any]] = {}

    for n in nodes:
        nid = n["id"]
        dominant_h = head.get(nid)
        elev_m = node_elev.get(nid)
        reaching = node_sources_reaching.get(nid, [])

        sources_reaching, sources_reaching_count, source_mix, source_warnings = _summarize_sources_reaching(
            items=reaching,
            dominant_head=dominant_h,
            node_elev_m=elev_m,
            max_items=max_sources_reaching,
        )

        node_source_summary[nid] = {
            "sources_reaching": sources_reaching,
            "sources_reaching_count": sources_reaching_count,
            "source_mix": source_mix,
            "warnings": source_warnings,
        }

    # --------------------------------------------------------
    # Agregar cañerías cerradas por válvula al output
    # para que el front pueda mostrarlas si lo necesita.
    # --------------------------------------------------------
    for p in pipes:
        pid = p["id"]

        if not (body.options.closed_valve_blocks_pipe and valve_pipe_open.get(pid) is False):
            continue

        pipe_out[pid] = {
            "q_lps": 0.0,
            "abs_q_lps": 0.0,
            "dir": 1,
            "dH_m": None,
            "R": None,
            "length_m": p.get("length_m"),
            "diam_mm": p.get("diametro_mm"),
            "blocked": True,
            "valve_closed": True,
            "u": p.get("from_node"),
            "v": p.get("to_node"),
            "flow_func": p.get("flow_func"),
            "pipe_role": pipe_meta.get(pid, {}).get("role"),
            "pressure_mca_u": None,
            "pressure_mca_v": None,
            "pressure_mca_avg": None,
            "pressure_mca_min": None,
            "pressure_mca_max": None,
            "pressure_bar_u": None,
            "pressure_bar_v": None,
            "pressure_bar_avg": None,
            "pressure_bar_min": None,
            "pressure_bar_max": None,
            "pressure_kind_u": None,
            "pressure_kind_v": None,
            "pressure_kind": "BLOCKED",
            "origin_source_u": None,
            "origin_source_v": None,
            "sources_reaching": [],
            "sources_reaching_count": 0,
            "source_mix": "VALVE_CLOSED",
            "warnings": ["PIPE_BLOCKED_BY_CLOSED_VALVE"],
        }

    # --------------------------------------------------------
    # Finalizar pipes
    # --------------------------------------------------------
    for pid, po in pipe_out.items():
        if po.get("valve_closed") is True:
            continue

        u = po["u"]
        v = po["v"]

        hu = head.get(u)
        hv = head.get(v)

        reached_u = hu is not None and math.isfinite(float(hu))
        reached_v = hv is not None and math.isfinite(float(hv))

        origin_u = origin_source.get(u)
        origin_v = origin_source.get(v)

        src_summary_u = node_source_summary.get(u, {})
        src_summary_v = node_source_summary.get(v, {})

        combined_sources = [
            *(node_sources_reaching.get(u, []) or []),
            *(node_sources_reaching.get(v, []) or []),
        ]

        dedup: Dict[str, dict[str, Any]] = {}

        for x in combined_sources:
            sid = str(x.get("source_id") or x.get("label") or "")
            if not sid:
                continue

            old = dedup.get(sid)
            if old is None or float(x.get("head_m") or -1e18) > float(old.get("head_m") or -1e18):
                dedup[sid] = x

        pipe_sources_reaching, pipe_sources_reaching_count, pipe_source_mix, pipe_source_warnings = _summarize_sources_reaching(
            items=list(dedup.values()),
            dominant_head=max([x for x in [hu, hv] if x is not None], default=None),
            node_elev_m=None,
            max_items=max_sources_reaching,
        )

        pm = pipe_meta.get(pid, {})
        pipe_role = pm.get("role")

        if pipe_role in {"DISTRIBUCION", "RAMAL"}:
            groups = [x.get("source_group") for x in list(dedup.values())]

            if any(_is_pressure_like_group(g) for g in groups):
                pipe_source_warnings.append("DISTRIBUTION_FED_BY_PRESSURE")

            if "TANK" in groups and any(_is_pressure_like_group(g) for g in groups):
                pipe_source_warnings.append("TANK_ZONE_INVADED_BY_PRESSURE")

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

            po["origin_source_u"] = origin_u
            po["origin_source_v"] = origin_v

            po["sources_reaching"] = pipe_sources_reaching
            po["sources_reaching_count"] = pipe_sources_reaching_count
            po["source_mix"] = pipe_source_mix
            po["warnings"] = _merge_warnings(
                pipe_source_warnings,
                src_summary_u.get("warnings", []),
                src_summary_v.get("warnings", []),
            )
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

        direct_source_u = fixed_source_meta.get(u)
        direct_source_v = fixed_source_meta.get(v)

        pressure_kind_u = direct_source_u.get("pressure_kind") if direct_source_u else "CALC"
        pressure_kind_v = direct_source_v.get("pressure_kind") if direct_source_v else "CALC"

        po["pressure_kind_u"] = pressure_kind_u
        po["pressure_kind_v"] = pressure_kind_v
        po["pressure_kind"] = _pipe_pressure_kind(pressure_kind_u, pressure_kind_v)

        po["origin_source_u"] = origin_u
        po["origin_source_v"] = origin_v

        po["sources_reaching"] = pipe_sources_reaching
        po["sources_reaching_count"] = pipe_sources_reaching_count
        po["source_mix"] = pipe_source_mix

        po["warnings"] = _merge_warnings(
            pipe_source_warnings,
            src_summary_u.get("warnings", []),
            src_summary_v.get("warnings", []),
        )

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
        source_summary = node_source_summary.get(nid, {})

        if source:
            pressure_kind = source.get("pressure_kind") or "CALC"
        elif reached:
            pressure_kind = "CALC"
        else:
            pressure_kind = None

        base = {
            "blocked": nid in blocked,
            "valve_closed": valve_node_open.get(nid) is False,
            "kind": node_kind.get(nid, "JUNCTION"),
            "label": node_label.get(nid),

            "is_source": nid in fixed_sources,
            "pressure_kind": pressure_kind,
            "source": source,
            "dominant_source": source or origin,
            "origin_source": origin,

            "sources_reaching": source_summary.get("sources_reaching", []),
            "sources_reaching_count": source_summary.get("sources_reaching_count", 0),
            "source_mix": source_summary.get("source_mix"),
            "warnings": source_summary.get("warnings", []),

            "is_pressure_real": pressure_kind == "REAL",
            "is_pressure_theoretical": pressure_kind == "CALC",
        }

        if not reached:
            nodes_out[nid] = {
                **base,
                "head_m": None,
                "elev_m": elev_m,
                "pressure_mca": None,
                "pressure_bar": None,
                "reached": False,
            }
            continue

        pressure_mca, pressure_bar = _pressure_from_head(float(h), elev_m)

        nodes_out[nid] = {
            **base,
            "head_m": float(h),
            "elev_m": elev_m,
            "pressure_mca": pressure_mca,
            "pressure_bar": pressure_bar,
            "reached": True,
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
            "pipes_closed_by_valve": closed_by_valve_count,
            "pipes_blocked_by_valve": blocked_count,

            "valves_total": valves_total,
            "valves_on_nodes": len(valve_node_open),
            "valves_on_pipes": len(valve_pipe_open),
            "closed_node_valves": sum(1 for v in valve_node_open.values() if v is False),
            "closed_pipe_valves": sum(1 for v in valve_pipe_open.values() if v is False),

            "demands_ignored": True,
            "pressure_formula": "pressure_mca = head_m - elev_m",
            "sources_origin": '"MapasAgua"."v_sim_sources_live"',
            "source_mix_logic": "propagación individual por fuente + fuente dominante por mayor head_m",
            "valve_logic": {
                "node_valve_closed": "bloquea todas las cañerías conectadas al nodo",
                "pipe_valve_closed": "bloquea solo la cañería asociada",
            },
            "pressure_kinds": {
                "REAL": "Punto con presión real medida por manómetro/manifold",
                "TANK": "Punto con carga por tanque, nivel y cota",
                "MANUAL": "Fuente manual",
                "CALC": "Presión teórica calculada por propagación",
                "MIXED": "Cañería entre fuentes/orígenes distintos",
            },
            "source_mix_types": {
                "TANK_ONLY": "Solo llega tanque",
                "PRESSURE_ONLY": "Solo llega presión real medida",
                "MANUAL_ONLY": "Solo llega fuente manual",
                "MULTI_TANK": "Llegan varios tanques",
                "MULTI_PRESSURE": "Llegan varias fuentes de presión",
                "MIXED_TANK_PRESSURE": "Llegan tanque(s) y presión/impulsión",
                "VALVE_CLOSED": "Cañería bloqueada por válvula cerrada",
            },
            "warnings_catalog": {
                "TANK_AND_PRESSURE_REACH_NODE": "Al nodo/tramo llegan tanque e impulsión/presión",
                "TANK_AND_REAL_PRESSURE_REACH_NODE": "Al nodo/tramo llegan tanque y manómetro real",
                "TANK_AND_MANUAL_SOURCE_REACH_NODE": "Al nodo/tramo llegan tanque y fuente manual",
                "MULTIPLE_TANKS_REACH_NODE": "Llegan varios tanques",
                "MULTIPLE_PRESSURE_SOURCES_REACH_NODE": "Llegan varias fuentes de presión",
                "REAL_AND_MANUAL_PRESSURE_REACH_NODE": "Llegan presión real y fuente manual",
                "DISTRIBUTION_FED_BY_PRESSURE": "Cañería de distribución/ramal dominada o alcanzada por impulsión/presión",
                "TANK_ZONE_INVADED_BY_PRESSURE": "Zona de tanque alcanzada también por impulsión/presión",
                "PIPE_BLOCKED_BY_CLOSED_VALVE": "Cañería bloqueada por válvula cerrada",
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