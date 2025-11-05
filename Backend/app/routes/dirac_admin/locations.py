# app/routes/dirac_admin/locations.py
from fastapi import APIRouter, Depends, HTTPException, Query
from psycopg.rows import dict_row
from app.db import get_conn
from app.security import require_user

router = APIRouter(prefix="/dirac/admin", tags=["admin-locations"])

def assert_is_admin_in_company(cur, user_id: int, company_id: int):
    cur.execute(
        "SELECT EXISTS(SELECT 1 FROM company_users WHERE user_id=%s AND company_id=%s AND role IN ('owner','admin')) AS ok",
        (user_id, company_id),
    )
    if not cur.fetchone()["ok"]:
        raise HTTPException(403, "Requiere owner/admin en la empresa")

@router.get("/locations", summary="Listar localizaciones (admin)")
def list_locations(company_id: int | None = Query(default=None), user=Depends(require_user)):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        # Admin/owner en alguna empresa
        cur.execute("SELECT EXISTS(SELECT 1 FROM company_users WHERE user_id=%s AND role IN ('owner','admin')) AS ok", (user["user_id"],))
        if not cur.fetchone()["ok"]:
            raise HTTPException(403, "Requiere owner/admin")

        if company_id:
            cur.execute("SELECT id, name, company_id, address, lat, lon FROM locations WHERE company_id=%s ORDER BY name", (company_id,))
        else:
            cur.execute("SELECT id, name, company_id, address, lat, lon FROM locations ORDER BY company_id, name")
        return cur.fetchall() or []

@router.get("/locations/{location_id}/stats", summary="Estadísticas de una localización (conteo de activos)")
def location_stats(location_id: int, user=Depends(require_user)):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute("SELECT id, name, company_id FROM locations WHERE id=%s", (location_id,))
        loc = cur.fetchone()
        if not loc:
            raise HTTPException(404, "Localización inexistente")

        assert_is_admin_in_company(cur, user["user_id"], loc["company_id"])

        cur.execute("SELECT COUNT(*) AS n FROM tanks WHERE location_id=%s", (location_id,))
        tk = cur.fetchone()["n"]
        cur.execute("SELECT COUNT(*) AS n FROM pumps WHERE location_id=%s", (location_id,))
        pu = cur.fetchone()["n"]
        cur.execute("SELECT COUNT(*) AS n FROM valves WHERE location_id=%s", (location_id,))
        va = cur.fetchone()["n"]

        return {
            "location_id": location_id,
            "company_id": loc["company_id"],
            "name": loc["name"],
            "counts": {"tanks": tk, "pumps": pu, "valves": va},
        }

class LocationPatchIn:
    # lo hacemos minimalista; si querés, podés cambiar a Pydantic BaseModel
    pass

@router.patch("/locations/{location_id}", summary="Actualizar localización (nombre/dire/coords)")
def patch_location(
    location_id: int,
    name: str | None = Query(default=None),
    address: str | None = Query(default=None),
    lat: float | None = Query(default=None),
    lon: float | None = Query(default=None),
    user=Depends(require_user),
):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute("SELECT id, company_id, name FROM locations WHERE id=%s", (location_id,))
        loc = cur.fetchone()
        if not loc:
            raise HTTPException(404, "Localización inexistente")

        assert_is_admin_in_company(cur, user["user_id"], loc["company_id"])

        try:
            cur.execute(
                "UPDATE locations SET "
                "name = COALESCE(%s, name), "
                "address = COALESCE(%s, address), "
                "lat = COALESCE(%s, lat), "
                "lon = COALESCE(%s, lon) "
                "WHERE id=%s "
                "RETURNING id, name, company_id, address, lat, lon",
                (name, address, lat, lon, location_id),
            )
            row = cur.fetchone()
            conn.commit()
            return row or {}
        except Exception as e:
            conn.rollback()
            raise HTTPException(400, f"Update location error: {e}")

@router.delete("/locations/{location_id}", summary="Eliminar localización (opcional mover activos con ?move_to=ID)")
def delete_location(
    location_id: int,
    move_to: int | None = Query(default=None, description="Mover activos a otra localización antes de eliminar"),
    user=Depends(require_user),
):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        # Traer loc y empresa
        cur.execute("SELECT id, company_id, name FROM locations WHERE id=%s", (location_id,))
        loc = cur.fetchone()
        if not loc:
            raise HTTPException(404, "Localización inexistente")

        assert_is_admin_in_company(cur, user["user_id"], loc["company_id"])

        # Contar activos
        cur.execute("SELECT COUNT(*) AS n FROM tanks WHERE location_id=%s", (location_id,))
        tk = cur.fetchone()["n"]
        cur.execute("SELECT COUNT(*) AS n FROM pumps WHERE location_id=%s", (location_id,))
        pu = cur.fetchone()["n"]
        cur.execute("SELECT COUNT(*) AS n FROM valves WHERE location_id=%s", (location_id,))
        va = cur.fetchone()["n"]
        total = (tk or 0) + (pu or 0) + (va or 0)

        # Si hay que mover, validar destino
        if move_to is not None:
            if move_to == location_id:
                raise HTTPException(400, "move_to no puede ser la misma localización")
            cur.execute("SELECT id, company_id FROM locations WHERE id=%s", (move_to,))
            dst = cur.fetchone()
            if not dst:
                raise HTTPException(400, f"move_to={move_to} no existe")
            if dst["company_id"] != loc["company_id"]:
                raise HTTPException(400, "move_to debe pertenecer a la misma empresa")

            # Mover activos
            cur.execute("UPDATE tanks  SET location_id=%s WHERE location_id=%s", (move_to, location_id))
            cur.execute("UPDATE pumps  SET location_id=%s WHERE location_id=%s", (move_to, location_id))
            cur.execute("UPDATE valves SET location_id=%s WHERE location_id=%s", (move_to, location_id))
            # Ahora sí borrar
            cur.execute("DELETE FROM locations WHERE id=%s", (location_id,))
            conn.commit()
            return {"ok": True, "moved_to": move_to, "deleted": location_id}

        # Si no se pidió mover y hay activos, bloquear con 409
        if total > 0:
            raise HTTPException(
                status_code=409,
                detail={"message": "La localización tiene activos asignados", "counts": {"tanks": tk, "pumps": pu, "valves": va}},
            )

        # Sin activos → borrar directo
        cur.execute("DELETE FROM locations WHERE id=%s", (location_id,))
        conn.commit()
        return {"ok": True, "deleted": location_id}
