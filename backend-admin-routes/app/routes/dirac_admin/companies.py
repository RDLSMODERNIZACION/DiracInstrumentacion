from fastapi import APIRouter, Depends, HTTPException
from psycopg.rows import dict_row
from app.db import get_conn
from app.security import require_user

router = APIRouter(prefix="/dirac/admin", tags=["admin-companies"])

@router.get("/companies", summary="Listar empresas (admin)")
def list_companies(user=Depends(require_user)):
  with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
    # Debe ser owner/admin en alguna empresa para listar
    cur.execute("SELECT EXISTS(SELECT 1 FROM company_users WHERE user_id=%s AND role IN ('owner','admin')) AS ok", (user["user_id"],))
    if not cur.fetchone()["ok"]:
      raise HTTPException(403, "Requiere owner/admin")
    cur.execute("SELECT id, name, status FROM companies ORDER BY id DESC")
    return cur.fetchall() or []
