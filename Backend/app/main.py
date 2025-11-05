import os
import logging
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

from app.db import get_conn, close_pool

# ===== Rutas existentes =====
from app.routes.tanks import router as tanks_router
from app.routes.pumps import router as pumps_router
from app.routes.ingest import router as ingest_router
from app.routes.arduino_controler import router as arduino_router
from app.routes.infraestructura import router as infraestructura_router
from app.routes.kpi import router as kpi_router

# ===== Dirac (módulos de operación) =====
from app.routes.dirac.me import router as dirac_me_router
from app.routes.dirac.users import router as dirac_users_router
from app.routes.dirac.companies import router as dirac_companies_router
from app.routes.dirac.locations import router as dirac_locations_router
from app.routes.dirac.pumps import router as dirac_pumps_router

# ===== Administración (CRUD completo) =====
# Asegurate de tener app/routes/dirac_admin/__init__.py (vacío)
from app.routes.dirac_admin.companies import router as admin_companies_router
from app.routes.dirac_admin.users import router as admin_users_router
from app.routes.dirac_admin.locations import router as admin_locations_router
from app.routes.dirac_admin.tanks import router as admin_tanks_router
from app.routes.dirac_admin.pumps import router as admin_pumps_router
from app.routes.dirac_admin.valves import router as admin_valves_router

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

# ===== CORS y GZIP =====
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=False,
    expose_headers=["*"],
    max_age=3600,
)
app.add_middleware(GZipMiddleware, minimum_size=1024)

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
    }

@app.head("/", include_in_schema=False)
def head_root():
    return Response(status_code=200)

@app.get("/health", tags=["health"])
def health():
    return {"ok": True}

@app.get("/health/db", tags=["health"])
def health_db():
    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("select 1")
            cur.fetchone()
        return {"ok": True, "db": "up"}
    except Exception:
        logging.exception("DB health check failed")
        return JSONResponse({"ok": False, "db": "down"}, status_code=503)

# ===== Rutas =====
app.include_router(tanks_router)
app.include_router(pumps_router)
app.include_router(ingest_router)
app.include_router(arduino_router)
app.include_router(infraestructura_router)
app.include_router(kpi_router)  # /kpi/*

# ===== Dirac (operación) =====
app.include_router(dirac_me_router)
app.include_router(dirac_users_router)
app.include_router(dirac_companies_router)
app.include_router(dirac_locations_router)
app.include_router(dirac_pumps_router)

# ===== Administración (CRUD) =====
app.include_router(admin_companies_router)
app.include_router(admin_users_router)
app.include_router(admin_locations_router)
app.include_router(admin_tanks_router)
app.include_router(admin_pumps_router)
app.include_router(admin_valves_router)

# ===== Cierre ordenado del pool de DB =====
@app.on_event("shutdown")
def _shutdown():
    close_pool()
