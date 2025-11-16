# app/routes/infraestructura/location_alarm.py
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Literal, Dict, Any
from psycopg.rows import dict_row

from app.db import get_conn
from app.security import require_user  # mismo que usás en valves/admin, etc.

router = APIRouter(prefix="/infraestructura", tags=["infraestructura-alarmas"])

# ---- helpers de permisos muy simples ----

def _is_superadmin(user: Dict[str, Any]) -> bool:
  try:
    return bool(user.get("superadmin"))
  except Exception:
    return False

def _user_can_access_location(cur, user: Dict[str, Any], location_id: int) -> bool:
  """
  Permite:
  - superadmin
  - usuarios con acceso en user_location_access (view/control/admin/owner)
  """
  if _is_superadmin(user):
    return True

  cur.execute(
    """
    SELECT 1
    FROM public.user_location_access ula
    WHERE ula.user_id = %s
      AND ula.location_id = %s
    LIMIT 1
    """,
    (user["user_id"], location_id),
  )
  return cur.fetchone() is not None


# ---- modelo de entrada ----

class LocationAlarmRequest(BaseModel):
  location_id: int
  action: Literal["on", "off", "pulse"] = "on"


# ---- endpoint UI: crear comando de alarma (luces + sirena) ----

@router.post("/location_alarm", status_code=201)
def create_location_alarm_command(
  payload: LocationAlarmRequest,
  user=Depends(require_user),
):
  """
  Crea un comando de alarma por localidad.
  Lo consumirá el PLC desde la carpeta /plc.
  """
  with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
    # validar que la localidad exista
    cur.execute(
      "SELECT id, name, company_id FROM public.locations WHERE id = %s",
      (payload.location_id,),
    )
    loc = cur.fetchone()
    if not loc:
      raise HTTPException(404, "Localidad no encontrada")

    # validar permisos de usuario sobre esa localidad
    if not _user_can_access_location(cur, user, payload.location_id):
      raise HTTPException(403, "No tenés acceso a esta localidad")

    # insertar comando
    cur.execute(
      """
      INSERT INTO public.location_alarm_commands (
        location_id, action, status, requested_by, requested_by_user_id
      )
      VALUES (%s, %s, 'pending', %s, %s)
      RETURNING id, location_id, action, status, requested_at
      """,
      (
        payload.location_id,
        payload.action,
        user.get("email") or user.get("username") or "ui",
        user.get("user_id"),
      ),
    )
    row = cur.fetchone()
    conn.commit()

    return {
      "id": row["id"],
      "location_id": row["location_id"],
      "action": row["action"],
      "status": row["status"],
      "requested_at": row["requested_at"].isoformat(),
      "location_name": loc["name"],
    }
