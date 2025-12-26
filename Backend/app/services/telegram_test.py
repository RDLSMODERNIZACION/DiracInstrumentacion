# app/services/telegram_test.py
from fastapi import APIRouter
from app.db import get_conn
from app.services.telegram_client import send_telegram_message
from app.services.telegram_reporter import _build_report

router = APIRouter(prefix="/telegram", tags=["telegram"])


@router.post("/report-now")
def telegram_report_now():
    with get_conn() as conn, conn.cursor() as cur:
        cur.execute("""
            SELECT id, name, level_percent, online
            FROM public.v_tanks_with_config
            ORDER BY name
        """)
        tanks = [
            dict(zip([d[0] for d in cur.description], r))
            for r in cur.fetchall()
        ]

        cur.execute("""
            SELECT id, name, running, fault, online
            FROM public.v_pumps_with_status
            ORDER BY name
        """)
        pumps = [
            dict(zip([d[0] for d in cur.description], r))
            for r in cur.fetchall()
        ]

    msg = _build_report(tanks, pumps)
    send_telegram_message(msg)

    return {
        "ok": True,
        "forced": True,
        "tanks": len(tanks),
        "pumps": len(pumps),
    }
