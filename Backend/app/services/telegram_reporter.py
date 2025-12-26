# app/services/telegram_reporter.py
import os
import threading
import time
import logging

from app.services.telegram_client import send_telegram_message

log = logging.getLogger("telegram-reporter")

TELEGRAM_ENABLED = os.getenv("TELEGRAM_ENABLED", "1") == "1"
TELEGRAM_REPORT_EVERY_SEC = int(os.getenv("TELEGRAM_REPORT_EVERY_SEC", "1800"))

_stop = threading.Event()
_thread: threading.Thread | None = None


def _build_report_like_test() -> tuple[str, int]:
    """
    Genera EXACTAMENTE el mismo reporte que el endpoint /telegram/report-now:
    - Agrupado por localidad
    - Envia SOLO localidades online (según staleness)
    - Hora en TZ Argentina (o la que venga por TELEGRAM_TZ)
    Retorna: (mensaje, locations_sent)
    """
    # Import local para evitar problemas circulares si alguna vez reordenás imports
    from app.services.telegram_test import telegram_report_now  # type: ignore

    # Llamamos a la misma función del test pero SIN mandar telegram 2 veces.
    # Como telegram_report_now() actualmente envía y retorna JSON, NO la podemos reutilizar directo.
    # Entonces la forma correcta es duplicar el "builder" o moverlo a un builder común.
    #
    # 👉 Para no duplicar lógica, asumimos que dejaste el "builder" dentro del test file.
    # En vez de eso, lo hacemos simple: importamos el módulo y llamamos a una función builder si existe.
    #
    # Si NO tenés builder, usá la versión de abajo que incluye el builder inline.
    raise RuntimeError("Falta builder común. Usá la versión inline de _build_report_like_test() de abajo.")


# =========================
# ✅ VERSION CORRECTA INLINE
# (mismo SQL y lógica del test)
# =========================
def _build_report_like_test_inline() -> tuple[str, int]:
    import traceback
    from datetime import datetime, timezone
    from collections import defaultdict
    from zoneinfo import ZoneInfo
    from app.db import get_conn

    TANK_OFFLINE_SEC = int(os.getenv("TELEGRAM_TANK_OFFLINE_SEC", "600"))  # 10 min
    PUMP_OFFLINE_SEC = int(os.getenv("TELEGRAM_PUMP_OFFLINE_SEC", "300"))  # 5 min
    TZ = ZoneInfo(os.getenv("TELEGRAM_TZ", "America/Argentina/Buenos_Aires"))

    def _age_sec(ts):
        if ts is None:
            return None
        now_utc = datetime.now(timezone.utc)
        return int((now_utc - ts).total_seconds())

    try:
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

        # ---- Agrupar por localidad ----
        by_loc = defaultdict(lambda: {"location_name": None, "tanks": [], "pumps": [], "loc_online": False})

        for t in tanks:
            loc_id = t["location_id"]
            loc = by_loc[loc_id]
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
            loc_id = p["location_id"]
            loc = by_loc[loc_id]
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

        # ---- SOLO localidades online ----
        online_locs = [loc for loc in by_loc.values() if loc["loc_online"]]
        online_locs.sort(key=lambda x: (x["location_name"] or "").lower())

        now_txt = datetime.now(TZ).strftime("%Y-%m-%d %H:%M:%S")
        lines = [f"📊 <b>REPORTE SCADA POR LOCALIDAD</b> <code>{now_txt}</code>", ""]

        if not online_locs:
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

    except Exception as e:
        # Si falla, devolvemos un mensaje claro (y no rompemos el loop)
        err = f"⚠️ <b>REPORTE SCADA</b>\nError generando reporte: {e}"
        log.error("build report failed: %s\n%s", e, traceback.format_exc())
        return err, 0


def _worker():
    log.info("Telegram reporter started (%ss)", TELEGRAM_REPORT_EVERY_SEC)
    next_run = 0  # manda 1 al iniciar

    while not _stop.is_set():
        now = time.time()

        if now >= next_run:
            try:
                msg, locations_sent = _build_report_like_test_inline()

                # Tu requisito: NO enviar si no hay localidades online
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
