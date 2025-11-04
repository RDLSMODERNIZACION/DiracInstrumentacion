from fastapi import APIRouter, Depends
from psycopg.rows import dict_row
from app.db import get_conn
from app.security import require_user

router = APIRouter(prefix="/dirac", tags=["me"])

@router.get(
    "/me/locations",
    summary="Mis localizaciones",
    description="Localizaciones a las que el usuario autenticado tiene acceso efectivo."
)
def my_locations(user=Depends(require_user)):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            "SELECT location_id, location_name, access, company_id "
            "FROM v_user_locations WHERE user_id=%s ORDER BY location_name",
            (user["user_id"],)
        )
        return cur.fetchall() or []

@router.get(
    "/me/pumps",
    summary="Mis bombas",
    description="Bombas dentro de las localizaciones a las que el usuario autenticado tiene acceso."
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
