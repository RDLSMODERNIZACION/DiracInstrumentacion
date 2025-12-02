# app/routes/arduino_controler.py

import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from app.db import get_conn
from psycopg.rows import dict_row

router = APIRouter(prefix="/arduino-controler", tags=["arduino"])

# -----------------------------------------------------------
# MODELO DEL HEARTBEAT QUE ENVÍA EL PLC / NODE-RED
# -----------------------------------------------------------

class HeartbeatIn(BaseModel):
    pump_id: int
    state: str | None = None          # "run" / "stop" (opcional)
    relay: bool | None = None         # true / false (opcional)
    di01_raw: str | int | None = None
    fw: str | None = None
    uptime: int | None = None
    # Agregá acá más campos si los estás mandando (AI01, AI02, etc.)


# -----------------------------------------------------------
# POST /heartbeat  (NUEVO CORRECTO)
# -----------------------------------------------------------

@router.post("/heartbeat")
def receive_heartbeat(hb: HeartbeatIn):
    """
    Recibe el estado de la bomba desde PLC/Node-RED.
    Guarda:
        - payload JSON completo
        - plc_state ("run" / "stop") proveniente del PLC
    """

    # ----------------------------------------
    # DETERMINAR ESTADO DEL PLC
    # ----------------------------------------
    if hb.state is not None:
        plc_state = hb.state.lower().strip()
    elif hb.relay is not None:
        plc_state = "run" if hb.relay else "stop"
    else:
        plc_state = None

    # validar
    if plc_state is not None and plc_state not in ("run", "stop"):
        logging.warning(f"Heartbeat inválido: plc_state={plc_state} para pump_id={hb.pump_id}")
        plc_state = None

    # ----------------------------------------
    # INSERTAR HEARTBEAT EN DB
    # ----------------------------------------
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            INSERT INTO public.pump_heartbeat (pump_id, payload, plc_state)
            VALUES (%s, %s, %s)
            RETURNING id, created_at
            """,
            (hb.pump_id, hb.dict(), plc_state)
        )
        row = cur.fetchone()
        conn.commit()

    return {
        "ok": True,
        "hb_id": row["id"],
        "ts": row["created_at"],
        "plc_state": plc_state,
    }
