# app/routes/dirac_admin/pumps.py
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from psycopg.rows import dict_row
from pydantic import BaseModel, constr

from app.db import get_conn
from app.security import require_user
from .location_utils import ensure_location_id

router = APIRouter(prefix="/dirac/admin", tags=["admin-pumps"])

# -----------------------------
# Modelos
# -----------------------------

class PumpCreate(BaseModel):
    name: str
    location_id: Optional[int] = None
    company_id: Optional[int] = None
    location_name: Optional[str] = None
    pin_code: Optional[constr(pattern=r"^\d{4}$")] = None
    require_pin: Optional[bool] = None

class PumpPatch(BaseModel):
    name: Optional[str] = None
    location_id: Optional[int] = None
    company_id: Optional[int] = None
    location_name: Optional[str] = None
    pin_code: Optional[constr(pattern=r"^\d{4}$")] = None
    require_pin: Optional[bool] = None

# -----------------------------
# Helpers permisos/metadata
# -----------------------------

def _is_superadmin(user) -> bool:
    try:
        return bool(user.get("superadmin"))
    except Exception:
        return False

def _assert_admin_company(cur, user, company_id: Optional[int]):
    """Requiere owner/admin en la empresa (o superadmin)."""
    if company_id is None:
        raise HTTPException(400, "La ubicación debe pertenecer a una empresa")
    if _is_superadmin(user):
        return
    cur.execute(
        """
        SELECT 1
        FROM company_users
        WHERE user_id=%s AND company_id=%s AND role IN ('owner','admin')
        LIMIT 1
        """,
        (user["user_id"], company_id),
    )
    if not cur.fetchone():
        raise HTTPException(403, "Requiere owner/admin en la empresa")

def _location_company_id(cur, location_id: int) -> Optional[int]:
    cur.execute("SELECT company_id FROM locations WHERE id=%s", (location_id,))
    row = cur.fetchone()
    return row["company_id"] if row else None

def _pump_company_id(cur, pump_id: int) -> Optional[int]:
    cur.execute(
        """
        SELECT l.company_id
        FROM pumps p
        LEFT JOIN locations l ON l.id = p.location_id
        WHERE p.id=%s
        """,
        (pump_id,),
    )
    row = cur.fetchone()
    return row["company_id"] if row else None

# -----------------------------
# GET: listar (viewer-safe) con filtros
# -----------------------------

@router.get("/pumps", summary="Listar bombas (con filtros por empresa/ubicación)")
def list_pumps(
    company_id: Optional[int] = Query(None),
    location_id: Optional[int] = Query(None),
    user=Depends(require_user),
):
    """
    - Superadmin: lista todo (con filtros si vienen).
    - Usuario normal: lista SOLO lo que puede ver (JOIN v_user_locations).
    SQL dinámico (sin 'param IS NULL') → evita AmbiguousParameter.
    """
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        if _is_superadmin(user):
            q = """
            SELECT p.id, p.name, p.location_id
            FROM pumps p
            LEFT JOIN locations l ON l.id = p.location_id
            """
            conds, params = [], []
            if company_id is not None:
                conds.append("l.company_id = %s")
                params.append(company_id)
            if location_id is not None:
                conds.append("p.location_id = %s")
                params.append(location_id)
            if conds:
                q += " WHERE " + " AND ".join(conds)
            q += " ORDER BY p.id DESC"
            cur.execute(q, params)
            return cur.fetchall() or []

        # usuario no superadmin: restringido por accesos efectivos
        q = """
        SELECT p.id, p.name, p.location_id
        FROM pumps p
        JOIN v_user_locations v
          ON v.location_id = p.location_id
         AND v.user_id = %s
        """
        conds, params = [], [user["user_id"]]
        if company_id is not None:
            conds.append("v.company_id = %s")
            params.append(company_id)
        if location_id is not None:
            conds.append("p.location_id = %s")
            params.append(location_id)
        if conds:
            q += " WHERE " + " AND ".join(conds)
        q += " ORDER BY p.id DESC"
        cur.execute(q, params)
        return cur.fetchall() or []

# -----------------------------
# POST: crear (owner/admin)
# -----------------------------

@router.post("/pumps", summary="Crear bomba (owner/admin)", status_code=201)
def create_pump(payload: PumpCreate, user=Depends(require_user)):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        # Determinar empresa objetivo y validar permisos
        target_company_id: Optional[int] = None
        if payload.location_id is not None:
            target_company_id = _location_company_id(cur, payload.location_id)
            if target_company_id is None:
                raise HTTPException(404, "Ubicación no encontrada")
        else:
            if not payload.company_id or not (payload.location_name or "").strip():
                raise HTTPException(400, "company_id y location_name son requeridos si no pasás location_id")
            target_company_id = payload.company_id

        _assert_admin_company(cur, user, target_company_id)

        # Resolver/crear location_id
        loc_id = ensure_location_id(
            conn,
            user["user_id"],
            payload.location_id,
            payload.company_id,
            (payload.location_name or "").strip() or None,
        )

        try:
            cur.execute(
                """
                INSERT INTO pumps(name, location_id, pin_code, require_pin)
                VALUES(%s, %s, COALESCE(%s,'0000'), COALESCE(%s,true))
                RETURNING id, name, location_id
                """,
                ( (payload.name or "").strip(), loc_id, payload.pin_code, payload.require_pin ),
            )
            row = cur.fetchone()
            conn.commit()
            return row
        except Exception as e:
            conn.rollback()
            raise HTTPException(400, f"Create pump error: {e}")

# -----------------------------
# PATCH: actualizar (owner/admin)
# -----------------------------

@router.patch("/pumps/{pump_id}", summary="Actualizar bomba (owner/admin)")
def update_pump(pump_id: int, payload: PumpPatch, user=Depends(require_user)):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        # Estado actual
        cur.execute(
            """
            SELECT p.id, p.name, p.location_id, l.company_id
            FROM pumps p
            LEFT JOIN locations l ON l.id = p.location_id
            WHERE p.id=%s
            """,
            (pump_id,),
        )
        current = cur.fetchone()
        if not current:
            raise HTTPException(404, "Bomba no encontrada")

        # Resolver nueva ubicación (si corresponde) y empresa objetivo
        loc_id = None
        target_company_id = current["company_id"]  # por defecto la actual

        wants_change_location = (
            payload.location_id is not None
            or (payload.company_id is not None and (payload.location_name or "").strip())
        )
        if wants_change_location:
            if payload.location_id is not None:
                loc_company_id = _location_company_id(cur, payload.location_id)
                if loc_company_id is None:
                    raise HTTPException(404, "Ubicación destino no encontrada")
                target_company_id = loc_company_id
                loc_id = payload.location_id
            else:
                if not payload.company_id or not (payload.location_name or "").strip():
                    raise HTTPException(400, "company_id y location_name requeridos para crear ubicación")
                target_company_id = payload.company_id
                loc_id = ensure_location_id(
                    conn,
                    user["user_id"],
                    None,
                    payload.company_id,
                    (payload.location_name or "").strip(),
                )

        # Permiso en la empresa objetivo (si no cambió, valida sobre la actual)
        _assert_admin_company(cur, user, target_company_id)

        new_name = (payload.name or "").strip() if (payload.name is not None) else None

        try:
            if new_name is None and loc_id is None and payload.pin_code is None and payload.require_pin is None:
                # Nada para actualizar → devolvemos estado actual
                return {
                    "id": current["id"],
                    "name": current["name"],
                    "location_id": current["location_id"],
                }

            cur.execute(
                """
                UPDATE pumps
                   SET name       = COALESCE(%s, name),
                       location_id = COALESCE(%s, location_id),
                       pin_code    = COALESCE(%s, pin_code),
                       require_pin = COALESCE(%s, require_pin)
                 WHERE id = %s
                 RETURNING id, name, location_id
                """,
                (new_name, loc_id, payload.pin_code, payload.require_pin, pump_id),
            )
            row = cur.fetchone()
            conn.commit()
            return row or {}
        except Exception as e:
            conn.rollback()
            raise HTTPException(400, f"Update pump error: {e}")

# -----------------------------
# DELETE: eliminar (owner/admin)
# -----------------------------

@router.delete("/pumps/{pump_id}", summary="Eliminar bomba (owner/admin)", status_code=204)
def delete_pump(pump_id: int, user=Depends(require_user)):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        company_id = _pump_company_id(cur, pump_id)
        if company_id is None:
            raise HTTPException(404, "Bomba no encontrada")
        _assert_admin_company(cur, user, company_id)

        try:
            cur.execute("DELETE FROM pumps WHERE id=%s", (pump_id,))
            if cur.rowcount == 0:
                raise HTTPException(404, "Bomba no encontrada")
            conn.commit()
            return  # 204
        except Exception as e:
            conn.rollback()
            raise HTTPException(400, f"Delete pump error: {e}")
