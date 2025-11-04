from fastapi import APIRouter, Depends, HTTPException
from psycopg.rows import dict_row
from app.db import get_conn
from app.security import require_user
from app.schemas_dirac import UserCreate, ChangePasswordIn

router = APIRouter(prefix="/dirac/users", tags=["users"])

@router.post(
    "",
    summary="Crear usuario",
    description="Crea un usuario (password en texto plano, SOLO pruebas). Requiere owner/admin en alguna empresa."
)
def create_user(payload: UserCreate, user=Depends(require_user)):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            "SELECT EXISTS(SELECT 1 FROM company_users WHERE user_id=%s AND role IN ('owner','admin')) AS ok",
            (user["user_id"],)
        )
        is_admin = cur.fetchone()["ok"]
        if not is_admin:
            raise HTTPException(403, "Se requiere owner/admin para crear usuarios")
        try:
            cur.execute(
                "INSERT INTO app_users(email, full_name, password_plain) "
                "VALUES(%s,%s,%s) RETURNING id, email, full_name, status",
                (payload.email, payload.full_name, payload.password)
            )
            row = cur.fetchone()
            conn.commit()
            return row
        except Exception as e:
            conn.rollback()
            raise HTTPException(400, f"No se pudo crear: {e}")

@router.post(
    "/me/change-password",
    summary="Cambiar mi contraseña",
    description="El usuario autenticado cambia su propia contraseña."
)
def me_change_password(payload: ChangePasswordIn, user=Depends(require_user)):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute(
            "UPDATE app_users SET password_plain=%s, password_updated_at=now() WHERE id=%s",
            (payload.new_password, user["user_id"])
        )
        conn.commit()
    return {"ok": True}

@router.post(
    "/{user_id}/password",
    summary="Cambiar contraseña de otro usuario",
    description="Solo owner/admin de alguna empresa compartida con el usuario destino."
)
def admin_change_password(user_id: int, payload: ChangePasswordIn, user=Depends(require_user)):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            SELECT EXISTS(
              SELECT 1
              FROM company_users admin
              JOIN company_users target ON target.company_id = admin.company_id AND target.user_id=%s
              WHERE admin.user_id=%s AND admin.role IN ('owner','admin')
            ) AS ok
            """,
            (user_id, user["user_id"])
        )
        shared_admin = cur.fetchone()["ok"]
        if not shared_admin:
            raise HTTPException(403, "Requiere owner/admin en una empresa compartida")
        cur.execute(
            "UPDATE app_users SET password_plain=%s, password_updated_at=now() WHERE id=%s",
            (payload.new_password, user_id)
        )
        conn.commit()
    return {"ok": True}
