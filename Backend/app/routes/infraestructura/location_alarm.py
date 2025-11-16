# app/routes/infraestructura/location_alarm.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Literal
from psycopg.rows import dict_row

from app.db import get_conn

router = APIRouter(prefix="/infraestructura", tags=["infraestructura-alarmas"])

# ---- modelo de entrada ----

class LocationAlarmRequest(BaseModel):
    location_id: int
    action: Literal["on", "off", "pulse"] = "on"


# ---- endpoint UI: crear comando de alarma (luces + sirena) SIN seguridad ----

@router.post("/location_alarm", status_code=201)
def create_location_alarm_command(
    payload: LocationAlarmRequest,
):
    """
    Crea un comando de alarma por localidad SIN autenticación.
    Lo consumirá el PLC desde la carpeta /plc.

    ⚠️ IMPORTANTE:
    Esto es sólo para pruebas. Después conviene volver a agregar require_user
    y los chequeos de permisos por localidad.
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

        # insertar comando (sin usuario autenticado)
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
                "public-ui",  # identificador genérico
                None,         # sin user_id
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
