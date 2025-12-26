# app/services/telegram_reporter.py
import asyncio
import logging

from app.services.telegram_client import send_telegram_message
from app.services.status_reporting import (
    get_tanks_status,
    get_pumps_status,
    build_report,
)

log = logging.getLogger("telegram-reporter")

REPORT_EVERY_SECONDS = 1800  # 30 minutos


async def telegram_report_loop():
    log.info("Telegram reporter started (30 min interval)")

    while True:
        try:
            tanks = await get_tanks_status()
            pumps = await get_pumps_status()

            report = build_report(tanks, pumps)
            send_telegram_message(report)

        except Exception as e:
            log.exception("Error generating telegram report: %s", e)

        await asyncio.sleep(REPORT_EVERY_SECONDS)
