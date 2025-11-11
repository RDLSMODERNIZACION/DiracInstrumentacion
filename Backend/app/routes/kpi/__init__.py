# app/routes/kpi/__init__.py
from fastapi import APIRouter
from .bombas_live import router as bombas_live_router

# Router agregador para todo lo de KPI
router = APIRouter()
router.include_router(bombas_live_router)  # /kpi/bombas/*

__all__ = ["router"]
