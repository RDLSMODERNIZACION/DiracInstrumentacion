from fastapi import APIRouter, Depends, HTTPException
from psycopg.rows import dict_row
from pydantic import BaseModel
from app.db import get_conn
from app.security import require_user

router = APIRouter(prefix="/dirac/admin", tags=["admin-valves"])

class ValveIn(BaseModel):
  name: str
  location_id: int | None = None
  kind: str | None = None

@router.get("/valves", summary="Listar válvulas (admin)")
def list_valves(user=Depends(require_user)):
  with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
    cur.execute("SELECT EXISTS(SELECT 1 FROM company_users WHERE user_id=%s AND role IN ('owner','admin')) AS ok", (user["user_id"],))
    if not cur.fetchone()["ok"]:
      raise HTTPException(403, "Requiere owner/admin")
    cur.execute("SELECT id, name, location_id, kind FROM valves ORDER BY id DESC")
    return cur.fetchall() or []

@router.post("/valves", summary="Crear válvula (admin)")
def create_valve(payload: ValveIn, user=Depends(require_user)):
  with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
    cur.execute("SELECT EXISTS(SELECT 1 FROM company_users WHERE user_id=%s AND role IN ('owner','admin')) AS ok", (user["user_id"],))
    if not cur.fetchone()["ok"]:
      raise HTTPException(403, "Requiere owner/admin")
    cur.execute("INSERT INTO valves(name, location_id, kind) VALUES(%s,%s,COALESCE(%s,'branch')) RETURNING id, name, location_id, kind",
                (payload.name, payload.location_id, payload.kind))
    row = cur.fetchone(); conn.commit(); return row

@router.patch("/valves/{valve_id}", summary="Actualizar válvula (admin)")
def update_valve(valve_id: int, payload: ValveIn, user=Depends(require_user)):
  with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
    cur.execute("SELECT EXISTS(SELECT 1 FROM company_users WHERE user_id=%s AND role IN ('owner','admin')) AS ok", (user["user_id"],))
    if not cur.fetchone()["ok"]:
      raise HTTPException(403, "Requiere owner/admin")
    cur.execute("UPDATE valves SET name=COALESCE(%s,name), location_id=COALESCE(%s,location_id), kind=COALESCE(%s,kind) WHERE id=%s RETURNING id, name, location_id, kind",
                (payload.name, payload.location_id, payload.kind, valve_id))
    row = cur.fetchone(); conn.commit(); return row or {}

@router.delete("/valves/{valve_id}", summary="Eliminar válvula (admin)")
def delete_valve(valve_id: int, user=Depends(require_user)):
  with get_conn() as conn, conn.cursor() as cur:
    cur.execute("SELECT EXISTS(SELECT 1 FROM company_users WHERE user_id=%s AND role IN ('owner','admin')) AS ok", (user["user_id"],))
    if not cur.fetchone()[0]:
      raise HTTPException(403, "Requiere owner/admin")
    cur.execute("DELETE FROM valves WHERE id=%s", (valve_id,)); conn.commit(); return {"ok": True}
