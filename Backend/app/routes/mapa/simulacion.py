# app/routes/mapa/simulacion.py
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Literal

from app.db import get_conn
from app.services.sim_solver import run_linear_simulation

router = APIRouter()

# ----------------------------
# Models
# ----------------------------

class SimOptions(BaseModel):
    min_pressure_m: float = 0.0
    default_diam_mm: float = 75.0
    ignore_unconnected: bool = True
    closed_valve_blocks_node: bool = True
    r_scale: float = 1.0

class SimRunRequest(BaseModel):
    options: SimOptions = Field(default_factory=SimOptions)

class ConnectPipeBody(BaseModel):
    from_node: str
    to_node: str

# ----------------------------
# Helpers
# ----------------------------

def _fetchall_dict(cur):
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]

# ----------------------------
# Endpoints
# ----------------------------

@router.post("/sim/run")
def sim_run(body: SimRunRequest):
    try:
        with get_conn() as conn, conn.cursor() as cur:
            # Pipes
            cur.execute("""
                SELECT
                  id,
                  from_node,
                  to_node,
                  COALESCE(length_m, ST_Length(geom::geography)) AS length_m,
                  COALESCE(diametro_mm, %s::int) AS diametro_mm,
                  COALESCE(is_open, true) AS is_open,
                  COALESCE(active, true) AS active
                FROM "MapasAgua".pipes
                WHERE COALESCE(active, true) = true
                  AND COALESCE(type, 'WATER') = 'WATER'
            """, (int(body.options.default_diam_mm),))
            pipes = _fetchall_dict(cur)

            # Nodes
            cur.execute("""SELECT id, kind FROM "MapasAgua".nodes""")
            nodes = _fetchall_dict(cur)

            # Valves (si no existe tabla, asumimos sin válvulas)
            try:
                cur.execute("""SELECT node_id, is_open FROM "MapasAgua".valves""")
                valves = _fetchall_dict(cur)
            except Exception:
                valves = []

            # Sources (OBLIGATORIO)
            try:
                cur.execute("""SELECT node_id, head_m FROM "MapasAgua".sources""")
                sources = _fetchall_dict(cur)
            except Exception:
                sources = []

            # Demands (opcional)
            try:
                cur.execute("""SELECT node_id, demand_lps FROM "MapasAgua".demands""")
                demands = _fetchall_dict(cur)
            except Exception:
                demands = []

        if not sources:
            raise HTTPException(400, "No hay sources en \"MapasAgua\".sources (node_id + head_m).")

        result = run_linear_simulation(
            nodes_rows=nodes,
            pipes_rows=pipes,
            valves_rows=valves,
            sources_rows=sources,
            demands_rows=demands,
            options=body.options.model_dump(),
        )
        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Simulación falló: {e}")

@router.patch("/pipes/{pipe_id}/connect")
def connect_pipe(pipe_id: str, body: ConnectPipeBody):
    """
    Conexión manual: asigna from_node y to_node a un pipe.
    """
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("""
            UPDATE "MapasAgua".pipes
            SET
              from_node = %s::uuid,
              to_node   = %s::uuid,
              updated_at = now()
            WHERE id = %s::uuid
        """, (body.from_node, body.to_node, pipe_id))

        if cur.rowcount == 0:
            raise HTTPException(404, "Pipe no encontrado")

        conn.commit()

    return {"ok": True, "pipe_id": pipe_id, "from_node": body.from_node, "to_node": body.to_node}


@router.get("/sim/debug_sources")
def debug_sources():
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("""SELECT node_id::text as node_id, head_m FROM "MapasAgua".sources""")
        cols = [d[0] for d in cur.description]
        items = [dict(zip(cols, r)) for r in cur.fetchall()]
    return {"count": len(items), "items": items}
