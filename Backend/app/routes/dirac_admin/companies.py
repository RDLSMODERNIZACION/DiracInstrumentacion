# app/routes/dirac_admin/companies.py
from fastapi import APIRouter, HTTPException, Query
from psycopg.rows import dict_row
from pydantic import BaseModel, Field
from app.db import get_conn

router = APIRouter(prefix="/dirac/admin", tags=["admin-companies"])

# ===================== Modelos =====================

class CompanyCreateIn(BaseModel):
    name: str = Field(..., min_length=1)
    legal_name: str | None = None
    cuit: str | None = None

class CompanyPatch(BaseModel):
    name: str | None = None
    legal_name: str | None = None
    cuit: str | None = None

class MemberUpsertIn(BaseModel):
    user_id: int = Field(..., description="Usuario a asignar a la empresa")
    role: str = Field(default="viewer", description="Enum membership_role_enum")
    is_primary: bool = False


# ===================== Endpoints =====================

@router.post("/companies", summary="Crear empresa (idempotente por nombre)")
def create_company(payload: CompanyCreateIn):
    name = payload.name.strip()
    if not name:
        raise HTTPException(400, "name requerido")

    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        # Si ya existe por nombre (case-insensitive), actualiza opcionales y devuelve la misma
        cur.execute("SELECT id FROM companies WHERE lower(name)=lower(%s)", (name,))
        found = cur.fetchone()
        if found:
            cur.execute(
                """
                UPDATE companies
                   SET legal_name = COALESCE(%s, legal_name),
                       cuit       = COALESCE(%s, cuit)
                 WHERE id=%s
             RETURNING id, name, status, legal_name, cuit
                """,
                (payload.legal_name, payload.cuit, found["id"]),
            )
            row = cur.fetchone()
            conn.commit()
            return row

        # Crear nueva
        cur.execute(
            """
            INSERT INTO companies(name, legal_name, cuit)
            VALUES (%s,%s,%s)
            RETURNING id, name, status, legal_name, cuit
            """,
            (name, payload.legal_name, payload.cuit),
        )
        row = cur.fetchone()
        conn.commit()
        return row


@router.get("/companies", summary="Listar empresas")
def list_companies():
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute("SELECT id, name, status, legal_name, cuit FROM companies ORDER BY id DESC")
        return cur.fetchall() or []


@router.get("/companies/{company_id}/users", summary="Listar usuarios de una empresa (con rol, is_primary y status)")
def list_company_users(company_id: int):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
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


@router.post("/companies/{company_id}/members", summary="Upsert de membresía (role/is_primary) en una empresa")
def upsert_member(company_id: int, payload: MemberUpsertIn):
    role_in = (payload.role or "viewer").strip().lower()
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
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


@router.patch("/companies/{company_id}", summary="Actualizar datos de la empresa")
def patch_company(company_id: int, payload: CompanyPatch):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
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
            if not row:
                raise HTTPException(404, "Empresa inexistente")
            conn.commit()
            return row
        except Exception as e:
            conn.rollback()
            raise HTTPException(400, f"Update company error: {e}")


@router.delete("/companies/{company_id}/users/{target_user_id}", summary="Quitar usuario de la empresa")
def remove_user_from_company(company_id: int, target_user_id: int):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM company_users WHERE company_id=%s AND user_id=%s", (company_id, target_user_id))
        conn.commit()
        return {"ok": True}


@router.delete("/companies/{company_id}", summary="Eliminar empresa (?force=1 borra TODO en cascada)")
def delete_company(company_id: int, force: bool = Query(default=False)):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        # Existe?
        cur.execute("SELECT id FROM companies WHERE id=%s", (company_id,))
        if not cur.fetchone():
            raise HTTPException(404, "Empresa inexistente")

        if not force:
            # Validar que esté vacía
            cur.execute("SELECT COUNT(*) AS n FROM company_users WHERE company_id=%s", (company_id,))
            members = cur.fetchone()["n"]
            cur.execute("SELECT COUNT(*) AS n FROM locations WHERE company_id=%s", (company_id,))
            locs = cur.fetchone()["n"]
            if (members or 0) > 0 or (locs or 0) > 0:
                raise HTTPException(409, {"message": "La empresa tiene usuarios y/o localizaciones", "members": members, "locations": locs})

            cur.execute("DELETE FROM companies WHERE id=%s", (company_id,))
            conn.commit()
            return {"ok": True, "deleted": company_id, "forced": False}

        # FORZADO: borrar activos -> locations -> membresías -> empresa
        # Activos por localizaciones de la empresa
        cur.execute("SELECT id FROM locations WHERE company_id=%s", (company_id,))
        loc_ids = [r["id"] for r in (cur.fetchall() or [])]

        if loc_ids:
            in_tuple = tuple(loc_ids)
            # tank_configs depende de tanks
            cur.execute(f"DELETE FROM tank_configs WHERE tank_id IN (SELECT id FROM tanks WHERE location_id IN %s)", (in_tuple,))
            # assets
            cur.execute("DELETE FROM tanks  WHERE location_id = ANY(%s)", (loc_ids,))
            cur.execute("DELETE FROM pumps  WHERE location_id = ANY(%s)", (loc_ids,))
            cur.execute("DELETE FROM valves WHERE location_id = ANY(%s)", (loc_ids,))
            # locations
            cur.execute("DELETE FROM locations WHERE id = ANY(%s)", (loc_ids,))

        # membresías
        cur.execute("DELETE FROM company_users WHERE company_id=%s", (company_id,))
        # empresa
        cur.execute("DELETE FROM companies WHERE id=%s", (company_id,))
        conn.commit()
        return {"ok": True, "deleted": company_id, "forced": True}
