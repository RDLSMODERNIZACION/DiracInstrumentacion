from __future__ import annotations

import json
from datetime import date, datetime
from decimal import Decimal
from typing import Any, Literal, Optional
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.db import get_conn


# IMPORTANTE:
# Este router se incluye desde app/routes/mapa/__init__.py
# y main.py monta mapa_router con prefix="/mapa".
# Por eso acá NO va prefix="/mapa/...".
# Endpoint final:
# /mapa/distribucion/instrumentation
router = APIRouter(
    prefix="/distribucion/instrumentation",
    tags=["Mapa - Instrumentación de distribución"],
)


# ============================================================
# Helpers
# ============================================================

MeterType = Literal["pressure", "flow"]


def _safe_rollback(conn) -> None:
    try:
        conn.rollback()
    except Exception:
        pass


def _fetchone_dict(cur) -> Optional[dict[str, Any]]:
    row = cur.fetchone()
    if not row:
        return None

    cols = [d[0] for d in cur.description]
    return dict(zip(cols, row))


def _fetchall_dict(cur) -> list[dict[str, Any]]:
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]


def _json_default(value: Any) -> str:
    if isinstance(value, (datetime, date)):
        return value.isoformat()

    if isinstance(value, Decimal):
        return str(value)

    if isinstance(value, UUID):
        return str(value)

    return str(value)


def jsonb(value: Any) -> str:
    return json.dumps(
        value if value is not None else {},
        ensure_ascii=False,
        default=_json_default,
    )


def _api_value(value: Any) -> Any:
    if value is None:
        return None

    if isinstance(value, UUID):
        return str(value)

    if isinstance(value, Decimal):
        return float(value)

    if isinstance(value, (datetime, date)):
        return value.isoformat()

    if isinstance(value, list):
        return [_api_value(v) for v in value]

    if isinstance(value, tuple):
        return [_api_value(v) for v in value]

    if isinstance(value, dict):
        return {str(k): _api_value(v) for k, v in value.items()}

    return value


def _api_dict(row: Optional[dict[str, Any]]) -> Optional[dict[str, Any]]:
    if row is None:
        return None

    return {k: _api_value(v) for k, v in row.items()}


def _api_list(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [_api_dict(r) or {} for r in rows]


def model_to_dict(model: BaseModel, exclude_unset: bool = False) -> dict[str, Any]:
    """
    Compatible con Pydantic v1 y v2.
    """
    if hasattr(model, "model_dump"):
        return model.model_dump(exclude_unset=exclude_unset)

    return model.dict(exclude_unset=exclude_unset)


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


def _meter_table(meter_type: MeterType) -> str:
    if meter_type == "pressure":
        return '"MapasAgua".distribution_pressure_meters'

    if meter_type == "flow":
        return '"MapasAgua".distribution_flow_meters'

    raise HTTPException(400, "meter_type debe ser pressure o flow")


def _source_table(meter_type: MeterType) -> str:
    return (
        "MapasAgua.distribution_pressure_meters"
        if meter_type == "pressure"
        else "MapasAgua.distribution_flow_meters"
    )


def _asset_type(meter_type: MeterType) -> str:
    return "PRESSURE_SENSOR" if meter_type == "pressure" else "FLOW_SENSOR"


# ============================================================
# Schemas
# ============================================================

class CreateInstrumentationPointIn(BaseModel):
    meter_type: MeterType = Field(..., description="pressure o flow")

    name: str
    tag: Optional[str] = None

    location_id: Optional[int] = None
    sector_name: Optional[str] = None
    barrio: Optional[str] = None

    # Si se manda map_pipe_id + lat/lng, el backend proyecta el punto sobre la cañería.
    map_pipe_id: Optional[UUID] = None

    # Si ya existe un nodo del mapa, se puede usar directamente.
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


class InsertOnPipeIn(BaseModel):
    meter_type: MeterType

    pipe_id: UUID
    lat: float
    lng: float

    name: str
    tag: Optional[str] = None

    location_id: Optional[int] = None
    sector_name: Optional[str] = None
    barrio: Optional[str] = None

    hydraulic_position: Optional[str] = "DISTRIBUCION"

    model: Optional[str] = None
    serial_number: Optional[str] = None
    device_id: Optional[str] = None
    topic: Optional[str] = None

    stale_after_sec: int = 300
    diameter_mm: Optional[int] = None

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
# SQL base
# ============================================================

PRESSURE_SELECT_SQL = """
select
  'pressure'::text as meter_type,

  m.id::text as id,
  m.name,
  m.tag,
  m.location_id,
  m.sector_name,
  m.barrio,

  m.map_node_id::text as map_node_id,
  m.map_pipe_id::text as map_pipe_id,

  m.hydraulic_position,
  m.model,
  m.serial_number,
  m.pressure_unit,

  m.min_pressure_bar::double precision as min_pressure_bar,
  m.max_pressure_bar::double precision as max_pressure_bar,

  m.telemetry_source,
  m.device_id,
  m.topic,

  m.stale_after_sec,
  m.active,
  m.props,
  m.notes,

  l.pressure_bar::double precision as pressure_bar,
  l.pressure_mca::double precision as pressure_mca,

  l.battery_v::double precision as battery_v,
  l.signal_rssi::double precision as signal_rssi,

  l.quality,
  l.measured_at,
  l.received_at,

  case
    when l.measured_at is null then null
    else extract(epoch from now() - l.measured_at)::integer
  end as age_sec,

  case
    when l.measured_at is null then false
    when extract(epoch from now() - l.measured_at) <= m.stale_after_sec then true
    else false
  end as online,

  case
    when l.measured_at is null then 'SIN_DATOS'
    when extract(epoch from now() - l.measured_at) <= m.stale_after_sec then 'ONLINE'
    else 'STALE'
  end as telemetry_status,

  l.raw_payload,
  l.updated_at as latest_updated_at,

  case
    when m.map_node_id is not null then st_y(n.geom)::double precision
    when m.map_pipe_id is not null then st_y(st_lineinterpolatepoint(st_linemerge(p.geom), 0.5))::double precision
    else null
  end as lat,

  case
    when m.map_node_id is not null then st_x(n.geom)::double precision
    when m.map_pipe_id is not null then st_x(st_lineinterpolatepoint(st_linemerge(p.geom), 0.5))::double precision
    else null
  end as lng,

  coalesce(p.props->>'Layer', p.props->>'layer', p.props->>'name', p.id::text) as pipe_name,
  p.diametro_mm::double precision as pipe_diametro_mm,
  p.flow_func as pipe_flow_func,

  m.created_at,
  m.updated_at

from "MapasAgua".distribution_pressure_meters m
left join "MapasAgua".distribution_pressure_latest l
  on l.pressure_meter_id = m.id
left join "MapasAgua".nodes n
  on n.id = m.map_node_id
left join "MapasAgua".pipes p
  on p.id = m.map_pipe_id
"""


FLOW_SELECT_SQL = """
select
  'flow'::text as meter_type,

  m.id::text as id,
  m.name,
  m.tag,
  m.location_id,
  m.sector_name,
  m.barrio,

  m.map_node_id::text as map_node_id,
  m.map_pipe_id::text as map_pipe_id,

  m.hydraulic_position,
  m.model,
  m.serial_number,

  m.diameter_mm,
  m.flow_unit,
  m.totalizer_unit,

  m.min_flow_m3h::double precision as min_flow_m3h,
  m.max_flow_m3h::double precision as max_flow_m3h,

  m.telemetry_source,
  m.device_id,
  m.topic,

  m.stale_after_sec,
  m.active,
  m.props,
  m.notes,

  l.flow_m3h::double precision as flow_m3h,
  l.flow_lps::double precision as flow_lps,
  l.total_m3::double precision as total_m3,

  l.battery_v::double precision as battery_v,
  l.signal_rssi::double precision as signal_rssi,

  l.quality,
  l.measured_at,
  l.received_at,

  case
    when l.measured_at is null then null
    else extract(epoch from now() - l.measured_at)::integer
  end as age_sec,

  case
    when l.measured_at is null then false
    when extract(epoch from now() - l.measured_at) <= m.stale_after_sec then true
    else false
  end as online,

  case
    when l.measured_at is null then 'SIN_DATOS'
    when extract(epoch from now() - l.measured_at) <= m.stale_after_sec then 'ONLINE'
    else 'STALE'
  end as telemetry_status,

  l.raw_payload,
  l.updated_at as latest_updated_at,

  case
    when m.map_node_id is not null then st_y(n.geom)::double precision
    when m.map_pipe_id is not null then st_y(st_lineinterpolatepoint(st_linemerge(p.geom), 0.5))::double precision
    else null
  end as lat,

  case
    when m.map_node_id is not null then st_x(n.geom)::double precision
    when m.map_pipe_id is not null then st_x(st_lineinterpolatepoint(st_linemerge(p.geom), 0.5))::double precision
    else null
  end as lng,

  coalesce(p.props->>'Layer', p.props->>'layer', p.props->>'name', p.id::text) as pipe_name,
  p.diametro_mm::double precision as pipe_diametro_mm,
  p.flow_func as pipe_flow_func,

  m.created_at,
  m.updated_at

from "MapasAgua".distribution_flow_meters m
left join "MapasAgua".distribution_flow_latest l
  on l.flow_meter_id = m.id
left join "MapasAgua".nodes n
  on n.id = m.map_node_id
left join "MapasAgua".pipes p
  on p.id = m.map_pipe_id
"""


def _get_meter(cur, meter_type: MeterType, meter_id: str) -> Optional[dict[str, Any]]:
    if meter_type == "pressure":
        cur.execute(
            f"""
            {PRESSURE_SELECT_SQL}
            where m.id = %s::uuid
            limit 1
            """,
            (meter_id,),
        )
    else:
        cur.execute(
            f"""
            {FLOW_SELECT_SQL}
            where m.id = %s::uuid
            limit 1
            """,
            (meter_id,),
        )

    return _fetchone_dict(cur)


def _create_measure_node(
    cur,
    *,
    meter_type: MeterType,
    name: str,
    tag: Optional[str],
    lat: float,
    lng: float,
    map_pipe_id: Optional[str],
    props: dict[str, Any],
) -> str:
    """
    Crea un nodo de medición.

    Si viene map_pipe_id:
    - proyecta el click sobre la cañería
    - crea el nodo encima de la cañería
    - NO parte la cañería

    Esto es distinto a válvulas:
    - una válvula puede bloquear/partir una cañería
    - un sensor solo mide
    """

    node_props = {
        "label": name,
        "created_from": "distribution_instrumentation",
        "meter_type": meter_type,
        "tag": tag,
        "map_pipe_id": map_pipe_id,
        **(props or {}),
    }

    if map_pipe_id:
        cur.execute(
            """
            with pipe as (
              select
                p.id,
                st_linemerge(p.geom) as line_geom,
                st_setsrid(
                  st_makepoint(%s::double precision, %s::double precision),
                  4326
                ) as click_geom
              from "MapasAgua".pipes p
              where p.id = %s::uuid
            ),

            located as (
              select
                p.*,
                greatest(
                  0.001,
                  least(0.999, st_linelocatepoint(p.line_geom, p.click_geom))
                ) as frac
              from pipe p
            ),

            new_node as (
              insert into "MapasAgua".nodes (
                kind,
                geom,
                props
              )
              select
                'JUNCTION',
                st_lineinterpolatepoint(l.line_geom, l.frac),
                %s::jsonb
                  || jsonb_build_object(
                    'projected_on_pipe', true,
                    'original_pipe_id', l.id::text,
                    'frac_on_pipe', l.frac
                  )
              from located l
              returning id
            )

            select id::text as id
            from new_node
            """,
            (lng, lat, map_pipe_id, jsonb(node_props)),
        )
    else:
        cur.execute(
            """
            insert into "MapasAgua".nodes (
              kind,
              geom,
              props
            )
            values (
              'JUNCTION',
              st_setsrid(
                st_makepoint(%s::double precision, %s::double precision),
                4326
              ),
              %s::jsonb
            )
            returning id::text as id
            """,
            (lng, lat, jsonb(node_props)),
        )

    row = _fetchone_dict(cur)

    if not row:
        raise HTTPException(500, "No se pudo crear el nodo de medición")

    return row["id"]


def _create_asset_link(
    cur,
    *,
    meter_type: MeterType,
    meter_id: str,
    name: str,
    location_id: Optional[int],
    map_node_id: Optional[str],
    map_pipe_id: Optional[str],
    hydraulic_position: Optional[str],
    tag: Optional[str],
    device_id: Optional[str],
    notes: Optional[str],
) -> None:
    cur.execute(
        """
        insert into "MapasAgua".asset_links (
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
        values (
          %s,
          %s,
          %s,
          %s,
          %s,
          %s::uuid,
          %s::uuid,
          'MEASURE_POINT',
          %s,
          true,
          %s::jsonb,
          %s
        )
        """,
        (
            _asset_type(meter_type),
            meter_id,
            name,
            _source_table(meter_type),
            location_id,
            map_node_id,
            map_pipe_id,
            hydraulic_position,
            jsonb(
                {
                    "tag": tag,
                    "meter_type": meter_type,
                    "device_id": device_id,
                }
            ),
            notes,
        ),
    )


def _create_meter(cur, payload: CreateInstrumentationPointIn) -> dict[str, Any]:
    map_node_id = str(payload.map_node_id) if payload.map_node_id else None
    map_pipe_id = str(payload.map_pipe_id) if payload.map_pipe_id else None

    if not map_node_id:
        if payload.lat is None or payload.lng is None:
            raise HTTPException(400, "Enviar lat/lng o map_node_id existente")

        map_node_id = _create_measure_node(
            cur,
            meter_type=payload.meter_type,
            name=payload.name,
            tag=payload.tag,
            lat=payload.lat,
            lng=payload.lng,
            map_pipe_id=map_pipe_id,
            props=payload.props,
        )

    if payload.meter_type == "pressure":
        cur.execute(
            """
            insert into "MapasAgua".distribution_pressure_meters (
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
            values (
              %s, %s, %s, %s::uuid, %s::uuid,
              %s, %s, %s,
              %s, %s,
              'bar',
              %s, %s,
              'DISTRIBUTION',
              %s, %s,
              %s,
              true,
              %s::jsonb,
              %s
            )
            returning id::text as id
            """,
            (
                payload.name,
                payload.tag,
                payload.location_id,
                map_node_id,
                map_pipe_id,
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
            ),
        )

        meter_row = _fetchone_dict(cur)

        if not meter_row:
            raise HTTPException(500, "No se pudo crear el manómetro")

        meter_id = meter_row["id"]

    else:
        cur.execute(
            """
            insert into "MapasAgua".distribution_flow_meters (
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
            values (
              %s, %s, %s, %s::uuid, %s::uuid,
              %s, %s, %s,
              %s, %s,
              %s,
              'm3h',
              'm3',
              %s, %s,
              'DISTRIBUTION',
              %s, %s,
              %s,
              true,
              %s::jsonb,
              %s
            )
            returning id::text as id
            """,
            (
                payload.name,
                payload.tag,
                payload.location_id,
                map_node_id,
                map_pipe_id,
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
            ),
        )

        meter_row = _fetchone_dict(cur)

        if not meter_row:
            raise HTTPException(500, "No se pudo crear el caudalímetro")

        meter_id = meter_row["id"]

    _create_asset_link(
        cur,
        meter_type=payload.meter_type,
        meter_id=meter_id,
        name=payload.name,
        location_id=payload.location_id,
        map_node_id=map_node_id,
        map_pipe_id=map_pipe_id,
        hydraulic_position=payload.hydraulic_position,
        tag=payload.tag,
        device_id=payload.device_id,
        notes=payload.notes,
    )

    item = _get_meter(cur, payload.meter_type, meter_id)

    return item or {
        "meter_type": payload.meter_type,
        "id": meter_id,
        "map_node_id": map_node_id,
        "map_pipe_id": map_pipe_id,
    }


# ============================================================
# GET /mapa/distribucion/instrumentation
# ============================================================

@router.get("")
def list_instrumentation_points(
    meter_type: Optional[MeterType] = Query(None),
    location_id: Optional[int] = Query(None),
    active: Optional[bool] = Query(True),
):
    items: list[dict[str, Any]] = []

    with get_conn() as conn, conn.cursor() as cur:
        try:
            if meter_type in (None, "pressure"):
                where = []
                params: list[Any] = []

                if location_id is not None:
                    where.append("m.location_id = %s")
                    params.append(location_id)

                if active is not None:
                    where.append("m.active = %s")
                    params.append(active)

                where_sql = "where " + " and ".join(where) if where else ""

                cur.execute(
                    f"""
                    {PRESSURE_SELECT_SQL}
                    {where_sql}
                    order by m.created_at desc
                    """,
                    params,
                )

                items.extend(_fetchall_dict(cur))

            if meter_type in (None, "flow"):
                where = []
                params = []

                if location_id is not None:
                    where.append("m.location_id = %s")
                    params.append(location_id)

                if active is not None:
                    where.append("m.active = %s")
                    params.append(active)

                where_sql = "where " + " and ".join(where) if where else ""

                cur.execute(
                    f"""
                    {FLOW_SELECT_SQL}
                    {where_sql}
                    order by m.created_at desc
                    """,
                    params,
                )

                items.extend(_fetchall_dict(cur))

        except Exception as e:
            _safe_rollback(conn)
            raise HTTPException(500, f"list_instrumentation_points falló: {e}")

    return {
        "ok": True,
        "count": len(items),
        "items": _api_list(items),
    }


# ============================================================
# POST /mapa/distribucion/instrumentation
# ============================================================

@router.post("")
def create_instrumentation_point(body: CreateInstrumentationPointIn):
    with get_conn() as conn, conn.cursor() as cur:
        try:
            item = _create_meter(cur, body)
            conn.commit()

        except HTTPException:
            _safe_rollback(conn)
            raise

        except Exception as e:
            _safe_rollback(conn)
            raise HTTPException(500, f"create_instrumentation_point falló: {e}")

    return {
        "ok": True,
        "item": _api_dict(item),
    }


# ============================================================
# POST /mapa/distribucion/instrumentation/insert-on-pipe
# Para crear desde el front al hacer click sobre una cañería.
# ============================================================

@router.post("/insert-on-pipe")
def insert_instrumentation_on_pipe(body: InsertOnPipeIn):
    payload = CreateInstrumentationPointIn(
        meter_type=body.meter_type,
        name=body.name,
        tag=body.tag,
        location_id=body.location_id,
        sector_name=body.sector_name,
        barrio=body.barrio,
        map_pipe_id=body.pipe_id,
        lat=body.lat,
        lng=body.lng,
        hydraulic_position=body.hydraulic_position,
        model=body.model,
        serial_number=body.serial_number,
        device_id=body.device_id,
        topic=body.topic,
        stale_after_sec=body.stale_after_sec,
        diameter_mm=body.diameter_mm,
        min_pressure_bar=body.min_pressure_bar,
        max_pressure_bar=body.max_pressure_bar,
        min_flow_m3h=body.min_flow_m3h,
        max_flow_m3h=body.max_flow_m3h,
        props=body.props,
        notes=body.notes,
    )

    with get_conn() as conn, conn.cursor() as cur:
        try:
            item = _create_meter(cur, payload)
            conn.commit()

        except HTTPException:
            _safe_rollback(conn)
            raise

        except Exception as e:
            _safe_rollback(conn)
            raise HTTPException(500, f"insert_instrumentation_on_pipe falló: {e}")

    return {
        "ok": True,
        "item": _api_dict(item),
    }


# ============================================================
# GET /mapa/distribucion/instrumentation/{meter_type}/{meter_id}
# ============================================================

@router.get("/{meter_type}/{meter_id}")
def get_instrumentation_point(
    meter_type: MeterType,
    meter_id: str,
):
    with get_conn() as conn, conn.cursor() as cur:
        try:
            item = _get_meter(cur, meter_type, meter_id)

        except Exception as e:
            _safe_rollback(conn)
            raise HTTPException(500, f"get_instrumentation_point falló: {e}")

    if not item:
        raise HTTPException(404, "Punto de medición no encontrado")

    return {
        "ok": True,
        "item": _api_dict(item),
    }


# ============================================================
# PATCH /mapa/distribucion/instrumentation/{meter_type}/{meter_id}
# ============================================================

@router.patch("/{meter_type}/{meter_id}")
def update_instrumentation_point(
    meter_type: MeterType,
    meter_id: str,
    body: UpdateInstrumentationPointIn,
):
    table = _meter_table(meter_type)
    data = model_to_dict(body, exclude_unset=True)

    if not data:
        raise HTTPException(400, "No hay campos para actualizar")

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
    params: list[Any] = []

    for key, value in data.items():
        if key not in allowed:
            continue

        if key == "props":
            sets.append(f"{key} = %s::jsonb")
            params.append(jsonb(value))
        else:
            sets.append(f"{key} = %s")
            params.append(value)

    if not sets:
        raise HTTPException(400, "No hay campos válidos para actualizar")

    sets.append("updated_at = now()")
    params.append(meter_id)

    with get_conn() as conn, conn.cursor() as cur:
        try:
            cur.execute(
                f"""
                update {table}
                set {", ".join(sets)}
                where id = %s::uuid
                returning
                  id::text as id,
                  name,
                  location_id,
                  map_node_id::text as map_node_id,
                  map_pipe_id::text as map_pipe_id,
                  hydraulic_position,
                  active,
                  props,
                  notes
                """,
                params,
            )

            updated = _fetchone_dict(cur)

            if not updated:
                raise HTTPException(404, "Punto de medición no encontrado")

            cur.execute(
                """
                update "MapasAgua".asset_links
                set asset_name = %s,
                    location_id = %s,
                    map_node_id = %s::uuid,
                    map_pipe_id = %s::uuid,
                    hydraulic_position = %s,
                    enabled = %s,
                    props = coalesce(props, '{}'::jsonb) || %s::jsonb,
                    notes = %s,
                    updated_at = now()
                where asset_type = %s
                  and source_table = %s
                  and asset_id = %s
                """,
                (
                    updated["name"],
                    updated["location_id"],
                    updated["map_node_id"],
                    updated["map_pipe_id"],
                    updated["hydraulic_position"],
                    updated["active"],
                    jsonb({"meter_type": meter_type}),
                    updated["notes"],
                    _asset_type(meter_type),
                    _source_table(meter_type),
                    updated["id"],
                ),
            )

            item = _get_meter(cur, meter_type, meter_id)
            conn.commit()

        except HTTPException:
            _safe_rollback(conn)
            raise

        except Exception as e:
            _safe_rollback(conn)
            raise HTTPException(500, f"update_instrumentation_point falló: {e}")

    return {
        "ok": True,
        "item": _api_dict(item),
    }


# ============================================================
# DELETE /mapa/distribucion/instrumentation/{meter_type}/{meter_id}
# Desactiva. No borra histórico.
# ============================================================

@router.delete("/{meter_type}/{meter_id}")
def deactivate_instrumentation_point(
    meter_type: MeterType,
    meter_id: str,
):
    table = _meter_table(meter_type)

    with get_conn() as conn, conn.cursor() as cur:
        try:
            cur.execute(
                f"""
                update {table}
                set active = false,
                    updated_at = now()
                where id = %s::uuid
                returning id::text as id
                """,
                (meter_id,),
            )

            row = _fetchone_dict(cur)

            if not row:
                raise HTTPException(404, "Punto de medición no encontrado")

            cur.execute(
                """
                update "MapasAgua".asset_links
                set enabled = false,
                    updated_at = now()
                where asset_type = %s
                  and source_table = %s
                  and asset_id = %s
                """,
                (
                    _asset_type(meter_type),
                    _source_table(meter_type),
                    meter_id,
                ),
            )

            conn.commit()

        except HTTPException:
            _safe_rollback(conn)
            raise

        except Exception as e:
            _safe_rollback(conn)
            raise HTTPException(500, f"deactivate_instrumentation_point falló: {e}")

    return {
        "ok": True,
        "meter_type": meter_type,
        "id": meter_id,
        "active": False,
    }


# ============================================================
# POST /mapa/distribucion/instrumentation/pressure/{meter_id}/readings
# ============================================================

@router.post("/pressure/{meter_id}/readings")
def insert_pressure_reading(
    meter_id: str,
    body: PressureReadingIn,
):
    pressure_bar = body.pressure_bar
    pressure_mca = body.pressure_mca

    if pressure_bar is None and pressure_mca is None:
        raise HTTPException(400, "Enviar pressure_bar o pressure_mca")

    if pressure_bar is None:
        pressure_bar = pressure_mca_to_bar(pressure_mca)

    if pressure_mca is None:
        pressure_mca = pressure_bar_to_mca(pressure_bar)

    with get_conn() as conn, conn.cursor() as cur:
        try:
            cur.execute(
                """
                select exists(
                  select 1
                  from "MapasAgua".distribution_pressure_meters
                  where id = %s::uuid
                    and active = true
                ) as exists
                """,
                (meter_id,),
            )

            exists_row = _fetchone_dict(cur)

            if not exists_row or not exists_row["exists"]:
                raise HTTPException(404, "Manómetro no encontrado o inactivo")

            cur.execute(
                """
                insert into "MapasAgua".distribution_pressure_readings (
                  pressure_meter_id,
                  pressure_bar,
                  pressure_mca,
                  battery_v,
                  signal_rssi,
                  quality,
                  measured_at,
                  raw_payload
                )
                values (
                  %s::uuid,
                  %s,
                  %s,
                  %s,
                  %s,
                  %s,
                  coalesce(%s::timestamptz, now()),
                  %s::jsonb
                )
                returning
                  id,
                  pressure_meter_id::text as pressure_meter_id,
                  pressure_bar::double precision as pressure_bar,
                  pressure_mca::double precision as pressure_mca,
                  measured_at,
                  received_at
                """,
                (
                    meter_id,
                    pressure_bar,
                    pressure_mca,
                    body.battery_v,
                    body.signal_rssi,
                    body.quality,
                    body.measured_at,
                    jsonb(body.raw_payload),
                ),
            )

            reading = _fetchone_dict(cur)

            # Upsert manual del latest.
            # Si también existe trigger, no molesta.
            # Queda siempre el último measured_at.
            cur.execute(
                """
                insert into "MapasAgua".distribution_pressure_latest (
                  pressure_meter_id,
                  pressure_bar,
                  pressure_mca,
                  battery_v,
                  signal_rssi,
                  quality,
                  measured_at,
                  received_at,
                  raw_payload,
                  updated_at
                )
                values (
                  %s::uuid,
                  %s,
                  %s,
                  %s,
                  %s,
                  %s,
                  coalesce(%s::timestamptz, now()),
                  now(),
                  %s::jsonb,
                  now()
                )
                on conflict (pressure_meter_id)
                do update set
                  pressure_bar = excluded.pressure_bar,
                  pressure_mca = excluded.pressure_mca,
                  battery_v = excluded.battery_v,
                  signal_rssi = excluded.signal_rssi,
                  quality = excluded.quality,
                  measured_at = excluded.measured_at,
                  received_at = excluded.received_at,
                  raw_payload = excluded.raw_payload,
                  updated_at = now()
                where excluded.measured_at >= "MapasAgua".distribution_pressure_latest.measured_at
                """,
                (
                    meter_id,
                    pressure_bar,
                    pressure_mca,
                    body.battery_v,
                    body.signal_rssi,
                    body.quality,
                    body.measured_at,
                    jsonb(body.raw_payload),
                ),
            )

            latest = _get_meter(cur, "pressure", meter_id)
            conn.commit()

        except HTTPException:
            _safe_rollback(conn)
            raise

        except Exception as e:
            _safe_rollback(conn)
            raise HTTPException(500, f"insert_pressure_reading falló: {e}")

    return {
        "ok": True,
        "reading": _api_dict(reading),
        "latest": _api_dict(latest),
    }


# ============================================================
# POST /mapa/distribucion/instrumentation/flow/{meter_id}/readings
# ============================================================

@router.post("/flow/{meter_id}/readings")
def insert_flow_reading(
    meter_id: str,
    body: FlowReadingIn,
):
    flow_m3h = body.flow_m3h
    flow_lps = body.flow_lps

    if flow_m3h is None and flow_lps is None:
        raise HTTPException(400, "Enviar flow_m3h o flow_lps")

    if flow_m3h is None:
        flow_m3h = flow_lps_to_m3h(flow_lps)

    if flow_lps is None:
        flow_lps = flow_m3h_to_lps(flow_m3h)

    with get_conn() as conn, conn.cursor() as cur:
        try:
            cur.execute(
                """
                select exists(
                  select 1
                  from "MapasAgua".distribution_flow_meters
                  where id = %s::uuid
                    and active = true
                ) as exists
                """,
                (meter_id,),
            )

            exists_row = _fetchone_dict(cur)

            if not exists_row or not exists_row["exists"]:
                raise HTTPException(404, "Caudalímetro no encontrado o inactivo")

            cur.execute(
                """
                insert into "MapasAgua".distribution_flow_readings (
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
                values (
                  %s::uuid,
                  %s,
                  %s,
                  %s,
                  %s,
                  %s,
                  %s,
                  coalesce(%s::timestamptz, now()),
                  %s::jsonb
                )
                returning
                  id,
                  flow_meter_id::text as flow_meter_id,
                  flow_m3h::double precision as flow_m3h,
                  flow_lps::double precision as flow_lps,
                  total_m3::double precision as total_m3,
                  measured_at,
                  received_at
                """,
                (
                    meter_id,
                    flow_m3h,
                    flow_lps,
                    body.total_m3,
                    body.battery_v,
                    body.signal_rssi,
                    body.quality,
                    body.measured_at,
                    jsonb(body.raw_payload),
                ),
            )

            reading = _fetchone_dict(cur)

            cur.execute(
                """
                insert into "MapasAgua".distribution_flow_latest (
                  flow_meter_id,
                  flow_m3h,
                  flow_lps,
                  total_m3,
                  battery_v,
                  signal_rssi,
                  quality,
                  measured_at,
                  received_at,
                  raw_payload,
                  updated_at
                )
                values (
                  %s::uuid,
                  %s,
                  %s,
                  %s,
                  %s,
                  %s,
                  %s,
                  coalesce(%s::timestamptz, now()),
                  now(),
                  %s::jsonb,
                  now()
                )
                on conflict (flow_meter_id)
                do update set
                  flow_m3h = excluded.flow_m3h,
                  flow_lps = excluded.flow_lps,
                  total_m3 = excluded.total_m3,
                  battery_v = excluded.battery_v,
                  signal_rssi = excluded.signal_rssi,
                  quality = excluded.quality,
                  measured_at = excluded.measured_at,
                  received_at = excluded.received_at,
                  raw_payload = excluded.raw_payload,
                  updated_at = now()
                where excluded.measured_at >= "MapasAgua".distribution_flow_latest.measured_at
                """,
                (
                    meter_id,
                    flow_m3h,
                    flow_lps,
                    body.total_m3,
                    body.battery_v,
                    body.signal_rssi,
                    body.quality,
                    body.measured_at,
                    jsonb(body.raw_payload),
                ),
            )

            latest = _get_meter(cur, "flow", meter_id)
            conn.commit()

        except HTTPException:
            _safe_rollback(conn)
            raise

        except Exception as e:
            _safe_rollback(conn)
            raise HTTPException(500, f"insert_flow_reading falló: {e}")

    return {
        "ok": True,
        "reading": _api_dict(reading),
        "latest": _api_dict(latest),
    }


# ============================================================
# GET /mapa/distribucion/instrumentation/pressure/{meter_id}/readings
# ============================================================

@router.get("/pressure/{meter_id}/readings")
def get_pressure_readings(
    meter_id: str,
    limit: int = Query(200, ge=1, le=2000),
):
    with get_conn() as conn, conn.cursor() as cur:
        try:
            cur.execute(
                """
                select
                  id,
                  pressure_meter_id::text as pressure_meter_id,
                  pressure_bar::double precision as pressure_bar,
                  pressure_mca::double precision as pressure_mca,
                  battery_v::double precision as battery_v,
                  signal_rssi::double precision as signal_rssi,
                  quality,
                  measured_at,
                  received_at,
                  raw_payload
                from "MapasAgua".distribution_pressure_readings
                where pressure_meter_id = %s::uuid
                order by measured_at desc
                limit %s
                """,
                (meter_id, limit),
            )

            items = _fetchall_dict(cur)

        except Exception as e:
            _safe_rollback(conn)
            raise HTTPException(500, f"get_pressure_readings falló: {e}")

    return {
        "ok": True,
        "count": len(items),
        "items": _api_list(items),
    }


# ============================================================
# GET /mapa/distribucion/instrumentation/flow/{meter_id}/readings
# ============================================================

@router.get("/flow/{meter_id}/readings")
def get_flow_readings(
    meter_id: str,
    limit: int = Query(200, ge=1, le=2000),
):
    with get_conn() as conn, conn.cursor() as cur:
        try:
            cur.execute(
                """
                select
                  id,
                  flow_meter_id::text as flow_meter_id,
                  flow_m3h::double precision as flow_m3h,
                  flow_lps::double precision as flow_lps,
                  total_m3::double precision as total_m3,
                  battery_v::double precision as battery_v,
                  signal_rssi::double precision as signal_rssi,
                  quality,
                  measured_at,
                  received_at,
                  raw_payload
                from "MapasAgua".distribution_flow_readings
                where flow_meter_id = %s::uuid
                order by measured_at desc
                limit %s
                """,
                (meter_id, limit),
            )

            items = _fetchall_dict(cur)

        except Exception as e:
            _safe_rollback(conn)
            raise HTTPException(500, f"get_flow_readings falló: {e}")

    return {
        "ok": True,
        "count": len(items),
        "items": _api_list(items),
    }