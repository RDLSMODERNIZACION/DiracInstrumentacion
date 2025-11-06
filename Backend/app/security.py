# app/security.py
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBasic, HTTPBasicCredentials
from psycopg.rows import dict_row
from app.db import get_conn

# Si tenés 'passlib' disponible, usamos Argon2:
try:
    from passlib.hash import argon2
    _HAS_ARGON2 = True
except Exception:
    _HAS_ARGON2 = False

security = HTTPBasic(auto_error=False)

def _unauth():
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Unauthorized",
        headers={"WWW-Authenticate": 'Basic realm="dirac", charset="UTF-8"'},
    )

def require_user(credentials: HTTPBasicCredentials = Depends(security)):
    if credentials is None or not (credentials.username and credentials.password):
        raise _unauth()

    email = credentials.username.strip().lower()
    pwd = credentials.password or ""

    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            SELECT id, email, full_name, status, is_superadmin,
                   password_hash, password_plain
            FROM app_users
            WHERE lower(email) = %s
            """,
            (email,),
        )
        u = cur.fetchone()

        if not u or u["status"] != "active":
            raise _unauth()

        ok = False

        # 1) Preferir password_hash (Argon2)
        if u.get("password_hash"):
            if _HAS_ARGON2:
                try:
                    ok = argon2.verify(pwd, u["password_hash"])
                except Exception:
                    ok = False
            else:
                ok = False  # si no hay passlib, no podemos verificar hash
        # 2) Fallback temporal a password_plain (migración)
        elif u.get("password_plain") is not None:
            ok = (pwd == u["password_plain"])
            if ok and _HAS_ARGON2:
                # migrar a hash en primer login exitoso
                try:
                    new_hash = argon2.hash(pwd)
                    cur.execute(
                        "UPDATE app_users SET password_hash=%s, password_updated_at=now() WHERE id=%s",
                        (new_hash, u["id"]),
                    )
                    conn.commit()
                except Exception:
                    conn.rollback()

        if not ok:
            raise _unauth()

        return {
            "user_id": int(u["id"]),
            "email": u["email"],
            "superadmin": bool(u.get("is_superadmin")),
        }
