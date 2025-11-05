# app/routes/dirac_admin/users.py
from fastapi import APIRouter, HTTPException, Query, Depends
from psycopg.rows import dict_row
from pydantic import BaseModel, Field
from app.db import get_conn

router = APIRouter(prefix="/dirac/admin", tags=["admin-users"])

# ---------- modelos ----------
class UserCreateIn(BaseModel):
    email: str = Field(..., description="Email (minúsculas)")
    full_name: str | None = None
    phone: str | None = None
    password: str | None = Field(default="1234", min_length=4, max_length=128)
    status: str | None = Field(default="active")  # user_status_enum
    company_id: int | None = None
    role: str | None = Field(default="viewer")    # membership_role_enum
    is_primary: bool = False

class UserPatch(BaseModel):
    full_name: str | None = None
    status: str | None = None  # 'active'|'disabled'

# ---------- crear usuario (+ opcional membresía inmediata) ----------
@router.post("/users", summary="Crear usuario (y opcionalmente asignarlo a una empresa)")
def create_user(payload: UserCreateIn):
    email = (payload.email or "").strip().lower()
    if not email:
        raise HTTPException(400, "email requerido")

    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute("SELECT id FROM app_users WHERE lower(email)=%s", (email,))
        if cur.fetchone():
            raise HTTPException(409, "Ya existe un usuario con ese email")

        cur.execute(
            """
            INSERT INTO app_users (email, full_name, phone, status, password_plain, is_superadmin)
            VALUES (%s,%s,%s, COALESCE(%s,'active'), %s, false)
            RETURNING id, email, full_name, phone, status, is_superadmin
            """,
            (email, payload.full_name, payload.phone, payload.status, payload.password or "1234"),
        )
        u = cur.fetchone()
        new_user_id = u["id"]

        if payload.company_id is not None:
            cur.execute(
                """
                INSERT INTO company_users(company_id, user_id, role, is_primary)
                VALUES (%s, %s, %s::membership_role_enum, %s)
                ON CONFLICT (company_id, user_id)
                DO UPDATE SET role = EXCLUDED.role, is_primary = EXCLUDED.is_primary
                """,
                (payload.company_id, new_user_id, payload.role or "viewer", payload.is_primary),
            )

        conn.commit()
        return {
            "id": new_user_id,
            "email": u["email"],
            "full_name": u["full_name"],
            "phone": u["phone"],
            "status": u["status"],
            "company_id": payload.company_id,
            "role": (payload.role or "viewer") if payload.company_id else None,
            "is_primary": payload.is_primary if payload.company_id else None,
        }

# ---------- listar ----------
@router.get("/users", summary="Listar usuarios o filtrar por empresa/localización/email")
def list_users(
    email: str | None = Query(default=None),
    company_id: int | None = Query(default=None),
    location_id: int | None = Query(default=None),
):
    email_q = (email or "").strip().lower() if email else None
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        if email_q:
            cur.execute("SELECT id, email, full_name, status FROM app_users WHERE lower(email)=%s", (email_q,))
            return cur.fetchone() or {}

        if company_id and location_id:
            cur.execute(
                """
                SELECT DISTINCT u.id, u.email, u.full_name, u.status
                FROM app_users u
                JOIN company_users cu ON cu.user_id = u.id AND cu.company_id = %s
                JOIN v_user_locations vul ON vul.user_id = u.id AND vul.location_id = %s
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

        cur.execute("SELECT id, email, full_name, status FROM app_users ORDER BY id DESC LIMIT 500")
        return cur.fetchall() or []

# ---------- patch ----------
@router.patch("/users/{user_id}", summary="Actualizar datos de un usuario")
def patch_user(user_id: int, payload: UserPatch):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
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
        if not row:
            raise HTTPException(404, "Usuario inexistente")
        return row

# ---------- empresas del usuario ----------
@router.get("/users/{user_id}/companies", summary="Empresas del usuario y roles")
def user_companies(user_id: int):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            SELECT cu.company_id, c.name, cu.role, cu.is_primary
            FROM company_users cu JOIN companies c ON c.id = cu.company_id
            WHERE cu.user_id=%s
            ORDER BY cu.role DESC, c.name
            """,
            (user_id,),
        )
        return cur.fetchall() or []

# ---------- accesos a localizaciones ----------
@router.get("/users/{user_id}/locations", summary="Accesos del usuario a localizaciones (efectivo y explícito)")
def user_locations(user_id: int, company_id: int | None = Query(default=None)):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
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

@router.delete("/users/{user_id}/locations/{location_id}", summary="Quitar acceso explícito a una localización")
def delete_user_location(user_id: int, location_id: int):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute("DELETE FROM user_location_access WHERE user_id=%s AND location_id=%s", (user_id, location_id))
        conn.commit()
        return {"ok": True}

# ---------- ELIMINAR USUARIO ----------
@router.delete("/users/{user_id}", summary="Eliminar usuario (?force=1 borra referencias)")
def delete_user(user_id: int, force: bool = Query(default=False)):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute("SELECT id FROM app_users WHERE id=%s", (user_id,))
        if not cur.fetchone():
            raise HTTPException(404, "Usuario inexistente")

        if not force:
            # bloqueos suaves
            cur.execute("SELECT COUNT(*) AS n FROM company_users WHERE user_id=%s", (user_id,))
            members = cur.fetchone()["n"]
            cur.execute("SELECT COUNT(*) AS n FROM user_location_access WHERE user_id=%s", (user_id,))
            locs = cur.fetchone()["n"]
            cur.execute("SELECT COUNT(*) AS n FROM pump_events WHERE created_by_user_id=%s", (user_id,))
            evs = cur.fetchone()["n"]
            cur.execute("SELECT COUNT(*) AS n FROM pump_commands WHERE requested_by_user_id=%s", (user_id,))
            cmds = cur.fetchone()["n"]

            total = (members or 0) + (locs or 0) + (evs or 0) + (cmds or 0)
            if total > 0:
                raise HTTPException(
                    409,
                    {
                        "message": "El usuario tiene referencias",
                        "members": members, "locations": locs,
                        "events": evs, "commands": cmds
                    },
                )

            cur.execute("DELETE FROM app_users WHERE id=%s", (user_id,))
            conn.commit()
            return {"ok": True, "deleted": user_id, "forced": False}

        # forzado: limpiar refs y borrar
        cur.execute("DELETE FROM user_location_access WHERE user_id=%s", (user_id,))
        cur.execute("DELETE FROM company_users WHERE user_id=%s", (user_id,))
        cur.execute("UPDATE pump_events   SET created_by_user_id=NULL WHERE created_by_user_id=%s", (user_id,))
        cur.execute("UPDATE pump_commands SET requested_by_user_id=NULL WHERE requested_by_user_id=%s", (user_id,))
        cur.execute("DELETE FROM app_users WHERE id=%s", (user_id,))
        conn.commit()
        return {"ok": True, "deleted": user_id, "forced": True}
