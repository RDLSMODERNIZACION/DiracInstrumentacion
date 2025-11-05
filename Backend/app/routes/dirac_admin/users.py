from fastapi import APIRouter, Depends, HTTPException, Query
from psycopg.rows import dict_row
from app.db import get_conn
from app.security import require_user

router = APIRouter(prefix="/dirac/admin", tags=["admin-users"])

@router.get("/users", summary="Listar usuarios o buscar por email (admin)")
def list_users(email: str | None = Query(default=None), user=Depends(require_user)):
  with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
    cur.execute("SELECT EXISTS(SELECT 1 FROM company_users WHERE user_id=%s AND role IN ('owner','admin')) AS ok", (user["user_id"],))
    if not cur.fetchone()["ok"]:
      raise HTTPException(403, "Requiere owner/admin")
    if email:
      cur.execute("SELECT id, email, full_name, status FROM app_users WHERE email=%s", (email,))
      row = cur.fetchone()
      return row or {}
    cur.execute("SELECT id, email, full_name, status FROM app_users ORDER BY id DESC LIMIT 500")
    return cur.fetchall() or []
