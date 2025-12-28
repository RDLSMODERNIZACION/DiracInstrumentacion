# app/routes/mapa/simulacion.py
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Any, Dict, Optional

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
    """
    Corre simulación.
    - Lee pipes/nodes/valves/sources/demands
    - Si sources (tabla) está vacía, hace fallback a nodes.kind='SOURCE' con props.head_m
    """
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

            # Nodes (incluimos props para fallback)
            cur.execute("""SELECT id, kind, props FROM "MapasAgua".nodes""")
            nodes = _fetchall_dict(cur)

            # Valves (opcional)
            try:
                cur.execute("""SELECT node_id, is_open FROM "MapasAgua".valves""")
                valves = _fetchall_dict(cur)
            except Exception:
                valves = []

            # Sources (OBLIGATORIO) -> NO tragamos errores: si falla, queremos verlo.
            cur.execute("""SELECT node_id, head_m FROM "MapasAgua".sources""")
            sources = _fetchall_dict(cur)

            # Demands (opcional)
            try:
                cur.execute("""SELECT node_id, demand_lps FROM "MapasAgua".demands""")
                demands = _fetchall_dict(cur)
            except Exception:
                demands = []

        # --------
        # Fallback: si sources tabla está vacía, usar nodes.kind='SOURCE' con props.head_m
        # --------
        if not sources:
            fallback = []
            for n in nodes:
                if (n.get("kind") or "").upper() != "SOURCE":
                    continue
                props = n.get("props") or {}
                head = None
                if isinstance(props, dict):
                    head = props.get("head_m")
                    if head is None and "head" in props:
                        head = props.get("head")
                try:
                    head_m = float(head) if head is not None else None
                except Exception:
                    head_m = None

                if head_m is not None:
                    fallback.append({"node_id": n["id"], "head_m": head_m})

            sources = fallback

        if not sources:
            raise HTTPException(
                status_code=400,
                detail='No hay sources en "MapasAgua".sources (node_id + head_m) y no hay fallback en nodes.props.head_m.'
            )

        result = run_linear_simulation(
            nodes_rows=nodes,
            pipes_rows=pipes,
            valves_rows=valves,
            sources_rows=sources,
            demands_rows=demands,
            options=body.options.model_dump(),
        )

        # meta extra para debug
        if isinstance(result, dict):
            result.setdefault("meta", {})
            result["meta"]["sources_count"] = len(sources)
        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Simulación falló (error real): {e}")

@router.patch("/pipes/{pipe_id}/connect")
def connect_pipe(pipe_id: str, body: ConnectPipeBody):
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
