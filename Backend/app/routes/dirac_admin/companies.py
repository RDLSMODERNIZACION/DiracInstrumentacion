# app/routes/dirac_admin/companies.py
from fastapi import APIRouter, Depends, HTTPException
from psycopg.rows import dict_row
from pydantic import BaseModel, Field
from app.db import get_conn
from app.security import require_user

router = APIRouter(prefix="/dirac/admin", tags=["admin-companies"])


# ===================== Modelos =====================

class CompanyPatch(BaseModel):
    name: str | None = None
    legal_name: str | None = None
    cuit: str | None = None


class MemberUpsertIn(BaseModel):
    user_id: int = Field(..., description="Usuario a asignar a la empresa")
    role: str = Field(default="viewer", description="Enum membership_role_enum")
    is_primary: bool = False


# ===================== Helpers de permisos =====================

def _assert_admin_any(cur, user: dict) -> None:
    """Requiere owner/admin en alguna empresa, salvo superadmin (bypass total)."""
    if user.get("superadmin"):
        return
    cur.execute(
        "SELECT EXISTS(SELECT 1 FROM company_users WHERE user_id=%s AND role IN ('owner','admin')) AS ok",
        (user["user_id"],),
    )
    if not cur.fetchone()["ok"]:
        raise HTTPException(403, "Requiere owner/admin (o superadmin)")


def _assert_admin_in_company(cur, user: dict, company_id: int) -> None:
    """Requiere owner/admin en la empresa, salvo superadmin (bypass total)."""
    if user.get("superadmin"):
        return
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


# ===================== Endpoints =====================

@router.get("/companies", summary="Listar empresas (admin/superadmin)")
def list_companies(user=Depends(require_user)):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        _assert_admin_any(cur, user)
        cur.execute("SELECT id, name, status FROM companies ORDER BY id DESC")
        return cur.fetchall() or []


@router.get(
    "/companies/{company_id}/users",
    summary="Listar usuarios de una empresa con rol e is_primary (admin/superadmin)",
)
def list_company_users(company_id: int, user=Depends(require_user)):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        _assert_admin_in_company(cur, user, company_id)
        cur.execute(
            """
            SELECT u.id AS user_id, u.email, u.full_name, u.status,
                   cu.role, cu.is_primary
            FROM company_users cu
            JOIN app_users u ON u.id = cu.user_id
            WHERE cu.company_id = %s
            ORDER BY cu.role DESC, u.id DESC
            """,
            (company_id,),
        )
        return cur.fetchall() or []


@router.post(
    "/companies/{company_id}/members",
    summary="Upsert de membresía (role/is_primary) en una empresa (admin/superadmin)",
)
def upsert_member(company_id: int, payload: MemberUpsertIn, user=Depends(require_user)):
    role_in = (payload.role or "viewer").strip().lower()
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        _assert_admin_in_company(cur, user, company_id)
        try:
            cur.execute(
                """
                INSERT INTO company_users (company_id, user_id, role, is_primary)
                VALUES (%s, %s, %s::membership_role_enum, %s)
                ON CONFLICT (company_id, user_id)
                DO UPDATE SET role = EXCLUDED.role,
                              is_primary = EXCLUDED.is_primary
                RETURNING company_id, user_id, role, is_primary
                """,
                (company_id, payload.user_id, role_in, payload.is_primary),
            )
            row = cur.fetchone()
            conn.commit()
            return row or {}
        except Exception as e:
            conn.rollback()
            raise HTTPException(400, f"Upsert member error: {e}")


@router.patch("/companies/{company_id}", summary="Actualizar datos de la empresa (admin/superadmin)")
def patch_company(company_id: int, payload: CompanyPatch, user=Depends(require_user)):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        _assert_admin_in_company(cur, user, company_id)
        try:
            cur.execute(
                """
                UPDATE companies
                   SET name       = COALESCE(%s, name),
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
    summary="Quitar usuario de la empresa (admin/superadmin)",
)
def remove_user_from_company(company_id: int, target_user_id: int, user=Depends(require_user)):
    with get_conn() as conn, conn.cursor() as cur:
        _assert_admin_in_company(cur, user, company_id)
        cur.execute(
            "DELETE FROM company_users WHERE company_id=%s AND user_id=%s",
            (company_id, target_user_id),
        )
        conn.commit()
        return {"ok": True}
