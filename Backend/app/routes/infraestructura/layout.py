from fastapi import APIRouter, HTTPException, Request, Query
from typing import List
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
    Devuelve conexiones de layout (layout_edges).
    - Sin company_id: todas.
    - Con company_id: sólo aristas cuyos endpoints pertenecen a nodos de esa empresa.
    Si no hay filas, devolvemos [] (200 OK).
    """
    try:
        with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
            if company_id is None:
                cur.execute(
                    """
                    SELECT edge_id, src_node_id, dst_node_id, relacion, prioridad, updated_at
                    FROM public.layout_edges
                    ORDER BY updated_at DESC
                    """
                )
                return cur.fetchall()

            # Scoped por empresa: limitamos por node_id de los nodos de esa empresa
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
                SELECT e.edge_id, e.src_node_id, e.dst_node_id, e.relacion, e.prioridad, e.updated_at
                FROM public.layout_edges e
                JOIN nodes a ON a.node_id = e.src_node_id
                JOIN nodes b ON b.node_id = e.dst_node_id
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
# GET /infraestructura/get_layout_combined
# -------------------------------------------------------------------
@router.get("/get_layout_combined", response_model=List[dict])
async def get_layout_combined(company_id: int | None = Query(default=None)):
    """
    Devuelve nodos (tank/pump/valve/manifold).
    - Sin company_id: usa v_layout_combined (tal cual).
    - Con company_id:
        * LEFT JOIN a layout_* para no perder nodos sin layout
        * level_pct = último tank_ingest
        * online (tanques) = último ingest ≤ 60s
        * alarma (tanques) = eval de level_pct contra tank_configs:
            - ≤ low_low_pct   -> 'critico'
            - ≤ low_pct       -> 'alerta'
            - ≥ high_high_pct -> 'critico'
            - ≥ high_pct      -> 'alerta'
          (si faltan umbrales o nivel => NULL)
        * Además devuelve location_id / location_name para agrupar por ubicación en el front.
    """
    try:
        with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
            if company_id is None:
                # Ojo: esta vista no incluye location_id/name.
                cur.execute(
                    """
                    SELECT node_id, id, type, x, y, updated_at, online, state, level_pct, alarma
                    FROM public.v_layout_combined
                    ORDER BY type, id
                    """
                )
                return cur.fetchall()

            # Scoped por empresa con cálculo de online/alarma y ubicación
            cur.execute(
                """
                WITH t AS (
                  SELECT
                    COALESCE(lt.node_id, 'tank:'||t.id) AS node_id,
                    t.id::bigint                        AS id,
                    'tank'::text                        AS type,
                    lt.x, lt.y, lt.updated_at,
                    /* ONLINE tanque: último ingest ≤ 60s */
                    COALESCE((
                      SELECT (now() - i.created_at) <= interval '60 seconds'
                      FROM public.tank_ingest i
                      WHERE i.tank_id = t.id
                      ORDER BY i.created_at DESC
                      LIMIT 1
                    ), false)                           AS online,
                    NULL::text                          AS state,
                    /* Último nivel vía LATERAL para reusar en alarma */
                    lvl.level_pct::numeric              AS level_pct,
                    /* Alarma por thresholds de tank_configs */
                    CASE
                      WHEN lvl.level_pct IS NULL THEN NULL
                      WHEN tc.low_low_pct   IS NOT NULL AND lvl.level_pct <= tc.low_low_pct   THEN 'critico'
                      WHEN tc.low_pct       IS NOT NULL AND lvl.level_pct <= tc.low_pct       THEN 'alerta'
                      WHEN tc.high_high_pct IS NOT NULL AND lvl.level_pct >= tc.high_high_pct THEN 'critico'
                      WHEN tc.high_pct      IS NOT NULL AND lvl.level_pct >= tc.high_pct      THEN 'alerta'
                      ELSE NULL
                    END::text                           AS alarma,
                    l.id::bigint                        AS location_id,
                    l.name::text                        AS location_name
                  FROM public.tanks t
                  JOIN public.locations l ON l.id = t.location_id
                  LEFT JOIN public.layout_tanks lt ON lt.tank_id = t.id
                  LEFT JOIN public.tank_configs   tc ON tc.tank_id = t.id
                  LEFT JOIN LATERAL (
                    SELECT i.level_pct
                    FROM public.tank_ingest i
                    WHERE i.tank_id = t.id
                    ORDER BY i.created_at DESC
                    LIMIT 1
                  ) AS lvl ON TRUE
                  WHERE l.company_id = %s
                ),
                p AS (
                  SELECT
                    COALESCE(lp.node_id, 'pump:'||p.id) AS node_id,
                    p.id::bigint                         AS id,
                    'pump'::text                         AS type,
                    lp.x, lp.y, lp.updated_at,
                    s.online                             AS online,
                    s.state                              AS state,
                    NULL::numeric                        AS level_pct,
                    NULL::text                           AS alarma,
                    l.id::bigint                         AS location_id,
                    l.name::text                         AS location_name
                  FROM public.pumps p
                  JOIN public.locations l ON l.id = p.location_id
                  LEFT JOIN public.layout_pumps lp ON lp.pump_id = p.id
                  LEFT JOIN public.v_pumps_with_status s ON s.pump_id = p.id
                  WHERE l.company_id = %s
                ),
                v AS (
                  SELECT
                    COALESCE(lv.node_id, 'valve:'||v.id) AS node_id,
                    v.id::bigint                          AS id,
                    'valve'::text                         AS type,
                    lv.x, lv.y, lv.updated_at,
                    NULL::boolean                         AS online,
                    NULL::text                            AS state,
                    NULL::numeric                         AS level_pct,
                    NULL::text                            AS alarma,
                    l.id::bigint                          AS location_id,
                    l.name::text                          AS location_name
                  FROM public.valves v
                  JOIN public.locations l ON l.id = v.location_id
                  LEFT JOIN public.layout_valves lv ON lv.valve_id = v.id
                  WHERE l.company_id = %s
                ),
                m AS (
                  SELECT
                    COALESCE(lm.node_id, 'manifold:'||m.id) AS node_id,
                    m.id::bigint                             AS id,
                    'manifold'::text                         AS type,
                    lm.x, lm.y, lm.updated_at,
                    NULL::boolean                            AS online,
                    NULL::text                               AS state,
                    NULL::numeric                            AS level_pct,
                    NULL::text                               AS alarma,
                    l.id::bigint                             AS location_id,
                    l.name::text                             AS location_name
                  FROM public.manifolds m
                  JOIN public.locations l ON l.id = m.location_id
                  LEFT JOIN public.layout_manifolds lm ON lm.manifold_id = m.id
                  WHERE l.company_id = %s
                )
                SELECT node_id,id,type,x,y,updated_at,online,state,level_pct,alarma,location_id,location_name FROM t
                UNION ALL
                SELECT node_id,id,type,x,y,updated_at,online,state,level_pct,alarma,location_id,location_name FROM p
                UNION ALL
                SELECT node_id,id,type,x,y,updated_at,online,state,level_pct,alarma,location_id,location_name FROM v
                UNION ALL
                SELECT node_id,id,type,x,y,updated_at,online,state,level_pct,alarma,location_id,location_name FROM m
                ORDER BY type,id
                """,
                (company_id, company_id, company_id, company_id),
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
    """
    Actualiza la posición (x,y) de un nodo de layout.
    Acepta node_id 'tank:21' o literal (usa node_id). 404 sólo si no existe.
    """
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

    # Si el sufijo es numérico, actualizamos por *_id (coincide con vistas/joins)
    try:
        id_numeric = int(sufijo)
        where = f"{id_col} = %s"
        params = (x, y, id_numeric)
    except ValueError:
        # Si no es numérico, caemos a node_id
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
    NO devolvemos 404 por listas vacías: [] (200 OK).
    También aplica el cálculo de online/alarma de tanques (umbral 60s).
    Ahora, en modo scoped, también incluye location_id / location_name en cada nodo.
    """
    try:
        with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
            if company_id is None:
                # Vista global (sin location_id/name)
                cur.execute(
                    """
                    SELECT node_id,id,type,x,y,updated_at,online,state,level_pct,alarma
                    FROM public.v_layout_combined ORDER BY type,id
                    """
                )
                nodes = cur.fetchall()

                cur.execute(
                    """
                    SELECT edge_id,src_node_id,dst_node_id,relacion,prioridad,updated_at
                    FROM public.layout_edges ORDER BY updated_at DESC
                    """
                )
                edges = cur.fetchall()

                return {"nodes": nodes, "edges": edges}

            # Scoped: nodos (con online/alarma tanque = 60s) + ubicación
            cur.execute(
                """
                WITH t AS (
                  SELECT
                    COALESCE(lt.node_id,'tank:'||t.id) AS node_id,
                    t.id::bigint                        AS id,
                    'tank'::text                        AS type,
                    lt.x, lt.y, lt.updated_at,
                    COALESCE((
                      SELECT (now() - i.created_at) <= interval '60 seconds'
                      FROM public.tank_ingest i
                      WHERE i.tank_id = t.id
                      ORDER BY i.created_at DESC
                      LIMIT 1
                    ), false)                           AS online,
                    NULL::text                          AS state,
                    (SELECT i.level_pct
                     FROM public.tank_ingest i
                     WHERE i.tank_id=t.id
                     ORDER BY i.created_at DESC
                     LIMIT 1)::numeric                  AS level_pct,
                    CASE
                      WHEN (SELECT i.level_pct FROM public.tank_ingest i WHERE i.tank_id=t.id ORDER BY i.created_at DESC LIMIT 1) IS NULL
                        THEN NULL
                      WHEN tc.low_low_pct   IS NOT NULL AND (SELECT i.level_pct FROM public.tank_ingest i WHERE i.tank_id=t.id ORDER BY i.created_at DESC LIMIT 1) <= tc.low_low_pct   THEN 'critico'
                      WHEN tc.low_pct       IS NOT NULL AND (SELECT i.level_pct FROM public.tank_ingest i WHERE i.tank_id=t.id ORDER BY i.created_at DESC LIMIT 1) <= tc.low_pct       THEN 'alerta'
                      WHEN tc.high_high_pct IS NOT NULL AND (SELECT i.level_pct FROM public.tank_ingest i WHERE i.tank_id=t.id ORDER BY i.created_at DESC LIMIT 1) >= tc.high_high_pct THEN 'critico'
                      WHEN tc.high_pct      IS NOT NULL AND (SELECT i.level_pct FROM public.tank_ingest i WHERE i.tank_id=t.id ORDER BY i.created_at DESC LIMIT 1) >= tc.high_pct      THEN 'alerta'
                      ELSE NULL
                    END::text                           AS alarma,
                    l.id::bigint                        AS location_id,
                    l.name::text                        AS location_name
                  FROM public.tanks t
                  JOIN public.locations l ON l.id=t.location_id
                  LEFT JOIN public.layout_tanks lt ON lt.tank_id=t.id
                  LEFT JOIN public.tank_configs tc ON tc.tank_id=t.id
                  WHERE l.company_id=%s
                ),
                p AS (
                  SELECT
                    COALESCE(lp.node_id,'pump:'||p.id)  AS node_id,
                    p.id::bigint                        AS id,
                    'pump'::text                        AS type,
                    lp.x, lp.y, lp.updated_at,
                    s.online                            AS online,
                    s.state                             AS state,
                    NULL::numeric                       AS level_pct,
                    NULL::text                          AS alarma,
                    l.id::bigint                        AS location_id,
                    l.name::text                        AS location_name
                  FROM public.pumps p
                  JOIN public.locations l ON l.id=p.location_id
                  LEFT JOIN public.layout_pumps lp ON lp.pump_id=p.id
                  LEFT JOIN public.v_pumps_with_status s ON s.pump_id=p.id
                  WHERE l.company_id=%s
                ),
                v AS (
                  SELECT
                    COALESCE(lv.node_id,'valve:'||v.id) AS node_id,
                    v.id::bigint                        AS id,
                    'valve'::text                       AS type,
                    lv.x, lv.y, lv.updated_at,
                    NULL::boolean                       AS online,
                    NULL::text                          AS state,
                    NULL::numeric                       AS level_pct,
                    NULL::text                          AS alarma,
                    l.id::bigint                        AS location_id,
                    l.name::text                        AS location_name
                  FROM public.valves v
                  JOIN public.locations l ON l.id=v.location_id
                  LEFT JOIN public.layout_valves lv ON lv.valve_id=v.id
                  WHERE l.company_id=%s
                ),
                m AS (
                  SELECT
                    COALESCE(lm.node_id,'manifold:'||m.id) AS node_id,
                    m.id::bigint                            AS id,
                    'manifold'::text                        AS type,
                    lm.x, lm.y, lm.updated_at,
                    NULL::boolean                           AS online,
                    NULL::text                              AS state,
                    NULL::numeric                           AS level_pct,
                    NULL::text                              AS alarma,
                    l.id::bigint                            AS location_id,
                    l.name::text                            AS location_name
                  FROM public.manifolds m
                  JOIN public.locations l ON l.id=m.location_id
                  LEFT JOIN public.layout_manifolds lm ON lm.manifold_id=m.id
                  WHERE l.company_id=%s
                ),
                nodes AS (
                  SELECT node_id,id,type,x,y,updated_at,online,state,level_pct,alarma,location_id,location_name FROM t
                  UNION ALL
                  SELECT node_id,id,type,x,y,updated_at,online,state,level_pct,alarma,location_id,location_name FROM p
                  UNION ALL
                  SELECT node_id,id,type,x,y,updated_at,online,state,level_pct,alarma,location_id,location_name FROM v
                  UNION ALL
                  SELECT node_id,id,type,x,y,updated_at,online,state,level_pct,alarma,location_id,location_name FROM m
                )
                SELECT node_id,id,type,x,y,updated_at,online,state,level_pct,alarma,location_id,location_name
                FROM nodes
                ORDER BY type,id
                """,
                (company_id, company_id, company_id, company_id),
            )
            nodes = cur.fetchall()

            # Scoped: edges
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
                SELECT e.edge_id, e.src_node_id, e.dst_node_id, e.relacion, e.prioridad, e.updated_at
                FROM public.layout_edges e
                JOIN nodes a ON a.node_id = e.src_node_id
                JOIN nodes b ON b.node_id = e.dst_node_id
                ORDER BY e.updated_at DESC
                """,
                (company_id, company_id, company_id, company_id),
            )
            edges = cur.fetchall()

            return {"nodes": nodes, "edges": edges}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error (bootstrap): {e}")
