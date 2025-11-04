from fastapi import APIRouter, Depends, HTTPException, Query
from psycopg.rows import dict_row
from app.db import get_conn
from app.security import require_user
from app.schemas_dirac import PumpCommandIn

router = APIRouter(prefix="/dirac/pumps", tags=["pumps"])

@router.post(
    "/{pump_id}/command",
    summary="Enviar comando start/stop",
    description="Valida permiso (control/admin) y PIN (si require_pin)."
)
def issue_pump_command(pump_id: int, payload: PumpCommandIn, user=Depends(require_user)):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            "SELECT p.id, p.pin_code, p.require_pin "
            "FROM pumps p "
            "JOIN locations l ON l.id = p.location_id "
            "JOIN v_user_locations vul ON vul.location_id = l.id "
            "WHERE p.id=%s AND vul.user_id=%s AND vul.access IN ('control','admin')",
            (pump_id, user["user_id"])
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=403, detail="Sin permisos para esta bomba")
        if row["require_pin"] and payload.pin != row["pin_code"]:
            raise HTTPException(status_code=401, detail="PIN incorrecto")
        cur.execute(
            "INSERT INTO pump_commands(pump_id, action, status, requested_by, requested_by_user_id, requested_at) "
            "VALUES(%s,%s,'pending',%s,%s, now())",
            (pump_id, payload.action, user["email"], user["user_id"])
        )
        conn.commit()
        return {"ok": True, "queued": True}

@router.post(
    "/{pump_id}/change-pin",
    summary="Cambiar PIN de la bomba",
    description="Solo usuarios con acceso admin a la localización."
)
def change_pump_pin(
    pump_id: int,
    new_pin: str = Query(..., min_length=4, max_length=4, regex=r"^\d{4}$"),
    user=Depends(require_user)
):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            "SELECT EXISTS(SELECT 1 FROM pumps p "
            "JOIN locations l ON l.id=p.location_id "
            "JOIN v_user_locations vul ON vul.location_id=l.id "
            "WHERE p.id=%s AND vul.user_id=%s AND vul.access='admin') AS ok",
            (pump_id, user["user_id"])
        )
        allowed = cur.fetchone()["ok"]
        if not allowed:
            raise HTTPException(403, "Requiere admin")
        cur.execute(
            "UPDATE pumps SET pin_code=%s, pin_updated_at=now() WHERE id=%s",
            (new_pin, pump_id)
        )
        conn.commit()
        return {"ok": True}
