# app/routes/dirac_admin/locations.py
from fastapi import APIRouter, HTTPException, Query
from psycopg.rows import dict_row
from pydantic import BaseModel, field_validator, Field
from typing import Optional
from app.db import get_conn

router = APIRouter(prefix="/dirac/admin", tags=["admin-locations"])


# -----------------------------
# Modelo para creación (abierto)
# -----------------------------

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


@router.post("/locations", summary="Crear/usar localización (abierto)", status_code=201)
def create_location(payload: LocationCreate):
    """
    Abierto: permite crear una localización para cualquier empresa existente.
    Si ya existe una localización con el mismo (company_id, lower(name)), la actualiza parcialmente (address/lat/lon).
    """
    name = payload.name.strip()

    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        # Validar empresa existente (FK)
        cur.execute("SELECT id FROM companies WHERE id=%s", (payload.company_id,))
        if not cur.fetchone():
            raise HTTPException(404, "Empresa inexistente")

        # ¿Existe (company_id, lower(name))?
        cur.execute(
            "SELECT id, name, company_id, address, lat, lon FROM locations WHERE company_id=%s AND lower(name)=lower(%s)",
            (payload.company_id, name),
        )
        existing = cur.fetchone()

        try:
            if existing:
                # Upsert "suave": solo pisa lo que venga no-nulo
                cur.execute(
                    """
                    UPDATE locations
                       SET address = COALESCE(%s, address),
                           lat     = COALESCE(%s, lat),
                           lon     = COALESCE(%s, lon)
                     WHERE id = %s
                 RETURNING id, name, company_id, address, lat, lon
                    """,
                    (payload.address, payload.lat, payload.lon, existing["id"]),
                )
                row = cur.fetchone()
                conn.commit()
                return row or existing

            # Inserción nueva
            cur.execute(
                """
                INSERT INTO locations (company_id, name, address, lat, lon)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id, name, company_id, address, lat, lon
                """,
                (payload.company_id, name, payload.address, payload.lat, payload.lon),
            )
            row = cur.fetchone()
            conn.commit()
            return row
        except Exception as e:
            conn.rollback()
            raise HTTPException(400, f"Create location error: {e}")


@router.get("/locations", summary="Listar localizaciones (abierto)")
def list_locations(company_id: int | None = Query(default=None)):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        if company_id is not None:
            cur.execute(
                """
                SELECT id, name, company_id, address, lat, lon
                  FROM locations
                 WHERE company_id = %s
                 ORDER BY name
                """,
                (company_id,),
            )
        else:
            cur.execute(
                """
                SELECT id, name, company_id, address, lat, lon
                  FROM locations
                 ORDER BY company_id, name
                """
            )
        return cur.fetchall() or []


@router.get(
    "/locations/{location_id}/stats",
    summary="Estadísticas de una localización (conteo de activos) (abierto)",
)
def location_stats(location_id: int):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute("SELECT id, name, company_id FROM locations WHERE id=%s", (location_id,))
        loc = cur.fetchone()
        if not loc:
            raise HTTPException(404, "Localización inexistente")

        cur.execute("SELECT COUNT(*) AS n FROM tanks  WHERE location_id=%s", (location_id,))
        tk = cur.fetchone()["n"]
        cur.execute("SELECT COUNT(*) AS n FROM pumps  WHERE location_id=%s", (location_id,))
        pu = cur.fetchone()["n"]
        cur.execute("SELECT COUNT(*) AS n FROM valves WHERE location_id=%s", (location_id,))
        va = cur.fetchone()["n"]

        return {
            "location_id": location_id,
            "company_id": loc["company_id"],
            "name": loc["name"],
            "counts": {"tanks": tk, "pumps": pu, "valves": va},
        }


@router.patch(
    "/locations/{location_id}",
    summary="Actualizar localización (nombre/dirección/coords) (abierto)",
)
def patch_location(
    location_id: int,
    name: str | None = Query(default=None),
    address: str | None = Query(default=None),
    lat: float | None = Query(default=None),
    lon: float | None = Query(default=None),
):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute("SELECT id FROM locations WHERE id=%s", (location_id,))
        if not cur.fetchone():
            raise HTTPException(404, "Localización inexistente")

        try:
            cur.execute(
                """
                UPDATE locations
                   SET name    = COALESCE(%s, name),
                       address = COALESCE(%s, address),
                       lat     = COALESCE(%s, lat),
                       lon     = COALESCE(%s, lon)
                 WHERE id=%s
             RETURNING id, name, company_id, address, lat, lon
                """,
                (name.strip() if isinstance(name, str) else name, address, lat, lon, location_id),
            )
            row = cur.fetchone()
            conn.commit()
            return row or {}
        except Exception as e:
            conn.rollback()
            raise HTTPException(400, f"Update location error: {e}")


@router.delete(
    "/locations/{location_id}",
    summary="Eliminar localización (opcional mover activos con ?move_to=ID) (abierto)",
)
def delete_location(location_id: int, move_to: int | None = Query(default=None)):
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute("SELECT id, company_id FROM locations WHERE id=%s", (location_id,))
        loc = cur.fetchone()
        if not loc:
            raise HTTPException(404, "Localización inexistente")

        # Conteos actuales
        cur.execute("SELECT COUNT(*) AS n FROM tanks  WHERE location_id=%s", (location_id,))
        tk = cur.fetchone()["n"]
        cur.execute("SELECT COUNT(*) AS n FROM pumps  WHERE location_id=%s", (location_id,))
        pu = cur.fetchone()["n"]
        cur.execute("SELECT COUNT(*) AS n FROM valves WHERE location_id=%s", (location_id,))
        va = cur.fetchone()["n"]
        total = (tk or 0) + (pu or 0) + (va or 0)

        # Si se pide mover, validamos destino y movemos antes de borrar
        if move_to is not None:
            if move_to == location_id:
                raise HTTPException(400, "move_to no puede ser la misma localización")

            cur.execute("SELECT id, company_id FROM locations WHERE id=%s", (move_to,))
            dst = cur.fetchone()
            if not dst:
                raise HTTPException(400, f"move_to={move_to} no existe")

            # Mantener integridad: mover dentro de la misma empresa
            if dst["company_id"] != loc["company_id"]:
                raise HTTPException(400, "move_to debe pertenecer a la misma empresa")

            cur.execute("UPDATE tanks  SET location_id=%s WHERE location_id=%s", (move_to, location_id))
            cur.execute("UPDATE pumps  SET location_id=%s WHERE location_id=%s", (move_to, location_id))
            cur.execute("UPDATE valves SET location_id=%s WHERE location_id=%s", (move_to, location_id))
            cur.execute("DELETE FROM locations WHERE id=%s", (location_id,))
            conn.commit()
            return {"ok": True, "moved_to": move_to, "deleted": location_id}

        # Si NO se mueve y hay activos, impedimos borrado (para no dejar huérfanos)
        if total > 0:
            raise HTTPException(
                409,
                {"message": "La localización tiene activos asignados", "counts": {"tanks": tk, "pumps": pu, "valves": va}},
            )

        cur.execute("DELETE FROM locations WHERE id=%s", (location_id,))
        conn.commit()
        return {"ok": True, "deleted": location_id}
    