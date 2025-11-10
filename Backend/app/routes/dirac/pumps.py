# Backend/app/routes/dirac/pumps.py
from typing import Optional, Literal, List
from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, field_validator
from psycopg.rows import dict_row

from app.db import get_conn

router = APIRouter(prefix="/dirac/pumps", tags=["dirac-pumps"])

# ---------- Modelos ----------

class CommandIn(BaseModel):
    action: Literal["start", "stop"]
    pin: Optional[str] = None

    @field_validator("pin")
    def pin_len(cls, v):
        # Permitimos None si la bomba no requiere PIN
        if v is None:
            return v
        v = v.strip()
        if v and (len(v) != 4 or not v.isdigit()):
            raise ValueError("El PIN debe tener 4 dígitos")
        return v


# ---------- Helpers ----------

def _get_user_labels_from_request(request: Request) -> tuple[Optional[str], Optional[int]]:
    """
    Devuelve etiquetas útiles para auditoría. Adaptalo a tu auth real:
      - email en request.state.user.email (si existe)
      - id en request.state.user.id (si existe)
    Si no hay sesión, cae a None/None.
    """
    try:
        u = getattr(request.state, "user", None)
        if not u:
            return None, None
        email = getattr(u, "email", None) or getattr(u, "name", None)
        uid = getattr(u, "id", None)
        # normalizar entero
        try:
            uid = int(uid) if uid is not None else None
        except Exception:
            uid = None
        return (email, uid)
    except Exception:
        return (None, None)


def _ensure_pump_visible(cur, pump_id: int, company_id: Optional[int]) -> dict:
    """
    Trae la fila de 'pumps' y valida (si se suministra company_id)
    que la bomba pertenezca a una location de esa empresa.
    """
    if company_id is None:
        cur.execute("""
            SELECT p.id, p.name, p.location_id, p.pin_code, p.require_pin
            FROM public.pumps p
            WHERE p.id = %s
        """, (pump_id,))
    else:
        cur.execute("""
            SELECT p.id, p.name, p.location_id, p.pin_code, p.require_pin
            FROM public.pumps p
            JOIN public.locations l ON l.id = p.location_id
            WHERE p.id = %s AND l.company_id = %s
        """, (pump_id, company_id))
    row = cur.fetchone()
    if not row:
        # 404 si no existe o no pertenece a la empresa indicada
        raise HTTPException(status_code=404, detail="Bomba no encontrada o fuera de alcance de la empresa")
    return row


# ---------- Endpoints ----------

@router.post("/{pump_id}/command")
async def post_pump_command(
    pump_id: int,
    payload: CommandIn,
    request: Request,
    company_id: int | None = Query(default=None)
):
    """
    Crea un comando de bomba ('start' / 'stop'), validando PIN si la bomba lo requiere.

    Flujo:
      1) Verifica que la bomba exista (y pertenezca a company_id si viene en query).
      2) Si require_pin = true, valida payload.pin == pumps.pin_code.
      3) Inserta fila en pump_commands (status = 'pending').
      4) (Opcional) Registra evento en pump_events (source='ui').
    """
    try:
        with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
            # 1) Alcance y datos de la bomba
            pump = _ensure_pump_visible(cur, pump_id, company_id)
            require_pin = bool(pump.get("require_pin"))
            pin_code_db = (pump.get("pin_code") or "").strip()

            # 2) Validación de PIN (si aplica)
            if require_pin:
                pin = (payload.pin or "").strip()
                if not pin:
                    raise HTTPException(status_code=400, detail="Se requiere PIN para operar esta bomba")
                if pin != pin_code_db:
                    # por seguridad: no revelamos el pin real
                    raise HTTPException(status_code=403, detail="PIN inválido")

            # Identidad para auditoría
            req_by_email, req_by_id = _get_user_labels_from_request(request)

            # 3) Registrar comando (status 'pending' para que lo consuma tu service/Node-RED/PLC)
            cur.execute("""
                INSERT INTO public.pump_commands (pump_id, action, status, requested_by, requested_by_user_id)
                VALUES (%s, %s, 'pending', %s, %s)
                RETURNING id, pump_id, action, status, requested_at
            """, (pump_id, payload.action, req_by_email, req_by_id))
            cmd = cur.fetchone()

            # 4) (Opcional) Insertar evento (útil para timeline)
            cur.execute("""
                INSERT INTO public.pump_events (pump_id, state, source, created_by, created_by_user_id)
                VALUES (%s, %s, 'ui', %s, %s)
                RETURNING id, created_at
            """, (pump_id, 'run' if payload.action == 'start' else 'stop', req_by_email, req_by_id))
            ev = cur.fetchone()

            conn.commit()
            return {
                "ok": True,
                "command": cmd,
                "event": ev,
                "require_pin": require_pin
            }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error (pump command): {e}")
