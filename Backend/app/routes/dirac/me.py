from fastapi import APIRouter, Depends, HTTPException
from psycopg.rows import dict_row
from psycopg_pool import PoolTimeout, TooManyRequests
import logging

from app.db import get_conn
from app.security import require_user

log = logging.getLogger(__name__)

router = APIRouter(prefix="/dirac", tags=["me"])

@router.get("/me/locations")
def my_locations(user=Depends(require_user)):
    try:
        with get_conn(timeout=1.5) as conn, conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                "SELECT location_id, location_name, access, company_id "
                "FROM v_user_locations WHERE user_id=%s ORDER BY location_name",
                (user["user_id"],)
            )
            return cur.fetchall() or []
    except (PoolTimeout, TooManyRequests) as e:
        log.warning("DB busy /dirac/me/locations user_id=%s err=%s", user.get("user_id"), e)
        raise HTTPException(status_code=503, detail="DB busy, try again")
    except Exception as e:
        log.exception("ERROR /dirac/me/locations user=%s", user)
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {e}")
