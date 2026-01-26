from fastapi import APIRouter, HTTPException, Request, Query
from typing import List
import json

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

                  UNION ALL
                  -- ✅ NUEVO: network analyzers (ABB)
                  SELECT lna.node_id
                  FROM public.layout_network_analyzers lna
                  JOIN public.network_analyzers na ON na.id = lna.analyzer_id
                  JOIN public.locations l ON l.id = na.location_id
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
                (company_id, company_id, company_id, company_id, company_id),
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
    ✅ NUEVO: incluye `network_analyzer` (ABB) desde layout_network_analyzers + network_analyzers.

    OPTIMIZADO (LATERAL + LIMIT 1):
    - Tanques: último tank_ingest por tanque via índice (N lookups, no scan global).
    - Bombas: último pump_heartbeat por bomba via índice (N lookups, no scan global).
    """
    try:
        with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
            # SIN company_id: leemos de la VIEW (⚠️ si querés ABB también acá, hay que actualizar v_layout_combined)
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

            # CON company_id: query rápida
            cur.execute(
                """
                WITH
                locs AS (
                  SELECT id
                  FROM public.locations
                  WHERE company_id = %s
                ),

                t AS (
                  SELECT
                    COALESCE(lt.node_id, 'tank:'||t.id) AS node_id,
                    t.id::bigint AS id,
                    'tank'::text AS type,
                    lt.x, lt.y, lt.updated_at,

                    COALESCE((now() - li.created_at) <= interval '60 seconds', false) AS online,
                    NULL::text AS state,
                    li.level_pct::numeric AS level_pct,

                    CASE
                      WHEN li.level_pct IS NULL THEN NULL
                      WHEN tc.low_low_pct   IS NOT NULL AND li.level_pct <= tc.low_low_pct   THEN 'critico'
                      WHEN tc.low_pct       IS NOT NULL AND li.level_pct <= tc.low_pct       THEN 'alerta'
                      WHEN tc.high_high_pct IS NOT NULL AND li.level_pct >= tc.high_high_pct THEN 'critico'
                      WHEN tc.high_pct      IS NOT NULL AND li.level_pct >= tc.high_pct      THEN 'alerta'
                      ELSE NULL
                    END::text AS alarma,

                    l.id::bigint AS location_id,
                    l.name::text AS location_name,
                    NULL::jsonb AS meta,
                    NULL::jsonb AS signals

                  FROM public.tanks t
                  JOIN public.locations l ON l.id = t.location_id
                  JOIN locs lx ON lx.id = l.id
                  LEFT JOIN public.layout_tanks lt ON lt.tank_id = t.id
                  LEFT JOIN public.tank_configs tc ON tc.tank_id = t.id
                  LEFT JOIN LATERAL (
                    SELECT i.level_pct, i.created_at
                    FROM public.tank_ingest i
                    WHERE i.tank_id = t.id
                    ORDER BY i.created_at DESC, i.id DESC
                    LIMIT 1
                  ) li ON TRUE
                ),

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
                  JOIN locs lx ON lx.id = l.id
                  LEFT JOIN public.layout_pumps lp ON lp.pump_id = p.id
                  LEFT JOIN LATERAL (
                    SELECT ph.created_at AS hb_ts, ph.plc_state
                    FROM public.pump_heartbeat ph
                    WHERE ph.pump_id = p.id
                    ORDER BY ph.created_at DESC, ph.id DESC
                    LIMIT 1
                  ) hb ON TRUE
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
                  JOIN locs lx ON lx.id = l.id
                  LEFT JOIN public.layout_valves lv ON lv.valve_id = v.id
                ),

                ms_last AS (
                  SELECT DISTINCT ON (r.manifold_signal_id)
                    r.manifold_signal_id,
                    r.value,
                    r.created_at
                  FROM public.manifold_signal_readings r
                  ORDER BY r.manifold_signal_id, r.created_at DESC
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
                  JOIN locs lx ON lx.id = l.id
                  LEFT JOIN public.layout_manifolds lm ON lm.manifold_id = m.id
                  LEFT JOIN m_signals ms ON ms.manifold_id = m.id
                ),

                -- ✅ NUEVO: ABB / Network Analyzers
                na AS (
                  SELECT
                    lna.node_id AS node_id,
                    na.id::bigint AS id,
                    'network_analyzer'::text AS type,
                    lna.x, lna.y, lna.updated_at,
                    NULL::boolean AS online,
                    NULL::text AS state,
                    NULL::numeric AS level_pct,
                    NULL::text AS alarma,
                    l.id::bigint AS location_id,
                    l.name::text AS location_name,
                    lna.meta AS meta,
                    -- por ahora vacío; después lo llenamos con lecturas reales
                    '{}'::jsonb AS signals
                  FROM public.layout_network_analyzers lna
                  JOIN public.network_analyzers na ON na.id = lna.analyzer_id
                  JOIN public.locations l ON l.id = na.location_id
                  JOIN locs lx ON lx.id = l.id
                )

                SELECT node_id,id,type,x,y,updated_at,online,state,level_pct,alarma,location_id,location_name,meta,signals FROM t
                UNION ALL
                SELECT node_id,id,type,x,y,updated_at,online,state,level_pct,alarma,location_id,location_name,meta,signals FROM p
                UNION ALL
                SELECT node_id,id,type,x,y,updated_at,online,state,level_pct,alarma,location_id,location_name,meta,signals FROM v
                UNION ALL
                SELECT node_id,id,type,x,y,updated_at,online,state,level_pct,alarma,location_id,location_name,meta,signals FROM m
                UNION ALL
                SELECT node_id,id,type,x,y,updated_at,online,state,level_pct,alarma,location_id,location_name,meta,signals FROM na
                ORDER BY type,id
                """,
                (company_id,),
            )
            return cur.fetchall()

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error (combined): {e}")


## -------------------------------------------------------------------
# POST /infraestructura/update_layout
# -------------------------------------------------------------------
@router.post("/update_layout")
async def update_layout(request: Request):
    """
    Actualiza x/y del nodo en su tabla layout correspondiente.

    ✅ Soporta node_id con prefijo tipo "pump:12" (lógica existente).
    ✅ Soporta "network_analyzer:3" si algún día lo usás.
    ✅ NUEVO: Soporta node_id "sueltos" como 'ABB-PLANTA-ESTE-01'
       buscándolo directamente por node_id en layout_network_analyzers
       (y como fallback en otros layout_*).
    """
    data = await request.json()
    node_id = data.get("node_id")
    x = data.get("x")
    y = data.get("y")

    if not node_id or not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
        raise HTTPException(
            status_code=400,
            detail="Parámetros inválidos: node_id, x, y son requeridos"
        )

    # 1) Si viene con prefijo "tipo:id"
    tipo, _, sufijo = node_id.partition(":")

    table_map = {
        "pump": ("layout_pumps", "pump_id"),
        "manifold": ("layout_manifolds", "manifold_id"),
        "valve": ("layout_valves", "valve_id"),
        "tank": ("layout_tanks", "tank_id"),
        # ABB / Analizador de red
        "network_analyzer": ("layout_network_analyzers", "analyzer_id"),
    }

    def _exec_update(cur, table: str, id_col: str, where_sql: str, params: tuple):
        sql = f"""
            UPDATE public.{table}
            SET x = %s::double precision,
                y = %s::double precision,
                updated_at = now()
            WHERE {where_sql}
            RETURNING node_id, {id_col} AS entity_id, x, y, updated_at
        """
        cur.execute(sql, params)
        return cur.fetchone()

    try:
        with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
            # ------------------------------------------------------------------
            # A) Caso normal: node_id con prefijo (pump:12, manifold:3, etc.)
            # ------------------------------------------------------------------
            meta = table_map.get(tipo)
            if meta:
                table, id_col = meta
                try:
                    # si el sufijo es numérico, actualizamos por id
                    id_numeric = int(sufijo)
                    row = _exec_update(
                        cur,
                        table,
                        id_col,
                        f"{id_col} = %s",
                        (x, y, id_numeric),
                    )
                except ValueError:
                    # si no es numérico, actualizamos por node_id
                    row = _exec_update(
                        cur,
                        table,
                        id_col,
                        "node_id = %s",
                        (x, y, node_id),
                    )

                if not row:
                    raise HTTPException(
                        status_code=404,
                        detail=f"no se encontró fila en {table} para {node_id}",
                    )

                conn.commit()
                return {"ok": True, "table": table, "updated": row}

            # ------------------------------------------------------------------
            # B) NUEVO: node_id sin prefijo (ej: ABB-PLANTA-ESTE-01)
            #     → primero intentamos layout_network_analyzers
            # ------------------------------------------------------------------
            row = _exec_update(
                cur,
                "layout_network_analyzers",
                "analyzer_id",
                "node_id = %s",
                (x, y, node_id),
            )
            if row:
                conn.commit()
                return {
                    "ok": True,
                    "table": "layout_network_analyzers",
                    "updated": row,
                }

            # ------------------------------------------------------------------
            # C) Fallback defensivo: buscar node_id en otros layout_*
            #    (no debería pasar, pero evita 500 raros)
            # ------------------------------------------------------------------
            candidates = [
                ("layout_pumps", "pump_id"),
                ("layout_manifolds", "manifold_id"),
                ("layout_valves", "valve_id"),
                ("layout_tanks", "tank_id"),
            ]

            for table, id_col in candidates:
                row = _exec_update(
                    cur,
                    table,
                    id_col,
                    "node_id = %s",
                    (x, y, node_id),
                )
                if row:
                    conn.commit()
                    return {"ok": True, "table": table, "updated": row}

            raise HTTPException(
                status_code=404,
                detail=f"no se encontró node_id={node_id} en ninguna tabla layout",
            )

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"DB error (update_layout): {e}",
        )



# -------------------------------------------------------------------
# GET /infraestructura/bootstrap_layout
# -------------------------------------------------------------------
@router.get("/bootstrap_layout")
async def bootstrap_layout(company_id: int | None = Query(default=None)):
    """
    Devuelve {nodes, edges}. Con company_id, limita a esa empresa.
    ✅ nodes incluye meta para valves y signals para manifolds.
    ✅ NUEVO: incluye network_analyzer (ABB) en scoped.

    Nota: para máxima performance en el front, podés pedir:
      - /get_layout_combined (nodes)
      - /get_layout_edges (edges)
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

            # Scoped: nodes
            cur.execute(
                """
                WITH
                locs AS (
                  SELECT id
                  FROM public.locations
                  WHERE company_id = %s
                ),

                t AS (
                  SELECT
                    COALESCE(lt.node_id, 'tank:'||t.id) AS node_id,
                    t.id::bigint AS id,
                    'tank'::text AS type,
                    lt.x, lt.y, lt.updated_at,
                    COALESCE((now() - li.created_at) <= interval '60 seconds', false) AS online,
                    NULL::text AS state,
                    li.level_pct::numeric AS level_pct,
                    CASE
                      WHEN li.level_pct IS NULL THEN NULL
                      WHEN tc.low_low_pct   IS NOT NULL AND li.level_pct <= tc.low_low_pct   THEN 'critico'
                      WHEN tc.low_pct       IS NOT NULL AND li.level_pct <= tc.low_pct       THEN 'alerta'
                      WHEN tc.high_high_pct IS NOT NULL AND li.level_pct >= tc.high_high_pct THEN 'critico'
                      WHEN tc.high_pct      IS NOT NULL AND li.level_pct >= tc.high_pct      THEN 'alerta'
                      ELSE NULL
                    END::text AS alarma,
                    l.id::bigint AS location_id,
                    l.name::text AS location_name,
                    NULL::jsonb AS meta,
                    NULL::jsonb AS signals
                  FROM public.tanks t
                  JOIN public.locations l ON l.id = t.location_id
                  JOIN locs lx ON lx.id = l.id
                  LEFT JOIN public.layout_tanks lt ON lt.tank_id = t.id
                  LEFT JOIN public.tank_configs tc ON tc.tank_id = t.id
                  LEFT JOIN LATERAL (
                    SELECT i.level_pct, i.created_at
                    FROM public.tank_ingest i
                    WHERE i.tank_id = t.id
                    ORDER BY i.created_at DESC, i.id DESC
                    LIMIT 1
                  ) li ON TRUE
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
                  JOIN locs lx ON lx.id = l.id
                  LEFT JOIN public.layout_pumps lp ON lp.pump_id = p.id
                  LEFT JOIN LATERAL (
                    SELECT ph.created_at AS hb_ts, ph.plc_state
                    FROM public.pump_heartbeat ph
                    WHERE ph.pump_id = p.id
                    ORDER BY ph.created_at DESC, ph.id DESC
                    LIMIT 1
                  ) hb ON TRUE
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
                  JOIN locs lx ON lx.id = l.id
                  LEFT JOIN public.layout_valves lv ON lv.valve_id = v.id
                ),

                ms_last AS (
                  SELECT DISTINCT ON (r.manifold_signal_id)
                    r.manifold_signal_id, r.value, r.created_at
                  FROM public.manifold_signal_readings r
                  ORDER BY r.manifold_signal_id, r.created_at DESC
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
                  JOIN locs lx ON lx.id = l.id
                  LEFT JOIN public.layout_manifolds lm ON lm.manifold_id = m.id
                  LEFT JOIN m_signals ms ON ms.manifold_id = m.id
                ),

                -- ✅ NUEVO: ABB / Network Analyzers
                na AS (
                  SELECT
                    lna.node_id AS node_id,
                    na.id::bigint AS id,
                    'network_analyzer'::text AS type,
                    lna.x, lna.y, lna.updated_at,
                    NULL::boolean AS online,
                    NULL::text AS state,
                    NULL::numeric AS level_pct,
                    NULL::text AS alarma,
                    l.id::bigint AS location_id,
                    l.name::text AS location_name,
                    lna.meta AS meta,
                    '{}'::jsonb AS signals
                  FROM public.layout_network_analyzers lna
                  JOIN public.network_analyzers na ON na.id = lna.analyzer_id
                  JOIN public.locations l ON l.id = na.location_id
                  JOIN locs lx ON lx.id = l.id
                )

                SELECT node_id,id,type,x,y,updated_at,online,state,level_pct,alarma,location_id,location_name,meta,signals FROM t
                UNION ALL
                SELECT node_id,id,type,x,y,updated_at,online,state,level_pct,alarma,location_id,location_name,meta,signals FROM p
                UNION ALL
                SELECT node_id,id,type,x,y,updated_at,online,state,level_pct,alarma,location_id,location_name,meta,signals FROM v
                UNION ALL
                SELECT node_id,id,type,x,y,updated_at,online,state,level_pct,alarma,location_id,location_name,meta,signals FROM m
                UNION ALL
                SELECT node_id,id,type,x,y,updated_at,online,state,level_pct,alarma,location_id,location_name,meta,signals FROM na
                ORDER BY type,id
                """,
                (company_id,),
            )
            nodes = cur.fetchall()

            # Scoped: edges + knots (incluye ABB)
            cur.execute(
                """
                WITH nodes AS (
                  SELECT COALESCE(lt.node_id,'tank:'||t.id) AS node_id
                  FROM public.tanks t
                  JOIN public.locations l ON l.id=t.location_id
                  LEFT JOIN public.layout_tanks lt ON lt.tank_id = t.id
                  WHERE l.company_id = %s
                  UNION ALL
                  SELECT COALESCE(lp.node_id,'pump:'||p.id)
                  FROM public.pumps p
                  JOIN public.locations l ON l.id=p.location_id
                  LEFT JOIN public.layout_pumps lp ON lp.pump_id=p.id
                  WHERE l.company_id = %s
                  UNION ALL
                  SELECT COALESCE(lv.node_id,'valve:'||v.id)
                  FROM public.valves v
                  JOIN public.locations l ON l.id=v.location_id
                  LEFT JOIN public.layout_valves lv ON lv.valve_id=v.id
                  WHERE l.company_id = %s
                  UNION ALL
                  SELECT COALESCE(lm.node_id,'manifold:'||m.id)
                  FROM public.manifolds m
                  JOIN public.locations l ON l.id=m.location_id
                  LEFT JOIN public.layout_manifolds lm ON lm.manifold_id=m.id
                  WHERE l.company_id = %s
                  UNION ALL
                  -- ✅ NUEVO: ABB
                  SELECT lna.node_id
                  FROM public.layout_network_analyzers lna
                  JOIN public.network_analyzers na ON na.id = lna.analyzer_id
                  JOIN public.locations l ON l.id = na.location_id
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
                (company_id, company_id, company_id, company_id, company_id),
            )
            edges = cur.fetchall()

            return {"nodes": nodes, "edges": edges}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error (bootstrap): {e}")
