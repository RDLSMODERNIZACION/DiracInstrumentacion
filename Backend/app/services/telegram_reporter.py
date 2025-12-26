# app/services/telegram_reporter.py
import os
import threading
import time
import logging
from datetime import datetime

from app.db import get_conn
from app.services.telegram_client import send_telegram_message

log = logging.getLogger("telegram-reporter")

TELEGRAM_ENABLED = os.getenv("TELEGRAM_ENABLED", "1") == "1"
TELEGRAM_REPORT_EVERY_SEC = int(os.getenv("TELEGRAM_REPORT_EVERY_SEC", "1800"))

_stop = threading.Event()
_thread: threading.Thread | None = None


def _fetchall_dict(cur):
    cols = [d.name if hasattr(d, "name") else d[0] for d in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


def _build_report(tanks: list[dict], pumps: list[dict]) -> str:
    now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    lines: list[str] = [f"📊 <b>REPORTE SCADA</b> <code>{now}</code>", ""]

    lines.append("🛢️ <b>TANQUES</b>")
    if not tanks:
        lines.append("• (sin datos)")
    else:
        for t in tanks:
            name = t.get("name") or t.get("nombre") or f"Tank {t.get('id','')}"
            online = bool(t.get("online"))
            level = t.get("level_percent")
            try:
                level_s = "N/D" if level is None else f"{float(level):.1f}%"
            except Exception:
                level_s = str(level) if level is not None else "N/D"
            lines.append(f"• {name}: {level_s} — {'🟢 Online' if online else '🔴 Offline'}")

    lines.append("")
    lines.append("🚰 <b>BOMBAS</b>")
    if not pumps:
        lines.append("• (sin datos)")
    else:
        for p in pumps:
            name = p.get("name") or p.get("nombre") or f"Pump {p.get('id','')}"
            online = bool(p.get("online"))
            running = bool(p.get("running"))
            fault = bool(p.get("fault"))

            if not online:
                st = "🔴 Offline"
            elif fault:
                st = "⚠️ Falla"
            elif running:
                st = "🟢 En marcha"
            else:
                st = "⏸️ Detenida"

            lines.append(f"• {name}: {st}")

    return "\n".join(lines)


def _worker():
    log.info("Telegram reporter started (%ss)", TELEGRAM_REPORT_EVERY_SEC)
    next_run = 0  # manda 1 al iniciar

    while not _stop.is_set():
        now = time.time()

        if now >= next_run:
            try:
                with get_conn() as conn, conn.cursor() as cur:
                    # ⚠️ Ajustá estas vistas si en tu DB se llaman distinto
                    cur.execute(
                        """
                        SELECT id, name, level_percent, online
                        FROM public.v_tanks_with_config
                        ORDER BY name
                        """
                    )
                    tanks = _fetchall_dict(cur)

                    cur.execute(
                        """
                        SELECT id, name, running, fault, online
                        FROM public.v_pumps_with_status
                        ORDER BY name
                        """
                    )
                    pumps = _fetchall_dict(cur)

                send_telegram_message(_build_report(tanks, pumps))
            except Exception:
                log.exception("Telegram report generation failed")

            next_run = now + max(30, TELEGRAM_REPORT_EVERY_SEC)

        _stop.wait(1.0)

    log.info("Telegram reporter stopped")


def start_telegram_reporter():
    global _thread
    if not TELEGRAM_ENABLED:
        log.info("Telegram reporter disabled (TELEGRAM_ENABLED=0)")
        return
    if _thread and _thread.is_alive():
        return

    _stop.clear()
    _thread = threading.Thread(target=_worker, name="telegram-reporter", daemon=True)
    _thread.start()


def stop_telegram_reporter():
    global _thread
    _stop.set()
    if _thread and _thread.is_alive():
        _thread.join(timeout=5)
    _thread = None
