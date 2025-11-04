from fastapi import APIRouter, Depends, HTTPException
from psycopg.rows import dict_row
from app.db import get_conn
from app.security import require_user
from app.schemas_dirac import LocationCreate, GrantAccessIn

router = APIRouter(prefix="/dirac/locations", tags=["locations"])

@router.post(
    "",
    summary="Crear localización",
    description="Crea una localización (opcionalmente asignada a empresa)."
)
def create_location(payload: LocationCreate, user=Depends(require_user)):
    if payload.company_id:
        with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                "SELECT EXISTS(SELECT 1 FROM company_users WHERE company_id=%s AND user_id=%s AND role IN ('owner','admin')) AS ok",
                (payload.company_id, user["user_id"])
            )
            allowed = cur.fetchone()["ok"]
            if not allowed:
                raise HTTPException(403, "Requiere owner/admin en la empresa")
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            "INSERT INTO locations(name, address, lat, lon, company_id) VALUES(%s,%s,%s,%s,%s) "
            "RETURNING id, name, company_id",
            (payload.name, payload.address, payload.lat, payload.lon, payload.company_id)
        )
        row = cur.fetchone()
        conn.commit()
        return row

@router.post(
    "/{location_id}/users/{target_user_id}",
    summary="Otorgar acceso a localización",
    description="Asigna view/control/admin a un usuario (requiere admin en la localización)."
)
def grant_access(location_id: int, target_user_id: int, payload: GrantAccessIn, user=Depends(require_user)):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
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
