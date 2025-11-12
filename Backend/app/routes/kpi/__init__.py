from fastapi import APIRouter
from .dashboard import router as dashboard_router
from .tanques import router as tanques_router
from .bombas_live import router as bombas_live_router
from .tank_live import router as tank_live_router   # 👈 nuevo
from .energy import router as energy_router         # 👈 agregado

router = APIRouter()
router.include_router(dashboard_router)    # /kpi/*
router.include_router(tanques_router)      # /kpi/*
router.include_router(bombas_live_router)  # /kpi/bombas/*
router.include_router(tank_live_router)    # /kpi/tanques/*   (…/live)
router.include_router(energy_router)       # /kpi/energy/*    (runtime por bandas)

__all__ = ["router"]
