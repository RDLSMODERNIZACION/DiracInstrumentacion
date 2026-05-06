# app/routes/mapa/sim/endpoints/run.py
from __future__ import annotations

from typing import Any, Dict, List, Tuple
import heapq
import math

from fastapi import APIRouter, HTTPException

from app.db import get_conn

from ..hydraulics import pipe_R, propagate_from_single_source
from ..models import SimRunRequest
from ..pipes import pipe_role_from_row
from ..repositories import read_live_sources, read_nodes, read_pipes
from ..sources import (
    is_pressure_like_group,
    pipe_pressure_kind,
    source_meta_from_row,
    summarize_sources_reaching,
)
from ..utils import merge_warnings, pressure_from_head, safe_float, safe_rollback
from ..valves import read_valves

router = APIRouter()


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
        bloquea el nodo completo.
    - Válvula en cañería cerrada:
        bloquea solo esa cañería.
    - Válvula insertada en punto:
        tiene map_node_id para dibujar y map_pipe_id para cortar.
        La simulación bloquea solo map_pipe_id.
    - Usa elev_m para calcular presión:
        pressure_mca = head_m - elev_m
    """
    with get_conn() as conn, conn.cursor() as cur:
        # ----------------------------------------------------
        # Pipes
        # ----------------------------------------------------
        try:
            pipes = read_pipes(cur, default_diam_mm=body.options.default_diam_mm)
        except Exception as e:
            safe_rollback(conn)
            raise HTTPException(500, f"Error leyendo pipes: {e}")

        # ----------------------------------------------------
        # Nodes
        # ----------------------------------------------------
        try:
            nodes = read_nodes(cur)
        except Exception as e:
            safe_rollback(conn)
            raise HTTPException(500, f"Error leyendo nodes: {e}")

        # ----------------------------------------------------
        # Valves
        # ----------------------------------------------------
        valve_node_open, valve_pipe_open, valves_total = read_valves(cur, conn)

        # ----------------------------------------------------
        # Sources hidráulicas vivas
        # ----------------------------------------------------
        try:
            sources = read_live_sources(cur)
        except Exception as e:
            safe_rollback(conn)
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
        pipe_role = pipe_role_from_row(p)

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

        R = pipe_R(
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

        h = safe_float(s.get("head_m"))

        if h is None:
            sources_invalid += 1
            continue

        meta = source_meta_from_row(s, h)
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
        start_head = safe_float(sm.get("head_m"))

        if not start_node or start_head is None:
            continue

        per_source_heads = propagate_from_single_source(
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

        sources_reaching, sources_reaching_count, source_mix, source_warnings = summarize_sources_reaching(
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

        pipe_sources_reaching, pipe_sources_reaching_count, pipe_source_mix, pipe_source_warnings = summarize_sources_reaching(
            items=list(dedup.values()),
            dominant_head=max([x for x in [hu, hv] if x is not None], default=None),
            node_elev_m=None,
            max_items=max_sources_reaching,
        )

        pm = pipe_meta.get(pid, {})
        pipe_role = pm.get("role")

        if pipe_role in {"DISTRIBUCION", "RAMAL"}:
            groups = [x.get("source_group") for x in list(dedup.values())]

            if any(is_pressure_like_group(g) for g in groups):
                pipe_source_warnings.append("DISTRIBUTION_FED_BY_PRESSURE")

            if "TANK" in groups and any(is_pressure_like_group(g) for g in groups):
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
            po["warnings"] = merge_warnings(
                pipe_source_warnings,
                src_summary_u.get("warnings", []),
                src_summary_v.get("warnings", []),
            )
            continue

        hu = float(hu)
        hv = float(hv)

        elev_u = node_elev.get(u)
        elev_v = node_elev.get(v)

        pressure_mca_u, pressure_bar_u = pressure_from_head(hu, elev_u)
        pressure_mca_v, pressure_bar_v = pressure_from_head(hv, elev_v)

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
        po["pressure_kind"] = pipe_pressure_kind(pressure_kind_u, pressure_kind_v)

        po["origin_source_u"] = origin_u
        po["origin_source_v"] = origin_v

        po["sources_reaching"] = pipe_sources_reaching
        po["sources_reaching_count"] = pipe_sources_reaching_count
        po["source_mix"] = pipe_source_mix

        po["warnings"] = merge_warnings(
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

        pressure_mca, pressure_bar = pressure_from_head(float(h), elev_m)

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
                "valve_with_node_and_pipe": "el nodo es ubicación física; el pipe es el tramo que se bloquea",
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
