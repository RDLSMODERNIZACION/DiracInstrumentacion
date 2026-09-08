# app/routes/dirac_admin/locations.py
from fastapi import APIRouter, Depends, HTTPException, Query
from psycopg.rows import dict_row
from pydantic import BaseModel, field_validator, Field
from typing import Optional

from app.db import get_conn
from app.security import require_user

router = APIRouter(prefix="/dirac/admin", tags=["admin-locations"])


class LocationCreate(BaseModel):
    company_id: int
    name: str
    address: Optional[str] = None
    lat: Optional[float] = Field(default=None, ge=-90.0, le=90.0)
    lon: Optional[float] = Field(default=None, ge=-180.0, le=180.0)

    @field_validator("name")
    @classmethod
    def _trim(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("name requerido")
        return v


def _resolve_admin_company(cur, user: dict, requested_company_id: int | None) -> int:
    if requested_company_id is not None:
        cur.execute(
            """
            SELECT 1 FROM company_users
            WHERE user_id=%s AND company_id=%s
              AND role IN ('owner','admin')
            LIMIT 1
            """,
            (user["user_id"], requested_company_id),
        )
        if not cur.fetchone():
            raise HTTPException(403, "No podés administrar esa empresa")
        return int(requested_company_id)

    cur.execute(
        """
        SELECT company_id
        FROM company_users
        WHERE user_id=%s AND role IN ('owner','admin')
        ORDER BY is_primary DESC, company_id ASC
        LIMIT 1
        """,
        (user["user_id"],),
    )
    row = cur.fetchone()
    if not row:
        raise HTTPException(403, "Tu usuario no tiene una empresa administrable")
    return int(row["company_id"])


def _get_scoped_location(cur, location_id: int, company_id: int):
    cur.execute(
        "SELECT id, name, company_id, address, lat, lon FROM locations WHERE id=%s AND company_id=%s",
        (location_id, company_id),
    )
    row = cur.fetchone()
    if not row:
        raise HTTPException(404, "Localización inexistente en esta empresa")
    return row


@router.post("/locations", summary="Crear/usar localización en la empresa administrada", status_code=201)
def create_location(
    payload: LocationCreate,
    company_id: int | None = Query(default=None),
    user=Depends(require_user),
):
    name = payload.name.strip()

    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        target_company_id = _resolve_admin_company(
            cur, user, company_id if company_id is not None else payload.company_id
        )

        cur.execute(
            "SELECT id, name, company_id, address, lat, lon FROM locations WHERE company_id=%s AND lower(name)=lower(%s)",
            (target_company_id, name),
        )
        existing = cur.fetchone()

        try:
            if existing:
                cur.execute(
                    """
                    UPDATE locations
                       SET address=COALESCE(%s,address),
                           lat=COALESCE(%s,lat),
                           lon=COALESCE(%s,lon)
                     WHERE id=%s
                 RETURNING id,name,company_id,address,lat,lon
                    """,
                    (payload.address, payload.lat, payload.lon, existing["id"]),
                )
                row = cur.fetchone()
                conn.commit()
                return row or existing

            cur.execute(
                """
                INSERT INTO locations(company_id,name,address,lat,lon)
                VALUES (%s,%s,%s,%s,%s)
                RETURNING id,name,company_id,address,lat,lon
                """,
                (target_company_id, name, payload.address, payload.lat, payload.lon),
            )
            row = cur.fetchone()
            conn.commit()
            return row
        except Exception as e:
            conn.rollback()
            raise HTTPException(400, f"Create location error: {e}")


@router.get("/locations", summary="Listar localizaciones de la empresa administrada")
def list_locations(
    company_id: int | None = Query(default=None),
    user=Depends(require_user),
):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        target_company_id = _resolve_admin_company(cur, user, company_id)
        cur.execute(
            """
            SELECT id,name,company_id,address,lat,lon
            FROM locations
            WHERE company_id=%s
            ORDER BY name
            """,
            (target_company_id,),
        )
        return cur.fetchall() or []


@router.get("/locations/{location_id}/stats", summary="Estadísticas de una localización de la empresa")
def location_stats(
    location_id: int,
    company_id: int | None = Query(default=None),
    user=Depends(require_user),
):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        target_company_id = _resolve_admin_company(cur, user, company_id)
        loc = _get_scoped_location(cur, location_id, target_company_id)

        cur.execute("SELECT COUNT(*) AS n FROM tanks WHERE location_id=%s", (location_id,))
        tk = cur.fetchone()["n"]
        cur.execute("SELECT COUNT(*) AS n FROM pumps WHERE location_id=%s", (location_id,))
        pu = cur.fetchone()["n"]
        cur.execute("SELECT COUNT(*) AS n FROM valves WHERE location_id=%s", (location_id,))
        va = cur.fetchone()["n"]

        return {
            "location_id": location_id,
            "company_id": target_company_id,
            "name": loc["name"],
            "counts": {"tanks": tk, "pumps": pu, "valves": va},
        }


@router.patch("/locations/{location_id}", summary="Actualizar localización de la empresa")
def patch_location(
    location_id: int,
    name: str | None = Query(default=None),
    address: str | None = Query(default=None),
    lat: float | None = Query(default=None),
    lon: float | None = Query(default=None),
    company_id: int | None = Query(default=None),
    user=Depends(require_user),
):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        target_company_id = _resolve_admin_company(cur, user, company_id)
        _get_scoped_location(cur, location_id, target_company_id)

        try:
            cur.execute(
                """
                UPDATE locations
                   SET name=COALESCE(%s,name),
                       address=COALESCE(%s,address),
                       lat=COALESCE(%s,lat),
                       lon=COALESCE(%s,lon)
                 WHERE id=%s AND company_id=%s
             RETURNING id,name,company_id,address,lat,lon
                """,
                (
                    name.strip() if isinstance(name, str) else name,
                    address,
                    lat,
                    lon,
                    location_id,
                    target_company_id,
                ),
            )
            row = cur.fetchone()
            conn.commit()
            return row or {}
        except Exception as e:
            conn.rollback()
            raise HTTPException(400, f"Update location error: {e}")


@router.delete("/locations/{location_id}", summary="Eliminar localización de la empresa")
def delete_location(
    location_id: int,
    move_to: int | None = Query(default=None),
    company_id: int | None = Query(default=None),
    user=Depends(require_user),
):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        target_company_id = _resolve_admin_company(cur, user, company_id)
        _get_scoped_location(cur, location_id, target_company_id)

        cur.execute("SELECT COUNT(*) AS n FROM tanks WHERE location_id=%s", (location_id,))
        tk = cur.fetchone()["n"]
        cur.execute("SELECT COUNT(*) AS n FROM pumps WHERE location_id=%s", (location_id,))
        pu = cur.fetchone()["n"]
        cur.execute("SELECT COUNT(*) AS n FROM valves WHERE location_id=%s", (location_id,))
        va = cur.fetchone()["n"]
        total = (tk or 0) + (pu or 0) + (va or 0)

        if move_to is not None:
            if move_to == location_id:
                raise HTTPException(400, "move_to no puede ser la misma localización")
            _get_scoped_location(cur, move_to, target_company_id)

            cur.execute("UPDATE tanks SET location_id=%s WHERE location_id=%s", (move_to, location_id))
            cur.execute("UPDATE pumps SET location_id=%s WHERE location_id=%s", (move_to, location_id))
            cur.execute("UPDATE valves SET location_id=%s WHERE location_id=%s", (move_to, location_id))
            cur.execute("DELETE FROM locations WHERE id=%s AND company_id=%s", (location_id, target_company_id))
            conn.commit()
            return {"ok": True, "moved_to": move_to, "deleted": location_id}

        if total > 0:
            raise HTTPException(
                409,
                {
                    "message": "La localización tiene activos asignados",
                    "counts": {"tanks": tk, "pumps": pu, "valves": va},
                },
            )

        cur.execute("DELETE FROM locations WHERE id=%s AND company_id=%s", (location_id, target_company_id))
        conn.commit()
        return {"ok": True, "deleted": location_id}
