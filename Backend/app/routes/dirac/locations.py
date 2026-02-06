from fastapi import APIRouter, Depends, HTTPException
from psycopg.rows import dict_row

from app.db import get_conn
from app.security import require_user
from app.schemas_dirac import LocationCreate, GrantAccessIn

router = APIRouter(prefix="/dirac/locations", tags=["locations"])


_ALLOWED_SERVICE_TYPES = {"agua", "cloacas"}


@router.post(
    "",
    summary="Crear/actualizar localización (idempotente por (company_id, name))",
    description="Si (company_id, name) ya existe, actualiza address/lat/lon/service_type y devuelve el mismo id."
)
def create_location(payload: LocationCreate, user=Depends(require_user)):
    # Normalizamos/validamos service_type (si no viene, dejamos que DB defaultee o no pisamos en update)
    service_type = getattr(payload, "service_type", None)
    if service_type is not None:
        service_type = str(service_type).strip().lower()
        if service_type not in _ALLOWED_SERVICE_TYPES:
            raise HTTPException(400, f"service_type inválido: {service_type}. Use 'agua' o 'cloacas'.")

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
                # Sin empresa → insert simple (incluye service_type)
                cur.execute(
                    "INSERT INTO locations(name, address, lat, lon, company_id, service_type) "
                    "VALUES(%s,%s,%s,%s,%s, COALESCE(%s, 'agua')) "
                    "RETURNING id, name, company_id, service_type",
                    (payload.name, payload.address, payload.lat, payload.lon, None, service_type)
                )
                row = cur.fetchone()
                conn.commit()
                return row

            # Con empresa → idempotente por (company_id, name)
            cur.execute(
                "SELECT id FROM locations WHERE company_id=%s AND name=%s",
                (payload.company_id, payload.name)
            )
            found = cur.fetchone()

            if found:
                # Update COALESCE (sólo pisa si mandás dato)
                cur.execute(
                    "UPDATE locations SET "
                    " address       = COALESCE(%s, address),"
                    " lat           = COALESCE(%s, lat),"
                    " lon           = COALESCE(%s, lon),"
                    " service_type  = COALESCE(%s, service_type)"
                    " WHERE id=%s "
                    " RETURNING id, name, company_id, service_type",
                    (payload.address, payload.lat, payload.lon, service_type, found["id"])
                )
                row = cur.fetchone()
                conn.commit()
                return row
            else:
                # Insert nuevo (incluye service_type)
                cur.execute(
                    "INSERT INTO locations(name, address, lat, lon, company_id, service_type) "
                    "VALUES(%s,%s,%s,%s,%s, COALESCE(%s, 'agua')) "
                    "RETURNING id, name, company_id, service_type",
                    (payload.name, payload.address, payload.lat, payload.lon, payload.company_id, service_type)
                )
                row = cur.fetchone()
                conn.commit()
                return row

        except Exception as e:
            conn.rollback()
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
