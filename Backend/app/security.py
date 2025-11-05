# app/security.py
from fastapi import Depends
from fastapi.security import HTTPBasic, HTTPBasicCredentials

# No exige header; si viene, lo ignora para permisos
security = HTTPBasic(auto_error=False)

def require_user(credentials: HTTPBasicCredentials | None = Depends(security)):
    """
    MODO INSEGURO (SOLO PRUEBAS)
    No valida credenciales ni consulta DB.
    Siempre devuelve un usuario 'superadmin' que habilita todo.
    """
    username = (credentials.username if credentials and credentials.username else "anon@local").lower()
    return {
        "user_id": 0,
        "email": username,
        "superadmin": True,  # bypass total
    }

# Helpers NO-OP (por si los usan routers)
def assert_admin_company(cur, user: dict, company_id: int):  # noqa
    return

def assert_any_admin(cur, user: dict):  # noqa
    return
