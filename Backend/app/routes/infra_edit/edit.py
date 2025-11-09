from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from psycopg.rows import dict_row

# Tu proyecto expone get_conn en app/db.py
from app.db import get_conn

router = APIRouter(prefix="/infraestructura", tags=["infraestructura"])

# --------- Modelos ---------
class EdgeCreate(BaseModel):
    src_node_id: str
    dst_node_id: str
    relacion: str | None = "conecta"
    prioridad: int | None = 1

class EdgeUpdate(BaseModel):
    relacion: str | None = None
    prioridad: int | None = None

class LayoutItem(BaseModel):
    node_id: str
    x: float
    y: float

class LayoutBatch(BaseModel):
    items: list[LayoutItem]

# --------- Helpers ---------
def _node_exists(cur, node_id: str) -> bool:
    cur.execute(
        """
        SELECT EXISTS (
          SELECT 1 FROM (
            SELECT node_id FROM public.layout_pumps
            UNION ALL SELECT node_id FROM public.layout_tanks
            UNION ALL SELECT node_id FROM public.layout_valves
            UNION ALL SELECT node_id FROM public.layout_manifolds
          ) t WHERE node_id = %s
        ) AS ok
        """,
        (node_id,),
    )
    return bool(cur.fetchone()["ok"])

# --------- Conexiones (CRUD) ---------
@router.post("/edges")
def create_edge(payload: EdgeCreate):
    if payload.src_node_id == payload.dst_node_id:
        raise HTTPException(status_code=400, detail="src_node_id y dst_node_id no pueden ser iguales")

    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        if not _node_exists(cur, payload.src_node_id):
            raise HTTPException(status_code=400, detail=f"src_node_id inexistente: {payload.src_node_id}")
        if not _node_exists(cur, payload.dst_node_id):
            raise HTTPException(status_code=400, detail=f"dst_node_id inexistente: {payload.dst_node_id}")

        # duplicado dirigido A->B
        cur.execute(
            "SELECT 1 FROM public.layout_edges WHERE src_node_id=%s AND dst_node_id=%s",
            (payload.src_node_id, payload.dst_node_id),
        )
        if cur.fetchone():
            raise HTTPException(status_code=409, detail="La conexión ya existe")

        cur.execute(
            """
            INSERT INTO public.layout_edges (src_node_id, dst_node_id, relacion, prioridad)
            VALUES (%s, %s, COALESCE(%s,'conecta'), COALESCE(%s,1))
            RETURNING edge_id, src_node_id, dst_node_id, relacion, prioridad, updated_at
            """,
            (payload.src_node_id, payload.dst_node_id, payload.relacion, payload.prioridad),
        )
        row = cur.fetchone()
        conn.commit()
        return row

@router.put("/edges/{edge_id}")
def update_edge(edge_id: int, payload: EdgeUpdate):
    sets, params = [], []
    if payload.relacion is not None:
        sets.append("relacion=%s")
        params.append(payload.relacion)
    if payload.prioridad is not None:
        sets.append("prioridad=%s")
        params.append(payload.prioridad)
    if not sets:
        raise HTTPException(status_code=400, detail="Nada para actualizar")

    params.append(edge_id)
    sql = f"""
        UPDATE public.layout_edges
           SET {", ".join(sets)},
               updated_at = now()
         WHERE edge_id = %s
     RETURNING edge_id, src_node_id, dst_node_id, relacion, prioridad, updated_at
    """
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(sql, tuple(params))
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Edge no encontrado")
        conn.commit()
        return row

@router.delete("/edges/{edge_id}")
def delete_edge(edge_id: int):
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("DELETE FROM public.layout_edges WHERE edge_id = %s", (edge_id,))
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Edge no encontrado")
        conn.commit()
        return {"ok": True}

# --------- Batch de posiciones (auto-orden) ---------
@router.post("/update_layout_many")
def update_layout_many(batch: LayoutBatch):
    """
    Actualiza (x,y) por node_id en la tabla layout_* correspondiente.
    Usado por el botón 'Auto-ordenar' y para movimientos masivos.
    """
    if not batch.items:
        return {"ok": True, "updated": 0}

    tables = [
        "public.layout_pumps",
        "public.layout_tanks",
        "public.layout_valves",
        "public.layout_manifolds",
    ]

    updated = 0
    with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
        for it in batch.items:
            if not _node_exists(cur, it.node_id):
                continue
            for tbl in tables:
                cur.execute(
                    f"""
                    UPDATE {tbl}
                       SET x=%s, y=%s, updated_at=now()
                     WHERE node_id=%s
                 RETURNING node_id
                    """,
                    (it.x, it.y, it.node_id),
                )
                if cur.fetchone():
                    updated += 1
                    break
        conn.commit()

    return {"ok": True, "updated": updated}
