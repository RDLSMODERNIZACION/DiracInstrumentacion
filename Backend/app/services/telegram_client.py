# app/services/telegram_client.py
import requests
import logging

TELEGRAM_BOT_TOKEN = "8409803233:AAHet0YhYyZGXWB4MeSZE_V88OKpUvw5arA"
TELEGRAM_CHAT_ID = "-1002986243904"

TELEGRAM_API = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"

log = logging.getLogger("telegram")


def send_telegram_message(text: str):
    try:
        resp = requests.post(
            TELEGRAM_API,
            json={
                "chat_id": TELEGRAM_CHAT_ID,
                "text": text,
                "parse_mode": "HTML",
                "disable_web_page_preview": True,
            },
            timeout=10,
        )

        if resp.status_code != 200:
            log.error("Telegram error %s - %s", resp.status_code, resp.text)

    except Exception as e:
        log.exception("Telegram send failed: %s", e)
