# app/routes/dirac_admin/users.py
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from psycopg.rows import dict_row

from app.db import get_conn
from app.security import require_user

router = APIRouter(prefix="/dirac/admin", tags=["admin-users"])


class UserCreateIn(BaseModel):
    email: str = Field(..., description="Email (se guarda en minúsculas)")
    full_name: str | None = None
    phone: str | None = None
    password: str | None = Field(default="1234", min_length=4, max_length=128)
    status: str | None = Field(default="active")
    company_id: int | None = None
    role: str | None = Field(default="viewer")
    is_primary: bool = False


class UserPatch(BaseModel):
    full_name: str | None = None
    status: str | None = None


class PasswordChangeIn(BaseModel):
    new_password: str = Field(..., min_length=4, max_length=128)


class GrantAccessIn(BaseModel):
    access: str = Field(default="control", description="access_level_enum: view|control|admin")


def _resolve_admin_company(cur, user: dict, requested_company_id: int | None) -> int:
    """La administración nunca queda sin empresa ni cruza a otra empresa.

    A diferencia de otros módulos, incluso un superadmin debe tener membresía
    owner/admin en la empresa que administra. Si no llega company_id, se usa
    la primaria administrable (o la primera).
    """
    if requested_company_id is not None:
        cur.execute(
            """
            SELECT cu.company_id
            FROM company_users cu
            WHERE cu.user_id=%s
              AND cu.company_id=%s
              AND cu.role IN ('owner','admin')
            LIMIT 1
            """,
            (user["user_id"], requested_company_id),
        )
        if not cur.fetchone():
            raise HTTPException(403, "No podés administrar esa empresa")
        return int(requested_company_id)

    cur.execute(
        """
        SELECT cu.company_id
        FROM company_users cu
        WHERE cu.user_id=%s
          AND cu.role IN ('owner','admin')
        ORDER BY cu.is_primary DESC, cu.company_id ASC
        LIMIT 1
        """,
        (user["user_id"],),
    )
    row = cur.fetchone()
    if not row:
        raise HTTPException(403, "Tu usuario no tiene una empresa administrable")
    return int(row["company_id"])


def _assert_user_in_company(cur, target_user_id: int, company_id: int):
    cur.execute(
        "SELECT 1 FROM company_users WHERE user_id=%s AND company_id=%s LIMIT 1",
        (target_user_id, company_id),
    )
    if not cur.fetchone():
        raise HTTPException(404, "Usuario no encontrado en esta empresa")


def _assert_location_in_company(cur, location_id: int, company_id: int):
    cur.execute(
        "SELECT 1 FROM locations WHERE id=%s AND company_id=%s LIMIT 1",
        (location_id, company_id),
    )
    if not cur.fetchone():
        raise HTTPException(404, "Localización no encontrada en esta empresa")


@router.post("/users", summary="Crear usuario dentro de la empresa administrada")
def create_user(
    payload: UserCreateIn,
    company_id: int | None = Query(default=None),
    user=Depends(require_user),
):
    email = (payload.email or "").strip().lower()
    if not email:
        raise HTTPException(400, "email requerido")

    status_in = (payload.status or "active").strip().lower()
    role_in = (payload.role or "viewer").strip().lower()
    pw = payload.password or "1234"

    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        target_company_id = _resolve_admin_company(
            cur, user, company_id if company_id is not None else payload.company_id
        )

        cur.execute("SELECT id, email, full_name, phone, status FROM app_users WHERE lower(email)=%s", (email,))
        existing = cur.fetchone()

        if existing:
            new_user_id = int(existing["id"])
            u = existing
        else:
            cur.execute(
                """
                INSERT INTO app_users (email, full_name, phone, status, password_plain, is_superadmin)
                VALUES (%s, %s, %s, %s::user_status_enum, %s, false)
                RETURNING id, email, full_name, phone, status
                """,
                (email, payload.full_name, payload.phone, status_in, pw),
            )
            u = cur.fetchone()
            new_user_id = int(u["id"])

        cur.execute(
            """
            INSERT INTO company_users (company_id, user_id, role, is_primary)
            VALUES (%s, %s, %s::membership_role_enum, %s)
            ON CONFLICT (company_id, user_id)
            DO UPDATE SET role=EXCLUDED.role, is_primary=EXCLUDED.is_primary
            """,
            (target_company_id, new_user_id, role_in, payload.is_primary),
        )
        conn.commit()

        return {
            "id": new_user_id,
            "email": u["email"],
            "full_name": u.get("full_name"),
            "phone": u.get("phone"),
            "status": u["status"],
            "company_id": target_company_id,
            "role": role_in,
            "is_primary": payload.is_primary,
        }


@router.get("/users", summary="Listar usuarios exclusivamente de la empresa administrada")
def list_users(
    email: str | None = Query(default=None),
    company_id: int | None = Query(default=None),
    location_id: int | None = Query(default=None),
    user=Depends(require_user),
):
    email_q = (email or "").strip().lower() if email else None

    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        target_company_id = _resolve_admin_company(cur, user, company_id)

        if location_id is not None:
            _assert_location_in_company(cur, location_id, target_company_id)

        q = """
            SELECT DISTINCT u.id, u.email, u.full_name, u.status
            FROM company_users cu
            JOIN app_users u ON u.id = cu.user_id
        """
        params: list = [target_company_id]
        conds = ["cu.company_id=%s"]

        if location_id is not None:
            q += " JOIN v_user_locations vul ON vul.user_id=u.id "
            conds.append("vul.location_id=%s")
            conds.append("vul.company_id=%s")
            params.extend([location_id, target_company_id])

        if email_q:
            conds.append("lower(u.email)=%s")
            params.append(email_q)

        q += " WHERE " + " AND ".join(conds)
        q += " ORDER BY u.id DESC"
        cur.execute(q, params)
        rows = cur.fetchall() or []

        if email_q:
            return rows[0] if rows else {}
        return rows


@router.patch("/users/{user_id}", summary="Actualizar usuario de la empresa administrada")
def patch_user(
    user_id: int,
    payload: UserPatch,
    company_id: int | None = Query(default=None),
    user=Depends(require_user),
):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        target_company_id = _resolve_admin_company(cur, user, company_id)
        _assert_user_in_company(cur, user_id, target_company_id)

        cur.execute(
            """
            UPDATE app_users
               SET full_name = COALESCE(%s, full_name),
                   status    = COALESCE(%s::user_status_enum, status)
             WHERE id = %s
         RETURNING id, email, full_name, status
            """,
            (payload.full_name, payload.status, user_id),
        )
        row = cur.fetchone()
        conn.commit()
        return row


@router.post("/users/{user_id}/password", summary="Cambiar contraseña de usuario de la empresa")
def change_password_admin(
    user_id: int,
    body: PasswordChangeIn | None = None,
    new_password: str | None = Query(default=None),
    company_id: int | None = Query(default=None),
    user=Depends(require_user),
):
    pw = (body.new_password if body else None) or new_password
    if not pw:
        raise HTTPException(400, "Falta new_password")
    if len(pw) < 4 or len(pw) > 128:
        raise HTTPException(400, "La contraseña debe tener entre 4 y 128 caracteres")

    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        target_company_id = _resolve_admin_company(cur, user, company_id)
        _assert_user_in_company(cur, user_id, target_company_id)
        cur.execute(
            """
            UPDATE app_users
               SET password_plain=%s, password_updated_at=now()
             WHERE id=%s
            """,
            (pw, user_id),
        )
        conn.commit()
    return {"ok": True, "user_id": user_id}


@router.get("/users/{user_id}/companies", summary="Empresa administrada del usuario")
def user_companies(
    user_id: int,
    company_id: int | None = Query(default=None),
    user=Depends(require_user),
):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        target_company_id = _resolve_admin_company(cur, user, company_id)
        _assert_user_in_company(cur, user_id, target_company_id)
        cur.execute(
            """
            SELECT cu.company_id, c.name, cu.role, cu.is_primary
            FROM company_users cu
            JOIN companies c ON c.id=cu.company_id
            WHERE cu.user_id=%s AND cu.company_id=%s
            """,
            (user_id, target_company_id),
        )
        return cur.fetchall() or []


@router.get("/users/{user_id}/locations", summary="Accesos del usuario dentro de la empresa administrada")
def user_locations(
    user_id: int,
    company_id: int | None = Query(default=None),
    user=Depends(require_user),
):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        target_company_id = _resolve_admin_company(cur, user, company_id)
        _assert_user_in_company(cur, user_id, target_company_id)

        cur.execute(
            """
            SELECT vul.location_id, vul.location_name, vul.access, vul.company_id
            FROM v_user_locations vul
            WHERE vul.user_id=%s AND vul.company_id=%s
            ORDER BY vul.location_name
            """,
            (user_id, target_company_id),
        )
        effective = cur.fetchall() or []

        cur.execute(
            """
            SELECT ula.location_id, l.name AS location_name, ula.access, l.company_id
            FROM user_location_access ula
            JOIN locations l ON l.id=ula.location_id
            WHERE ula.user_id=%s AND l.company_id=%s
            ORDER BY l.name
            """,
            (user_id, target_company_id),
        )
        explicit = cur.fetchall() or []
        return {"effective": effective, "explicit": explicit}


@router.post("/users/{user_id}/locations/{location_id}", summary="Conceder acceso dentro de la empresa administrada")
def grant_user_location(
    user_id: int,
    location_id: int,
    body: GrantAccessIn | None = None,
    access: str | None = Query(default=None),
    company_id: int | None = Query(default=None),
    user=Depends(require_user),
):
    acc = (body.access if body else None) or (access or "control")
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        target_company_id = _resolve_admin_company(cur, user, company_id)
        _assert_user_in_company(cur, user_id, target_company_id)
        _assert_location_in_company(cur, location_id, target_company_id)

        cur.execute(
            """
            INSERT INTO user_location_access (user_id, location_id, access)
            VALUES (%s, %s, %s::access_level_enum)
            ON CONFLICT (user_id, location_id)
            DO UPDATE SET access=EXCLUDED.access, created_at=now()
            RETURNING user_id, location_id, access
            """,
            (user_id, location_id, acc),
        )
        row = cur.fetchone()
        conn.commit()
        return row


@router.delete("/users/{user_id}/locations/{location_id}", summary="Quitar acceso dentro de la empresa administrada")
def delete_user_location(
    user_id: int,
    location_id: int,
    company_id: int | None = Query(default=None),
    user=Depends(require_user),
):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        target_company_id = _resolve_admin_company(cur, user, company_id)
        _assert_user_in_company(cur, user_id, target_company_id)
        _assert_location_in_company(cur, location_id, target_company_id)
        cur.execute(
            "DELETE FROM user_location_access WHERE user_id=%s AND location_id=%s",
            (user_id, location_id),
        )
        conn.commit()
        return {"ok": True}


@router.delete("/users/{user_id}", summary="Quitar usuario de la empresa administrada")
def delete_user(
    user_id: int,
    force: bool = Query(default=False),
    company_id: int | None = Query(default=None),
    user=Depends(require_user),
):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        target_company_id = _resolve_admin_company(cur, user, company_id)
        _assert_user_in_company(cur, user_id, target_company_id)

        # Se eliminan únicamente accesos pertenecientes a esta empresa.
        cur.execute(
            """
            DELETE FROM user_location_access ula
            USING locations l
            WHERE ula.location_id=l.id
              AND ula.user_id=%s
              AND l.company_id=%s
            """,
            (user_id, target_company_id),
        )
        cur.execute(
            "DELETE FROM company_users WHERE user_id=%s AND company_id=%s",
            (user_id, target_company_id),
        )

        # Si ya no pertenece a ninguna empresa, recién ahí se elimina el usuario global.
        cur.execute("SELECT COUNT(*) AS n FROM company_users WHERE user_id=%s", (user_id,))
        remaining = int(cur.fetchone()["n"] or 0)
        deleted_global = False
        if remaining == 0 and force:
            cur.execute("UPDATE pump_events SET created_by_user_id=NULL WHERE created_by_user_id=%s", (user_id,))
            cur.execute("UPDATE pump_commands SET requested_by_user_id=NULL WHERE requested_by_user_id=%s", (user_id,))
            cur.execute("DELETE FROM app_users WHERE id=%s", (user_id,))
            deleted_global = True

        conn.commit()
        return {
            "ok": True,
            "user_id": user_id,
            "company_id": target_company_id,
            "removed_from_company": True,
            "deleted_global": deleted_global,
        }
