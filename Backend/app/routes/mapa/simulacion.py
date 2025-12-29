# app/routes/mapa/simulacion.py
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Any, Dict

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

def _exec_or_500(conn, cur, sql: str, params: tuple | None, what: str):
    """
    Ejecuta SQL y si falla:
    - rollback inmediato (para limpiar estado aborted)
    - levanta HTTPException con el error real y el bloque que falló
    """
    try:
        cur.execute(sql, params or None)
        return
    except Exception as e:
        try:
            conn.rollback()
        except Exception:
            pass
        raise HTTPException(500, f"Error leyendo {what}: {e}")

# ----------------------------
# Endpoints
# ----------------------------

@router.get("/sim/debug_sources")
def debug_sources():
    with get_conn() as conn, conn.cursor() as cur:
        _exec_or_500(
            conn, cur,
            """SELECT node_id::text as node_id, head_m FROM "MapasAgua".sources""",
            None,
            "sources(debug)"
        )
        items = _fetchall_dict(cur)
    return {"count": len(items), "items": items}

@router.post("/sim/run")
def sim_run(body: SimRunRequest):
    try:
        with get_conn() as conn, conn.cursor() as cur:
            # 1) PIPES
            _exec_or_500(
                conn, cur,
                """
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
                """,
                (int(body.options.default_diam_mm),),
                "pipes"
            )
            pipes = _fetchall_dict(cur)

            # 2) NODES (incluye props para fallback)
            _exec_or_500(
                conn, cur,
                """SELECT id, kind, props FROM "MapasAgua".nodes""",
                None,
                "nodes"
            )
            nodes = _fetchall_dict(cur)

            # 3) VALVES (opcional)
            valves = []
            try:
                cur.execute("""SELECT node_id, is_open FROM "MapasAgua".valves""")
                valves = _fetchall_dict(cur)
            except Exception:
                try:
                    conn.rollback()
                except Exception:
                    pass
                valves = []

            # 4) SOURCES (obligatorio)
            _exec_or_500(
                conn, cur,
                """SELECT node_id, head_m FROM "MapasAgua".sources""",
                None,
                "sources"
            )
            sources = _fetchall_dict(cur)

            # 5) DEMANDS (opcional)
            demands = []
            try:
                cur.execute("""SELECT node_id, demand_lps FROM "MapasAgua".demands""")
                demands = _fetchall_dict(cur)
            except Exception:
                try:
                    conn.rollback()
                except Exception:
                    pass
                demands = []

        # fallback si sources tabla está vacía
        if not sources:
            fallback = []
            for n in nodes:
                if (n.get("kind") or "").upper() != "SOURCE":
                    continue
                props = n.get("props") or {}
                head = None
                if isinstance(props, dict):
                    head = props.get("head_m")
                try:
                    head_m = float(head) if head is not None else None
                except Exception:
                    head_m = None
                if head_m is not None:
                    fallback.append({"node_id": n["id"], "head_m": head_m})
            sources = fallback

        if not sources:
            raise HTTPException(
                400,
                'No hay sources en "MapasAgua".sources (node_id + head_m) y no hay fallback en nodes.props.head_m.'
            )

        result = run_linear_simulation(
            nodes_rows=nodes,
            pipes_rows=pipes,
            valves_rows=valves,
            sources_rows=sources,
            demands_rows=demands,
            options=body.options.model_dump(),
        )

        if isinstance(result, dict):
            result.setdefault("meta", {})
            result["meta"]["sources_count"] = len(sources)
            result["meta"]["pipes_count"] = len(pipes)
            result["meta"]["nodes_count"] = len(nodes)
        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Simulación falló (error real): {e}")

@router.patch("/pipes/{pipe_id}/connect")
def connect_pipe(pipe_id: str, body: ConnectPipeBody):
    with get_conn() as conn, conn.cursor() as cur:
        _exec_or_500(
            conn, cur,
            """
            UPDATE "MapasAgua".pipes
            SET
              from_node = %s::uuid,
              to_node   = %s::uuid,
              updated_at = now()
            WHERE id = %s::uuid
            """,
            (body.from_node, body.to_node, pipe_id),
            "pipes/connect"
        )
        if cur.rowcount == 0:
            raise HTTPException(404, "Pipe no encontrado")
        conn.commit()

    return {"ok": True, "pipe_id": pipe_id, "from_node": body.from_node, "to_node": body.to_node}
