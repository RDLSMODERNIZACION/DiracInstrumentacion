# app/routes/mapa/sim/__init__.py
from __future__ import annotations

from fastapi import APIRouter

from .endpoints.debug import router as debug_router
from .endpoints.run import router as run_router
from .endpoints.connect import router as connect_router

router = APIRouter()

# Mantiene las rutas actuales:
# GET   /mapa/sim/debug_sources
# GET   /mapa/sim/debug_network
# POST  /mapa/sim/run
# PATCH /mapa/pipes/{pipe_id}/connect
router.include_router(debug_router)
router.include_router(run_router)
router.include_router(connect_router)

__all__ = ["router"]
