from fastapi import APIRouter, Depends, HTTPException
from psycopg.rows import dict_row
from pydantic import BaseModel
from app.db import get_conn
from app.security import require_user
from .location_utils import ensure_location_id

router = APIRouter(prefix="/dirac/admin", tags=["admin-tanks"])

class TankCreate(BaseModel):
    name: str
    location_id: int | None = None
    company_id: int | None = None
    location_name: str | None = None

class TankPatch(BaseModel):
    name: str | None = None
    location_id: int | None = None
    company_id: int | None = None
    location_name: str | None = None

@router.get("/tanks", summary="Listar tanques (admin)")
def list_tanks(user=Depends(require_user)):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute("SELECT EXISTS(SELECT 1 FROM company_users WHERE user_id=%s AND role IN ('owner','admin')) AS ok", (user["user_id"],))
        if not cur.fetchone()["ok"]:
            raise HTTPException(403, "Requiere owner/admin")
        cur.execute("SELECT id, name, location_id FROM tanks ORDER BY id DESC")
        return cur.fetchall() or []

@router.post("/tanks", summary="Crear tanque (admin)")
def create_tank(payload: TankCreate, user=Depends(require_user)):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        loc_id = ensure_location_id(conn, user["user_id"], payload.location_id, payload.company_id, payload.location_name)
        try:
            cur.execute("INSERT INTO tanks(name, location_id) VALUES(%s,%s) RETURNING id, name, location_id", (payload.name, loc_id))
            row = cur.fetchone(); conn.commit(); return row
        except Exception as e:
            conn.rollback(); raise HTTPException(400, f"Create tank error: {e}")

@router.patch("/tanks/{tank_id}", summary="Actualizar tanque (admin)")
def update_tank(tank_id: int, payload: TankPatch, user=Depends(require_user)):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        loc_id = None
        if payload.location_id is not None or (payload.company_id and payload.location_name):
            loc_id = ensure_location_id(conn, user["user_id"], payload.location_id, payload.company_id, payload.location_name)
        try:
            cur.execute(
                "UPDATE tanks SET name=COALESCE(%s,name), location_id=COALESCE(%s,location_id) WHERE id=%s "
                "RETURNING id, name, location_id",
                (payload.name, loc_id, tank_id)
            )
            row = cur.fetchone(); conn.commit(); return row or {}
        except Exception as e:
            conn.rollback(); raise HTTPException(400, f"Update tank error: {e}")
