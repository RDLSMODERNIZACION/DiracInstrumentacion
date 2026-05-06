# app/routes/mapa/sim/sources.py
from __future__ import annotations

from typing import Any

from .utils import pressure_from_head, safe_float


def source_label(s: dict[str, Any]) -> str:
    return (
        s.get("label")
        or s.get("source_name")
        or s.get("asset_name")
        or s.get("source_type")
        or "Fuente"
    )


def pressure_kind_from_source_type(source_type: str | None) -> str:
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


def source_group_from_type(source_type: str | None) -> str:
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


def is_pressure_like_group(group: str | None) -> bool:
    return group in {"PRESSURE", "MANUAL"}


def pipe_pressure_kind(kind_u: str | None, kind_v: str | None) -> str:
    ku = kind_u or "CALC"
    kv = kind_v or "CALC"

    if ku == kv:
        return ku

    return "MIXED"


def source_meta_from_row(s: dict[str, Any], head_m: float) -> dict[str, Any]:
    source_type = s.get("source_type")
    pressure_kind = pressure_kind_from_source_type(source_type)
    source_group = source_group_from_type(source_type)

    return {
        "source_id": s.get("id"),
        "source_type": source_type,
        "source_group": source_group,
        "pressure_kind": pressure_kind,
        "asset_link_id": s.get("asset_link_id"),
        "asset_type": s.get("asset_type"),
        "asset_id": s.get("asset_id"),
        "label": source_label(s),
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


def classify_sources_reaching(items: list[dict[str, Any]]) -> tuple[str | None, list[str]]:
    """
    Clasifica mezcla de fuentes que llegan a un nodo/cañería.

    Devuelve:
      source_mix, warnings
    """
    if not items:
        return None, []

    groups = [x.get("source_group") for x in items]
    tank_count = sum(1 for g in groups if g == "TANK")
    pressure_count = sum(1 for g in groups if is_pressure_like_group(g))
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


def summarize_sources_reaching(
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

    source_mix, warnings = classify_sources_reaching(sorted_items)

    out: list[dict[str, Any]] = []

    for x in sorted_items[:max_items]:
        h = safe_float(x.get("head_m"))
        pressure_mca, pressure_bar = pressure_from_head(h, node_elev_m)

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
