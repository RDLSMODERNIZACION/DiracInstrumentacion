# app/routes/dirac_me.py
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, Query, HTTPException
from psycopg.rows import dict_row

from app.db import get_conn
from app.security import require_user

router = APIRouter(prefix="/dirac", tags=["me"])

def _row_or_404(cur, q, args, not_found_msg="Not found"):
    cur.execute(q, args)
    row = cur.fetchone()
    if not row:
        raise HTTPException(404, not_found_msg)
    return row

@router.get("/me", summary="Datos del usuario + empresas a las que pertenece o tiene acceso")
def get_me(user = Depends(require_user)):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        # Perfil básico
        u = _row_or_404(cur, """
            SELECT id, email, full_name, status, is_superadmin
            FROM app_users WHERE id=%s
        """, (user["user_id"],), "Usuario no encontrado")

        # Empresas por membresía explícita
        cur.execute("""
            SELECT c.id AS company_id, c.name AS company_name,
                   cu.role, cu.is_primary
            FROM company_users cu
            JOIN companies c ON c.id = cu.company_id
            WHERE cu.user_id = %s
        """, (user["user_id"],))
        membership = {r["company_id"]: r for r in cur.fetchall()}

        # Empresas por accesos efectivos (puede no haber membresía)
        cur.execute("""
            SELECT DISTINCT v.company_id, c.name AS company_name
            FROM v_user_locations v
            JOIN companies c ON c.id = v.company_id
            WHERE v.user_id = %s
        """, (user["user_id"],))
        via_access = {}
        for r in cur.fetchall():
            if r["company_id"] not in membership:
                via_access[r["company_id"]] = {
                    "company_id": r["company_id"],
                    "company_name": r["company_name"],
                    "role": "viewer",         # por defecto
                    "is_primary": False,
                }

        companies = list(membership.values()) + list(via_access.values())

        # Primary heurística si no hay is_primary
        primary_company_id = None
        for c in companies:
            if c.get("is_primary"):
                primary_company_id = c["company_id"]; break
        if primary_company_id is None and companies:
            primary_company_id = companies[0]["company_id"]

        return {
            "user": {
                "id": u["id"],
                "email": u["email"],
                "full_name": u["full_name"],
                "status": u["status"],
                "is_superadmin": bool(u["is_superadmin"]),
            },
            "companies": companies,
            "primary_company_id": primary_company_id,
        }

@router.get("/me/locations", summary="Locaciones del usuario (effective/explicit)")
def get_my_locations(
    company_id: Optional[int] = Query(None),
    user = Depends(require_user),
):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        # explicit
        q_exp = """
            SELECT ula.user_id, ula.location_id,
                   l.name AS location_name, l.company_id,
                   ula.access
            FROM user_location_access ula
            JOIN locations l ON l.id = ula.location_id
            WHERE ula.user_id = %s
        """
        params_exp = [user["user_id"]]
        if company_id is not None:
            q_exp += " AND l.company_id = %s"
            params_exp.append(company_id)
        q_exp += " ORDER BY l.id"
        cur.execute(q_exp, params_exp)
        explicit = cur.fetchall() or []

        # effective (vista ya resuelve empresa + unifica niveles)
        q_eff = """
            SELECT v.user_id, v.location_id, l.name AS location_name,
                   v.company_id, v.access
            FROM v_user_locations v
            JOIN locations l ON l.id = v.location_id
            WHERE v.user_id = %s
        """
        params_eff = [user["user_id"]]
        if company_id is not None:
            q_eff += " AND v.company_id = %s"
            params_eff.append(company_id)
        q_eff += " ORDER BY l.id"
        cur.execute(q_eff, params_eff)
        effective = cur.fetchall() or []

        return {"explicit": explicit, "effective": effective}

@router.get("/me/summary", summary="Resumen de activos accesibles (por empresa)")
def get_my_summary(
    company_id: int = Query(..., description="Empresa sobre la que se calcula el resumen"),
    user = Depends(require_user),
):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        # Verificar que el usuario tenga al menos una locación accesible en la empresa
        cur.execute("""
            SELECT 1
            FROM v_user_locations
            WHERE user_id=%s AND company_id=%s
            LIMIT 1
        """, (user["user_id"], company_id))
        if not cur.fetchone():
            # Podría ser viewer sin accesos en esa empresa: devolvemos todo en 0
            return {"company_id": company_id, "locations": 0, "tanks": 0, "pumps": 0, "valves": 0}

        # Locations
        cur.execute("""
            SELECT COUNT(DISTINCT v.location_id) AS n
            FROM v_user_locations v
            WHERE v.user_id=%s AND v.company_id=%s
        """, (user["user_id"], company_id))
        n_loc = int(cur.fetchone()["n"])

        # Tanks
        cur.execute("""
            SELECT COUNT(DISTINCT t.id) AS n
            FROM tanks t
            JOIN v_user_locations v ON v.location_id = t.location_id
            WHERE v.user_id=%s AND v.company_id=%s
        """, (user["user_id"], company_id))
        n_tanks = int(cur.fetchone()["n"])

        # Pumps
        cur.execute("""
            SELECT COUNT(DISTINCT p.id) AS n
            FROM pumps p
            JOIN v_user_locations v ON v.location_id = p.location_id
            WHERE v.user_id=%s AND v.company_id=%s
        """, (user["user_id"], company_id))
        n_pumps = int(cur.fetchone()["n"])

        # Valves
        cur.execute("""
            SELECT COUNT(DISTINCT v2.id) AS n
            FROM valves v2
            JOIN v_user_locations v ON v.location_id = v2.location_id
            WHERE v.user_id=%s AND v.company_id=%s
        """, (user["user_id"], company_id))
        n_valves = int(cur.fetchone()["n"])

        return {
            "company_id": company_id,
            "locations": n_loc,
            "tanks": n_tanks,
            "pumps": n_pumps,
            "valves": n_valves,
        }
