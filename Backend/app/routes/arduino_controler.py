from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, Literal, List
from datetime import datetime, timezone
from app.db import get_conn
from psycopg.rows import dict_row
from psycopg.types.json import Json  # adaptador JSON (psycopg3)
from psycopg import DatabaseError

router = APIRouter(prefix="/arduino-controler", tags=["arduino-controler"])

# ===== Modelos =====

class CommandIn(BaseModel):
    pump_id: int
    action: Literal["start", "stop"]
    user: Optional[str] = None


class HeartbeatIn(BaseModel):
    """
    Modelo para heartbeat del PLC / Node-RED.

    Tu Node-RED hoy está mandando algo como:
      {
        "pump_id": 23,
        "state": "run",
        "relay": true,
        "di01_raw": "1",
        "fw": "m300-node-red 1.0",
        "uptime": 123
      }
    """
    pump_id: int

    # campos PLC (top-level) que usamos para plc_state
    state: Optional[Literal["run", "stop"]] = None
    relay: Optional[bool] = None
    di01_raw: Optional[str | int] = None
    fw: Optional[str] = None
    uptime: Optional[int] = None

    # opcionales extra
    alive: Optional[int] = None
    rssi: Optional[int] = None

    # payload crudo opcional: si lo mandás, se usa; si no, se arma desde todo el modelo
    payload: Optional[dict] = None


class StateIn(BaseModel):
    pump_id: int
    # simple: relay 1/0, mapeado a run/stop
    relay: Optional[int] = None
    # avanzado: directamente 'run'/'stop'
    state: Optional[Literal["run", "stop"]] = None
    source: str = "device"
    user: Optional[str] = None
    command_id: Optional[int] = None


class CommandOut(BaseModel):
    id: int
    pump_id: int
    action: Literal["start", "stop"]
    status: Literal["pending", "sent", "acked", "failed", "expired"]
    requested_at: datetime
    sent_at: Optional[datetime] = None


# ========== Front -> crear comando ==========

@router.post("/command")
def create_command(cmd: CommandIn):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute("SELECT 1 FROM public.pumps WHERE id=%s", (cmd.pump_id,))
        if cur.fetchone() is None:
            raise HTTPException(status_code=404, detail="pump not found")

        cur.execute(
            """
            INSERT INTO public.pump_commands (pump_id, action, status, requested_by)
            VALUES (%s, %s, 'pending', %s)
            RETURNING id
            """,
            (cmd.pump_id, cmd.action, cmd.user),
        )
        row = cur.fetchone()

        cur.execute(
            "UPDATE public.pump_commands SET status='sent', sent_at=now() WHERE id=%s",
            (row["id"],),
        )
        conn.commit()

    return {"ok": True, "command_id": row["id"], "status": "sent"}


# ========== Arduino -> heartbeat (PLC estado + conectividad) ==========

@router.post("/heartbeat")
def push_heartbeat(body: HeartbeatIn):
    """
    Inserta heartbeat de la bomba.

    - Guarda payload JSON completo (todo el body)
    - Calcula y guarda plc_state ('run' / 'stop') según state / relay
    """

    # 1) validar bomba
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute("SELECT 1 FROM public.pumps WHERE id=%s", (body.pump_id,))
        if cur.fetchone() is None:
            raise HTTPException(status_code=404, detail="pump not found")

    # 2) determinar plc_state desde state / relay
    plc_state: Optional[str]

    if body.state is not None:
        plc_state = body.state.lower().strip()
    elif body.relay is not None:
        plc_state = "run" if bool(body.relay) else "stop"
    else:
        plc_state = None

    if plc_state is not None and plc_state not in ("run", "stop"):
        plc_state = None  # descartamos valores raros

    # 3) armar payload JSON que queremos guardar
    #    si vino body.payload, usamos eso; si no, usamos todo el modelo
    if body.payload is not None:
        raw_payload = body.payload
    else:
        # usamos el dict del modelo, sin meter None
        raw_payload = {
            k: v
            for k, v in body.model_dump().items()
            if v is not None and k != "payload"
        }

    payload_json = Json(raw_payload)  # psycopg3 -> json/jsonb
    rssi = body.rssi if body.rssi is not None else None

    # 4) insertar en DB
    try:
        with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                INSERT INTO public.pump_heartbeat (pump_id, rssi, payload, plc_state)
                VALUES (%s, %s, %s, %s)
                RETURNING id, created_at
                """,
                (body.pump_id, rssi, payload_json, plc_state),
            )
            row = cur.fetchone()
            conn.commit()
    except DatabaseError as e:
        raise HTTPException(
            status_code=500,
            detail=f"heartbeat insert failed: {e}",
        ) from e

    return {
        "ok": True,
        "hb_id": row["id"],
        "ts": row["created_at"],
        "plc_state": plc_state,
    }


# Variante ultra simple por querystring (NO guarda plc_state, solo latido)
@router.get("/hb")
def heartbeat_get(pump_id: int = Query(...)):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute("SELECT 1 FROM public.pumps WHERE id=%s", (pump_id,))
        if cur.fetchone() is None:
            raise HTTPException(status_code=404, detail="pump not found")
        cur.execute(
            """
            INSERT INTO public.pump_heartbeat (pump_id)
            VALUES (%s)
            RETURNING id, created_at
            """,
            (pump_id,),
        )
        row = cur.fetchone()
        conn.commit()
    return {"ok": True, "hb_id": row["id"], "ts": row["created_at"]}


# ========== Arduino -> estado real del relé (historial de eventos) ==========

@router.post("/state")
def push_state(body: StateIn):
    """
    Inserta evento de estado (run/stop) en pump_events.
    Esto es el historial; el estado LIVE lo vamos a leer desde plc_state en pump_heartbeat.
    """
    # Mapear entrada simple o avanzada
    if body.state in ("run", "stop"):
        state = body.state
    elif body.relay is not None:
        state = "run" if int(body.relay) == 1 else "stop"
    else:
        raise HTTPException(status_code=422, detail="missing 'state' or 'relay'")

    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute("SELECT 1 FROM public.pumps WHERE id=%s", (body.pump_id,))
        if cur.fetchone() is None:
            raise HTTPException(status_code=404, detail="pump not found")

        cur.execute(
            """
            INSERT INTO public.pump_events (pump_id, state, source, created_by)
            VALUES (%s, %s, %s, %s)
            RETURNING id, created_at
            """,
            (body.pump_id, state, body.source, body.user),
        )
        ev = cur.fetchone()

        if body.command_id is not None:
            cur.execute(
                """
                UPDATE public.pump_commands
                SET status='acked', acked_at=now()
                WHERE id=%s AND pump_id=%s AND status IN ('pending','sent')
                """,
                (body.command_id, body.pump_id),
            )

        conn.commit()

    return {"ok": True, "event_id": ev["id"], "state": state, "ts": ev["created_at"]}


# Variante ultra simple por querystring
@router.get("/st")
def state_get(pump_id: int = Query(...), relay: int = Query(...)):
    state = "run" if int(relay) == 1 else "stop"
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute("SELECT 1 FROM public.pumps WHERE id=%s", (pump_id,))
        if cur.fetchone() is None:
            raise HTTPException(status_code=404, detail="pump not found")
        cur.execute(
            """
            INSERT INTO public.pump_events (pump_id, state, source)
            VALUES (%s, %s, 'device')
            RETURNING id, created_at
            """,
            (pump_id, state),
        )
        ev = cur.fetchone()
        conn.commit()
    return {"ok": True, "event_id": ev["id"], "state": state, "ts": ev["created_at"]}


# ========== Backend -> Arduino: comandos pendientes (pull) ==========

@router.get("/next_commands")
def next_commands(
    pump_id: int = Query(...),
    limit: int = Query(5, ge=1, le=50),
):
    now = datetime.now(timezone.utc)
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            SELECT id, pump_id, action, status, requested_at, sent_at
            FROM public.pump_commands
            WHERE pump_id=%s AND status IN ('pending','sent')
            ORDER BY requested_at ASC
            LIMIT %s
            """,
            (pump_id, limit),
        )
        rows = cur.fetchall()

        ids_to_mark = [r["id"] for r in rows if r["status"] == "pending"]
        if ids_to_mark:
            cur.execute(
                """
                UPDATE public.pump_commands
                SET status='sent', sent_at=%s
                WHERE id = ANY(%s)
                """,
                (now, ids_to_mark),
            )
            for r in rows:
                if r["id"] in ids_to_mark:
                    r["status"] = "sent"
                    r["sent_at"] = now
        conn.commit()

    cmds: List[CommandOut] = [
        CommandOut(
            id=r["id"],
            pump_id=r["pump_id"],
            action=r["action"],
            status=r["status"],
            requested_at=r["requested_at"],
            sent_at=r.get("sent_at"),
        )
        for r in rows
    ]
    return {"commands": [c.model_dump() for c in cmds]}
