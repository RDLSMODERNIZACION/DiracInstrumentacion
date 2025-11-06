# app/security.py
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from psycopg.rows import dict_row
from app.db import get_conn

# No usamos passlib ni hash. Login básico con password_plain.
security = HTTPBasic(auto_error=False)

def _unauth():
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Unauthorized",
        headers={"WWW-Authenticate": 'Basic realm="dirac", charset="UTF-8"'},
    )

def require_user(credentials: HTTPBasicCredentials = Depends(security)):
    # Si no hay credenciales, 401
    if credentials is None or not credentials.username or credentials.password is None:
        raise _unauth()

    email = credentials.username.strip().lower()
    pwd = credentials.password

    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            SELECT id, email, full_name, status, is_superadmin, password_plain
            FROM app_users
            WHERE lower(email) = %s
            """,
            (email,),
        )
        u = cur.fetchone()

        # Fallar-cerrado: usuario no existe, inactivo o password_plain no coincide
        if not u or u["status"] != "active" or u.get("password_plain") is None or pwd != u["password_plain"]:
            raise _unauth()

        # OK: devolvemos identidad básica
        return {
            "user_id": int(u["id"]),
            "email": u["email"],
            "superadmin": bool(u.get("is_superadmin")),
        }
