# app/services/status_reporting.py
from app.db import database


async def get_tanks_status():
    query = """
        SELECT
            id,
            name,
            level_percent,
            online
        FROM public.v_tanks_with_config
        ORDER BY name
    """
    return await database.fetch_all(query)


async def get_pumps_status():
    query = """
        SELECT
            id,
            name,
            running,
            fault,
            online
        FROM public.v_pumps_with_status
        ORDER BY name
    """
    return await database.fetch_all(query)


def build_report(tanks, pumps) -> str:
    lines = []
    lines.append("📊 <b>REPORTE SCADA</b>")
    lines.append("⏱️ Estado actual de tanques y bombas\n")

    # ---- TANQUES ----
    lines.append("🛢️ <b>TANQUES</b>")
    for t in tanks:
        status = "🟢 Online" if t["online"] else "🔴 Offline"
        level = f'{t["level_percent"]:.1f}%' if t["level_percent"] is not None else "N/D"
        lines.append(f"• {t['name']}: {level} — {status}")

    # ---- BOMBAS ----
    lines.append("\n🚰 <b>BOMBAS</b>")
    for p in pumps:
        if not p["online"]:
            state = "🔴 Offline"
        elif p["fault"]:
            state = "⚠️ Falla"
        elif p["running"]:
            state = "🟢 En marcha"
        else:
            state = "⏸️ Detenida"

        lines.append(f"• {p['name']}: {state}")

    return "\n".join(lines)
