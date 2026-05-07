from __future__ import annotations

import json
from typing import Any, Literal, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field


# IMPORTANTE:
# Este router está dentro de app/routes/mapa/__init__.py.
# Por eso NO debe tener prefix="/mapa/..."
# Si ponés /mapa acá, queda publicado como /mapa/mapa/...
router = APIRouter(
    prefix="/distribucion/instrumentation",
    tags=["Mapa - Instrumentación de distribución"],
)


# ============================================================
# Helpers
# ============================================================

def get_pool(request: Request):
    """
    Intenta tomar el pool de distintas formas porque en tu backend
    puede estar guardado como app.state.pool, app.state.db_pool, etc.
    """
    for attr in ("pool", "db_pool", "database_pool"):
        pool = getattr(request.app.state, attr, None)
        if pool is not None:
            return pool

    raise HTTPException(
        status_code=500,
        detail="No se encontró pool de base de datos en app.state.pool / app.state.db_pool / app.state.database_pool",
    )


def model_to_dict(model: BaseModel, exclude_unset: bool = False) -> dict[str, Any]:
    """
    Compatible con Pydantic v1 y v2.
    """
    if hasattr(model, "model_dump"):
        return model.model_dump(exclude_unset=exclude_unset)
    return model.dict(exclude_unset=exclude_unset)


def jsonb(value: Any) -> str:
    """
    asyncpg normalmente espera string para json/jsonb si no hay codec personalizado.
    """
    return json.dumps(value if value is not None else {}, ensure_ascii=False, default=str)


def pressure_bar_to_mca(bar: Optional[float]) -> Optional[float]:
    if bar is None:
        return None
    return bar * 10.19716213


def pressure_mca_to_bar(mca: Optional[float]) -> Optional[float]:
    if mca is None:
        return None
    return mca / 10.19716213


def flow_m3h_to_lps(m3h: Optional[float]) -> Optional[float]:
    if m3h is None:
        return None
    return m3h * 1000.0 / 3600.0


def flow_lps_to_m3h(lps: Optional[float]) -> Optional[float]:
    if lps is None:
        return None
    return lps * 3.6


# ============================================================
# Schemas
# ============================================================

MeterType = Literal["pressure", "flow"]


class CreateInstrumentationPointIn(BaseModel):
    meter_type: MeterType = Field(..., description="pressure o flow")

    name: str
    tag: Optional[str] = None

    location_id: Optional[int] = None
    sector_name: Optional[str] = None
    barrio: Optional[str] = None

    # Cañería donde se coloca el punto
    map_pipe_id: Optional[UUID] = None

    # Si ya tenés un nodo existente, podés mandarlo.
    # Si no lo mandás, el backend crea un nodo nuevo con lat/lng.
    map_node_id: Optional[UUID] = None

    lat: Optional[float] = None
    lng: Optional[float] = None

    hydraulic_position: Optional[str] = "DISTRIBUCION"

    model: Optional[str] = None
    serial_number: Optional[str] = None
    device_id: Optional[str] = None
    topic: Optional[str] = None

    stale_after_sec: int = 300

    # Solo caudalímetro
    diameter_mm: Optional[int] = None

    # Rangos opcionales
    min_pressure_bar: Optional[float] = None
    max_pressure_bar: Optional[float] = None
    min_flow_m3h: Optional[float] = None
    max_flow_m3h: Optional[float] = None

    props: dict[str, Any] = Field(default_factory=dict)
    notes: Optional[str] = None


class UpdateInstrumentationPointIn(BaseModel):
    name: Optional[str] = None
    tag: Optional[str] = None
    location_id: Optional[int] = None
    sector_name: Optional[str] = None
    barrio: Optional[str] = None
    hydraulic_position: Optional[str] = None
    active: Optional[bool] = None
    stale_after_sec: Optional[int] = None
    props: Optional[dict[str, Any]] = None
    notes: Optional[str] = None


class PressureReadingIn(BaseModel):
    pressure_bar: Optional[float] = None
    pressure_mca: Optional[float] = None

    battery_v: Optional[float] = None
    signal_rssi: Optional[float] = None
    quality: str = "OK"

    measured_at: Optional[str] = None
    raw_payload: dict[str, Any] = Field(default_factory=dict)


class FlowReadingIn(BaseModel):
    flow_m3h: Optional[float] = None
    flow_lps: Optional[float] = None
    total_m3: Optional[float] = None

    battery_v: Optional[float] = None
    signal_rssi: Optional[float] = None
    quality: str = "OK"

    measured_at: Optional[str] = None
    raw_payload: dict[str, Any] = Field(default_factory=dict)


# ============================================================
# Crear punto de medición
# ============================================================

@router.post("")
async def create_instrumentation_point(
    payload: CreateInstrumentationPointIn,
    request: Request,
):
    """
    Crea un manómetro o caudalímetro de distribución.

    - Si viene map_node_id, usa ese nodo.
    - Si no viene map_node_id, crea un nodo nuevo en lat/lng.
    - Lo asocia a map_pipe_id si viene.
    - Inserta también un asset_link para que quede como activo del mapa.
    """
    pool = get_pool(request)

    if payload.map_node_id is None:
        if payload.lat is None or payload.lng is None:
            raise HTTPException(
                status_code=400,
                detail="Para crear un punto nuevo necesitás enviar lat y lng, o enviar map_node_id existente.",
            )

    async with pool.acquire() as conn:
        async with conn.transaction():
            map_node_id = payload.map_node_id

            # ------------------------------------------------------------
            # Crear nodo en el mapa si no viene uno existente
            # ------------------------------------------------------------
            if map_node_id is None:
                node_kind = "PRESSURE_SENSOR" if payload.meter_type == "pressure" else "FLOW_SENSOR"

                row = await conn.fetchrow(
                    """
                    INSERT INTO "MapasAgua".nodes (
                      kind,
                      geom,
                      props
                    )
                    VALUES (
                      $1,
                      ST_SetSRID(ST_MakePoint($2, $3), 4326),
                      $4::jsonb
                    )
                    RETURNING id
                    """,
                    node_kind,
                    payload.lng,
                    payload.lat,
                    jsonb(
                        {
                            "created_from": "distribution_instrumentation",
                            "meter_type": payload.meter_type,
                            "name": payload.name,
                            "tag": payload.tag,
                            "map_pipe_id": str(payload.map_pipe_id) if payload.map_pipe_id else None,
                        }
                    ),
                )

                map_node_id = row["id"]

            # ------------------------------------------------------------
            # Crear manómetro
            # ------------------------------------------------------------
            if payload.meter_type == "pressure":
                meter = await conn.fetchrow(
                    """
                    INSERT INTO "MapasAgua".distribution_pressure_meters (
                      name,
                      tag,
                      location_id,
                      map_node_id,
                      map_pipe_id,
                      sector_name,
                      barrio,
                      hydraulic_position,
                      model,
                      serial_number,
                      pressure_unit,
                      min_pressure_bar,
                      max_pressure_bar,
                      telemetry_source,
                      device_id,
                      topic,
                      stale_after_sec,
                      active,
                      props,
                      notes
                    )
                    VALUES (
                      $1, $2, $3, $4, $5,
                      $6, $7, $8,
                      $9, $10,
                      'bar',
                      $11, $12,
                      'DISTRIBUTION',
                      $13, $14,
                      $15,
                      true,
                      $16::jsonb,
                      $17
                    )
                    RETURNING *
                    """,
                    payload.name,
                    payload.tag,
                    payload.location_id,
                    map_node_id,
                    payload.map_pipe_id,
                    payload.sector_name,
                    payload.barrio,
                    payload.hydraulic_position,
                    payload.model,
                    payload.serial_number,
                    payload.min_pressure_bar,
                    payload.max_pressure_bar,
                    payload.device_id,
                    payload.topic,
                    payload.stale_after_sec,
                    jsonb(payload.props),
                    payload.notes,
                )

                await conn.execute(
                    """
                    INSERT INTO "MapasAgua".asset_links (
                      asset_type,
                      asset_id,
                      asset_name,
                      source_table,
                      location_id,
                      map_node_id,
                      map_pipe_id,
                      sim_role,
                      hydraulic_position,
                      enabled,
                      props,
                      notes
                    )
                    VALUES (
                      'PRESSURE_SENSOR',
                      $1,
                      $2,
                      'MapasAgua.distribution_pressure_meters',
                      $3,
                      $4,
                      $5,
                      'MEASURE_POINT',
                      $6,
                      true,
                      $7::jsonb,
                      $8
                    )
                    """,
                    str(meter["id"]),
                    meter["name"],
                    meter["location_id"],
                    meter["map_node_id"],
                    meter["map_pipe_id"],
                    meter["hydraulic_position"],
                    jsonb(
                        {
                            "tag": meter["tag"],
                            "meter_type": "pressure",
                            "device_id": meter["device_id"],
                        }
                    ),
                    meter["notes"],
                )

                latest = await conn.fetchrow(
                    """
                    SELECT *
                    FROM "MapasAgua".v_distribution_pressure_latest
                    WHERE id = $1
                    """,
                    meter["id"],
                )

                return {
                    "ok": True,
                    "meter_type": "pressure",
                    "id": str(meter["id"]),
                    "map_node_id": str(map_node_id),
                    "map_pipe_id": str(payload.map_pipe_id) if payload.map_pipe_id else None,
                    "latest": dict(latest) if latest else None,
                }

            # ------------------------------------------------------------
            # Crear caudalímetro
            # ------------------------------------------------------------
            meter = await conn.fetchrow(
                """
                INSERT INTO "MapasAgua".distribution_flow_meters (
                  name,
                  tag,
                  location_id,
                  map_node_id,
                  map_pipe_id,
                  sector_name,
                  barrio,
                  hydraulic_position,
                  model,
                  serial_number,
                  diameter_mm,
                  flow_unit,
                  totalizer_unit,
                  min_flow_m3h,
                  max_flow_m3h,
                  telemetry_source,
                  device_id,
                  topic,
                  stale_after_sec,
                  active,
                  props,
                  notes
                )
                VALUES (
                  $1, $2, $3, $4, $5,
                  $6, $7, $8,
                  $9, $10,
                  $11,
                  'm3h',
                  'm3',
                  $12, $13,
                  'DISTRIBUTION',
                  $14, $15,
                  $16,
                  true,
                  $17::jsonb,
                  $18
                )
                RETURNING *
                """,
                payload.name,
                payload.tag,
                payload.location_id,
                map_node_id,
                payload.map_pipe_id,
                payload.sector_name,
                payload.barrio,
                payload.hydraulic_position,
                payload.model,
                payload.serial_number,
                payload.diameter_mm,
                payload.min_flow_m3h,
                payload.max_flow_m3h,
                payload.device_id,
                payload.topic,
                payload.stale_after_sec,
                jsonb(payload.props),
                payload.notes,
            )

            await conn.execute(
                """
                INSERT INTO "MapasAgua".asset_links (
                  asset_type,
                  asset_id,
                  asset_name,
                  source_table,
                  location_id,
                  map_node_id,
                  map_pipe_id,
                  sim_role,
                  hydraulic_position,
                  enabled,
                  props,
                  notes
                )
                VALUES (
                  'FLOW_SENSOR',
                  $1,
                  $2,
                  'MapasAgua.distribution_flow_meters',
                  $3,
                  $4,
                  $5,
                  'MEASURE_POINT',
                  $6,
                  true,
                  $7::jsonb,
                  $8
                )
                """,
                str(meter["id"]),
                meter["name"],
                meter["location_id"],
                meter["map_node_id"],
                meter["map_pipe_id"],
                meter["hydraulic_position"],
                jsonb(
                    {
                        "tag": meter["tag"],
                        "meter_type": "flow",
                        "device_id": meter["device_id"],
                    }
                ),
                meter["notes"],
            )

            latest = await conn.fetchrow(
                """
                SELECT *
                FROM "MapasAgua".v_distribution_flow_latest
                WHERE id = $1
                """,
                meter["id"],
            )

            return {
                "ok": True,
                "meter_type": "flow",
                "id": str(meter["id"]),
                "map_node_id": str(map_node_id),
                "map_pipe_id": str(payload.map_pipe_id) if payload.map_pipe_id else None,
                "latest": dict(latest) if latest else None,
            }


# ============================================================
# Listar puntos
# ============================================================

@router.get("")
async def list_instrumentation_points(
    request: Request,
    meter_type: Optional[MeterType] = Query(None),
    location_id: Optional[int] = Query(None),
    active: Optional[bool] = Query(True),
):
    pool = get_pool(request)

    async with pool.acquire() as conn:
        rows: list[dict[str, Any]] = []

        if meter_type in (None, "pressure"):
            pressure_rows = await conn.fetch(
                """
                SELECT
                  'pressure' AS meter_type,
                  v.*,
                  ST_Y(n.geom::geometry) AS lat,
                  ST_X(n.geom::geometry) AS lng
                FROM "MapasAgua".v_distribution_pressure_latest v
                LEFT JOIN "MapasAgua".nodes n
                  ON n.id = v.map_node_id
                WHERE ($1::int IS NULL OR v.location_id = $1)
                  AND ($2::boolean IS NULL OR v.active = $2)
                ORDER BY v.name
                """,
                location_id,
                active,
            )
            rows.extend([dict(r) for r in pressure_rows])

        if meter_type in (None, "flow"):
            flow_rows = await conn.fetch(
                """
                SELECT
                  'flow' AS meter_type,
                  v.*,
                  ST_Y(n.geom::geometry) AS lat,
                  ST_X(n.geom::geometry) AS lng
                FROM "MapasAgua".v_distribution_flow_latest v
                LEFT JOIN "MapasAgua".nodes n
                  ON n.id = v.map_node_id
                WHERE ($1::int IS NULL OR v.location_id = $1)
                  AND ($2::boolean IS NULL OR v.active = $2)
                ORDER BY v.name
                """,
                location_id,
                active,
            )
            rows.extend([dict(r) for r in flow_rows])

        return {
            "ok": True,
            "count": len(rows),
            "items": rows,
        }


# ============================================================
# Leer un punto por ID
# ============================================================

@router.get("/{meter_type}/{meter_id}")
async def get_instrumentation_point(
    meter_type: MeterType,
    meter_id: UUID,
    request: Request,
):
    pool = get_pool(request)

    if meter_type == "pressure":
        sql = """
        SELECT
          'pressure' AS meter_type,
          v.*,
          ST_Y(n.geom::geometry) AS lat,
          ST_X(n.geom::geometry) AS lng
        FROM "MapasAgua".v_distribution_pressure_latest v
        LEFT JOIN "MapasAgua".nodes n
          ON n.id = v.map_node_id
        WHERE v.id = $1
        """
    else:
        sql = """
        SELECT
          'flow' AS meter_type,
          v.*,
          ST_Y(n.geom::geometry) AS lat,
          ST_X(n.geom::geometry) AS lng
        FROM "MapasAgua".v_distribution_flow_latest v
        LEFT JOIN "MapasAgua".nodes n
          ON n.id = v.map_node_id
        WHERE v.id = $1
        """

    async with pool.acquire() as conn:
        row = await conn.fetchrow(sql, meter_id)

    if not row:
        raise HTTPException(status_code=404, detail="Punto de medición no encontrado")

    return {
        "ok": True,
        "item": dict(row),
    }


# ============================================================
# Editar punto
# ============================================================

@router.patch("/{meter_type}/{meter_id}")
async def update_instrumentation_point(
    meter_type: MeterType,
    meter_id: UUID,
    payload: UpdateInstrumentationPointIn,
    request: Request,
):
    pool = get_pool(request)

    table = (
        '"MapasAgua".distribution_pressure_meters'
        if meter_type == "pressure"
        else '"MapasAgua".distribution_flow_meters'
    )

    data = model_to_dict(payload, exclude_unset=True)

    if not data:
        raise HTTPException(status_code=400, detail="No hay campos para actualizar")

    allowed = {
        "name",
        "tag",
        "location_id",
        "sector_name",
        "barrio",
        "hydraulic_position",
        "active",
        "stale_after_sec",
        "props",
        "notes",
    }

    sets: list[str] = []
    values: list[Any] = []
    i = 1

    for key, value in data.items():
        if key not in allowed:
            continue

        if key == "props":
            sets.append(f"{key} = ${i}::jsonb")
            values.append(jsonb(value))
        else:
            sets.append(f"{key} = ${i}")
            values.append(value)

        i += 1

    if not sets:
        raise HTTPException(status_code=400, detail="No hay campos válidos para actualizar")

    sets.append("updated_at = now()")
    values.append(meter_id)

    sql = f"""
    UPDATE {table}
    SET {", ".join(sets)}
    WHERE id = ${i}
    RETURNING id, name, location_id, map_node_id, map_pipe_id, hydraulic_position, active, props, notes
    """

    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(sql, *values)

            if not row:
                raise HTTPException(status_code=404, detail="Punto de medición no encontrado")

            # Sincronizar asset_links
            asset_type = "PRESSURE_SENSOR" if meter_type == "pressure" else "FLOW_SENSOR"
            source_table = (
                "MapasAgua.distribution_pressure_meters"
                if meter_type == "pressure"
                else "MapasAgua.distribution_flow_meters"
            )

            await conn.execute(
                """
                UPDATE "MapasAgua".asset_links
                SET asset_name = $1,
                    location_id = $2,
                    map_node_id = $3,
                    map_pipe_id = $4,
                    hydraulic_position = $5,
                    enabled = $6,
                    props = $7::jsonb,
                    notes = $8,
                    updated_at = now()
                WHERE asset_type = $9
                  AND source_table = $10
                  AND asset_id = $11
                """,
                row["name"],
                row["location_id"],
                row["map_node_id"],
                row["map_pipe_id"],
                row["hydraulic_position"],
                row["active"],
                jsonb(row["props"]),
                row["notes"],
                asset_type,
                source_table,
                str(row["id"]),
            )

    return {
        "ok": True,
        "meter_type": meter_type,
        "id": str(row["id"]),
    }


# ============================================================
# Desactivar punto
# ============================================================

@router.delete("/{meter_type}/{meter_id}")
async def deactivate_instrumentation_point(
    meter_type: MeterType,
    meter_id: UUID,
    request: Request,
):
    pool = get_pool(request)

    table = (
        '"MapasAgua".distribution_pressure_meters'
        if meter_type == "pressure"
        else '"MapasAgua".distribution_flow_meters'
    )

    asset_type = "PRESSURE_SENSOR" if meter_type == "pressure" else "FLOW_SENSOR"
    source_table = (
        "MapasAgua.distribution_pressure_meters"
        if meter_type == "pressure"
        else "MapasAgua.distribution_flow_meters"
    )

    async with pool.acquire() as conn:
        async with conn.transaction():
            row = await conn.fetchrow(
                f"""
                UPDATE {table}
                SET active = false,
                    updated_at = now()
                WHERE id = $1
                RETURNING id
                """,
                meter_id,
            )

            if not row:
                raise HTTPException(status_code=404, detail="Punto de medición no encontrado")

            await conn.execute(
                """
                UPDATE "MapasAgua".asset_links
                SET enabled = false,
                    updated_at = now()
                WHERE asset_type = $1
                  AND source_table = $2
                  AND asset_id = $3
                """,
                asset_type,
                source_table,
                str(meter_id),
            )

    return {
        "ok": True,
        "meter_type": meter_type,
        "id": str(row["id"]),
        "active": False,
    }


# ============================================================
# Cargar dato de presión por ID
# ============================================================

@router.post("/pressure/{meter_id}/readings")
async def insert_pressure_reading(
    meter_id: UUID,
    payload: PressureReadingIn,
    request: Request,
):
    pool = get_pool(request)

    pressure_bar = payload.pressure_bar
    pressure_mca = payload.pressure_mca

    if pressure_bar is None and pressure_mca is None:
        raise HTTPException(
            status_code=400,
            detail="Enviar pressure_bar o pressure_mca",
        )

    if pressure_bar is None:
        pressure_bar = pressure_mca_to_bar(pressure_mca)

    if pressure_mca is None:
        pressure_mca = pressure_bar_to_mca(pressure_bar)

    measured_at_sql = "COALESCE($7::timestamptz, now())"

    async with pool.acquire() as conn:
        exists = await conn.fetchval(
            """
            SELECT EXISTS (
              SELECT 1
              FROM "MapasAgua".distribution_pressure_meters
              WHERE id = $1
                AND active = true
            )
            """,
            meter_id,
        )

        if not exists:
            raise HTTPException(status_code=404, detail="Manómetro no encontrado o inactivo")

        row = await conn.fetchrow(
            f"""
            INSERT INTO "MapasAgua".distribution_pressure_readings (
              pressure_meter_id,
              pressure_bar,
              pressure_mca,
              battery_v,
              signal_rssi,
              quality,
              measured_at,
              raw_payload
            )
            VALUES (
              $1, $2, $3, $4, $5, $6, {measured_at_sql}, $8::jsonb
            )
            RETURNING id, pressure_meter_id, pressure_bar, pressure_mca, measured_at, received_at
            """,
            meter_id,
            pressure_bar,
            pressure_mca,
            payload.battery_v,
            payload.signal_rssi,
            payload.quality,
            payload.measured_at,
            jsonb(payload.raw_payload),
        )

        latest = await conn.fetchrow(
            """
            SELECT *
            FROM "MapasAgua".v_distribution_pressure_latest
            WHERE id = $1
            """,
            meter_id,
        )

    return {
        "ok": True,
        "reading": dict(row),
        "latest": dict(latest) if latest else None,
    }


# ============================================================
# Cargar dato de caudal por ID
# ============================================================

@router.post("/flow/{meter_id}/readings")
async def insert_flow_reading(
    meter_id: UUID,
    payload: FlowReadingIn,
    request: Request,
):
    pool = get_pool(request)

    flow_m3h = payload.flow_m3h
    flow_lps = payload.flow_lps

    if flow_m3h is None and flow_lps is None:
        raise HTTPException(
            status_code=400,
            detail="Enviar flow_m3h o flow_lps",
        )

    if flow_m3h is None:
        flow_m3h = flow_lps_to_m3h(flow_lps)

    if flow_lps is None:
        flow_lps = flow_m3h_to_lps(flow_m3h)

    measured_at_sql = "COALESCE($8::timestamptz, now())"

    async with pool.acquire() as conn:
        exists = await conn.fetchval(
            """
            SELECT EXISTS (
              SELECT 1
              FROM "MapasAgua".distribution_flow_meters
              WHERE id = $1
                AND active = true
            )
            """,
            meter_id,
        )

        if not exists:
            raise HTTPException(status_code=404, detail="Caudalímetro no encontrado o inactivo")

        row = await conn.fetchrow(
            f"""
            INSERT INTO "MapasAgua".distribution_flow_readings (
              flow_meter_id,
              flow_m3h,
              flow_lps,
              total_m3,
              battery_v,
              signal_rssi,
              quality,
              measured_at,
              raw_payload
            )
            VALUES (
              $1, $2, $3, $4, $5, $6, $7, {measured_at_sql}, $9::jsonb
            )
            RETURNING id, flow_meter_id, flow_m3h, flow_lps, total_m3, measured_at, received_at
            """,
            meter_id,
            flow_m3h,
            flow_lps,
            payload.total_m3,
            payload.battery_v,
            payload.signal_rssi,
            payload.quality,
            payload.measured_at,
            jsonb(payload.raw_payload),
        )

        latest = await conn.fetchrow(
            """
            SELECT *
            FROM "MapasAgua".v_distribution_flow_latest
            WHERE id = $1
            """,
            meter_id,
        )

    return {
        "ok": True,
        "reading": dict(row),
        "latest": dict(latest) if latest else None,
    }


# ============================================================
# Histórico simple por ID
# ============================================================

@router.get("/pressure/{meter_id}/readings")
async def get_pressure_readings(
    meter_id: UUID,
    request: Request,
    limit: int = Query(200, ge=1, le=2000),
):
    pool = get_pool(request)

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT *
            FROM "MapasAgua".distribution_pressure_readings
            WHERE pressure_meter_id = $1
            ORDER BY measured_at DESC
            LIMIT $2
            """,
            meter_id,
            limit,
        )

    return {
        "ok": True,
        "count": len(rows),
        "items": [dict(r) for r in rows],
    }


@router.get("/flow/{meter_id}/readings")
async def get_flow_readings(
    meter_id: UUID,
    request: Request,
    limit: int = Query(200, ge=1, le=2000),
):
    pool = get_pool(request)

    async with pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT *
            FROM "MapasAgua".distribution_flow_readings
            WHERE flow_meter_id = $1
            ORDER BY measured_at DESC
            LIMIT $2
            """,
            meter_id,
            limit,
        )

    return {
        "ok": True,
        "count": len(rows),
        "items": [dict(r) for r in rows],
    }