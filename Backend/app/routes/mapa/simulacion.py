# app/routes/mapa/simulacion.py
"""
Router liviano de simulación.

Este archivo queda para mantener compatibilidad con:
    from .simulacion import router as simulacion_router

en app/routes/mapa/__init__.py.

La implementación real quedó refactorizada en:
    app/routes/mapa/sim/
"""
from __future__ import annotations

from .sim import router

__all__ = ["router"]
