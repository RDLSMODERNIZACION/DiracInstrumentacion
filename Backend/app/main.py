# app/main.py
import os
import logging
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

from app.db import get_conn, close_pool

# ===== Rutas base (operación / visualización) =====
from app.routes.tanks import router as tanks_router
from app.routes.pumps import router as pumps_router
from app.routes.ingest import router as ingest_router
from app.routes.arduino_controler import router as arduino_router
from app.routes.infraestructura import router as infraestructura_router  # layout + alarmas

# ===== PLC (consumo de comandos) =====
from app.routes.plc import router as plc_router

# ===== KPI (agregador) =====
#   /kpi/* (dashboard + tanques)  y  /kpi/bombas/*  (bombas_live)
from app.routes.kpi import router as kpi_router

# ===== Dirac (operación) =====
from app.routes.dirac.me import router as dirac_me_router
# OJO: NO importamos app.routes.dirac.users (queda deshabilitado)
from app.routes.dirac.companies import router as dirac_companies_router
from app.routes.dirac.locations import router as dirac_locations_router
from app.routes.dirac.pumps import router as dirac_pumps_router

# ===== Administración (CRUD abierto) =====
# (asegurate de tener app/routes/dirac_admin/__init__.py vacío)
from app.routes.dirac_admin.companies import router as admin_companies_router
from app.routes.dirac_admin.users import router as admin_users_router
from app.routes.dirac_admin.locations import router as admin_locations_router
from app.routes.dirac_admin.tanks import router as admin_tanks_router
from app.routes.dirac_admin.pumps import router as admin_pumps_router
from app.routes.dirac_admin.valves import router as admin_valves_router
from app.routes.dirac_admin.manifolds import router as admin_manifolds_router

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

# Orígenes permitidos (agregá acá los que uses)
CORS_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:5175",
    "https://diracserviciosenergia.com",
    # Proyecto actual en Vercel (ajustar si cambia):
    "https://dirac-instrumentacion-kbqekdgdr-tecnologiainnovacions-projects.vercel.app",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=False,  # usamos Basic Auth, no cookies
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

# ===== Rutas (operación base) =====
app.include_router(tanks_router)
app.include_router(pumps_router)
app.include_router(ingest_router)
app.include_router(arduino_router)

# Infraestructura (diagramas + alarmas por localidad)
app.include_router(infraestructura_router)

# Endpoints para PLC / Node-RED (lectura de comandos, ack, etc.)
app.include_router(plc_router)

# ===== KPI (agregador: dashboard + tanques + bombas_live) =====
app.include_router(kpi_router)

# ===== Dirac (operación) =====
app.include_router(dirac_me_router)
# No incluimos /dirac/users (queda deshabilitado para evitar confusiones)
app.include_router(dirac_companies_router)
app.include_router(dirac_locations_router)
app.include_router(dirac_pumps_router)

# ===== Administración (CRUD abierto) =====
# /dirac/admin/companies, /dirac/admin/users, /dirac/admin/locations,
# /dirac/admin/tanks, /dirac/admin/pumps, /dirac/admin/valves, /dirac/admin/manifolds
app.include_router(admin_companies_router)
app.include_router(admin_users_router)
app.include_router(admin_locations_router)
app.include_router(admin_tanks_router)
app.include_router(admin_pumps_router)
app.include_router(admin_valves_router)
app.include_router(admin_manifolds_router)

# ===== Cierre ordenado del pool de DB =====
@app.on_event("shutdown")
def _shutdown():
    close_pool()
