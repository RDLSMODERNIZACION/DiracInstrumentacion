# app/routes/mapa/valves.py
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, Literal

from app.db import get_conn

router = APIRouter(prefix="/valves", tags=["mapa-valves"])


# ============================================================
# Models
# ============================================================

class ValveCreateBody(BaseModel):
    name: Optional[str] = None
    map_node_id: Optional[str] = None
    map_pipe_id: Optional[str] = None
    is_open: bool = True
    valve_type: str = "MANUAL"
    location_id: Optional[int] = None
    source: str = "MANUAL"
    tag: Optional[str] = None
    notes: Optional[str] = None


class ValveInsertOnPipeBody(BaseModel):
    pipe_id: str
    lat: float
    lng: float
    name: Optional[str] = None
    is_open: bool = True
    valve_type: str = "MANUAL"
    location_id: Optional[int] = None
    source: str = "MANUAL"
    tag: Optional[str] = None
    notes: Optional[str] = None

    # Qué tramo bloquea la válvula cuando está cerrada:
    # - "to": bloquea el tramo desde válvula hacia el to_node original.
    # - "from": bloquea el tramo desde válvula hacia el from_node original.
    block_side: Literal["from", "to"] = "to"


class ValveStateBody(BaseModel):
    is_open: bool


# ============================================================
# Helpers
# ============================================================

def _fetchall_dict(cur):
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]


def _fetchone_dict(cur):
    cols = [d[0] for d in cur.description]
    row = cur.fetchone()
    if not row:
        return None
    return dict(zip(cols, row))


def _safe_rollback(conn):
    try:
        conn.rollback()
    except Exception:
        pass


VALVE_SELECT_SQL = """
select
  v.id::text as valve_id,
  v.name,
  v.location_id,

  v.map_node_id::text as map_node_id,
  v.map_pipe_id::text as map_pipe_id,

  v.is_open,
  case
    when v.is_open then 'OPEN'
    else 'CLOSED'
  end as valve_status,

  v.valve_type,
  v.normal_position,
  v.source,
  v.tag,
  v.last_ts,
  v.notes,
  v.props,

  n.elev_m::double precision as node_elev_m,

  case
    when v.map_node_id is not null then st_y(n.geom)::double precision
    when v.map_pipe_id is not null then st_y(st_lineinterpolatepoint(st_linemerge(p.geom), 0.5))::double precision
    else null
  end as lat,

  case
    when v.map_node_id is not null then st_x(n.geom)::double precision
    when v.map_pipe_id is not null then st_x(st_lineinterpolatepoint(st_linemerge(p.geom), 0.5))::double precision
    else null
  end as lng,

  coalesce(p.props->>'Layer', p.props->>'layer', p.props->>'name') as pipe_name,
  p.diametro_mm::double precision as diametro_mm,
  p.flow_func,

  v.created_at,
  v.updated_at

from "MapasAgua"."valves" v
left join "MapasAgua"."nodes" n
  on n.id = v.map_node_id
left join "MapasAgua"."pipes" p
  on p.id = v.map_pipe_id
"""


def _get_valve(cur, valve_id: str):
    cur.execute(
        f"""
        {VALVE_SELECT_SQL}
        where v.id = %s::uuid
        """,
        (valve_id,),
    )
    return _fetchone_dict(cur)


# ============================================================
# GET /mapa/valves
# ============================================================

@router.get("")
def list_valves():
    with get_conn() as conn, conn.cursor() as cur:
        try:
            cur.execute(
                f"""
                {VALVE_SELECT_SQL}
                order by v.created_at desc
                """
            )
            items = _fetchall_dict(cur)
        except Exception as e:
            _safe_rollback(conn)
            raise HTTPException(500, f"list_valves falló: {e}")

    return {
        "count": len(items),
        "items": items,
    }


# ============================================================
# POST /mapa/valves
# Crea una válvula simple asociada a nodo o cañería completa.
# Para punto exacto sobre cañería usar /insert-on-pipe.
# ============================================================

@router.post("")
def create_valve(body: ValveCreateBody):
    if not body.map_node_id and not body.map_pipe_id:
        raise HTTPException(400, "La válvula debe estar asociada a un nodo o a una cañería")

    if body.map_node_id and body.map_pipe_id:
        raise HTTPException(
            400,
            "Usá map_node_id o map_pipe_id, no ambos. Para insertar en punto exacto usá /insert-on-pipe.",
        )

    name = body.name

    with get_conn() as conn, conn.cursor() as cur:
        try:
            if body.map_pipe_id and not name:
                cur.execute(
                    """
                    select coalesce(props->>'Layer', props->>'layer', props->>'name', id::text)
                    from "MapasAgua"."pipes"
                    where id = %s::uuid
                    """,
                    (body.map_pipe_id,),
                )
                row = cur.fetchone()
                name = f"Válvula {row[0] if row else body.map_pipe_id[:8]}"

            if body.map_node_id and not name:
                cur.execute(
                    """
                    select coalesce(props->>'label', id::text)
                    from "MapasAgua"."nodes"
                    where id = %s::uuid
                    """,
                    (body.map_node_id,),
                )
                row = cur.fetchone()
                name = f"Válvula {row[0] if row else body.map_node_id[:8]}"

            cur.execute(
                """
                insert into "MapasAgua"."valves" (
                  name,
                  map_node_id,
                  map_pipe_id,
                  is_open,
                  valve_type,
                  location_id,
                  source,
                  tag,
                  notes,
                  props
                )
                values (
                  %s,
                  %s::uuid,
                  %s::uuid,
                  %s,
                  %s,
                  %s,
                  %s,
                  %s,
                  %s,
                  '{}'::jsonb
                )
                returning id::text
                """,
                (
                    name or "Válvula",
                    body.map_node_id,
                    body.map_pipe_id,
                    body.is_open,
                    body.valve_type,
                    body.location_id,
                    body.source,
                    body.tag,
                    body.notes,
                ),
            )

            valve_id = cur.fetchone()[0]
            conn.commit()

            item = _get_valve(cur, valve_id)

        except Exception as e:
            _safe_rollback(conn)
            raise HTTPException(500, f"create_valve falló: {e}")

    return item


# ============================================================
# POST /mapa/valves/insert-on-pipe
# Inserta una válvula en un punto exacto sobre una cañería:
# - proyecta el click sobre la línea
# - crea nodo
# - parte cañería
# - desactiva original
# - crea válvula en el nodo y asociada a uno de los tramos
# ============================================================

@router.post("/insert-on-pipe")
def insert_valve_on_pipe(body: ValveInsertOnPipeBody):
    if not body.pipe_id:
        raise HTTPException(400, "Falta pipe_id")

    if body.block_side not in ("from", "to"):
        raise HTTPException(400, "block_side debe ser 'from' o 'to'")

    with get_conn() as conn, conn.cursor() as cur:
        try:
            # ------------------------------------------------
            # Validar cañería original
            # ------------------------------------------------
            cur.execute(
                """
                select
                  p.id::text as pipe_id,
                  p.from_node::text as from_node,
                  p.to_node::text as to_node,
                  geometrytype(st_linemerge(p.geom)) as line_type,
                  coalesce(p.props->>'Layer', p.props->>'layer', p.props->>'name', p.id::text) as label,
                  p.active
                from "MapasAgua"."pipes" p
                where p.id = %s::uuid
                """,
                (body.pipe_id,),
            )
            pipe_info = _fetchone_dict(cur)

            if not pipe_info:
                raise HTTPException(404, "Cañería no encontrada")

            if not pipe_info.get("from_node") or not pipe_info.get("to_node"):
                raise HTTPException(
                    400,
                    "La cañería debe tener from_node y to_node antes de insertar una válvula.",
                )

            if pipe_info.get("line_type") != "LINESTRING":
                raise HTTPException(
                    400,
                    f"La geometría de la cañería no es LINESTRING simple: {pipe_info.get('line_type')}",
                )

            # ------------------------------------------------
            # Crear nodo + partir cañería
            # ------------------------------------------------
            cur.execute(
                """
                with original as (
                  select
                    p.*,
                    st_linemerge(p.geom) as line_geom,
                    st_setsrid(st_makepoint(%s, %s), 4326) as click_geom
                  from "MapasAgua"."pipes" p
                  where p.id = %s::uuid
                    and p.from_node is not null
                    and p.to_node is not null
                ),

                located as (
                  select
                    o.*,
                    st_linelocatepoint(o.line_geom, o.click_geom) as frac_raw
                  from original o
                ),

                clamped as (
                  select
                    l.*,
                    greatest(0.001, least(0.999, l.frac_raw)) as frac
                  from located l
                ),

                elevations as (
                  select
                    c.*,
                    nf.elev_m::double precision as from_elev_m,
                    nt.elev_m::double precision as to_elev_m,
                    case
                      when nf.elev_m is not null and nt.elev_m is not null
                      then (
                        nf.elev_m::double precision
                        + (
                          nt.elev_m::double precision - nf.elev_m::double precision
                        ) * c.frac
                      )
                      else null
                    end as valve_elev_m
                  from clamped c
                  left join "MapasAgua"."nodes" nf
                    on nf.id = c.from_node
                  left join "MapasAgua"."nodes" nt
                    on nt.id = c.to_node
                ),

                valve_node as (
                  insert into "MapasAgua"."nodes" (
                    kind,
                    elev_m,
                    props,
                    geom
                  )
                  select
                    'VALVE',
                    e.valve_elev_m,
                    jsonb_build_object(
                      'label', %s,
                      'auto_created', true,
                      'created_by', 'insert_valve_on_pipe',
                      'original_pipe_id', e.id::text,
                      'frac_on_pipe', e.frac,
                      'from_node', e.from_node::text,
                      'to_node', e.to_node::text
                    ),
                    st_lineinterpolatepoint(e.line_geom, e.frac)
                  from elevations e
                  returning id, id::text as id_text
                ),

                pipe_a as (
                  insert into "MapasAgua"."pipes" (
                    geom,
                    from_node,
                    to_node,
                    length_m,
                    diametro_mm,
                    type,
                    flow_func,
                    active,
                    is_open,
                    props
                  )
                  select
                    st_linesubstring(e.line_geom, 0, e.frac),
                    e.from_node,
                    vn.id,
                    st_length(st_linesubstring(e.line_geom, 0, e.frac)::geography),
                    e.diametro_mm,
                    e.type,
                    e.flow_func,
                    true,
                    coalesce(e.is_open, true),
                    coalesce(e.props, '{}'::jsonb)
                      || jsonb_build_object(
                        'split_from_pipe_id', e.id::text,
                        'split_part', 'from_to_valve',
                        'valve_node_id', vn.id_text,
                        'Layer', coalesce(e.props->>'Layer', e.props->>'layer', e.props->>'name', 'Tramo partido') || ' · tramo válvula A'
                      )
                  from elevations e
                  cross join valve_node vn
                  returning id, id::text as id_text
                ),

                pipe_b as (
                  insert into "MapasAgua"."pipes" (
                    geom,
                    from_node,
                    to_node,
                    length_m,
                    diametro_mm,
                    type,
                    flow_func,
                    active,
                    is_open,
                    props
                  )
                  select
                    st_linesubstring(e.line_geom, e.frac, 1),
                    vn.id,
                    e.to_node,
                    st_length(st_linesubstring(e.line_geom, e.frac, 1)::geography),
                    e.diametro_mm,
                    e.type,
                    e.flow_func,
                    true,
                    coalesce(e.is_open, true),
                    coalesce(e.props, '{}'::jsonb)
                      || jsonb_build_object(
                        'split_from_pipe_id', e.id::text,
                        'split_part', 'valve_to_to',
                        'valve_node_id', vn.id_text,
                        'Layer', coalesce(e.props->>'Layer', e.props->>'layer', e.props->>'name', 'Tramo partido') || ' · tramo válvula B'
                      )
                  from elevations e
                  cross join valve_node vn
                  returning id, id::text as id_text
                ),

                original_off as (
                  update "MapasAgua"."pipes" p
                  set
                    active = false,
                    updated_at = now(),
                    props = coalesce(p.props, '{}'::jsonb)
                      || jsonb_build_object(
                        'inactive_reason', 'split_for_valve',
                        'split_for_valve_at', now(),
                        'split_valve_name', %s
                      )
                  where p.id = %s::uuid
                  returning p.id::text as original_pipe_id
                )

                select
                  (select id_text from valve_node) as valve_node_id,
                  (select id_text from pipe_a) as pipe_from_id,
                  (select id_text from pipe_b) as pipe_to_id,
                  (select original_pipe_id from original_off) as original_pipe_id,
                  (select frac from elevations) as frac_on_pipe,
                  st_y((select geom from valve_node))::double precision as valve_lat,
                  st_x((select geom from valve_node))::double precision as valve_lng,
                  (select valve_elev_m from elevations)::double precision as valve_elev_m
                """,
                (
                    body.lng,
                    body.lat,
                    body.pipe_id,
                    body.name or "Válvula",
                    body.name or "Válvula",
                    body.pipe_id,
                ),
            )

            split = _fetchone_dict(cur)

            if not split:
                raise HTTPException(500, "No se pudo partir la cañería")

            valve_node_id = split["valve_node_id"]
            pipe_from_id = split["pipe_from_id"]
            pipe_to_id = split["pipe_to_id"]

            blocked_pipe_id = pipe_to_id if body.block_side == "to" else pipe_from_id

            # ------------------------------------------------
            # Nombre automático
            # ------------------------------------------------
            name = body.name

            if not name:
                name = f"Válvula {pipe_info.get('label') or body.pipe_id[:8]}"

            # ------------------------------------------------
            # Crear válvula
            # Nota:
            # - map_node_id = ubicación física de la válvula.
            # - map_pipe_id = tramo que se bloquea cuando la válvula cierra.
            # ------------------------------------------------
            cur.execute(
                """
                insert into "MapasAgua"."valves" (
                  name,
                  map_node_id,
                  map_pipe_id,
                  is_open,
                  valve_type,
                  location_id,
                  source,
                  tag,
                  notes,
                  props
                )
                values (
                  %s,
                  %s::uuid,
                  %s::uuid,
                  %s,
                  %s,
                  %s,
                  %s,
                  %s,
                  %s,
                  jsonb_build_object(
                    'inserted_on_pipe_point', true,
                    'original_pipe_id', %s,
                    'pipe_from_id', %s,
                    'pipe_to_id', %s,
                    'blocked_pipe_id', %s,
                    'block_side', %s,
                    'frac_on_pipe', %s,
                    'valve_lat', %s,
                    'valve_lng', %s,
                    'valve_elev_m', %s
                  )
                )
                returning id::text
                """,
                (
                    name,
                    valve_node_id,
                    blocked_pipe_id,
                    body.is_open,
                    body.valve_type,
                    body.location_id,
                    body.source,
                    body.tag,
                    body.notes or "Insertada desde el mapa sobre punto de cañería",
                    body.pipe_id,
                    pipe_from_id,
                    pipe_to_id,
                    blocked_pipe_id,
                    body.block_side,
                    split.get("frac_on_pipe"),
                    split.get("valve_lat"),
                    split.get("valve_lng"),
                    split.get("valve_elev_m"),
                ),
            )

            valve_id = cur.fetchone()[0]

            # Completar metadata de original desactivada con valve_id
            cur.execute(
                """
                update "MapasAgua"."pipes"
                set props = coalesce(props, '{}'::jsonb)
                  || jsonb_build_object('split_valve_id', %s)
                where id = %s::uuid
                """,
                (valve_id, body.pipe_id),
            )

            conn.commit()

            item = _get_valve(cur, valve_id)

        except HTTPException:
            _safe_rollback(conn)
            raise
        except Exception as e:
            _safe_rollback(conn)
            raise HTTPException(500, f"insert_valve_on_pipe falló: {e}")

    return {
        "ok": True,
        "valve": item,
        "split": {
            "original_pipe_id": split.get("original_pipe_id"),
            "valve_node_id": split.get("valve_node_id"),
            "pipe_from_id": split.get("pipe_from_id"),
            "pipe_to_id": split.get("pipe_to_id"),
            "blocked_pipe_id": blocked_pipe_id,
            "block_side": body.block_side,
            "frac_on_pipe": split.get("frac_on_pipe"),
            "lat": split.get("valve_lat"),
            "lng": split.get("valve_lng"),
            "elev_m": split.get("valve_elev_m"),
        },
    }


# ============================================================
# PATCH /mapa/valves/{valve_id}/state
# ============================================================

@router.patch("/{valve_id}/state")
def update_valve_state(valve_id: str, body: ValveStateBody):
    with get_conn() as conn, conn.cursor() as cur:
        try:
            cur.execute(
                """
                update "MapasAgua"."valves"
                set
                  is_open = %s,
                  updated_at = now()
                where id = %s::uuid
                returning id::text
                """,
                (body.is_open, valve_id),
            )

            row = cur.fetchone()

            if not row:
                raise HTTPException(404, "Válvula no encontrada")

            conn.commit()

            item = _get_valve(cur, valve_id)

        except HTTPException:
            _safe_rollback(conn)
            raise
        except Exception as e:
            _safe_rollback(conn)
            raise HTTPException(500, f"update_valve_state falló: {e}")

    return item


# ============================================================
# DELETE /mapa/valves/{valve_id}
# Borra la válvula, pero no recompone la cañería partida.
# ============================================================

@router.delete("/{valve_id}")
def delete_valve(valve_id: str):
    with get_conn() as conn, conn.cursor() as cur:
        try:
            cur.execute(
                """
                delete from "MapasAgua"."valves"
                where id = %s::uuid
                returning id::text
                """,
                (valve_id,),
            )

            row = cur.fetchone()

            if not row:
                raise HTTPException(404, "Válvula no encontrada")

            conn.commit()

        except HTTPException:
            _safe_rollback(conn)
            raise
        except Exception as e:
            _safe_rollback(conn)
            raise HTTPException(500, f"delete_valve falló: {e}")

    return {
        "ok": True,
        "valve_id": valve_id,
    }