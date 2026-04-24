from fastapi import APIRouter

from .dashboard import router as dashboard_router
from .tanques import router as tanques_router
from .bombas_live import router as bombas_live_router
from .tank_live import router as tank_live_router
from .energy import router as energy_router
from .reliability import router as reliability_router
from .energy_areas import router as energy_areas_router
from .operation_reliability import router as operation_reliability_router

router = APIRouter()

router.include_router(dashboard_router)
router.include_router(tanques_router)

router.include_router(bombas_live_router)
router.include_router(tank_live_router)

router.include_router(energy_router)

router.include_router(reliability_router)

router.include_router(energy_areas_router)

router.include_router(operation_reliability_router)

__all__ = ["router"]