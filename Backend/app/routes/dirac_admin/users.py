from fastapi import APIRouter, Depends, HTTPException, Query
from psycopg.rows import dict_row
from pydantic import BaseModel
from app.db import get_conn
from app.security import require_user

router = APIRouter(prefix="/dirac/admin", tags=["admin-users"])

class UserPatch(BaseModel):
    full_name: str | None = None
    status: str | None = None  # 'active'|'disabled' opcional

@router.get("/users", summary="Listar usuarios o filtrar por empresa/localización/email (admin)")
def list_users(
    email: str | None = Query(default=None),
    company_id: int | None = Query(default=None),
    location_id: int | None = Query(default=None),
    user=Depends(require_user),
):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        # Debe ser admin/owner en alguna empresa
        cur.execute("SELECT EXISTS(SELECT 1 FROM company_users WHERE user_id=%s AND role IN ('owner','admin')) AS ok", (user["user_id"],))
        if not cur.fetchone()["ok"]:
            raise HTTPException(403, "Requiere owner/admin")

        if email:
            cur.execute("SELECT id, email, full_name, status FROM app_users WHERE email=%s", (email,))
            row = cur.fetchone()
            return row or {}

        if company_id and location_id:
            # Intersección: miembros de la empresa que además tienen acceso efectivo a esa location
            cur.execute("""
              SELECT DISTINCT u.id, u.email, u.full_name, u.status
              FROM app_users u
              JOIN company_users cu ON cu.user_id = u.id AND cu.company_id = %s
              JOIN v_user_locations vul ON vul.user_id = u.id AND vul.location_id = %s
              ORDER BY u.id DESC
            """, (company_id, location_id))
            return cur.fetchall() or []

        if company_id:
            cur.execute("""
              SELECT u.id, u.email, u.full_name, u.status
              FROM company_users cu
              JOIN app_users u ON u.id = cu.user_id
              WHERE cu.company_id=%s
              ORDER BY u.id DESC
            """, (company_id,))
            return cur.fetchall() or []

        if location_id:
            cur.execute("""
              SELECT DISTINCT u.id, u.email, u.full_name, u.status
              FROM v_user_locations vul
              JOIN app_users u ON u.id = vul.user_id
              WHERE vul.location_id = %s
              ORDER BY u.id DESC
            """, (location_id,))
            return cur.fetchall() or []

        cur.execute("SELECT id, email, full_name, status FROM app_users ORDER BY id DESC LIMIT 500")
        return cur.fetchall() or []

@router.patch("/users/{user_id}", summary="Actualizar datos de un usuario (admin)")
def patch_user(user_id: int, payload: UserPatch, user=Depends(require_user)):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute("SELECT EXISTS(SELECT 1 FROM company_users WHERE user_id=%s AND role IN ('owner','admin')) AS ok", (user["user_id"],))
        if not cur.fetchone()["ok"]:
            raise HTTPException(403, "Requiere owner/admin")
        cur.execute(
            "UPDATE app_users SET full_name=COALESCE(%s,full_name), status=COALESCE(%s,status) WHERE id=%s "
            "RETURNING id, email, full_name, status",
            (payload.full_name, payload.status, user_id)
        )
        row = cur.fetchone(); conn.commit()
        return row or {}

@router.get("/users/{user_id}/companies", summary="Empresas del usuario y roles (admin)")
def user_companies(user_id: int, user=Depends(require_user)):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute("SELECT EXISTS(SELECT 1 FROM company_users WHERE user_id=%s AND role IN ('owner','admin')) AS ok", (user["user_id"],))
        if not cur.fetchone()["ok"]:
            raise HTTPException(403, "Requiere owner/admin")
        cur.execute("""
          SELECT cu.company_id, c.name, cu.role, cu.is_primary
          FROM company_users cu JOIN companies c ON c.id = cu.company_id
          WHERE cu.user_id=%s
          ORDER BY cu.role DESC, c.name
        """, (user_id,))
        return cur.fetchall() or []

@router.get("/users/{user_id}/locations", summary="Accesos del usuario a localizaciones (efectivo y explícito)")
def user_locations(user_id: int, company_id: int | None = Query(default=None), user=Depends(require_user)):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute("SELECT EXISTS(SELECT 1 FROM company_users WHERE user_id=%s AND role IN ('owner','admin')) AS ok", (user["user_id"],))
        if not cur.fetchone()["ok"]:
            raise HTTPException(403, "Requiere owner/admin")

        # Efectivos (heredados por rol + explícitos)
        if company_id:
            cur.execute("""
              SELECT vul.location_id, vul.location_name, vul.access, vul.company_id
              FROM v_user_locations vul
              WHERE vul.user_id=%s AND vul.company_id=%s
              ORDER BY vul.location_name
            """, (user_id, company_id))
        else:
            cur.execute("""
              SELECT vul.location_id, vul.location_name, vul.access, vul.company_id
              FROM v_user_locations vul
              WHERE vul.user_id=%s
              ORDER BY vul.location_name
            """, (user_id,))
        effective = cur.fetchall() or []

        # Explícitos (user_location_access)
        if company_id:
            cur.execute("""
              SELECT ula.location_id, l.name AS location_name, ula.access
              FROM user_location_access ula
              JOIN locations l ON l.id = ula.location_id
              WHERE ula.user_id=%s AND l.company_id=%s
              ORDER BY l.name
            """, (user_id, company_id))
        else:
            cur.execute("""
              SELECT ula.location_id, l.name AS location_name, ula.access
              FROM user_location_access ula
              JOIN locations l ON l.id = ula.location_id
              WHERE ula.user_id=%s
              ORDER BY l.name
            """, (user_id,))
        explicit = cur.fetchall() or []

        return {"effective": effective, "explicit": explicit}

@router.delete("/users/{user_id}/locations/{location_id}", summary="Quitar acceso explícito a una localización (admin)")
def delete_user_location(user_id: int, location_id: int, user=Depends(require_user)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("SELECT EXISTS(SELECT 1 FROM company_users WHERE user_id=%s AND role IN ('owner','admin')) AS ok", (user["user_id"],))
        if not cur.fetchone()[0]:
            raise HTTPException(403, "Requiere owner/admin")
        cur.execute("DELETE FROM user_location_access WHERE user_id=%s AND location_id=%s", (user_id, location_id))
        conn.commit()
        return {"ok": True}
