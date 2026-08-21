from fastapi import APIRouter
from .layout import router as layout_router
from .location_alarm import router as location_alarm_router
from .mantenimiento import router as mantenimiento_router
from .pump_taps import router as pump_taps_router
from .node_servicio import router as node_servicio_router
from .pump_availability import router as pump_availability_router

router = APIRouter()
router.include_router(layout_router)
router.include_router(location_alarm_router)
router.include_router(mantenimiento_router)
router.include_router(pump_taps_router)
router.include_router(node_servicio_router)
router.include_router(pump_availability_router)

