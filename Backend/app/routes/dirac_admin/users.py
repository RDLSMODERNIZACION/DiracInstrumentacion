# app/routes/dirac_admin/users.py
from fastapi import APIRouter, Depends, HTTPException, Query
from psycopg.rows import dict_row
from pydantic import BaseModel
from app.db import get_conn
from app.security import require_user

router = APIRouter(prefix="/dirac/admin", tags=["admin-users"])


# ===================== helpers de permisos =====================

def _assert_any_admin(cur, user: dict) -> None:
    """Requiere owner/admin en alguna empresa, salvo superadmin."""
    if user.get("superadmin"):
        return
    cur.execute(
        "SELECT EXISTS(SELECT 1 FROM company_users WHERE user_id=%s AND role IN ('owner','admin')) AS ok",
        (user["user_id"],),
    )
    if not cur.fetchone()["ok"]:
        raise HTTPException(403, "Requiere owner/admin (o superadmin)")

def _assert_admin_in_company(cur, user: dict, company_id: int) -> None:
    """Requiere owner/admin en la empresa, salvo superadmin."""
    if user.get("superadmin"):
        return
    cur.execute(
        """
        SELECT EXISTS(
          SELECT 1 FROM company_users
          WHERE user_id=%s AND company_id=%s AND role IN ('owner','admin')
        ) AS ok
        """,
        (user["user_id"], company_id),
    )
    if not cur.fetchone()["ok"]:
        raise HTTPException(403, "Requiere owner/admin en la empresa (o superadmin)")

def _company_of_location(cur, location_id: int) -> int | None:
    cur.execute("SELECT company_id FROM locations WHERE id=%s", (location_id,))
    r = cur.fetchone()
    return int(r["company_id"]) if r and r["company_id"] is not None else None


# ===================== modelos =====================

class UserPatch(BaseModel):
    full_name: str | None = None
    status: str | None = None  # 'active'|'disabled' (según tu enum)


# ===================== endpoints =====================

@router.get(
    "/users",
    summary="Listar usuarios o filtrar por empresa/localización/email (admin/superadmin)"
)
def list_users(
    email: str | None = Query(default=None),
    company_id: int | None = Query(default=None),
    location_id: int | None = Query(default=None),
    user=Depends(require_user),
):
    email_q = (email or "").strip().lower() if email else None

    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        # Permisos según filtro
        if company_id is not None:
            _assert_admin_in_company(cur, user, company_id)
        elif location_id is not None:
            cid = _company_of_location(cur, location_id)
            if cid is None:
                raise HTTPException(404, "Localización inexistente")
            _assert_admin_in_company(cur, user, cid)
        else:
            # Sin filtro de empresa/loc: exige al menos admin global; si no es superadmin,
            # al menos admin en alguna empresa (como antes).
            _assert_any_admin(cur, user)

        if email_q:
            # Búsqueda por email (case-insensitive). Permite a admin o superadmin.
            cur.execute(
                "SELECT id, email, full_name, status FROM app_users WHERE lower(email)=%s",
                (email_q,),
            )
            row = cur.fetchone()
            return row or {}

        if company_id and location_id:
            # Miembros de la empresa que además tienen acceso efectivo a esa location
            cur.execute(
                """
                SELECT DISTINCT u.id, u.email, u.full_name, u.status
                FROM app_users u
                JOIN company_users cu
                  ON cu.user_id = u.id AND cu.company_id = %s
                JOIN v_user_locations vul
                  ON vul.user_id = u.id AND vul.location_id = %s
                ORDER BY u.id DESC
                """,
                (company_id, location_id),
            )
            return cur.fetchall() or []

        if company_id:
            cur.execute(
                """
                SELECT u.id, u.email, u.full_name, u.status
                FROM company_users cu
                JOIN app_users u ON u.id = cu.user_id
                WHERE cu.company_id=%s
                ORDER BY u.id DESC
                """,
                (company_id,),
            )
            return cur.fetchall() or []

        if location_id:
            cur.execute(
                """
                SELECT DISTINCT u.id, u.email, u.full_name, u.status
                FROM v_user_locations vul
                JOIN app_users u ON u.id = vul.user_id
                WHERE vul.location_id = %s
                ORDER BY u.id DESC
                """,
                (location_id,),
            )
            return cur.fetchall() or []

        # Listado global (sin filtros): permitir si es superadmin; si no, limitar a sus empresas
        if user.get("superadmin"):
            cur.execute(
                "SELECT id, email, full_name, status FROM app_users ORDER BY id DESC LIMIT 500"
            )
            return cur.fetchall() or []
        else:
            # Usuarios que comparten alguna empresa con el admin
            cur.execute(
                """
                SELECT DISTINCT u.id, u.email, u.full_name, u.status
                FROM company_users cu_admin
                JOIN company_users cu ON cu.company_id = cu_admin.company_id
                JOIN app_users u ON u.id = cu.user_id
                WHERE cu_admin.user_id = %s AND cu_admin.role IN ('owner','admin')
                ORDER BY u.id DESC
                """,
                (user["user_id"],),
            )
            return cur.fetchall() or []


@router.patch("/users/{user_id}", summary="Actualizar datos de un usuario (admin/superadmin)")
def patch_user(user_id: int, payload: UserPatch, user=Depends(require_user)):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        _assert_any_admin(cur, user)
        cur.execute(
            """
            UPDATE app_users
               SET full_name = COALESCE(%s,full_name),
                   status    = COALESCE(%s,status)
             WHERE id=%s
         RETURNING id, email, full_name, status
            """,
            (payload.full_name, payload.status, user_id),
        )
        row = cur.fetchone()
        conn.commit()
        return row or {}


@router.get("/users/{user_id}/companies", summary="Empresas del usuario y roles (admin/superadmin)")
def user_companies(user_id: int, user=Depends(require_user)):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        _assert_any_admin(cur, user)
        cur.execute(
            """
            SELECT cu.company_id, c.name, cu.role, cu.is_primary
            FROM company_users cu
            JOIN companies c ON c.id = cu.company_id
            WHERE cu.user_id=%s
            ORDER BY cu.role DESC, c.name
            """,
            (user_id,),
        )
        return cur.fetchall() or []


@router.get("/users/{user_id}/locations", summary="Accesos del usuario a localizaciones (efectivo y explícito)")
def user_locations(user_id: int, company_id: int | None = Query(default=None), user=Depends(require_user)):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        if company_id is not None:
            _assert_admin_in_company(cur, user, company_id)
        else:
            _assert_any_admin(cur, user)

        # Efectivos (heredados por rol + explícitos)
        if company_id:
            cur.execute(
                """
                SELECT vul.location_id, vul.location_name, vul.access, vul.company_id
                FROM v_user_locations vul
                WHERE vul.user_id=%s AND vul.company_id=%s
                ORDER BY vul.location_name
                """,
                (user_id, company_id),
            )
        else:
            cur.execute(
                """
                SELECT vul.location_id, vul.location_name, vul.access, vul.company_id
                FROM v_user_locations vul
                WHERE vul.user_id=%s
                ORDER BY vul.location_name
                """,
                (user_id,),
            )
        effective = cur.fetchall() or []

        # Explícitos (user_location_access)
        if company_id:
            cur.execute(
                """
                SELECT ula.location_id, l.name AS location_name, ula.access
                FROM user_location_access ula
                JOIN locations l ON l.id = ula.location_id
                WHERE ula.user_id=%s AND l.company_id=%s
                ORDER BY l.name
                """,
                (user_id, company_id),
            )
        else:
            cur.execute(
                """
                SELECT ula.location_id, l.name AS location_name, ula.access
                FROM user_location_access ula
                JOIN locations l ON l.id = ula.location_id
                WHERE ula.user_id=%s
                ORDER BY l.name
                """,
                (user_id,),
            )
        explicit = cur.fetchall() or []

        return {"effective": effective, "explicit": explicit}


@router.delete("/users/{user_id}/locations/{location_id}", summary="Quitar acceso explícito a una localización (admin/superadmin)")
def delete_user_location(user_id: int, location_id: int, user=Depends(require_user)):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        # Debe ser admin en la empresa dueña de esa location (o superadmin)
        cid = _company_of_location(cur, location_id)
        if cid is None:
            raise HTTPException(404, "Localización inexistente")
        _assert_admin_in_company(cur, user, cid)

        cur.execute(
            "DELETE FROM user_location_access WHERE user_id=%s AND location_id=%s",
            (user_id, location_id),
        )
        conn.commit()
        return {"ok": True}
