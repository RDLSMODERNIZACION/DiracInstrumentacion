# app/routes/mapa/sim/endpoints/connect.py
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.db import get_conn

from ..models import ConnectPipeBody
from ..utils import safe_rollback

router = APIRouter()


# ============================================================
# Connect pipe
# PATCH /mapa/pipes/{pipe_id}/connect
# ============================================================

@router.patch("/pipes/{pipe_id}/connect")
def connect_pipe(pipe_id: str, body: ConnectPipeBody):
    if not body.from_node or not body.to_node:
        raise HTTPException(400, "Falta from_node o to_node")

    if body.from_node == body.to_node:
        raise HTTPException(400, "from_node y to_node no pueden ser iguales")

    with get_conn() as conn, conn.cursor() as cur:
        try:
            # Validar nodos
            cur.execute(
                """
                SELECT count(*)::int
                FROM "MapasAgua".nodes
                WHERE id::text IN (%s, %s)
                """,
                (
                    body.from_node,
                    body.to_node,
                ),
            )

            n = cur.fetchone()[0]

            if n < 2:
                raise HTTPException(
                    400,
                    "Uno o ambos nodos no existen",
                )

            # Guardar conexión
            cur.execute(
                """
                UPDATE "MapasAgua".pipes
                SET
                    from_node = %s::uuid,
                    to_node = %s::uuid,
                    length_m = COALESCE(length_m, ST_Length(geom::geography)),
                    updated_at = now()
                WHERE id = %s::uuid
                RETURNING
                    id::text AS id,
                    from_node::text AS from_node,
                    to_node::text AS to_node,
                    length_m::double precision AS length_m
                """,
                (
                    body.from_node,
                    body.to_node,
                    pipe_id,
                ),
            )

            row = cur.fetchone()

            if not row:
                raise HTTPException(404, "Pipe no encontrado")

            conn.commit()

        except HTTPException:
            safe_rollback(conn)
            raise
        except Exception as e:
            safe_rollback(conn)
            raise HTTPException(500, f"connect_pipe falló: {e}")

    return {
        "ok": True,
        "pipe_id": row[0],
        "from_node": row[1],
        "to_node": row[2],
        "length_m": row[3],
    }
