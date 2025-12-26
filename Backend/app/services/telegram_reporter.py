# app/services/telegram_reporter.py
import os
import threading
import time
import logging
from collections import defaultdict
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from app.db import get_conn
from app.services.telegram_client import send_telegram_message

log = logging.getLogger("telegram-reporter")

TELEGRAM_ENABLED = os.getenv("TELEGRAM_ENABLED", "1") == "1"
TELEGRAM_REPORT_EVERY_SEC = int(os.getenv("TELEGRAM_REPORT_EVERY_SEC", "1800"))

TANK_OFFLINE_SEC = int(os.getenv("TELEGRAM_TANK_OFFLINE_SEC", "600"))  # 10 min
PUMP_OFFLINE_SEC = int(os.getenv("TELEGRAM_PUMP_OFFLINE_SEC", "300"))  # 5 min
TZ_NAME = os.getenv("TELEGRAM_TZ", "America/Argentina/Buenos_Aires")
TZ = ZoneInfo(TZ_NAME)

_stop = threading.Event()
_thread: threading.Thread | None = None


def _age_sec(ts):
    if ts is None:
        return None
    now_utc = datetime.now(timezone.utc)
    return int((now_utc - ts).total_seconds())


def _build_report_like_test() -> tuple[str, int]:
    """
    Mismo reporte que /telegram/report-now:
    - Agrupado por localidad
    - SOLO localidades online
    - Hora en TELEGRAM_TZ (Argentina por defecto)
    """
    with get_conn() as conn, conn.cursor() as cur:
        # ---- TANQUES + localidad + último ingest ----
        cur.execute(
            """
            SELECT
              l.id AS location_id,
              l.name AS location_name,
              t.id AS tank_id,
              t.name AS tank_name,
              ti.level_pct,
              ti.created_at AS last_seen
            FROM public.tanks t
            JOIN public.locations l ON l.id = t.location_id
            LEFT JOIN LATERAL (
              SELECT level_pct, created_at
              FROM public.tank_ingest
              WHERE tank_id = t.id
              ORDER BY created_at DESC
              LIMIT 1
            ) ti ON true
            ORDER BY l.name, t.name
            """
        )
        tanks = [dict(zip([d[0] for d in cur.description], r)) for r in cur.fetchall()]

        # ---- BOMBAS + localidad + último heartbeat ----
        cur.execute(
            """
            SELECT
              l.id AS location_id,
              l.name AS location_name,
              p.id AS pump_id,
              p.name AS pump_name,
              ph.plc_state,
              ph.created_at AS last_seen
            FROM public.pumps p
            JOIN public.locations l ON l.id = p.location_id
            LEFT JOIN LATERAL (
              SELECT plc_state, created_at
              FROM public.pump_heartbeat
              WHERE pump_id = p.id
              ORDER BY created_at DESC
              LIMIT 1
            ) ph ON true
            ORDER BY l.name, p.name
            """
        )
        pumps = [dict(zip([d[0] for d in cur.description], r)) for r in cur.fetchall()]

    by_loc = defaultdict(lambda: {"location_name": None, "tanks": [], "pumps": [], "loc_online": False})

    for t in tanks:
        loc = by_loc[t["location_id"]]
        loc["location_name"] = t["location_name"]

        age = _age_sec(t.get("last_seen"))
        online = (age is not None) and (age <= TANK_OFFLINE_SEC)
        if online:
            loc["loc_online"] = True

        level = t.get("level_pct")
        level_s = "N/D" if level is None else f"{float(level):.1f}%"
        status = "🟢" if online else "🔴"
        age_txt = "" if age is None else f" ({age}s)"
        loc["tanks"].append(f"{status} {t['tank_name']}: {level_s}{age_txt}")

    for p in pumps:
        loc = by_loc[p["location_id"]]
        loc["location_name"] = p["location_name"]

        age = _age_sec(p.get("last_seen"))
        online = (age is not None) and (age <= PUMP_OFFLINE_SEC)
        if online:
            loc["loc_online"] = True

        if not online:
            st = "🔴 Offline"
        else:
            if p.get("plc_state") == "run":
                st = "🟢 Run"
            elif p.get("plc_state") == "stop":
                st = "⏸ Stop"
            else:
                st = "❓ N/D"

        age_txt = "" if age is None else f" ({age}s)"
        loc["pumps"].append(f"• {p['pump_name']}: {st}{age_txt}")

    online_locs = [loc for loc in by_loc.values() if loc["loc_online"]]
    online_locs.sort(key=lambda x: (x["location_name"] or "").lower())

    now_local = datetime.now(TZ)
    tz_abbr = now_local.strftime("%Z") or TZ_NAME
    now_txt = now_local.strftime("%Y-%m-%d %H:%M:%S")

    lines = [f"📊 <b>REPORTE SCADA POR LOCALIDAD</b> <code>{now_txt}</code> <i>{tz_abbr}</i>", ""]

    if not online_locs:
        # requisito: no enviar si no hay online -> devolvemos 0
        lines.append("⚠️ No hay localidades online (según staleness).")
        return "\n".join(lines), 0

    for loc in online_locs:
        lines.append(f"📍 <b>{loc['location_name']}</b>")
        if loc["tanks"]:
            lines.append("  🛢️ <b>Tanques</b>")
            for s in loc["tanks"]:
                lines.append(f"  • {s}")
        if loc["pumps"]:
            lines.append("  🚰 <b>Bombas</b>")
            for s in loc["pumps"]:
                lines.append(f"  {s}")
        lines.append("")

    return "\n".join(lines).strip(), len(online_locs)


def _worker():
    log.info("Telegram reporter started (%ss)", TELEGRAM_REPORT_EVERY_SEC)
    next_run = 0  # manda 1 al iniciar

    while not _stop.is_set():
        now = time.time()

        if now >= next_run:
            try:
                msg, locations_sent = _build_report_like_test()

                if locations_sent > 0:
                    send_telegram_message(msg)
                else:
                    log.info("No online locations -> skipping telegram send")

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
