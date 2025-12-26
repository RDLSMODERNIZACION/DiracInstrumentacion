# app/services/telegram_client.py
import os
import json
import logging
import urllib.request
import urllib.error

log = logging.getLogger("telegram")

TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
CHAT_ID = os.getenv("TELEGRAM_CHAT_ID", "").strip()


def send_telegram_message(text: str):
    if not TOKEN or not CHAT_ID:
        log.warning("Telegram not configured: missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID")
        return

    url = f"https://api.telegram.org/bot{TOKEN}/sendMessage"
    payload = {
        "chat_id": CHAT_ID,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": True,
    }

    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = resp.read().decode("utf-8", errors="ignore")
            if resp.status != 200:
                log.error("Telegram error %s: %s", resp.status, body)
    except urllib.error.HTTPError as e:
        try:
            body = e.read().decode("utf-8", errors="ignore")
        except Exception:
            body = str(e)
        log.error("Telegram HTTPError %s: %s", e.code, body)
    except Exception:
        log.exception("Telegram send failed")
