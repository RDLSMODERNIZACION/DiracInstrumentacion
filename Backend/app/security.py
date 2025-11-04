from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from psycopg.rows import dict_row
from app.db import get_conn

security = HTTPBasic()

def require_user(credentials: HTTPBasicCredentials = Depends(security)):
    """
    Auth básica SOLO PRUEBAS: valida contra public.app_users (email + password_plain, status='active').
    """
    email = credentials.username
    password = credentials.password
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            "SELECT id, email, status FROM public.app_users WHERE email=%s AND password_plain=%s",
            (email, password)
        )
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Credenciales inválidas")
    if row["status"] != "active":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Usuario inactivo")
    return {"user_id": row["id"], "email": row["email"]}
