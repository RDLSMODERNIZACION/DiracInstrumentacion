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
    """
    Verifica la conexión con la base de datos (health-check interno).
    """
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
    Devuelve las conexiones (layout_edges).
    - Si `company_id` es None: devuelve todas las aristas.
    - Si `company_id` tiene valor: devuelve sólo aristas cuyos endpoints
      pertenecen a nodos (tank/pump/valve/manifold) de esa empresa.

    IMPORTANTE: si no hay filas, devuelve [] (200 OK). NO se responde 404.
    Esto permite que el front-end muestre los nodos aunque todavía no haya conexiones.
    """
    try:
        with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
            if company_id is None:
                sql = """
                SELECT
                    edge_id,
                    src_node_id,
                    dst_node_id,
                    relacion,
                    prioridad,
                    updated_at
                FROM public.layout_edges
                ORDER BY updated_at DESC
                """
                cur.execute(sql)
                rows = cur.fetchall()
                # No levantar 404: lista vacía es un estado válido
                return rows

            # Con scope por empresa: limitar a node_id de la empresa
            sql_scoped = """
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
            """
            cur.execute(sql_scoped, (company_id, company_id, company_id, company_id))
            rows = cur.fetchall()
            # No levantar 404: lista vacía es un estado válido
            return rows

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
    Devuelve los nodos (tank/pump/valve/manifold).
    - Si `company_id` es None: lee la vista `v_layout_combined`.
    - Si `company_id` tiene valor: arma el conjunto por CTEs, usando LEFT JOIN
      contra tablas de layout para NO perder nodos sin layout explícito.
      También arma `node_id` por defecto (p. ej. 'tank:ID').

    IMPORTANTE: si no hay filas, devuelve [] (200 OK). NO se responde 404.
    """
    try:
        with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
            if company_id is None:
                sql = """
                SELECT
                    node_id,
                    id,
                    type,
                    x,
                    y,
                    updated_at,
                    online,
                    state,
                    level_pct,
                    alarma
                FROM public.v_layout_combined
                ORDER BY type, id
                """
                cur.execute(sql)
                nodes = cur.fetchall()
                # No levantar 404: lista vacía es un estado válido
                return nodes

            # Con scope por empresa (LEFT JOIN para no perder nodos sin layout)
            sql_scoped = """
            WITH t AS (
              SELECT
                COALESCE(lt.node_id, 'tank:'||t.id) AS node_id,
                t.id::bigint                        AS id,
                'tank'::text                        AS type,
                lt.x, lt.y, lt.updated_at,
                NULL::boolean                       AS online,
                NULL::text                          AS state,
                (
                  SELECT level_pct
                  FROM public.tank_ingest i
                  WHERE i.tank_id = t.id
                  ORDER BY created_at DESC
                  LIMIT 1
                )::numeric                          AS level_pct,
                NULL::text                          AS alarma
              FROM public.tanks t
              JOIN public.locations l ON l.id = t.location_id
              LEFT JOIN public.layout_tanks lt ON lt.tank_id = t.id
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
                NULL::text                           AS alarma
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
                NULL::text                            AS alarma
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
                NULL::text                               AS alarma
              FROM public.manifolds m
              JOIN public.locations l ON l.id = m.location_id
              LEFT JOIN public.layout_manifolds lm ON lm.manifold_id = m.id
              WHERE l.company_id = %s
            )
            SELECT node_id,id,type,x,y,updated_at,online,state,level_pct,alarma FROM t
            UNION ALL
            SELECT node_id,id,type,x,y,updated_at,online,state,level_pct,alarma FROM p
            UNION ALL
            SELECT node_id,id,type,x,y,updated_at,online,state,level_pct,alarma FROM v
            UNION ALL
            SELECT node_id,id,type,x,y,updated_at,online,state,level_pct,alarma FROM m
            ORDER BY type,id
            """
            cur.execute(sql_scoped, (company_id, company_id, company_id, company_id))
            nodes = cur.fetchall()
            # No levantar 404: lista vacía es un estado válido
            return nodes

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
    - Acepta node_id con sufijo numérico (e.g. 'tank:21') o literal (usa node_id).
    - Devuelve 404 sólo si NO existe la fila a actualizar.
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

    # Si el sufijo es numérico, actualizamos por *_id (lo que usa la vista).
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
    Devuelve {nodes, edges}; con company_id, lo limita a esa empresa.
    Nunca responde 404 si una lista está vacía: devuelve [] (200 OK).
    """
    try:
        with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
            if company_id is None:
                cur.execute("""
                    SELECT node_id,id,type,x,y,updated_at,online,state,level_pct,alarma
                    FROM public.v_layout_combined ORDER BY type,id
                """)
                nodes = cur.fetchall()

                cur.execute("""
                    SELECT edge_id,src_node_id,dst_node_id,relacion,prioridad,updated_at
                    FROM public.layout_edges ORDER BY updated_at DESC
                """)
                edges = cur.fetchall()

                return {"nodes": nodes, "edges": edges}

            # Con scope: nodos
            cur.execute("""
                WITH t AS (
                  SELECT COALESCE(lt.node_id,'tank:'||t.id) AS node_id, t.id::bigint AS id, 'tank'::text AS type,
                         lt.x, lt.y, lt.updated_at, NULL::boolean AS online, NULL::text AS state,
                         (SELECT level_pct FROM public.tank_ingest i WHERE i.tank_id=t.id ORDER BY created_at DESC LIMIT 1)::numeric AS level_pct,
                         NULL::text AS alarma
                  FROM public.tanks t
                  JOIN public.locations l ON l.id=t.location_id
                  LEFT JOIN public.layout_tanks lt ON lt.tank_id=t.id
                  WHERE l.company_id=%s
                ),
                p AS (
                  SELECT COALESCE(lp.node_id,'pump:'||p.id), p.id::bigint, 'pump'::text,
                         lp.x, lp.y, lp.updated_at, s.online, s.state, NULL::numeric, NULL::text
                  FROM public.pumps p
                  JOIN public.locations l ON l.id=p.location_id
                  LEFT JOIN public.layout_pumps lp ON lp.pump_id=p.id
                  LEFT JOIN public.v_pumps_with_status s ON s.pump_id=p.id
                  WHERE l.company_id=%s
                ),
                v AS (
                  SELECT COALESCE(lv.node_id,'valve:'||v.id), v.id::bigint, 'valve'::text,
                         lv.x, lv.y, lv.updated_at, NULL::boolean, NULL::text, NULL::numeric, NULL::text
                  FROM public.valves v
                  JOIN public.locations l ON l.id=v.location_id
                  LEFT JOIN public.layout_valves lv ON lv.valve_id=v.id
                  WHERE l.company_id=%s
                ),
                m AS (
                  SELECT COALESCE(lm.node_id,'manifold:'||m.id), m.id::bigint, 'manifold'::text,
                         lm.x, lm.y, lm.updated_at, NULL::boolean, NULL::text, NULL::numeric, NULL::text
                  FROM public.manifolds m
                  JOIN public.locations l ON l.id=m.location_id
                  LEFT JOIN public.layout_manifolds lm ON lm.manifold_id=m.id
                  WHERE l.company_id=%s
                ),
                nodes AS (
                  SELECT * FROM t
                  UNION ALL SELECT * FROM p
                  UNION ALL SELECT * FROM v
                  UNION ALL SELECT * FROM m
                )
                SELECT node_id,id,type,x,y,updated_at,online,state,level_pct,alarma
                FROM nodes
                ORDER BY type,id
            """, (company_id, company_id, company_id, company_id))
            nodes = cur.fetchall()

            # Con scope: edges
            cur.execute("""
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
            """, (company_id, company_id, company_id, company_id))
            edges = cur.fetchall()

            return {"nodes": nodes, "edges": edges}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error (bootstrap): {e}")
