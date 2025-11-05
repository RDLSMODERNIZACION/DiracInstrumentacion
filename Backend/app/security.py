# app/security.py
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from psycopg.rows import dict_row
from app.db import get_conn

security = HTTPBasic()


def require_user(credentials: HTTPBasicCredentials = Depends(security)):
    """
    Autenticación básica (SOLO PRUEBAS).
    Valida contra public.app_users (email + password_plain, status='active')
    y expone el flag de superadmin para bypass de permisos en los routers.
    """
    email = (credentials.username or "").strip().lower()
    password = credentials.password or ""

    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            SELECT
                id AS user_id,
                lower(email) AS email,
                status,
                COALESCE(is_superadmin,false) AS is_superadmin
            FROM public.app_users
            WHERE lower(email) = %s AND password_plain = %s
            """,
            (email, password),
        )
        row = cur.fetchone()

    if not row:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Credenciales inválidas",
        )

    # status suele ser un enum; lo comparamos en minúsculas
    if str(row["status"]).lower() != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuario inactivo",
        )

    return {
        "user_id": int(row["user_id"]),
        "email": row["email"],
        "superadmin": bool(row["is_superadmin"]),
    }


# ===================== Helpers opcionales para routers =====================

def assert_admin_company(cur, user: dict, company_id: int):
    """
    Requiere owner/admin en la empresa, salvo que sea superadmin (bypass).
    Uso:
      with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
          assert_admin_company(cur, user, company_id)
    """
    if user.get("superadmin"):
        return
    cur.execute(
        """
        SELECT EXISTS(
            SELECT 1
            FROM public.company_users
            WHERE user_id = %s
              AND company_id = %s
              AND role IN ('owner','admin')
        ) AS ok
        """,
        (user["user_id"], company_id),
    )
    if not cur.fetchone()["ok"]:
        raise HTTPException(
            status_code=403,
            detail="Requiere owner/admin en la empresa (o superadmin)",
        )


def assert_any_admin(cur, user: dict):
    """
    Requiere owner/admin en AL MENOS una empresa, salvo que sea superadmin (bypass).
    Útil para endpoints de listado global.
    """
    if user.get("superadmin"):
        return
    cur.execute(
        "SELECT EXISTS(SELECT 1 FROM public.company_users WHERE user_id=%s AND role IN ('owner','admin')) AS ok",
        (user["user_id"],),
    )
    if not cur.fetchone()["ok"]:
        raise HTTPException(
            status_code=403,
            detail="Requiere owner/admin (o superadmin)",
        )
