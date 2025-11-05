# app/routes/dirac_admin/companies.py
from fastapi import APIRouter, Depends, HTTPException
from psycopg.rows import dict_row
from pydantic import BaseModel
from app.db import get_conn
from app.security import require_user

router = APIRouter(prefix="/dirac/admin", tags=["admin-companies"])


class CompanyPatch(BaseModel):
    name: str | None = None
    legal_name: str | None = None
    cuit: str | None = None


def assert_is_admin_in_company(cur, user: dict, company_id: int) -> None:
    """
    Requiere owner/admin en la empresa, salvo que el usuario sea superadmin.
    """
    if user.get("superadmin"):
        return  # bypass global
    cur.execute(
        """
        SELECT EXISTS(
            SELECT 1
            FROM company_users
            WHERE user_id=%s AND company_id=%s
              AND role IN ('owner','admin')
        ) AS ok
        """,
        (user["user_id"], company_id),
    )
    if not cur.fetchone()["ok"]:
        raise HTTPException(403, "Requiere owner/admin en la empresa (o superadmin)")


@router.get("/companies", summary="Listar empresas (admin)")
def list_companies(user=Depends(require_user)):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        # Si no es superadmin, debe ser owner/admin en alguna empresa
        if not user.get("superadmin"):
            cur.execute(
                "SELECT EXISTS(SELECT 1 FROM company_users WHERE user_id=%s AND role IN ('owner','admin')) AS ok",
                (user["user_id"],),
            )
            if not cur.fetchone()["ok"]:
                raise HTTPException(403, "Requiere owner/admin")
        cur.execute("SELECT id, name, status FROM companies ORDER BY id DESC")
        return cur.fetchall() or []


@router.patch("/companies/{company_id}", summary="Actualizar datos de la empresa (admin)")
def patch_company(company_id: int, payload: CompanyPatch, user=Depends(require_user)):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        assert_is_admin_in_company(cur, user, company_id)
        try:
            cur.execute(
                """
                UPDATE companies SET
                  name       = COALESCE(%s, name),
                  legal_name = COALESCE(%s, legal_name),
                  cuit       = COALESCE(%s, cuit)
                WHERE id=%s
                RETURNING id, name, status, legal_name, cuit
                """,
                (payload.name, payload.legal_name, payload.cuit, company_id),
            )
            row = cur.fetchone()
            conn.commit()
            return row or {}
        except Exception as e:
            conn.rollback()
            raise HTTPException(400, f"Update company error: {e}")


@router.delete(
    "/companies/{company_id}/users/{target_user_id}",
    summary="Quitar usuario de la empresa (admin)",
)
def remove_user_from_company(company_id: int, target_user_id: int, user=Depends(require_user)):
    with get_conn() as conn, conn.cursor() as cur:
        assert_is_admin_in_company(cur, user, company_id)
        cur.execute(
            "DELETE FROM company_users WHERE company_id=%s AND user_id=%s",
            (company_id, target_user_id),
        )
        conn.commit()
        return {"ok": True}
