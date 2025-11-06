# app/routes/dirac/pumps.py
from typing import Optional, Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, constr
from psycopg.rows import dict_row

from app.db import get_conn
from app.security import require_user

router = APIRouter(prefix="/dirac", tags=["pumps"])  # ya lo tenías

# ---- entrada del comando (pin opcional) ----
class PumpCommandIn(BaseModel):
    action: Literal["start", "stop"]
    pin: Optional[constr(pattern=r"^\d{4}$")] = None

ALLOWED_ROLES = {"owner", "admin", "operator"}

@router.post("/pumps/{pump_id}/command", status_code=202, summary="Emitir comando a bomba (start/stop)")
def issue_pump_command(pump_id: int, payload: PumpCommandIn, me = Depends(require_user)):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        # 1) Bomba + empresa + requisitos de PIN
        cur.execute("""
            SELECT p.id, p.name, p.location_id, p.pin_code, p.require_pin, l.company_id
            FROM pumps p
            LEFT JOIN locations l ON l.id = p.location_id
            WHERE p.id = %s
        """, (pump_id,))
        p = cur.fetchone()
        if not p:
            raise HTTPException(404, "Bomba no encontrada")
        if p["company_id"] is None:
            raise HTTPException(400, "Bomba sin empresa asociada")

        # 2) Chequeo de rol a nivel empresa (solo owner/admin/operator)
        cur.execute("""
            SELECT role
            FROM company_users
            WHERE user_id = %s AND company_id = %s
        """, (me["user_id"], p["company_id"]))
        r = cur.fetchone()
        role = r["role"] if r else None
        if role not in ALLOWED_ROLES and not me.get("superadmin", False):
            raise HTTPException(403, "No autorizado: tu rol no puede controlar bombas")

        # 3) Chequeo de acceso a la ubicación (control/admin sobre ESA location)
        cur.execute("""
            SELECT access
            FROM v_user_locations
            WHERE user_id=%s AND location_id=%s
        """, (me["user_id"], p["location_id"]))
        v = cur.fetchone()
        if not v or v["access"] not in ("control", "admin"):
            raise HTTPException(403, "No autorizado en esta ubicación")

        # 4) Validar PIN si la bomba lo requiere
        if p["require_pin"]:
            if not payload.pin or payload.pin != p["pin_code"]:
                raise HTTPException(403, "PIN inválido")

        # 5) Encolar comando
        cur.execute("""
            INSERT INTO pump_commands (pump_id, action, status, requested_by, requested_by_user_id)
            VALUES (%s, %s, 'pending', %s, %s)
            RETURNING id, pump_id, action, status, requested_at
        """, (pump_id, payload.action, me["email"], me["user_id"]))
        row = cur.fetchone()
        conn.commit()
        return row
