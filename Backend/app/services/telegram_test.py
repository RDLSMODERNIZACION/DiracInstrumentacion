# app/services/telegram_test.py
import os
import traceback
from datetime import datetime, timezone
from collections import defaultdict

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
    now = datetime.now(timezone.utc)
    return int((now - ts).total_seconds())


@router.post("/report-now")
def telegram_report_now():
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

        # ---- Construir mensaje SOLO con localidades online ----
        online_locs = [loc for loc in by_loc.values() if loc["loc_online"]]

        now_txt = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
        lines = [f"📊 <b>REPORTE SCADA POR LOCALIDAD</b> <code>{now_txt}</code>", ""]

        if not online_locs:
            lines.append("⚠️ No hay localidades online (según staleness).")
            msg = "\n".join(lines)
            send_telegram_message(msg)
            return {"ok": True, "forced": True, "locations_sent": 0}

        # Ordenar por nombre
        online_locs.sort(key=lambda x: (x["location_name"] or "").lower())

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
            lines.append("")  # separador

        msg = "\n".join(lines).strip()
        send_telegram_message(msg)

        return {"ok": True, "forced": True, "locations_sent": len(online_locs)}

    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={"ok": False, "error": str(e), "trace": traceback.format_exc()},
        )
