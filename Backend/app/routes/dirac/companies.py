from fastapi import APIRouter, Depends, HTTPException
from psycopg.rows import dict_row
from app.db import get_conn
from app.security import require_user
from app.schemas_dirac import CompanyCreate, CompanyUserAdd

router = APIRouter(prefix="/dirac/companies", tags=["companies"])

@router.post(
    "",
    summary="Crear empresa",
    description="Crea una empresa y agrega al solicitante como owner."
)
def create_company(payload: CompanyCreate, user=Depends(require_user)):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            "INSERT INTO companies(name, legal_name, cuit) VALUES(%s,%s,%s) "
            "RETURNING id, name, status",
            (payload.name, payload.legal_name, payload.cuit)
        )
        row = cur.fetchone()
        cur.execute(
            "INSERT INTO company_users(company_id, user_id, role, is_primary) "
            "VALUES(%s,%s,'owner',true) ON CONFLICT DO NOTHING",
            (row["id"], user["user_id"])
        )
        conn.commit()
        return row

@router.post(
    "/{company_id}/users",
    summary="Agregar usuario a empresa",
    description="Owner/Admin pueden asignar rol a usuarios dentro de la empresa."
)
def add_user_to_company(company_id: int, payload: CompanyUserAdd, user=Depends(require_user)):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            "SELECT EXISTS(SELECT 1 FROM company_users WHERE company_id=%s AND user_id=%s AND role IN ('owner','admin')) AS ok",
            (company_id, user["user_id"])
        )
        allowed = cur.fetchone()["ok"]
        if not allowed:
            raise HTTPException(403, "Requiere owner/admin en esta empresa")
        cur.execute(
            "INSERT INTO company_users(company_id, user_id, role, is_primary) "
            "VALUES(%s,%s,%s,%s) "
            "ON CONFLICT(company_id,user_id) DO UPDATE SET role=excluded.role, is_primary=excluded.is_primary, updated_at=now()",
            (company_id, payload.user_id, payload.role, payload.is_primary)
        )
        conn.commit()
        return {"ok": True}

@router.get(
    "/{company_id}/users",
    summary="Listar usuarios de la empresa",
    description="Solo visible para owner/admin."
)
def list_company_users(company_id: int, user=Depends(require_user)):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            "SELECT EXISTS(SELECT 1 FROM company_users WHERE company_id=%s AND user_id=%s AND role IN ('owner','admin')) AS ok",
            (company_id, user["user_id"])
        )
        allowed = cur.fetchone()["ok"]
        if not allowed:
            raise HTTPException(403, "Requiere owner/admin en esta empresa")
        cur.execute(
            "SELECT cu.user_id, u.email, u.full_name, cu.role, cu.is_primary "
            "FROM company_users cu JOIN app_users u ON u.id = cu.user_id "
            "WHERE cu.company_id=%s ORDER BY cu.role DESC, u.email",
            (company_id,)
        )
        return cur.fetchall() or []
