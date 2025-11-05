from fastapi import APIRouter, Depends, HTTPException
from psycopg.rows import dict_row
from app.db import get_conn
from app.security import require_user
from app.schemas_dirac import LocationCreate, GrantAccessIn

router = APIRouter(prefix="/dirac/locations", tags=["locations"])

@router.post(
    "",
    summary="Crear/actualizar localización (idempotente por (company_id, name))",
    description="Si (company_id, name) ya existe, actualiza address/lat/lon y devuelve el mismo id."
)
def create_location(payload: LocationCreate, user=Depends(require_user)):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        # Si viene empresa, el usuario debe ser owner/admin EN ESA empresa
        if payload.company_id:
            cur.execute(
                "SELECT EXISTS(SELECT 1 FROM company_users "
                "WHERE company_id=%s AND user_id=%s AND role IN ('owner','admin')) AS ok",
                (payload.company_id, user["user_id"])
            )
            if not cur.fetchone()["ok"]:
                raise HTTPException(403, "Requiere owner/admin en la empresa")

        try:
            if payload.company_id is None:
                # Sin empresa → no aplica índice único parcial: insert simple
                cur.execute(
                    "INSERT INTO locations(name, address, lat, lon, company_id) "
                    "VALUES(%s,%s,%s,%s,%s) "
                    "RETURNING id, name, company_id",
                    (payload.name, payload.address, payload.lat, payload.lon, None)
                )
                row = cur.fetchone()
                conn.commit()
                return row

            # Con empresa → idempotente por (company_id, name) sin depender del nombre del constraint
            # 1) Ver si ya existe (company_id, name)
            cur.execute(
                "SELECT id FROM locations WHERE company_id=%s AND name=%s",
                (payload.company_id, payload.name)
            )
            found = cur.fetchone()

            if found:
                # 2) Update COALESCE (sólo pisa si mandás dato)
                cur.execute(
                    "UPDATE locations SET "
                    " address = COALESCE(%s, address),"
                    " lat     = COALESCE(%s, lat),"
                    " lon     = COALESCE(%s, lon)"
                    " WHERE id=%s "
                    " RETURNING id, name, company_id",
                    (payload.address, payload.lat, payload.lon, found["id"])
                )
                row = cur.fetchone()
                conn.commit()
                return row
            else:
                # 3) Insert nuevo
                cur.execute(
                    "INSERT INTO locations(name, address, lat, lon, company_id) "
                    "VALUES(%s,%s,%s,%s,%s) "
                    "RETURNING id, name, company_id",
                    (payload.name, payload.address, payload.lat, payload.lon, payload.company_id)
                )
                row = cur.fetchone()
                conn.commit()
                return row

        except Exception as e:
            conn.rollback()
            # Devolvé el detalle en 400 (no 500)
            raise HTTPException(400, f"Create location error: {e}")

@router.post(
    "/{location_id}/users/{target_user_id}",
    summary="Otorgar acceso a localización",
    description="Asigna view/control/admin a un usuario (requiere admin en la localización)."
)
def grant_access(location_id: int, target_user_id: int, payload: GrantAccessIn, user=Depends(require_user)):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        # Debés ser admin en esa localización (efectivo)
        cur.execute(
            "SELECT EXISTS(SELECT 1 FROM v_user_locations WHERE user_id=%s AND location_id=%s AND access='admin') AS ok",
            (user["user_id"], location_id)
        )
        allowed = cur.fetchone()["ok"]
        if not allowed:
            raise HTTPException(403, "Requiere admin en la localización")
        cur.execute(
            "INSERT INTO user_location_access(user_id, location_id, access) VALUES(%s,%s,%s) "
            "ON CONFLICT(user_id, location_id) DO UPDATE SET access=excluded.access, created_at=now()",
            (target_user_id, location_id, payload.access)
        )
        conn.commit()
        return {"ok": True}
