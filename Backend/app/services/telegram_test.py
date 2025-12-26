# app/services/telegram_test.py
import os
import traceback
from datetime import datetime, timezone

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app.db import get_conn
from app.services.telegram_client import send_telegram_message

router = APIRouter(prefix="/telegram", tags=["telegram"])

TANK_OFFLINE_SEC = int(os.getenv("TELEGRAM_TANK_OFFLINE_SEC", "600"))  # 10 min
PUMP_OFFLINE_SEC = int(os.getenv("TELEGRAM_PUMP_OFFLINE_SEC", "300"))  # 5 min


def _age_sec(ts):
    if ts is None:
        return None
    # ts viene con tz (UTC), comparamos en UTC
    now = datetime.now(timezone.utc)
    return int((now - ts).total_seconds())


@router.post("/report-now")
def telegram_report_now():
    try:
        with get_conn() as conn, conn.cursor() as cur:
            # TANQUES: último ingest + config
            cur.execute(
                """
                SELECT
                  t.id AS tank_id,
                  t.name AS tank_name,
                  ti.level_pct,
                  ti.created_at AS last_seen,
                  tc.low_low_pct,
                  tc.low_pct,
                  tc.high_pct,
                  tc.high_high_pct
                FROM public.tanks t
                LEFT JOIN LATERAL (
                  SELECT level_pct, created_at
                  FROM public.tank_ingest
                  WHERE tank_id = t.id
                  ORDER BY created_at DESC
                  LIMIT 1
                ) ti ON true
                LEFT JOIN public.tank_configs tc
                  ON tc.tank_id = t.id
                ORDER BY t.name
                """
            )
            tanks = [dict(zip([d[0] for d in cur.description], r)) for r in cur.fetchall()]

            # BOMBAS: último heartbeat
            cur.execute(
                """
                SELECT
                  p.id AS pump_id,
                  p.name AS pump_name,
                  ph.plc_state,
                  ph.created_at AS last_seen
                FROM public.pumps p
                LEFT JOIN LATERAL (
                  SELECT plc_state, created_at
                  FROM public.pump_heartbeat
                  WHERE pump_id = p.id
                  ORDER BY created_at DESC
                  LIMIT 1
                ) ph ON true
                ORDER BY p.name
                """
            )
            pumps = [dict(zip([d[0] for d in cur.description], r)) for r in cur.fetchall()]

        # ---- Mensaje ----
        now_txt = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        lines = [f"📊 <b>REPORTE SCADA</b> <code>{now_txt}</code>", ""]

        # TANQUES
        lines.append("🛢️ <b>TANQUES</b>")
        for t in tanks:
            name = t["tank_name"]
            level = t.get("level_pct")
            last_seen = t.get("last_seen")
            age = _age_sec(last_seen)

            if level is None:
                level_s = "N/D"
            else:
                level_s = f"{float(level):.1f}%"

            online = (age is not None) and (age <= TANK_OFFLINE_SEC)
            online_s = "🟢 Online" if online else "🔴 Offline"

            # Severidad por umbrales si existen
            sev = ""
            try:
                if level is not None:
                    lv = float(level)
                    ll = t.get("low_low_pct")
                    l = t.get("low_pct")
                    h = t.get("high_pct")
                    hh = t.get("high_high_pct")
                    if ll is not None and lv <= float(ll):
                        sev = " ⛔ LOW-LOW"
                    elif l is not None and lv <= float(l):
                        sev = " ⚠️ LOW"
                    elif hh is not None and lv >= float(hh):
                        sev = " ⛔ HIGH-HIGH"
                    elif h is not None and lv >= float(h):
                        sev = " ⚠️ HIGH"
            except Exception:
                pass

            age_txt = "" if age is None else f" (hace {age}s)"
            lines.append(f"• {name}: {level_s} — {online_s}{sev}{age_txt}")

        # BOMBAS
        lines.append("")
        lines.append("🚰 <b>BOMBAS</b>")
        for p in pumps:
            name = p["pump_name"]
            plc_state = p.get("plc_state")
            last_seen = p.get("last_seen")
            age = _age_sec(last_seen)

            online = (age is not None) and (age <= PUMP_OFFLINE_SEC)

            if not online:
                st = "🔴 Offline"
            else:
                if plc_state == "run":
                    st = "🟢 En marcha"
                elif plc_state == "stop":
                    st = "⏸️ Detenida"
                else:
                    st = "❓ Sin estado"

            age_txt = "" if age is None else f" (hace {age}s)"
            lines.append(f"• {name}: {st}{age_txt}")

        msg = "\n".join(lines)
        send_telegram_message(msg)

        return {"ok": True, "forced": True, "tanks": len(tanks), "pumps": len(pumps)}

    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"ok": False, "error": str(e), "trace": traceback.format_exc()},
        )
