from fastapi import APIRouter
from .location_alarm import router as location_alarm_router

router = APIRouter(prefix="/plc", tags=["plc"])

router.include_router(location_alarm_router)
    