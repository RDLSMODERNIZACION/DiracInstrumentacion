from fastapi import APIRouter, Depends, HTTPException, Query
from psycopg.rows import dict_row
from app.db import get_conn
from app.security import require_user

router = APIRouter(prefix="/dirac/admin", tags=["admin-locations"])

@router.get("/locations", summary="Listar localizaciones (admin)")
def list_locations(company_id: int | None = Query(default=None), user=Depends(require_user)):
  with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
    cur.execute("SELECT EXISTS(SELECT 1 FROM company_users WHERE user_id=%s AND role IN ('owner','admin')) AS ok", (user["user_id"],))
    if not cur.fetchone()["ok"]:
      raise HTTPException(403, "Requiere owner/admin")
    if company_id:
      cur.execute("SELECT id, name, company_id FROM locations WHERE company_id=%s ORDER BY id DESC", (company_id,))
    else:
      cur.execute("SELECT id, name, company_id FROM locations ORDER BY id DESC")
    return cur.fetchall() or []
