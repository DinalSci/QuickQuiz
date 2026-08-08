import os
import uuid
from fastapi import FastAPI, Request, HTTPException, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from telegram import Update
from telegram.ext import Application, CommandHandler
from dotenv import load_dotenv

from app.bot import start_command

load_dotenv()
TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
WEBAPP_URL = os.getenv("WEBAPP_URL", "")
WEBHOOK_URL = f"{WEBAPP_URL}/api/webhook"

app = FastAPI(title="PDF to Telegram Quiz WebApp (Stateless)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
app.mount("/static", StaticFiles(directory=os.path.join(BASE_DIR, "static")), name="static")
templates = Jinja2Templates(directory=os.path.join(BASE_DIR, "app/templates"))

ptb = (
    Application.builder().token(TOKEN).build()
) if TOKEN else None

if ptb:
    ptb.add_handler(CommandHandler("start", start_command))

_bot_initialized = False

async def get_ptb_app():
    global _bot_initialized
    if not ptb:
        raise Exception("Bot token not configured")
    if not _bot_initialized:
        await ptb.initialize()
        _bot_initialized = True
    return ptb


class PublishRequest(BaseModel):
    question_id: Optional[str] = None
    correct_option_id: int
    question_text: str
    options: List[str]
    target_chat_id: Optional[str] = None


@app.get("/")
def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.get("/api/config")
def get_config():
    """Returns safe client-side config (Gemini API key for browser-side calls)."""
    return {
        "gemini_api_key": os.getenv("GEMINI_API_KEY", ""),
    }


@app.post("/api/publish-quiz")
async def publish_quiz(req: PublishRequest):
    target_chat = req.target_chat_id or os.getenv("TARGET_CHAT_ID")
    if not target_chat:
        raise HTTPException(status_code=400, detail="Target Chat ID is required.")

    cleaned_options = [opt[:100] for opt in req.options]

    try:
        app_instance = await get_ptb_app()
        poll_msg = await app_instance.bot.send_poll(
            chat_id=target_chat,
            question=req.question_text[:300],
            options=cleaned_options,
            type="quiz",
            correct_option_id=req.correct_option_id,
            is_anonymous=True
        )
        return {"status": "success", "message_id": poll_msg.message_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/webhook")
async def process_webhook(request: Request):
    try:
        app_instance = await get_ptb_app()
        req_json = await request.json()
        update = Update.de_json(req_json, app_instance.bot)
        await app_instance.process_update(update)
        return {"ok": True}
    except Exception as e:
        print("Error processing webhook:", e)
        return {"ok": False}


@app.get("/api/set-webhook")
async def set_webhook():
    try:
        app_instance = await get_ptb_app()
        if WEBAPP_URL:
            await app_instance.bot.set_webhook(WEBHOOK_URL)
            return {"status": f"Webhook set to {WEBHOOK_URL}"}
        return {"status": "WEBAPP_URL not configured"}
    except Exception as e:
        return {"error": str(e)}
