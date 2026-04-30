# app/routes/mapa/__init__.py
from fastapi import APIRouter

from .mapasagua import router as mapasagua_router
from .simulacion import router as simulacion_router
from .nodes import router as nodes_router
from .contours import router as contours_router

router = APIRouter()

# /mapa/mapasagua/...
router.include_router(mapasagua_router)

# /mapa/sim/...
# /mapa/pipes/{pipe_id}/connect
router.include_router(simulacion_router)

# /mapa/nodes/...
router.include_router(nodes_router)

# /mapa/contours/...
router.include_router(contours_router)

__all__ = ["router"]