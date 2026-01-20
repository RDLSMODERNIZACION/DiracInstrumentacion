# app/main.py
import os
import logging
from fastapi import FastAPI, Response
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from psycopg_pool import PoolTimeout, TooManyRequests
from psycopg import OperationalError

from app.db import get_conn, close_pool

# ===== Telegram reporter (30 min) =====
from app.services.telegram_reporter import start_telegram_reporter, stop_telegram_reporter

# ===== Telegram test router =====
from app.services.telegram_test import router as telegram_test_router

# ===== Rutas base (operación / visualización) =====
from app.routes.tanks import router as tanks_router
from app.routes.pumps import router as pumps_router
# 🔴 INGEST TEMPORALMENTE DESHABILITADO
# from app.routes.ingest import router as ingest_router
from app.routes.arduino_controler import router as arduino_router

# ===== Infraestructura (lectura) =====
from app.routes.infraestructura import router as infraestructura_router

# ===== Infraestructura (edición) =====
from app.routes.infra_edit.edit import router as infra_edit_router

# ===== PLC =====
from app.routes.plc import router as plc_router

# ===== KPI =====
from app.routes.kpi import router as kpi_router

# ===== Dirac (operación) =====
from app.routes.dirac.me import router as dirac_me_router
from app.routes.dirac.companies import router as dirac_companies_router
from app.routes.dirac.locations import router as dirac_locations_router
from app.routes.dirac.pumps import router as dirac_pumps_router

# ===== Administración =====
from app.routes.dirac_admin.companies import router as admin_companies_router
from app.routes.dirac_admin.users import router as admin_users_router
from app.routes.dirac_admin.locations import router as admin_locations_router
from app.routes.dirac_admin.tanks import router as admin_tanks_router
from app.routes.dirac_admin.pumps import router as admin_pumps_router
from app.routes.dirac_admin.valves import router as admin_valves_router
from app.routes.dirac_admin.manifolds import router as admin_manifolds_router

# ===== Mapa =====
from app.routes.mapa.mapasagua import router as mapasagua_router
from app.routes.mapa.simulacion import router as mapasagua_sim_router
from app.routes.mapa.nodes import router as mapa_nodes_router  # ✅ NUEVO

# ===== Logging =====
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s :: %(message)s",
)
for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
    logging.getLogger(name).setLevel(getattr(logging, LOG_LEVEL, logging.INFO))

# ===== App =====
enable_docs = os.getenv("ENABLE_DOCS", "1") == "1"

app = FastAPI(
    title="Backend MIN API",
    version=(os.getenv("RENDER_GIT_COMMIT", "")[:8] or "dev"),
    docs_url="/docs" if enable_docs else None,
    openapi_url="/openapi.json" if enable_docs else None,
)

# ✅ Solo GZip (SIN CORS)
app.add_middleware(GZipMiddleware, minimum_size=1024)

# ===== Flags de diagnóstico =====
DEBUG_BYPASS = os.getenv("DEBUG_BYPASS", "0") == "1"
DISABLE_TELEGRAM_REPORTER = os.getenv("DISABLE_TELEGRAM_REPORTER", "1") == "1"

# ===== Health =====
@app.get("/", tags=["health"])
def root():
    return {
        "ok": True,
        "service": "Backend MIN API",
        "version": os.getenv("RENDER_GIT_COMMIT", "")[:8] or "dev",
        "docs": "/docs" if enable_docs else None,
        "health": "/health",
        "health_db": "/health/db",
        "debug_bypass": DEBUG_BYPASS,
    }

@app.head("/", include_in_schema=False)
def head_root():
    return Response(status_code=200)

@app.get("/health", tags=["health"])
def health():
    return {"ok": True}

@app.get("/health/db", tags=["health"])
def health_db():
    """
    - up: conecta y ejecuta SELECT 1
    - busy: pool saturado (DB vive, pero no hay conexión libre)
    - down: fallo real de conexión/auth/ssl/etc
    """
    try:
        with get_conn(timeout=2) as conn, conn.cursor() as cur:
            cur.execute("select 1")
            cur.fetchone()
        return {"ok": True, "db": "up"}
    except (PoolTimeout, TooManyRequests):
        return JSONResponse({"ok": False, "db": "busy"}, status_code=503)
    except (OperationalError, Exception):
        logging.exception("DB health check failed")
        return JSONResponse({"ok": False, "db": "down"}, status_code=503)

# ===== DEBUG DB =====
@app.get("/debug/db/ping", include_in_schema=False)
def debug_db_ping():
    if not DEBUG_BYPASS:
        return JSONResponse({"ok": False, "detail": "DEBUG_BYPASS=0"}, status_code=403)
    try:
        with get_conn(timeout=2) as conn, conn.cursor() as cur:
            cur.execute("select 1")
            return {"ok": True, "ping": 1}
    except Exception as e:
        logging.exception("debug db ping failed")
        return JSONResponse(
            {"ok": False, "detail": f"{type(e).__name__}: {e}"},
            status_code=500,
        )

# ===== Rutas (operación base) =====
app.include_router(tanks_router)
app.include_router(pumps_router)
# 🔴 INGEST DESHABILITADO
# app.include_router(ingest_router)
app.include_router(arduino_router)

# ===== Infraestructura =====
app.include_router(infraestructura_router)
app.include_router(infra_edit_router)

# ===== PLC / KPI =====
app.include_router(plc_router)
app.include_router(kpi_router)

# ===== Dirac (operación) =====
app.include_router(dirac_me_router)
app.include_router(dirac_companies_router)
app.include_router(dirac_locations_router)
app.include_router(dirac_pumps_router)

# ===== Administración =====
app.include_router(admin_companies_router)
app.include_router(admin_users_router)
app.include_router(admin_locations_router)
app.include_router(admin_tanks_router)
app.include_router(admin_pumps_router)
app.include_router(admin_valves_router)
app.include_router(admin_manifolds_router)

# ===== Mapa =====
app.include_router(mapasagua_router, prefix="/mapa", tags=["mapa"])
app.include_router(mapasagua_sim_router, prefix="/mapa", tags=["mapa"])
app.include_router(mapa_nodes_router, prefix="/mapa", tags=["mapa"])

# ===== Telegram test =====
app.include_router(telegram_test_router)

# ===== Startup / Shutdown =====
@app.on_event("startup")
def _startup():
    if not DISABLE_TELEGRAM_REPORTER:
        start_telegram_reporter()

@app.on_event("shutdown")
def _shutdown():
    try:
        stop_telegram_reporter()
    except Exception:
        pass
    close_pool()
