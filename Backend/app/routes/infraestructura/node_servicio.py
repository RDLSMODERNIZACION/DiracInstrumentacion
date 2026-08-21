from fastapi import APIRouter, HTTPException, Request
from psycopg.rows import dict_row
from app.db import get_conn

router = APIRouter(prefix="/infraestructura", tags=["infraestructura"])

VALID = {"agua", "cargaderos", "cloacas"}
TABLES = {
    "tank": ("tanks", "id"),
    "pump": ("pumps", "id"),
    "manifold": ("manifolds", "id"),
    "network_analyzer": ("network_analyzers", "id"),
}

@router.post("/node_servicio")
async def update_node_servicio(request: Request):
    data = await request.json()
    node_id = str(data.get("node_id") or "").strip()
    servicio = str(data.get("servicio") or "").strip().lower()

    if servicio not in VALID:
        raise HTTPException(status_code=400, detail="servicio inválido")

    tipo, sep, raw_id = node_id.partition(":")
    if not sep or tipo not in TABLES:
        raise HTTPException(status_code=400, detail="node_id no soportado")

    try:
        entity_id = int(raw_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="node_id inválido")

    table, id_col = TABLES[tipo]

    try:
        with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                f"UPDATE public.{table} SET servicio=%s WHERE {id_col}=%s RETURNING {id_col} AS id, servicio",
                (servicio, entity_id),
            )
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="nodo no encontrado")
            conn.commit()
            return {"ok": True, "node_id": node_id, "servicio": row["servicio"]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error (node_servicio): {e}")
