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
        if payload.company_id:
            # Debe ser owner/admin en ESA empresa
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
            else:
                # Idempotente por (company_id, name)
                cur.execute(
                    "INSERT INTO locations(name, address, lat, lon, company_id) "
                    "VALUES(%s,%s,%s,%s,%s) "
                    "ON CONFLICT ON CONSTRAINT uniq_location_per_company_name "
                    "DO UPDATE SET address=EXCLUDED.address, lat=EXCLUDED.lat, lon=EXCLUDED.lon "
                    "RETURNING id, name, company_id",
                    (payload.name, payload.address, payload.lat, payload.lon, payload.company_id)
                )
            row = cur.fetchone()
            conn.commit()
            return row
        except Exception as e:
            conn.rollback()
            raise HTTPException(400, f"Create location error: {e}")
