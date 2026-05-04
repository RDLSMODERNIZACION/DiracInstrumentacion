# app/routes/mapa/valves.py
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional

from app.db import get_conn

router = APIRouter(prefix="/valves", tags=["mapa-valves"])


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


class ValveStateBody(BaseModel):
    is_open: bool


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
    when v.map_pipe_id is not null then st_y(st_lineinterpolatepoint(p.geom, 0.5))::double precision
    else null
  end as lat,

  case
    when v.map_node_id is not null then st_x(n.geom)::double precision
    when v.map_pipe_id is not null then st_x(st_lineinterpolatepoint(p.geom, 0.5))::double precision
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


@router.post("")
def create_valve(body: ValveCreateBody):
    if not body.map_node_id and not body.map_pipe_id:
        raise HTTPException(400, "La válvula debe estar asociada a un nodo o a una cañería")

    if body.map_node_id and body.map_pipe_id:
        raise HTTPException(400, "Usá map_node_id o map_pipe_id, no ambos")

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

            cur.execute(
                f"""
                {VALVE_SELECT_SQL}
                where v.id = %s::uuid
                """,
                (valve_id,),
            )
            item = _fetchone_dict(cur)

        except Exception as e:
            _safe_rollback(conn)
            raise HTTPException(500, f"create_valve falló: {e}")

    return item


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

            cur.execute(
                f"""
                {VALVE_SELECT_SQL}
                where v.id = %s::uuid
                """,
                (valve_id,),
            )
            item = _fetchone_dict(cur)

        except HTTPException:
            _safe_rollback(conn)
            raise
        except Exception as e:
            _safe_rollback(conn)
            raise HTTPException(500, f"update_valve_state falló: {e}")

    return item


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