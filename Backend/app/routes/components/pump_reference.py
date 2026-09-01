from __future__ import annotations

from fastapi import APIRouter, HTTPException
from psycopg.rows import dict_row

from app.db import get_conn

router = APIRouter(
    prefix="/components/network_analyzers",
    tags=["network_analyzers"],
)


@router.get("/pump-reference/{pump_id}")
def get_pump_reference(pump_id: int):
    if pump_id <= 0:
        raise HTTPException(status_code=400, detail="Invalid pump_id")

    with get_conn() as conn:
        with conn.cursor(row_factory=dict_row) as cur:
            cur.execute(
                """
                select
                    pem.id,
                    pem.pump_id,
                    p.name as pump_name,
                    pem.measured_at,
                    pem.source,
                    pem.i_l1_a,
                    pem.i_l2_a,
                    pem.i_l3_a,
                    pem.i_avg_a,
                    pem.startup_type,
                    pem.notes
                from public.pump_electrical_measurements pem
                join public.pumps p on p.id = pem.pump_id
                where pem.pump_id = %(pump_id)s
                order by pem.measured_at desc, pem.id desc
                limit 1
                """,
                {"pump_id": pump_id},
            )
            row = cur.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="No official electrical reference found")

    return row
