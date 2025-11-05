# app/routes/dirac_admin/companies.py
from fastapi import APIRouter, HTTPException, Query
from psycopg.rows import dict_row
from pydantic import BaseModel, Field
from app.db import get_conn

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

# ===================== Endpoints =====================
@router.get("/companies", summary="Listar empresas (abierto)")
def list_companies():
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute("SELECT id, name, status FROM companies ORDER BY id DESC")
        return cur.fetchall() or []

@router.get("/companies/{company_id}/users", summary="Usuarios de una empresa (abierto, incluye status)")
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

@router.post("/companies/{company_id}/members", summary="Upsert de membresía (abierto)")
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

@router.patch("/companies/{company_id}", summary="Actualizar datos de la empresa (abierto)")
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
            return row or {}
        except Exception as e:
            conn.rollback()
            raise HTTPException(400, f"Update company error: {e}")

@router.delete("/companies/{company_id}/users/{target_user_id}", summary="Quitar usuario de la empresa (abierto)")
def remove_user_from_company(company_id: int, target_user_id: int):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM company_users WHERE company_id=%s AND user_id=%s", (company_id, target_user_id))
        conn.commit()
        return {"ok": True}

@router.delete("/companies/{company_id}", summary="Eliminar empresa (?force=1 para forzar)")
def delete_company(company_id: int, force: int | None = Query(default=None)):
    force = 1 if str(force).lower() in ("1", "true", "yes") else 0
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        # existe?
        cur.execute("SELECT id FROM companies WHERE id=%s", (company_id,))
        if not cur.fetchone():
            raise HTTPException(404, "Empresa inexistente")

        # conteos
        cur.execute("SELECT COUNT(*) AS n FROM company_users WHERE company_id=%s", (company_id,))
        members = cur.fetchone()["n"]

        cur.execute("SELECT COUNT(*) AS n FROM locations WHERE company_id=%s", (company_id,))
        locs = cur.fetchone()["n"]

        cur.execute(
            """
            SELECT 
              (SELECT COUNT(*) FROM tanks   t JOIN locations l ON l.id=t.location_id WHERE l.company_id=%s) AS tanks,
              (SELECT COUNT(*) FROM pumps   p JOIN locations l ON l.id=p.location_id WHERE l.company_id=%s) AS pumps,
              (SELECT COUNT(*) FROM valves  v JOIN locations l ON l.id=v.location_id WHERE l.company_id=%s) AS valves
            """,
            (company_id, company_id, company_id),
        )
        c = cur.fetchone()
        assets = (c["tanks"] or 0) + (c["pumps"] or 0) + (c["valves"] or 0)

        if not force and (members > 0 or locs > 0 or assets > 0):
            raise HTTPException(
                409,
                {
                    "message": "La empresa tiene dependencias",
                    "counts": {"members": members, "locations": locs, "tanks": c["tanks"], "pumps": c["pumps"], "valves": c["valves"]},
                },
            )

        # -------- Cascade simple (forzar) --------
        # borrar dependencias por company_id
        cur.execute("SELECT id FROM locations WHERE company_id=%s", (company_id,))
        loc_ids = [r["id"] for r in cur.fetchall()]

        if loc_ids:
            # tanks
            cur.execute("SELECT id FROM tanks WHERE location_id = ANY(%s)", (loc_ids,))
            tank_ids = [r["id"] for r in cur.fetchall()]
            if tank_ids:
                cur.execute("DELETE FROM tank_ingest WHERE tank_id = ANY(%s)", (tank_ids,))
                cur.execute("DELETE FROM tank_configs WHERE tank_id = ANY(%s)", (tank_ids,))
                cur.execute("DELETE FROM layout_tanks WHERE tank_id = ANY(%s)", (tank_ids,))
                cur.execute("DELETE FROM tanks WHERE id = ANY(%s)", (tank_ids,))

            # pumps
            cur.execute("SELECT id FROM pumps WHERE location_id = ANY(%s)", (loc_ids,))
            pump_ids = [r["id"] for r in cur.fetchall()]
            if pump_ids:
                cur.execute("DELETE FROM pump_events WHERE pump_id = ANY(%s)", (pump_ids,))
                cur.execute("DELETE FROM pump_commands WHERE pump_id = ANY(%s)", (pump_ids,))
                cur.execute("DELETE FROM pump_heartbeat WHERE pump_id = ANY(%s)", (pump_ids,))
                cur.execute("DELETE FROM layout_pumps WHERE pump_id = ANY(%s)", (pump_ids,))
                cur.execute("DELETE FROM pumps WHERE id = ANY(%s)", (pump_ids,))

            # valves
            cur.execute("SELECT id FROM valves WHERE location_id = ANY(%s)", (loc_ids,))
            valve_ids = [r["id"] for r in cur.fetchall()]
            if valve_ids:
                cur.execute("DELETE FROM layout_valves WHERE valve_id = ANY(%s)", (valve_ids,))
                cur.execute("DELETE FROM valves WHERE id = ANY(%s)", (valve_ids,))

            # manifolds (si aplica)
            cur.execute("DELETE FROM manifolds WHERE location_id = ANY(%s)", (loc_ids,))
            # locations
            cur.execute("DELETE FROM locations WHERE id = ANY(%s)", (loc_ids,))

        # memberships y company
        cur.execute("DELETE FROM company_users WHERE company_id=%s", (company_id,))
        cur.execute("DELETE FROM companies WHERE id=%s", (company_id,))
        conn.commit()
        return {"ok": True, "deleted": company_id, "forced": bool(force)}
