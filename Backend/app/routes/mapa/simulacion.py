# app/routes/simulacion.py
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Dict, Optional, Literal, Any

from app.db import get_conn
from app.services.sim_solver import run_linear_simulation

router = APIRouter(prefix="/sim", tags=["sim"])

class SimOptions(BaseModel):
    min_pressure_m: float = 0.0
    default_diam_mm: float = 75.0
    model: Literal["LINEAR"] = "LINEAR"
    snap_ignore_unconnected: bool = True  # ignora pipes sin from/to
    closed_valve_blocks_node: bool = True # si valve cerrada, bloquea todo el nodo
    r_scale: float = 1.0  # escala global de resistencia (para calibrar visualmente)

class SimRunRequest(BaseModel):
    options: SimOptions = Field(default_factory=SimOptions)

@router.post("/run")
async def sim_run(body: SimRunRequest):
    conn = await get_conn()
    try:
        # 1) cargar red
        pipes = await conn.fetch("""
            SELECT
              id,
              from_node,
              to_node,
              COALESCE(length_m, ST_Length(geom::geography)) AS length_m,
              COALESCE(diametro_mm, $1::int) AS diametro_mm,
              COALESCE(is_open, true) AS is_open,
              COALESCE(active, true) AS active
            FROM "MapasAgua".pipes
            WHERE COALESCE(active, true) = true
              AND COALESCE(type, 'WATER') = 'WATER'
        """, int(body.options.default_diam_mm))

        nodes = await conn.fetch("""
            SELECT id, kind
            FROM "MapasAgua".nodes
        """)

        valves = await conn.fetch("""
            SELECT node_id, is_open
            FROM "MapasAgua".valves
        """)

        sources = await conn.fetch("""
            SELECT node_id, head_m
            FROM "MapasAgua".sources
        """)

        demands = await conn.fetch("""
            SELECT node_id, demand_lps
            FROM "MapasAgua".demands
        """)

        if len(sources) == 0:
            raise HTTPException(
                status_code=400,
                detail="No hay sources. Creá al menos una fuente (sources: node_id + head_m)."
            )

        # 2) correr solver
        result = run_linear_simulation(
            nodes=nodes,
            pipes=pipes,
            valves=valves,
            sources=sources,
            demands=demands,
            options=body.options.model_dump()
        )

        return result
    finally:
        # tu pool probablemente maneja release interno; si tenés close_conn, úsalo
        pass
