from fastapi import APIRouter, Depends, HTTPException
from psycopg.rows import dict_row
from pydantic import BaseModel
from app.db import get_conn
from app.security import require_user

router = APIRouter(prefix="/dirac/admin", tags=["admin-tanks"])

class TankIn(BaseModel):
  name: str
  location_id: int | None = None

@router.get("/tanks", summary="Listar tanques (admin)")
def list_tanks(user=Depends(require_user)):
  with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
    cur.execute("SELECT EXISTS(SELECT 1 FROM company_users WHERE user_id=%s AND role IN ('owner','admin')) AS ok", (user["user_id"],))
    if not cur.fetchone()["ok"]:
      raise HTTPException(403, "Requiere owner/admin")
    cur.execute("SELECT id, name, location_id FROM tanks ORDER BY id DESC")
    return cur.fetchall() or []

@router.post("/tanks", summary="Crear tanque (admin)")
def create_tank(payload: TankIn, user=Depends(require_user)):
  with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
    cur.execute("SELECT EXISTS(SELECT 1 FROM company_users WHERE user_id=%s AND role IN ('owner','admin')) AS ok", (user["user_id"],))
    if not cur.fetchone()["ok"]:
      raise HTTPException(403, "Requiere owner/admin")
    cur.execute("INSERT INTO tanks(name, location_id) VALUES(%s,%s) RETURNING id, name, location_id", (payload.name, payload.location_id))
    row = cur.fetchone(); conn.commit(); return row

@router.patch("/tanks/{tank_id}", summary="Actualizar tanque (admin)")
def update_tank(tank_id: int, payload: TankIn, user=Depends(require_user)):
  with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
    cur.execute("SELECT EXISTS(SELECT 1 FROM company_users WHERE user_id=%s AND role IN ('owner','admin')) AS ok", (user["user_id"],))
    if not cur.fetchone()["ok"]:
      raise HTTPException(403, "Requiere owner/admin")
    cur.execute("UPDATE tanks SET name=COALESCE(%s,name), location_id=%s WHERE id=%s RETURNING id, name, location_id", (payload.name, payload.location_id, tank_id))
    row = cur.fetchone(); conn.commit(); return row or {}

@router.delete("/tanks/{tank_id}", summary="Eliminar tanque (admin)")
def delete_tank(tank_id: int, user=Depends(require_user)):
  with get_conn() as conn, conn.cursor() as cur:
    cur.execute("SELECT EXISTS(SELECT 1 FROM company_users WHERE user_id=%s AND role IN ('owner','admin')) AS ok", (user["user_id"],))
    if not cur.fetchone()[0]:
      raise HTTPException(403, "Requiere owner/admin")
    cur.execute("DELETE FROM tanks WHERE id=%s", (tank_id,)); conn.commit(); return {"ok": True}
