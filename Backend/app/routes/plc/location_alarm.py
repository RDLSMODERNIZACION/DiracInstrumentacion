# app/routes/plc/location_alarm.py
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Literal, Optional
from psycopg.rows import dict_row

from app.db import get_conn

router = APIRouter(tags=["plc-location-alarm"])

# Modelo para ACK desde PLC
class LocationAlarmAck(BaseModel):
  status: Literal["sent", "acked", "failed"]
  fail_reason: Optional[str] = None
  # estado resultante de la alarma (para registrar evento)
  state: Optional[Literal["on", "off"]] = None


@router.get("/location_alarm/pending")
def get_pending_location_alarm_commands(
  limit: int = Query(50, ge=1, le=500),
  location_id: Optional[int] = Query(None),
  company_id: Optional[int] = Query(None),
):
  """
  Endopoint para el PLC / Node-RED:
  devuelve comandos de alarma pendientes (status = 'pending'),
  filtrables por location_id y/o company_id.
  """
  with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
    conds = ["c.status = 'pending'"]
    params: list = []

    if location_id is not None:
      conds.append("c.location_id = %s")
      params.append(location_id)

    if company_id is not None:
      conds.append("l.company_id = %s")
      params.append(company_id)

    sql = f"""
      SELECT
        c.id,
        c.location_id,
        l.name AS location_name,
        l.company_id,
        c.action,
        c.status,
        c.requested_at
      FROM public.location_alarm_commands c
      JOIN public.locations l ON l.id = c.location_id
      WHERE {" AND ".join(conds)}
      ORDER BY c.requested_at
      LIMIT %s
    """
    params.append(limit)

    cur.execute(sql, params)
    rows = cur.fetchall()

    return [
      {
        "id": r["id"],
        "location_id": r["location_id"],
        "location_name": r["location_name"],
        "company_id": r["company_id"],
        "action": r["action"],
        "status": r["status"],
        "requested_at": r["requested_at"].isoformat(),
      }
      for r in rows
    ]


@router.post("/location_alarm/{command_id}/ack")
def ack_location_alarm_command(command_id: int, payload: LocationAlarmAck):
  """
  Endopoint que el PLC llama después de intentar ejecutar el comando.
  - Actualiza status en location_alarm_commands.
  - Opcionalmente registra un evento on/off en location_alarm_events.
  """
  with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
    # Traer comando y localidad
    cur.execute(
      """
      SELECT c.id, c.location_id, c.status, c.action, l.name AS location_name
      FROM public.location_alarm_commands c
      JOIN public.locations l ON l.id = c.location_id
      WHERE c.id = %s
      """,
      (command_id,),
    )
    cmd = cur.fetchone()
    if not cmd:
      raise HTTPException(404, "Comando no encontrado")

    # Evitar re-ack de cosas ya cerradas
    if cmd["status"] in ("acked", "failed", "expired"):
      raise HTTPException(400, f"Comando ya está en estado {cmd['status']}")

    # Actualizar comando
    cur.execute(
      """
      UPDATE public.location_alarm_commands
      SET status = %s,
          sent_at = COALESCE(sent_at, now()),
          acked_at = CASE
                        WHEN %s = 'acked' THEN now()
                        ELSE acked_at
                     END,
          fail_reason = %s
      WHERE id = %s
      """,
      (payload.status, payload.status, payload.fail_reason, command_id),
    )

    # Registrar evento de estado si viene state
    if payload.state is not None:
      cur.execute(
        """
        INSERT INTO public.location_alarm_events (
          location_id, state, source, created_by
        )
        VALUES (%s, %s, 'plc', 'plc-node')
        """,
        (cmd["location_id"], payload.state),
      )

    conn.commit()

    return {
      "ok": True,
      "command_id": command_id,
      "location_id": cmd["location_id"],
      "location_name": cmd["location_name"],
      "new_status": payload.status,
    }
