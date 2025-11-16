from fastapi import APIRouter
from .layout import router as layout_router
from .location_alarm import router as location_alarm_router

router = APIRouter()
router.include_router(layout_router)
router.include_router(location_alarm_router)
