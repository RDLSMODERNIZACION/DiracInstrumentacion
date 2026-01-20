from fastapi import APIRouter, Depends, HTTPException
from psycopg.rows import dict_row
from psycopg_pool import PoolTimeout, TooManyRequests
import logging

from app.db import get_conn
from app.security import require_user

log = logging.getLogger(__name__)

router = APIRouter(prefix="/dirac", tags=["me"])


@router.get(
    "/me/locations",
    summary="Mis localizaciones",
    description="Localizaciones a las que el usuario autenticado tiene acceso efectivo."
)
def my_locations(user=Depends(require_user)):
    # ✅ Validación defensiva (evita 500 si require_user devuelve algo inesperado)
    user_id = None
    try:
        user_id = user.get("user_id") if isinstance(user, dict) else None
    except Exception:
        user_id = None

    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")

    try:
        # ✅ timeout corto para no colgar el login si el pool está bajo presión
        with get_conn(timeout=2) as conn, conn.cursor(row_factory=dict_row) as cur:
            # ✅ límite de tiempo por query (solo para esta transacción/conexión)
            # Evita que una view pesada te secuestre conexiones
            try:
                cur.execute("SET LOCAL statement_timeout = 5000")  # 5s
            except Exception:
                # si por permisos/config no se puede, no rompe el endpoint
                pass

            cur.execute(
                """
                SELECT location_id, location_name, access, company_id
                FROM v_user_locations
                WHERE user_id = %s
                ORDER BY location_name
                """,
                (user_id,),
            )
            return cur.fetchall() or []

    except (PoolTimeout, TooManyRequests) as e:
        # ✅ Cuando el pool está saturado NO devolvemos 500 (rompe el front),
        # devolvemos 503 para que el cliente pueda reintentar con backoff.
        log.warning("DB pool busy in /dirac/me/locations user_id=%s err=%s", user_id, e)
        raise HTTPException(status_code=503, detail="DB busy, try again")

    except Exception:
        # ✅ Log completo para ver la causa real del 500 en Render
        log.exception("Error en /dirac/me/locations user_id=%s", user_id)
        raise HTTPException(status_code=500, detail="Internal error")


@router.get(
    "/me/pumps",
    summary="Mis bombas",
    description="Bombas dentro de las localizaciones a las que el usuario autenticado tiene acceso."
)
def my_pumps(user=Depends(require_user)):
    user_id = None
    try:
        user_id = user.get("user_id") if isinstance(user, dict) else None
    except Exception:
        user_id = None

    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")

    sql = (
        "SELECT p.id, p.name, p.location_id "
        "FROM v_user_locations vul "
        "JOIN pumps p ON p.location_id = vul.location_id "
        "WHERE vul.user_id=%s ORDER BY p.name"
    )

    try:
        # timeout algo mayor (pumps puede tardar un poco más)
        with get_conn(timeout=3) as conn, conn.cursor(row_factory=dict_row) as cur:
            try:
                cur.execute("SET LOCAL statement_timeout = 8000")  # 8s
            except Exception:
                pass

            cur.execute(sql, (user_id,))
            return cur.fetchall() or []

    except (PoolTimeout, TooManyRequests) as e:
        log.warning("DB pool busy in /dirac/me/pumps user_id=%s err=%s", user_id, e)
        raise HTTPException(status_code=503, detail="DB busy, try again")

    except Exception:
        log.exception("Error en /dirac/me/pumps user_id=%s", user_id)
        raise HTTPException(status_code=500, detail="Internal error")
