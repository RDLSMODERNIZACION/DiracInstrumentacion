# app/routes/mapa/sim/models.py
from __future__ import annotations

from pydantic import BaseModel, Field


class SimOptions(BaseModel):
    default_diam_mm: float = 75.0
    r_scale: float = 1.0

    # Si una válvula está asociada a un nodo y está cerrada,
    # bloquea todas las cañerías conectadas a ese nodo.
    closed_valve_blocks_node: bool = True

    # Si una válvula está asociada a una cañería y está cerrada,
    # esa cañería no entra al grafo hidráulico.
    closed_valve_blocks_pipe: bool = True

    # Caída de head por resistencia.
    # Esto NO es EPANET; es una simulación simple/visual para ver continuidad,
    # sentido aproximado de circulación y presión estimada.
    head_drop_scale: float = 0.00001

    # Escala para calcular absQ = 1 / (1 + R/R0)
    # Si ves caudales visuales muy bajos, se puede subir.
    R0: float = 500000.0

    # Compatibilidad con llamadas viejas del front.
    ignore_unconnected: bool = True
    min_pressure_m: float = 0.0

    # Cuántas fuentes alternativas devolver por nodo/cañería.
    max_sources_reaching_per_node: int = 6


class SimRunRequest(BaseModel):
    options: SimOptions = Field(default_factory=SimOptions)


class ConnectPipeBody(BaseModel):
    from_node: str
    to_node: str
