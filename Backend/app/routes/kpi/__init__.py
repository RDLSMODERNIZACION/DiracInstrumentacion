from fastapi import APIRouter

from .dashboard import router as dashboard_router
from .tanques import router as tanques_router
from .bombas_live import router as bombas_live_router
from .tank_live import router as tank_live_router   # …/kpi/tanques/* (live)
from .energy import router as energy_router         # …/energy/*
from .reliability import router as reliability_router  # …/reliability/*

router = APIRouter()

# Estos dos suelen tener prefix="/kpi"
router.include_router(dashboard_router)    # /kpi/*
router.include_router(tanques_router)      # /kpi/*

# Live de bombas y tanques (probablemente /kpi/bombas/* y /kpi/tanques/*)
router.include_router(bombas_live_router)  # /kpi/bombas/*
router.include_router(tank_live_router)    # /kpi/tanques/*

# Eficiencia energética (torta por bandas)
router.include_router(energy_router)       # /energy/*  (ej: /energy/runtime)

# Operación y confiabilidad (timeline de conectividad)
router.include_router(reliability_router)  # /reliability/* (ej: /reliability/location_timeline)

__all__ = ["router"]
