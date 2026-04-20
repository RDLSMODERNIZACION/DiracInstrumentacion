from fastapi import APIRouter

from .dashboard import router as dashboard_router
from .tanques import router as tanques_router
from .bombas_live import router as bombas_live_router
from .tank_live import router as tank_live_router   # …/kpi/tanques/* (live)
from .energy import router as energy_router         # …/energy/*
from .reliability import router as reliability_router  # …/reliability/*
from .energy_areas import router as energy_areas_router  # …/energy_areas/*

router = APIRouter()

# Estos dos suelen tener prefix="/kpi"
router.include_router(dashboard_router)    # /kpi/*
router.include_router(tanques_router)      # /kpi/*

# Live de bombas y tanques
router.include_router(bombas_live_router)  # /kpi/bombas/*
router.include_router(tank_live_router)    # /kpi/tanques/*

# Eficiencia energética
router.include_router(energy_router)       # /energy/*

# Operación y confiabilidad
router.include_router(reliability_router)  # /reliability/*

# Áreas energéticas
router.include_router(energy_areas_router) # /energy_areas/*

__all__ = ["router"]