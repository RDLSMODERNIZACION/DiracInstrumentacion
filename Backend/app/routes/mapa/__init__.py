# app/routes/mapa/__init__.py
from fastapi import APIRouter

from .mapasagua import router as mapasagua_router
from .simulacion import router as simulacion_router
from .nodes import router as nodes_router
from .contours import router as contours_router
from .assets import router as assets_router
from .diameters import router as diameters_router
from .valves import router as valves_router
from .distribution_instrumentation import router as distribution_instrumentation_router


router = APIRouter()

router.include_router(mapasagua_router)
router.include_router(simulacion_router)
router.include_router(nodes_router)
router.include_router(contours_router)
router.include_router(assets_router)
router.include_router(diameters_router)
router.include_router(valves_router)
router.include_router(distribution_instrumentation_router)

__all__ = ["router"]