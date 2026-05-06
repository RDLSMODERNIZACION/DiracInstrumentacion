# app/routes/mapa/sim/utils.py
from __future__ import annotations

from typing import Any
import math


def fetchall_dict(cur) -> list[dict[str, Any]]:
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]


def safe_rollback(conn) -> None:
    try:
        conn.rollback()
    except Exception:
        pass


def safe_float(v: Any) -> float | None:
    if v is None:
        return None

    try:
        n = float(v)
    except Exception:
        return None

    if not math.isfinite(n):
        return None

    return n


def pressure_from_head(
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

    h = safe_float(head_m)
    z = safe_float(elev_m)

    if h is None or z is None:
        return None, None

    pressure_mca = h - z
    return pressure_mca, pressure_mca / 10.197162129779


def merge_warnings(*parts: list[str]) -> list[str]:
    out: list[str] = []
    seen = set()

    for p in parts:
        for w in p or []:
            if w not in seen:
                seen.add(w)
                out.append(w)

    return out
