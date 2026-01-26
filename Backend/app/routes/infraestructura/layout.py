from fastapi import APIRouter, HTTPException, Request, Query
from typing import List
import json
import time

from app.db import get_conn
from psycopg.rows import dict_row

router = APIRouter(prefix="/infraestructura", tags=["infraestructura"])


# -------------------------------------------------------------------
# GET /infraestructura/health_db
# -------------------------------------------------------------------
@router.get("/health_db")
async def health_db():
    """Health-check simple contra la DB."""
    try:
        with get_conn() as conn, conn.cursor() as cur:
            cur.execute("SELECT 1")
            cur.fetchone()
        return {"ok": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB down: {e}")


# -------------------------------------------------------------------
# GET /infraestructura/get_layout_edges
# -------------------------------------------------------------------
@router.get("/get_layout_edges", response_model=List[dict])
async def get_layout_edges(company_id: int | None = Query(default=None)):
    """
    Devuelve conexiones de layout (edges) desde public.v_layout_edges_flow,
    incluyendo src_port/dst_port y knots desde public.layout_edge_knots.
    - Sin company_id: todas.
    - Con company_id: sólo aristas cuyos endpoints pertenecen a nodos de esa empresa.
    """
    try:
        with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
            if company_id is None:
                cur.execute(
                    """
                    SELECT
                      e.edge_id, e.src_node_id, e.dst_node_id, e.relacion, e.prioridad, e.updated_at,
                      e.src_port, e.dst_port,
                      COALESCE(k.knots, '[]'::jsonb) AS knots
                    FROM public.v_layout_edges_flow e
                    LEFT JOIN public.layout_edge_knots k ON k.edge_id = e.edge_id
                    ORDER BY e.updated_at DESC
                    """
                )
                return cur.fetchall()

            cur.execute(
                """
                WITH nodes AS (
                  SELECT COALESCE(lt.node_id,'tank:'||t.id) AS node_id
                  FROM public.tanks t
                  JOIN public.locations l ON l.id = t.location_id
                  LEFT JOIN public.layout_tanks lt ON lt.tank_id = t.id
                  WHERE l.company_id = %s
                  UNION ALL
                  SELECT COALESCE(lp.node_id,'pump:'||p.id)
                  FROM public.pumps p
                  JOIN public.locations l ON l.id = p.location_id
                  LEFT JOIN public.layout_pumps lp ON lp.pump_id = p.id
                  WHERE l.company_id = %s
                  UNION ALL
                  SELECT COALESCE(lv.node_id,'valve:'||v.id)
                  FROM public.valves v
                  JOIN public.locations l ON l.id = v.location_id
                  LEFT JOIN public.layout_valves lv ON lv.valve_id = v.id
                  WHERE l.company_id = %s
                  UNION ALL
                  SELECT COALESCE(lm.node_id,'manifold:'||m.id)
                  FROM public.manifolds m
                  JOIN public.locations l ON l.id = m.location_id
                  LEFT JOIN public.layout_manifolds lm ON lm.manifold_id = m.id
                  WHERE l.company_id = %s
                )
                SELECT
                  e.edge_id, e.src_node_id, e.dst_node_id, e.relacion, e.prioridad, e.updated_at,
                  e.src_port, e.dst_port,
                  COALESCE(k.knots, '[]'::jsonb) AS knots
                FROM public.v_layout_edges_flow e
                JOIN nodes a ON a.node_id = e.src_node_id
                JOIN nodes b ON b.node_id = e.dst_node_id
                LEFT JOIN public.layout_edge_knots k ON k.edge_id = e.edge_id
                ORDER BY e.updated_at DESC
                """,
                (company_id, company_id, company_id, company_id),
            )
            return cur.fetchall()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error (edges): {e}")


# -------------------------------------------------------------------
# POST /infraestructura/update_edge_knots
# -------------------------------------------------------------------
@router.post("/update_edge_knots")
async def update_edge_knots(request: Request):
    """
    Guarda la forma (knots) de un edge para que quede fijo en cualquier PC.
    """
    data = await request.json()
    edge_id = data.get("edge_id")
    knots = data.get("knots")

    if not isinstance(edge_id, int):
        raise HTTPException(status_code=400, detail="edge_id requerido (int)")
    if not isinstance(knots, list):
        raise HTTPException(status_code=400, detail="knots debe ser una lista [{x,y},...]")

    for p in knots:
        if not isinstance(p, dict) or "x" not in p or "y" not in p:
            raise HTTPException(status_code=400, detail="knots inválido: cada punto debe tener x,y")
        try:
            float(p["x"])
            float(p["y"])
        except Exception:
            raise HTTPException(status_code=400, detail="knots inválido: x/y deben ser numéricos")

    try:
        with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                INSERT INTO public.layout_edge_knots (edge_id, knots, updated_at)
                VALUES (%s, %s::jsonb, now())
                ON CONFLICT (edge_id)
                DO UPDATE SET knots = excluded.knots, updated_at = now()
                RETURNING edge_id, knots, updated_at
                """,
                (edge_id, json.dumps(knots)),
            )
            row = cur.fetchone()
            conn.commit()
            return {"ok": True, "saved": row}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error (edge_knots): {e}")


# -------------------------------------------------------------------
# GET /infraestructura/get_layout_combined
# -------------------------------------------------------------------
@router.get("/get_layout_combined", response_model=List[dict])
async def get_layout_combined(company_id: int | None = Query(default=None)):
    """
    Devuelve nodos (tank/pump/valve/manifold).
    ✅ Incluye `meta` para valves (layout_valves.meta).
    ✅ Incluye `signals` para manifolds (manifold_signals + latest readings).

    OPTIMIZADO:
    - Tanques: latest ingest SOLO para tanques de la empresa (no escanea 5.2M).
    - Bombas: latest hb/event SOLO para pumps de la empresa (no usa v_pumps_with_status).
    """
    try:
        with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
            # SIN company_id: leemos de la VIEW
            if company_id is None:
                cur.execute(
                    """
                    SELECT
                      c.node_id, c.id, c.type, c.x, c.y, c.updated_at, c.online, c.state, c.level_pct, c.alarma,
                      CASE WHEN c.type = 'valve' THEN lv.meta ELSE NULL END AS meta,
                      c.signals
                    FROM public.v_layout_combined c
                    LEFT JOIN public.layout_valves lv ON lv.node_id = c.node_id
                    ORDER BY c.type, c.id
                    """
                )
                return cur.fetchall()

            # CON company_id: query scoped (evita scans globales)
            cur.execute(
                """
                WITH
                -- ===== scope de assets por empresa =====
                locs AS (
                  SELECT id
                  FROM public.locations
                  WHERE company_id = %s
                ),
                pumps_scope AS (
                  SELECT p.id AS pump_id, p.location_id
                  FROM public.pumps p
                  JOIN locs l ON l.id = p.location_id
                ),
                tanks_scope AS (
                  SELECT t.id AS tank_id, t.location_id
                  FROM public.tanks t
                  JOIN locs l ON l.id = t.location_id
                ),

                -- ===== latest tank ingest (solo para esos tanques) =====
                tank_last AS (
                  SELECT DISTINCT ON (i.tank_id)
                    i.tank_id,
                    i.level_pct,
                    i.created_at
                  FROM public.tank_ingest i
                  JOIN tanks_scope s ON s.tank_id = i.tank_id
                  ORDER BY i.tank_id, i.created_at DESC
                ),

                -- ===== latest pump heartbeat (solo para esos pumps) =====
                last_hb AS (
                  SELECT DISTINCT ON (ph.pump_id)
                    ph.pump_id,
                    ph.id AS latest_hb_id,
                    ph.created_at AS hb_ts,
                    ph.plc_state
                  FROM public.pump_heartbeat ph
                  JOIN pumps_scope ps ON ps.pump_id = ph.pump_id
                  ORDER BY ph.pump_id, ph.created_at DESC, ph.id DESC
                ),

         

                -- ===== latest manifold reading por señal (ok) =====
                ms_last AS (
                  SELECT DISTINCT ON (r.manifold_signal_id)
                    r.manifold_signal_id,
                    r.value,
                    r.created_at
                  FROM public.manifold_signal_readings r
                  ORDER BY r.manifold_signal_id, r.created_at DESC
                ),

                -- ===== tanks =====
                t AS (
                  SELECT
                    COALESCE(lt.node_id, 'tank:'||t.id) AS node_id,
                    t.id::bigint AS id,
                    'tank'::text AS type,
                    lt.x, lt.y, lt.updated_at,

                    COALESCE((now() - tl.created_at) <= interval '60 seconds', false) AS online,
                    NULL::text AS state,
                    tl.level_pct::numeric AS level_pct,

                    CASE
                      WHEN tl.level_pct IS NULL THEN NULL
                      WHEN tc.low_low_pct   IS NOT NULL AND tl.level_pct <= tc.low_low_pct   THEN 'critico'
                      WHEN tc.low_pct       IS NOT NULL AND tl.level_pct <= tc.low_pct       THEN 'alerta'
                      WHEN tc.high_high_pct IS NOT NULL AND tl.level_pct >= tc.high_high_pct THEN 'critico'
                      WHEN tc.high_pct      IS NOT NULL AND tl.level_pct >= tc.high_pct      THEN 'alerta'
                      ELSE NULL
                    END::text AS alarma,

                    l.id::bigint AS location_id,
                    l.name::text AS location_name,
                    NULL::jsonb AS meta,
                    NULL::jsonb AS signals
                  FROM public.tanks t
                  JOIN public.locations l ON l.id = t.location_id
                  LEFT JOIN public.layout_tanks lt ON lt.tank_id = t.id
                  LEFT JOIN public.tank_configs tc ON tc.tank_id = t.id
                  LEFT JOIN tank_last tl ON tl.tank_id = t.id
                  WHERE l.company_id = %s
                ),

                -- ===== pumps (mismo output que v_pump_latest_state) =====
                p AS (
                  SELECT
                    COALESCE(lp.node_id, 'pump:'||p.id) AS node_id,
                    p.id::bigint AS id,
                    'pump'::text AS type,
                    lp.x, lp.y, lp.updated_at,

                    CASE
                      WHEN hb.hb_ts IS NOT NULL AND (now() - hb.hb_ts) < interval '00:05:00' THEN true
                      ELSE false
                    END AS online,

                    COALESCE(hb.plc_state, 'stop'::text) AS state,

                    NULL::numeric AS level_pct,
                    NULL::text AS alarma,

                    l.id::bigint AS location_id,
                    l.name::text AS location_name,
                    NULL::jsonb AS meta,
                    NULL::jsonb AS signals

                  FROM public.pumps p
                  JOIN public.locations l ON l.id = p.location_id
                  LEFT JOIN public.layout_pumps lp ON lp.pump_id = p.id
                  LEFT JOIN last_hb hb ON hb.pump_id = p.id
                  -- si en el front necesitás latest_event_id/event_ts, podés agregarlos acá
                  -- LEFT JOIN last_event ev ON ev.pump_id = p.id
                  WHERE l.company_id = %s
                ),

                -- ===== valves =====
                v AS (
                  SELECT
                    COALESCE(lv.node_id, 'valve:'||v.id) AS node_id,
                    v.id::bigint AS id,
                    'valve'::text AS type,
                    lv.x, lv.y, lv.updated_at,
                    NULL::boolean AS online,
                    NULL::text AS state,
                    NULL::numeric AS level_pct,
                    NULL::text AS alarma,
                    l.id::bigint AS location_id,
                    l.name::text AS location_name,
                    lv.meta AS meta,
                    NULL::jsonb AS signals
                  FROM public.valves v
                  JOIN public.locations l ON l.id = v.location_id
                  LEFT JOIN public.layout_valves lv ON lv.valve_id = v.id
                  WHERE l.company_id = %s
                ),

                -- ===== manifold signals aggregate =====
                m_signals AS (
                  SELECT
                    s.manifold_id,
                    MAX(ml.created_at) AS last_ts,
                    jsonb_object_agg(
                      s.signal_type,
                      jsonb_build_object(
                        'id', s.id,
                        'signal_type', s.signal_type,
                        'node_id', s.node_id,
                        'tag', s.tag,
                        'unit', s.unit,
                        'scale_mult', s.scale_mult,
                        'scale_add', s.scale_add,
                        'min_value', s.min_value,
                        'max_value', s.max_value,
                        'value', ml.value,
                        'ts', ml.created_at
                      )
                    ) AS signals
                  FROM public.manifold_signals s
                  LEFT JOIN ms_last ml ON ml.manifold_signal_id = s.id
                  GROUP BY s.manifold_id
                ),

                -- ===== manifolds =====
                m AS (
                  SELECT
                    COALESCE(lm.node_id, 'manifold:'||m.id) AS node_id,
                    m.id::bigint AS id,
                    'manifold'::text AS type,
                    lm.x, lm.y, lm.updated_at,

                    CASE
                      WHEN ms.last_ts IS NOT NULL AND (now() - ms.last_ts) <= interval '00:10:00'
                      THEN true ELSE false
                    END AS online,

                    NULL::text AS state,
                    NULL::numeric AS level_pct,
                    NULL::text AS alarma,
                    l.id::bigint AS location_id,
                    l.name::text AS location_name,
                    NULL::jsonb AS meta,
                    COALESCE(ms.signals, '{}'::jsonb) AS signals
                  FROM public.manifolds m
                  JOIN public.locations l ON l.id = m.location_id
                  LEFT JOIN public.layout_manifolds lm ON lm.manifold_id = m.id
                  LEFT JOIN m_signals ms ON ms.manifold_id = m.id
                  WHERE l.company_id = %s
                )

                SELECT node_id,id,type,x,y,updated_at,online,state,level_pct,alarma,location_id,location_name,meta,signals FROM t
                UNION ALL
                SELECT node_id,id,type,x,y,updated_at,online,state,level_pct,alarma,location_id,location_name,meta,signals FROM p
                UNION ALL
                SELECT node_id,id,type,x,y,updated_at,online,state,level_pct,alarma,location_id,location_name,meta,signals FROM v
                UNION ALL
                SELECT node_id,id,type,x,y,updated_at,online,state,level_pct,alarma,location_id,location_name,meta,signals FROM m
                ORDER BY type,id
                """,
                # company_id usado en locs + cada bloque t/p/v/m
                (company_id, company_id, company_id, company_id, company_id),
            )
            return cur.fetchall()

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error (combined): {e}")


# -------------------------------------------------------------------
# POST /infraestructura/update_layout
# -------------------------------------------------------------------
@router.post("/update_layout")
async def update_layout(request: Request):
    data = await request.json()
    node_id = data.get("node_id")
    x = data.get("x")
    y = data.get("y")

    if not node_id or not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
        raise HTTPException(status_code=400, detail="Parámetros inválidos: node_id, x, y son requeridos")

    tipo, _, sufijo = node_id.partition(":")
    table_map = {
        "pump": ("layout_pumps", "pump_id"),
        "manifold": ("layout_manifolds", "manifold_id"),
        "valve": ("layout_valves", "valve_id"),
        "tank": ("layout_tanks", "tank_id"),
    }
    meta = table_map.get(tipo)
    if not meta:
        raise HTTPException(status_code=400, detail=f"Tipo de nodo no soportado: {tipo}")

    table, id_col = meta

    try:
        id_numeric = int(sufijo)
        where = f"{id_col} = %s"
        params = (x, y, id_numeric)
    except ValueError:
        where = "node_id = %s"
        params = (x, y, node_id)

    sql = f"""
        UPDATE public.{table}
        SET x = %s::double precision,
            y = %s::double precision,
            updated_at = now()
        WHERE {where}
        RETURNING node_id, {id_col} AS entity_id, x, y, updated_at
    """

    try:
        with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
            cur.execute(sql, params)
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail=f"no se encontró fila en {table} con {where}")
            conn.commit()
            return {"ok": True, "table": table, "updated": row}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error (update): {e}")


# -------------------------------------------------------------------
# GET /infraestructura/bootstrap_layout
# -------------------------------------------------------------------
@router.get("/bootstrap_layout")
async def bootstrap_layout(company_id: int | None = Query(default=None)):
    """
    Devuelve {nodes, edges}. Con company_id, limita a esa empresa.
    ✅ nodes incluye meta para valves y signals para manifolds.
    """
    try:
        with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
            if company_id is None:
                cur.execute(
                    """
                    SELECT
                      c.node_id, c.id, c.type, c.x, c.y, c.updated_at, c.online, c.state, c.level_pct, c.alarma,
                      CASE WHEN c.type = 'valve' THEN lv.meta ELSE NULL END AS meta,
                      c.signals
                    FROM public.v_layout_combined c
                    LEFT JOIN public.layout_valves lv ON lv.node_id = c.node_id
                    ORDER BY c.type, c.id
                    """
                )
                nodes = cur.fetchall()

                cur.execute(
                    """
                    SELECT
                      e.edge_id, e.src_node_id, e.dst_node_id, e.relacion, e.prioridad, e.updated_at,
                      e.src_port, e.dst_port,
                      COALESCE(k.knots, '[]'::jsonb) AS knots
                    FROM public.v_layout_edges_flow e
                    LEFT JOIN public.layout_edge_knots k ON k.edge_id = e.edge_id
                    ORDER BY e.updated_at DESC
                    """
                )
                edges = cur.fetchall()

                return {"nodes": nodes, "edges": edges}

            # Nodes (reusa get_layout_combined lógico, pero en SQL para no hacer 2 roundtrips)
            cur.execute(
                """
                WITH
                locs AS (
                  SELECT id FROM public.locations WHERE company_id = %s
                ),
                pumps_scope AS (
                  SELECT p.id AS pump_id
                  FROM public.pumps p
                  JOIN locs l ON l.id = p.location_id
                ),
                tanks_scope AS (
                  SELECT t.id AS tank_id
                  FROM public.tanks t
                  JOIN locs l ON l.id = t.location_id
                ),
                tank_last AS (
                  SELECT DISTINCT ON (i.tank_id)
                    i.tank_id,
                    i.level_pct,
                    i.created_at
                  FROM public.tank_ingest i
                  JOIN tanks_scope s ON s.tank_id = i.tank_id
                  ORDER BY i.tank_id, i.created_at DESC
                ),
                last_hb AS (
                  SELECT DISTINCT ON (ph.pump_id)
                    ph.pump_id,
                    ph.created_at AS hb_ts,
                    ph.plc_state
                  FROM public.pump_heartbeat ph
                  JOIN pumps_scope ps ON ps.pump_id = ph.pump_id
                  ORDER BY ph.pump_id, ph.created_at DESC, ph.id DESC
                ),
                ms_last AS (
                  SELECT DISTINCT ON (r.manifold_signal_id)
                    r.manifold_signal_id,
                    r.value,
                    r.created_at
                  FROM public.manifold_signal_readings r
                  ORDER BY r.manifold_signal_id, r.created_at DESC
                ),
                t AS (
                  SELECT
                    COALESCE(lt.node_id, 'tank:'||t.id) AS node_id,
                    t.id::bigint AS id,
                    'tank'::text AS type,
                    lt.x, lt.y, lt.updated_at,
                    COALESCE((now() - tl.created_at) <= interval '60 seconds', false) AS online,
                    NULL::text AS state,
                    tl.level_pct::numeric AS level_pct,
                    CASE
                      WHEN tl.level_pct IS NULL THEN NULL
                      WHEN tc.low_low_pct   IS NOT NULL AND tl.level_pct <= tc.low_low_pct   THEN 'critico'
                      WHEN tc.low_pct       IS NOT NULL AND tl.level_pct <= tc.low_pct       THEN 'alerta'
                      WHEN tc.high_high_pct IS NOT NULL AND tl.level_pct >= tc.high_high_pct THEN 'critico'
                      WHEN tc.high_pct      IS NOT NULL AND tl.level_pct >= tc.high_pct      THEN 'alerta'
                      ELSE NULL
                    END::text AS alarma,
                    l.id::bigint AS location_id,
                    l.name::text AS location_name,
                    NULL::jsonb AS meta,
                    NULL::jsonb AS signals
                  FROM public.tanks t
                  JOIN public.locations l ON l.id = t.location_id
                  LEFT JOIN public.layout_tanks lt ON lt.tank_id = t.id
                  LEFT JOIN public.tank_configs tc ON tc.tank_id = t.id
                  LEFT JOIN tank_last tl ON tl.tank_id = t.id
                  WHERE l.company_id = %s
                ),
                p AS (
                  SELECT
                    COALESCE(lp.node_id, 'pump:'||p.id) AS node_id,
                    p.id::bigint AS id,
                    'pump'::text AS type,
                    lp.x, lp.y, lp.updated_at,
                    CASE WHEN hb.hb_ts IS NOT NULL AND (now() - hb.hb_ts) < interval '00:05:00' THEN true ELSE false END AS online,
                    COALESCE(hb.plc_state, 'stop'::text) AS state,
                    NULL::numeric AS level_pct,
                    NULL::text AS alarma,
                    l.id::bigint AS location_id,
                    l.name::text AS location_name,
                    NULL::jsonb AS meta,
                    NULL::jsonb AS signals
                  FROM public.pumps p
                  JOIN public.locations l ON l.id = p.location_id
                  LEFT JOIN public.layout_pumps lp ON lp.pump_id = p.id
                  LEFT JOIN last_hb hb ON hb.pump_id = p.id
                  WHERE l.company_id = %s
                ),
                v AS (
                  SELECT
                    COALESCE(lv.node_id, 'valve:'||v.id) AS node_id,
                    v.id::bigint AS id,
                    'valve'::text AS type,
                    lv.x, lv.y, lv.updated_at,
                    NULL::boolean AS online,
                    NULL::text AS state,
                    NULL::numeric AS level_pct,
                    NULL::text AS alarma,
                    l.id::bigint AS location_id,
                    l.name::text AS location_name,
                    lv.meta AS meta,
                    NULL::jsonb AS signals
                  FROM public.valves v
                  JOIN public.locations l ON l.id = v.location_id
                  LEFT JOIN public.layout_valves lv ON lv.valve_id = v.id
                  WHERE l.company_id = %s
                ),
                m_signals AS (
                  SELECT
                    s.manifold_id,
                    MAX(ml.created_at) AS last_ts,
                    jsonb_object_agg(
                      s.signal_type,
                      jsonb_build_object(
                        'id', s.id,
                        'signal_type', s.signal_type,
                        'node_id', s.node_id,
                        'tag', s.tag,
                        'unit', s.unit,
                        'scale_mult', s.scale_mult,
                        'scale_add', s.scale_add,
                        'min_value', s.min_value,
                        'max_value', s.max_value,
                        'value', ml.value,
                        'ts', ml.created_at
                      )
                    ) AS signals
                  FROM public.manifold_signals s
                  LEFT JOIN ms_last ml ON ml.manifold_signal_id = s.id
                  GROUP BY s.manifold_id
                ),
                m AS (
                  SELECT
                    COALESCE(lm.node_id, 'manifold:'||m.id) AS node_id,
                    m.id::bigint AS id,
                    'manifold'::text AS type,
                    lm.x, lm.y, lm.updated_at,
                    CASE WHEN ms.last_ts IS NOT NULL AND (now() - ms.last_ts) <= interval '00:10:00' THEN true ELSE false END AS online,
                    NULL::text AS state,
                    NULL::numeric AS level_pct,
                    NULL::text AS alarma,
                    l.id::bigint AS location_id,
                    l.name::text AS location_name,
                    NULL::jsonb AS meta,
                    COALESCE(ms.signals, '{}'::jsonb) AS signals
                  FROM public.manifolds m
                  JOIN public.locations l ON l.id = m.location_id
                  LEFT JOIN public.layout_manifolds lm ON lm.manifold_id = m.id
                  LEFT JOIN m_signals ms ON ms.manifold_id = m.id
                  WHERE l.company_id = %s
                ),
                nodes AS (
                  SELECT node_id,id,type,x,y,updated_at,online,state,level_pct,alarma,location_id,location_name,meta,signals FROM t
                  UNION ALL
                  SELECT node_id,id,type,x,y,updated_at,online,state,level_pct,alarma,location_id,location_name,meta,signals FROM p
                  UNION ALL
                  SELECT node_id,id,type,x,y,updated_at,online,state,level_pct,alarma,location_id,location_name,meta,signals FROM v
                  UNION ALL
                  SELECT node_id,id,type,x,y,updated_at,online,state,level_pct,alarma,location_id,location_name,meta,signals FROM m
                )
                SELECT * FROM nodes
                ORDER BY type,id
                """,
                (company_id, company_id, company_id, company_id, company_id),
            )
            nodes = cur.fetchall()

            # Edges + knots (NO TOCAR)
            cur.execute(
                """
                WITH nodes AS (
                  SELECT COALESCE(lt.node_id,'tank:'||t.id) AS node_id
                  FROM public.tanks t
                  JOIN public.locations l ON l.id=t.location_id
                  LEFT JOIN public.layout_tanks lt ON lt.tank_id=t.id
                  WHERE l.company_id=%s
                  UNION ALL
                  SELECT COALESCE(lp.node_id,'pump:'||p.id)
                  FROM public.pumps p
                  JOIN public.locations l ON l.id=p.location_id
                  LEFT JOIN public.layout_pumps lp ON lp.pump_id=p.id
                  WHERE l.company_id=%s
                  UNION ALL
                  SELECT COALESCE(lv.node_id,'valve:'||v.id)
                  FROM public.valves v
                  JOIN public.locations l ON l.id=v.location_id
                  LEFT JOIN public.layout_valves lv ON lv.valve_id=v.id
                  WHERE l.company_id=%s
                  UNION ALL
                  SELECT COALESCE(lm.node_id,'manifold:'||m.id)
                  FROM public.manifolds m
                  JOIN public.locations l ON l.id=m.location_id
                  LEFT JOIN public.layout_manifolds lm ON lm.manifold_id=m.id
                  WHERE l.company_id=%s
                )
                SELECT
                  e.edge_id, e.src_node_id, e.dst_node_id, e.relacion, e.prioridad, e.updated_at,
                  e.src_port, e.dst_port,
                  COALESCE(k.knots, '[]'::jsonb) AS knots
                FROM public.v_layout_edges_flow e
                JOIN nodes a ON a.node_id = e.src_node_id
                JOIN nodes b ON b.node_id = e.dst_node_id
                LEFT JOIN public.layout_edge_knots k ON k.edge_id = e.edge_id
                ORDER BY e.updated_at DESC
                """,
                (company_id, company_id, company_id, company_id),
            )
            edges = cur.fetchall()

            return {"nodes": nodes, "edges": edges}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error (bootstrap): {e}")
