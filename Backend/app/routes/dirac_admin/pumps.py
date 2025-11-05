from fastapi import APIRouter, Depends, HTTPException
from psycopg.rows import dict_row
from pydantic import BaseModel, constr
from app.db import get_conn
from app.security import require_user
from .location_utils import ensure_location_id

router = APIRouter(prefix="/dirac/admin", tags=["admin-pumps"])

class PumpCreate(BaseModel):
    name: str
    location_id: int | None = None
    company_id: int | None = None
    location_name: str | None = None
    pin_code: constr(pattern=r"^\d{4}$") | None = None
    require_pin: bool | None = None

class PumpPatch(BaseModel):
    name: str | None = None
    location_id: int | None = None
    company_id: int | None = None
    location_name: str | None = None
    pin_code: constr(pattern=r"^\d{4}$") | None = None
    require_pin: bool | None = None

@router.get("/pumps", summary="Listar bombas (admin)")
def list_pumps(user=Depends(require_user)):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute("SELECT EXISTS(SELECT 1 FROM company_users WHERE user_id=%s AND role IN ('owner','admin')) AS ok", (user["user_id"],))
        if not cur.fetchone()["ok"]:
            raise HTTPException(403, "Requiere owner/admin")
        cur.execute("SELECT id, name, location_id FROM pumps ORDER BY id DESC")
        return cur.fetchall() or []

@router.post("/pumps", summary="Crear bomba (admin)")
def create_pump(payload: PumpCreate, user=Depends(require_user)):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        loc_id = ensure_location_id(conn, user["user_id"], payload.location_id, payload.company_id, payload.location_name)
        try:
            cur.execute(
                "INSERT INTO pumps(name, location_id, pin_code, require_pin) "
                "VALUES(%s,%s,COALESCE(%s,'0000'),COALESCE(%s,true)) "
                "RETURNING id, name, location_id",
                (payload.name, loc_id, payload.pin_code, payload.require_pin)
            )
            row = cur.fetchone(); conn.commit(); return row
        except Exception as e:
            conn.rollback(); raise HTTPException(400, f"Create pump error: {e}")

@router.patch("/pumps/{pump_id}", summary="Actualizar bomba (admin)")
def update_pump(pump_id: int, payload: PumpPatch, user=Depends(require_user)):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        loc_id = None
        if payload.location_id is not None or (payload.company_id and payload.location_name):
            loc_id = ensure_location_id(conn, user["user_id"], payload.location_id, payload.company_id, payload.location_name)
        try:
            cur.execute(
                "UPDATE pumps SET "
                "name = COALESCE(%s, name), "
                "location_id = COALESCE(%s, location_id), "
                "pin_code = COALESCE(%s, pin_code), "
                "require_pin = COALESCE(%s, require_pin) "
                "WHERE id=%s RETURNING id, name, location_id",
                (payload.name, loc_id, payload.pin_code, payload.require_pin, pump_id)
            )
            row = cur.fetchone(); conn.commit(); return row or {}
        except Exception as e:
            conn.rollback(); raise HTTPException(400, f"Update pump error: {e}")
