from fastapi import APIRouter, Depends
from psycopg.rows import dict_row
from app.db import get_conn
from app.security import require_user

router = APIRouter(prefix="/dirac", tags=["me"])


@router.get(
    "/me",
    summary="Datos del usuario y empresas",
    description="Perfil del usuario autenticado y empresas a las que pertenece o tiene acceso.",
)
def my_profile(user=Depends(require_user)):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            SELECT id, email, full_name, status, is_superadmin
            FROM app_users
            WHERE id=%s
            """,
            (user["user_id"],),
        )
        u = cur.fetchone()
        if not u:
            return {"user": {}, "companies": [], "primary_company_id": None}

        cur.execute(
            """
            SELECT c.id AS company_id,
                   c.name AS company_name,
                   cu.role,
                   cu.is_primary
            FROM company_users cu
            JOIN companies c ON c.id = cu.company_id
            WHERE cu.user_id=%s
            ORDER BY cu.is_primary DESC, c.name
            """,
            (user["user_id"],),
        )
        membership = cur.fetchall() or []

        by_id = {int(r["company_id"]): dict(r) for r in membership}

        cur.execute(
            """
            SELECT DISTINCT v.company_id, c.name AS company_name
            FROM v_user_locations v
            JOIN companies c ON c.id = v.company_id
            WHERE v.user_id=%s
            """,
            (user["user_id"],),
        )
        for r in cur.fetchall() or []:
            cid = int(r["company_id"])
            if cid not in by_id:
                by_id[cid] = {
                    "company_id": cid,
                    "company_name": r["company_name"],
                    "role": "viewer",
                    "is_primary": False,
                }

        companies = list(by_id.values())
        primary_company_id = next(
            (int(c["company_id"]) for c in companies if c.get("is_primary")),
            int(companies[0]["company_id"]) if companies else None,
        )

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


@router.get(
    "/me/locations",
    summary="Mis localizaciones",
    description="Localizaciones a las que el usuario autenticado tiene acceso efectivo.",
)
def my_locations(user=Depends(require_user)):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            "SELECT location_id, location_name, access, company_id "
            "FROM v_user_locations WHERE user_id=%s ORDER BY location_name",
            (user["user_id"],),
        )
        return cur.fetchall() or []


@router.get(
    "/me/pumps",
    summary="Mis bombas",
    description="Bombas dentro de las localizaciones a las que el usuario autenticado tiene acceso.",
)
def my_pumps(user=Depends(require_user)):
    sql = (
        "SELECT p.id, p.name, p.location_id "
        "FROM v_user_locations vul "
        "JOIN pumps p ON p.location_id = vul.location_id "
        "WHERE vul.user_id=%s ORDER BY p.name"
    )
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(sql, (user["user_id"],))
        return cur.fetchall() or []
