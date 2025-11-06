from fastapi import APIRouter, Depends, HTTPException, Query
from psycopg.rows import dict_row
from pydantic import BaseModel, field_validator
from typing import Optional

from app.db import get_conn
from app.security import require_user
from .location_utils import ensure_location_id

router = APIRouter(prefix="/dirac/admin", tags=["admin-tanks"])

# -----------------------------
# Modelos
# -----------------------------

class TankCreate(BaseModel):
    name: str
    location_id: Optional[int] = None
    company_id: Optional[int] = None
    location_name: Optional[str] = None

    @field_validator("name")
    @classmethod
    def _name_trim(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("name requerido")
        return v

class TankPatch(BaseModel):
    name: Optional[str] = None
    location_id: Optional[int] = None
    company_id: Optional[int] = None
    location_name: Optional[str] = None

    @field_validator("name")
    @classmethod
    def _name_trim(cls, v: Optional[str]) -> Optional[str]:
        return (v or "").strip() if v is not None else v

# -----------------------------
# Helpers de permisos
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

def _tank_company_id(cur, tank_id: int) -> Optional[int]:
    """Obtiene company_id de un tanque vía su location."""
    cur.execute(
        """
        SELECT l.company_id
        FROM tanks t
        LEFT JOIN locations l ON l.id = t.location_id
        WHERE t.id=%s
        """,
        (tank_id,),
    )
    row = cur.fetchone()
    return row["company_id"] if row else None

def _location_company_id(cur, location_id: int) -> Optional[int]:
    cur.execute("SELECT company_id FROM locations WHERE id=%s", (location_id,))
    row = cur.fetchone()
    return row["company_id"] if row else None

# -----------------------------
# Listar (VIEW-Like dentro de /admin)
# -----------------------------

@router.get("/tanks", summary="Listar tanques (con filtros por empresa/ubicación)")
def list_tanks(
    company_id: Optional[int] = Query(None),
    location_id: Optional[int] = Query(None),
    user=Depends(require_user),
):
    """
    - Si superadmin: lista todo (con filtros opcionales).
    - Si no: lista SOLO lo que el usuario puede ver (join a v_user_locations).
    Evita 403 para usuarios con rol 'viewer' y hace que el front pueda listar.
    """
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        if _is_superadmin(user):
            cur.execute(
                """
                SELECT t.id, t.name, t.location_id
                FROM tanks t
                LEFT JOIN locations l ON l.id = t.location_id
                WHERE (%(cid)s IS NULL OR l.company_id = %(cid)s)
                  AND (%(lid)s IS NULL OR t.location_id = %(lid)s)
                ORDER BY t.id DESC
                """,
                {"cid": company_id, "lid": location_id},
            )
            return cur.fetchall() or []

        # Usuario normal: restringir por accesos efectivos (empresa/ubicación)
        cur.execute(
            """
            SELECT t.id, t.name, t.location_id
            FROM tanks t
            JOIN v_user_locations v
              ON v.location_id = t.location_id
             AND v.user_id = %(uid)s
            WHERE (%(cid)s IS NULL OR v.company_id = %(cid)s)
              AND (%(lid)s IS NULL OR t.location_id = %(lid)s)
            ORDER BY t.id DESC
            """,
            {"uid": user["user_id"], "cid": company_id, "lid": location_id},
        )
        return cur.fetchall() or []

# -----------------------------
# Crear
# -----------------------------

@router.post("/tanks", summary="Crear tanque (owner/admin)", status_code=201)
def create_tank(payload: TankCreate, user=Depends(require_user)):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        # Determinar empresa objetivo y validar permisos
        target_company_id: Optional[int] = None

        if payload.location_id is not None:
            target_company_id = _location_company_id(cur, payload.location_id)
            if target_company_id is None:
                raise HTTPException(404, "Ubicación no encontrada")
        else:
            # Se espera company_id + location_name para crear la nueva ubicación
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
                "INSERT INTO tanks(name, location_id) VALUES(%s,%s) RETURNING id, name, location_id",
                (payload.name.strip(), loc_id),
            )
            row = cur.fetchone()
            conn.commit()
            return row
        except Exception as e:
            conn.rollback()
            raise HTTPException(400, f"Create tank error: {e}")

# -----------------------------
# Actualizar
# -----------------------------

@router.patch("/tanks/{tank_id}", summary="Actualizar tanque (owner/admin)")
def update_tank(tank_id: int, payload: TankPatch, user=Depends(require_user)):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        # Fetch actual para conocer empresa actual
        cur.execute(
            """
            SELECT t.id, t.name, t.location_id, l.company_id
            FROM tanks t
            LEFT JOIN locations l ON l.id = t.location_id
            WHERE t.id=%s
            """,
            (tank_id,),
        )
        current = cur.fetchone()
        if not current:
            raise HTTPException(404, "Tanque no encontrado")

        # Resolver nueva ubicación (si se pide) y empresa objetivo
        loc_id = None
        target_company_id = current["company_id"]

        wants_change_location = (
            payload.location_id is not None or
            (payload.company_id is not None and (payload.location_name or "").strip())
        )

        if wants_change_location:
            # Si pasa location_id -> usamos esa location
            if payload.location_id is not None:
                loc_company_id = _location_company_id(cur, payload.location_id)
                if loc_company_id is None:
                    raise HTTPException(404, "Ubicación destino no encontrada")
                target_company_id = loc_company_id
                loc_id = payload.location_id
            else:
                # crear/asegurar nueva ubicación con company_id + location_name
                if not payload.company_id or not (payload.location_name or "").strip():
                    raise HTTPException(400, "company_id y location_name requeridos para crear ubicación")
                target_company_id = payload.company_id
                # ensure_location_id crea y devuelve id
                loc_id = ensure_location_id(
                    conn,
                    user["user_id"],
                    None,
                    payload.company_id,
                    (payload.location_name or "").strip(),
                )

        # Validar permisos de admin/owner en la empresa objetivo
        _assert_admin_company(cur, user, target_company_id)

        # Construir UPDATE dinámico
        new_name = payload.name.strip() if (payload.name is not None) else None
        try:
            if new_name is None and loc_id is None:
                # Nada para actualizar: devolver estado actual
                return {
                    "id": current["id"],
                    "name": current["name"],
                    "location_id": current["location_id"],
                }

            cur.execute(
                """
                UPDATE tanks
                   SET name = COALESCE(%s, name),
                       location_id = COALESCE(%s, location_id)
                 WHERE id = %s
                 RETURNING id, name, location_id
                """,
                (new_name, loc_id, tank_id),
            )
            row = cur.fetchone()
            conn.commit()
            return row or {}
        except Exception as e:
            conn.rollback()
            raise HTTPException(400, f"Update tank error: {e}")

# -----------------------------
# Borrar
# -----------------------------

@router.delete("/tanks/{tank_id}", summary="Eliminar tanque (owner/admin)", status_code=204)
def delete_tank(tank_id: int, user=Depends(require_user)):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        # Validar permiso sobre la empresa del tanque
        company_id = _tank_company_id(cur, tank_id)
        if company_id is None:
            # No existe
            raise HTTPException(404, "Tanque no encontrado")
        _assert_admin_company(cur, user, company_id)

        try:
            cur.execute("DELETE FROM tanks WHERE id=%s", (tank_id,))
            if cur.rowcount == 0:
                raise HTTPException(404, "Tanque no encontrado")
            conn.commit()
            return  # 204 No Content
        except Exception as e:
            conn.rollback()
            raise HTTPException(400, f"Delete tank error: {e}")
