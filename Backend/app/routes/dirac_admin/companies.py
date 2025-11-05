# al inicio ya tenés imports y router
from fastapi import APIRouter, Depends, HTTPException
from psycopg.rows import dict_row
from app.db import get_conn
from app.security import require_user

router = APIRouter(prefix="/dirac/admin", tags=["admin-companies-membership"])

@router.delete("/companies/{company_id}/users/{target_user_id}", summary="Quitar usuario de una empresa (admin)")
def remove_user_from_company(company_id: int, target_user_id: int, user=Depends(require_user)):
    with get_conn() as conn, conn.cursor() as cur:
        # Debe ser owner/admin en esa empresa
        cur.execute(
            "SELECT EXISTS(SELECT 1 FROM company_users WHERE company_id=%s AND user_id=%s AND role IN ('owner','admin')) AS ok",
            (company_id, user["user_id"])
        )
        if not cur.fetchone()[0]:
            raise HTTPException(403, "Requiere owner/admin en la empresa")
        cur.execute("DELETE FROM company_users WHERE company_id=%s AND user_id=%s", (company_id, target_user_id))
        conn.commit()
        return {"ok": True}
