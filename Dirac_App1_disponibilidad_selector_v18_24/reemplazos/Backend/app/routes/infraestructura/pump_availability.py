from fastapi import APIRouter, HTTPException, Request
from psycopg.rows import dict_row

from app.db import get_conn

router = APIRouter(prefix="/infraestructura", tags=["infraestructura"])


@router.get("/pump_availability")
async def list_pump_availability():
    try:
        with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                SELECT
                  p.id,
                  p.name,
                  p.location_id,
                  p.rol_red,
                  COALESCE(p.disponible, true) AS disponible,
                  p.disponibilidad_descripcion,
                  p.disponibilidad_actualizada_at
                FROM public.pumps p
                WHERE p.rol_red = 'impulsion_principal'
                ORDER BY p.location_id, p.id
                """
            )
            return cur.fetchall()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error (pump_availability): {e}")


@router.get("/pump_availability/{pump_id}")
async def get_pump_availability(pump_id: int):
    try:
        with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                SELECT
                  p.id,
                  p.name,
                  p.location_id,
                  p.rol_red,
                  COALESCE(p.disponible, true) AS disponible,
                  p.disponibilidad_descripcion,
                  p.disponibilidad_actualizada_at
                FROM public.pumps p
                WHERE p.id = %s
                """,
                (pump_id,),
            )
            row = cur.fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Bomba no encontrada")

        return row
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error (pump_availability): {e}")


@router.post("/pump_availability/{pump_id}")
async def update_pump_availability(pump_id: int, request: Request):
    data = await request.json()
    disponible = data.get("disponible")
    descripcion = data.get("descripcion")

    if not isinstance(disponible, bool):
        raise HTTPException(status_code=400, detail="disponible debe ser boolean")

    if descripcion is not None and not isinstance(descripcion, str):
        raise HTTPException(status_code=400, detail="descripcion debe ser string o null")

    descripcion = (descripcion or "").strip() or None
    if disponible:
        descripcion = None

    try:
        with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                UPDATE public.pumps
                SET disponible = %s,
                    disponibilidad_descripcion = %s,
                    disponibilidad_actualizada_at = now()
                WHERE id = %s
                  AND rol_red = 'impulsion_principal'
                RETURNING
                  id,
                  name,
                  location_id,
                  rol_red,
                  COALESCE(disponible, true) AS disponible,
                  disponibilidad_descripcion,
                  disponibilidad_actualizada_at
                """,
                (disponible, descripcion, pump_id),
            )
            row = cur.fetchone()
            conn.commit()

        if not row:
            raise HTTPException(
                status_code=404,
                detail="La bomba no existe o no está marcada como impulsión principal",
            )

        return {"ok": True, "pump": row}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error (pump_availability update): {e}")
