from fastapi import APIRouter, Depends, HTTPException
from psycopg.rows import dict_row
from pydantic import BaseModel
from app.db import get_conn
from app.security import require_user
from .location_utils import ensure_location_id

router = APIRouter(prefix="/dirac/admin", tags=["admin-valves"])

ALLOWED_KINDS = {"branch", "outlet", "isolation", "high", "gravity"}

class ValveCreate(BaseModel):
    name: str
    # Modalidad A: referenciar ubicación existente
    location_id: int | None = None
    # Modalidad B: crear/usar ubicación por (empresa + nombre)
    company_id: int | None = None
    location_name: str | None = None
    # Otros
    kind: str | None = None

class ValvePatch(BaseModel):
    name: str | None = None
    location_id: int | None = None
    company_id: int | None = None
    location_name: str | None = None
    kind: str | None = None

@router.get("/valves", summary="Listar válvulas (admin)")
def list_valves(user=Depends(require_user)):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            "SELECT EXISTS(SELECT 1 FROM company_users WHERE user_id=%s AND role IN ('owner','admin')) AS ok",
            (user["user_id"],)
        )
        if not cur.fetchone()["ok"]:
            raise HTTPException(403, "Requiere owner/admin")
        cur.execute("SELECT id, name, location_id, kind FROM valves ORDER BY id DESC")
        return cur.fetchall() or []

@router.post("/valves", summary="Crear válvula (admin)")
def create_valve(payload: ValveCreate, user=Depends(require_user)):
    kind = (payload.kind or "branch").strip().lower()
    if kind not in ALLOWED_KINDS:
        raise HTTPException(400, f"kind inválido. Permitidos: {sorted(ALLOWED_KINDS)}")

    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        # Resolver location_id a partir de A o B
        loc_id = ensure_location_id(conn, user["user_id"], payload.location_id, payload.company_id, payload.location_name)

        try:
            cur.execute(
                "INSERT INTO valves(name, location_id, kind) VALUES(%s,%s,%s) "
                "RETURNING id, name, location_id, kind",
                (payload.name, loc_id, kind)
            )
            row = cur.fetchone(); conn.commit()
            return row
        except Exception as e:
            conn.rollback()
            raise HTTPException(400, f"Create valve error: {e}")

@router.patch("/valves/{valve_id}", summary="Actualizar válvula (admin)")
def update_valve(valve_id: int, payload: ValvePatch, user=Depends(require_user)):
    new_kind = payload.kind.strip().lower() if payload.kind else None
    if new_kind and new_kind not in ALLOWED_KINDS:
        raise HTTPException(400, f"kind inválido. Permitidos: {sorted(ALLOWED_KINDS)}")

    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        loc_id = None
        if payload.location_id is not None or (payload.company_id and payload.location_name):
            loc_id = ensure_location_id(conn, user["user_id"], payload.location_id, payload.company_id, payload.location_name)

        try:
            cur.execute(
                "UPDATE valves SET "
                "name = COALESCE(%s, name), "
                "location_id = COALESCE(%s, location_id), "
                "kind = COALESCE(%s, kind) "
                "WHERE id=%s "
                "RETURNING id, name, location_id, kind",
                (payload.name, loc_id, new_kind, valve_id)
            )
            row = cur.fetchone(); conn.commit()
            return row or {}
        except Exception as e:
            conn.rollback()
            raise HTTPException(400, f"Update valve error: {e}")
