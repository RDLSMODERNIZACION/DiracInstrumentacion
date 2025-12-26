# app/services/telegram_test.py
from fastapi import APIRouter
from app.services.telegram_client import send_telegram_message

router = APIRouter(prefix="/telegram", tags=["telegram"])

@router.post("/test")
def test_telegram():
    send_telegram_message("✅ <b>TEST TELEGRAM</b>\nLlego desde Render 🚀")
    return {"ok": True, "sent": True}
