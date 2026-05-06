# app/routes/mapa/sim/pipes.py
from __future__ import annotations

from typing import Any


def normalize_text(s: Any) -> str:
    return str(s or "").upper()


def pipe_role_from_row(p: dict[str, Any]) -> str:
    """
    Clasificación simple de cañería para warnings operativos.
    """
    flow_func = normalize_text(p.get("flow_func"))
    props = p.get("props") or {}

    if not isinstance(props, dict):
        props = {}

    label = normalize_text(
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
