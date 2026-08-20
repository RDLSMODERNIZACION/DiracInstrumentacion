from fastapi import APIRouter, HTTPException, Request
from psycopg.rows import dict_row
from app.db import get_conn
router = APIRouter(prefix="/infraestructura", tags=["infraestructura"])

@router.get("/pump_pipe_taps")
async def list_pump_pipe_taps():
    try:
        with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
            cur.execute("""SELECT t.id,t.pump_id,COALESCE(lp.node_id,'pump:'||t.pump_id) AS pump_node_id,t.edge_id,t.mode,t.t,t.x,t.y,t.created_at,t.updated_at FROM public.layout_pump_pipe_taps t LEFT JOIN public.layout_pumps lp ON lp.pump_id=t.pump_id ORDER BY t.pump_id""")
            return cur.fetchall()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error (pump_pipe_taps): {e}")

@router.post("/pump_pipe_taps")
async def upsert_pump_pipe_tap(request: Request):
    data = await request.json()
    print("[PUMP-TAP][BACKEND_POST]", data, flush=True)
    pump_id, edge_id = data.get("pump_id"), data.get("edge_id")
    mode = str(data.get("mode") or "inject").lower()
    if not isinstance(pump_id, int) or not isinstance(edge_id, int):
        raise HTTPException(status_code=400, detail="pump_id y edge_id requeridos")
    if mode not in ("inject", "extract"):
        raise HTTPException(status_code=400, detail="mode debe ser inject o extract")
    try:
        x, y = float(data.get("x")), float(data.get("y"))
        t = max(0.0, min(1.0, float(data.get("t", 0.5))))
    except Exception:
        raise HTTPException(status_code=400, detail="x, y y t deben ser numericos")
    try:
        with get_conn() as conn, conn.cursor(row_factory=dict_row) as cur:
            cur.execute("""INSERT INTO public.layout_pump_pipe_taps(pump_id,edge_id,mode,t,x,y,updated_at) VALUES(%s,%s,%s,%s,%s,%s,now()) ON CONFLICT(pump_id) DO UPDATE SET edge_id=excluded.edge_id,mode=excluded.mode,t=excluded.t,x=excluded.x,y=excluded.y,updated_at=now() RETURNING *""", (pump_id,edge_id,mode,t,x,y))
            row = cur.fetchone(); conn.commit(); return {"ok": True, "tap": row}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error (save pump tap): {e}")

