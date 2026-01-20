from fastapi import APIRouter, Depends, HTTPException
from psycopg.rows import dict_row
import logging

from app.db import get_conn
from app.security import require_user

log = logging.getLogger(__name__)

router = APIRouter(prefix="/dirac", tags=["me"])

@router.get("/me/locations")
def my_locations(user=Depends(require_user)):
    try:
        with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                "SELECT location_id, location_name, access, company_id "
                "FROM v_user_locations WHERE user_id=%s ORDER BY location_name",
                (user["user_id"],)
            )
            return cur.fetchall() or []
    except Exception as e:
        # 👇 Esto te va a decir EXACTAMENTE qué está fallando (vista, permisos, columna, etc.)
        log.exception("ERROR /dirac/me/locations user=%s", user)
        raise HTTPException(status_code=500, detail=str(e))
