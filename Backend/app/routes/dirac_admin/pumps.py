from fastapi import APIRouter, Depends, HTTPException
from psycopg.rows import dict_row
from pydantic import BaseModel, Field, constr
from app.db import get_conn
from app.security import require_user

router = APIRouter(prefix="/dirac/admin", tags=["admin-pumps"])

class PumpIn(BaseModel):
  name: str
  location_id: int | None = None
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
def create_pump(payload: PumpIn, user=Depends(require_user)):
  with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
    cur.execute("SELECT EXISTS(SELECT 1 FROM company_users WHERE user_id=%s AND role IN ('owner','admin')) AS ok", (user["user_id"],))
    if not cur.fetchone()["ok"]:
      raise HTTPException(403, "Requiere owner/admin")
    cur.execute("INSERT INTO pumps(name, location_id, pin_code, require_pin) VALUES(%s,%s,COALESCE(%s,'0000'),COALESCE(%s,true)) RETURNING id, name, location_id",
                (payload.name, payload.location_id, payload.pin_code, payload.require_pin))
    row = cur.fetchone(); conn.commit(); return row

@router.patch("/pumps/{pump_id}", summary="Actualizar bomba (admin)")
def update_pump(pump_id: int, payload: PumpIn, user=Depends(require_user)):
  with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
    cur.execute("SELECT EXISTS(SELECT 1 FROM company_users WHERE user_id=%s AND role IN ('owner','admin')) AS ok", (user["user_id"],))
    if not cur.fetchone()["ok"]:
      raise HTTPException(403, "Requiere owner/admin")
    cur.execute("UPDATE pumps SET name=COALESCE(%s,name), location_id=COALESCE(%s,location_id) WHERE id=%s RETURNING id, name, location_id",
                (payload.name, payload.location_id, pump_id))
    row = cur.fetchone(); conn.commit(); return row or {}

@router.delete("/pumps/{pump_id}", summary="Eliminar bomba (admin)")
def delete_pump(pump_id: int, user=Depends(require_user)):
  with get_conn() as conn, conn.cursor() as cur:
    cur.execute("SELECT EXISTS(SELECT 1 FROM company_users WHERE user_id=%s AND role IN ('owner','admin')) AS ok", (user["user_id"],))
    if not cur.fetchone()[0]:
      raise HTTPException(403, "Requiere owner/admin")
    cur.execute("DELETE FROM pumps WHERE id=%s", (pump_id,)); conn.commit(); return {"ok": True}
