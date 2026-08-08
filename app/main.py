import os
import asyncio
from fastapi import FastAPI, Request, HTTPException, Depends, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional
from telegram import Bot, Update
from telegram.ext import Application, CommandHandler
from dotenv import load_dotenv

from app.database import init_db, SessionLocal, Question
from app.bot import start_command
from app.pdf_parser import extract_text_from_pdf, parse_mcqs_with_gemini

load_dotenv()
TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
WEBHOOK_URL = f"{os.getenv('WEBAPP_URL')}/api/webhook"

app = FastAPI(title="PDF to Telegram Quiz WebApp")

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

# Initialize PTB Application
ptb = (
    Application.builder()
    .token(TOKEN)
    .build()
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

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.on_event("startup")
def startup_event():
    init_db()

class PublishRequest(BaseModel):
    question_id: int
    correct_option_id: int
    question_text: str
    options: List[str]
    target_chat_id: Optional[str] = None

@app.get("/")
def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/api/questions")
def get_questions(db: Session = Depends(get_db)):
    questions = db.query(Question).filter(Question.is_published == False).all()
    return questions

@app.post("/api/upload-pdf")
async def upload_pdf(file: UploadFile = File(...), db: Session = Depends(get_db)):
    if not file.filename.endswith('.pdf'):
        raise HTTPException(status_code=400, detail="Only PDF files are allowed")
    
    # Save temporarily
    os.makedirs("/tmp/uploads", exist_ok=True)
    file_path = f"/tmp/uploads/{file.filename}"
    
    with open(file_path, "wb") as f:
        f.write(await file.read())
        
    try:
        raw_text = extract_text_from_pdf(file_path)
        parsed_questions = parse_mcqs_with_gemini(raw_text)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing PDF: {str(e)}")
        
    if not parsed_questions:
        raise HTTPException(status_code=400, detail="Failed to extract questions. Please verify PDF format.")
        
    # Save to database
    for q in parsed_questions:
        db_item = Question(
            pdf_name=file.filename,
            question_text=q["question_text"],
            options=q["options"],
            correct_option_id=q.get("correct_option_id"),
            explanation=q.get("explanation", "")
        )
        db.add(db_item)
    db.commit()
    
    # Clean up temp file
    try:
        os.remove(file_path)
    except:
        pass
        
    return {"status": "success", "count": len(parsed_questions)}

@app.post("/api/publish-quiz")
async def publish_quiz(req: PublishRequest, db: Session = Depends(get_db)):
    target_chat = req.target_chat_id or os.getenv("TARGET_CHAT_ID")
    if not target_chat:
        raise HTTPException(status_code=400, detail="Target Chat ID is required.")

    # Validate option strings for Telegram API constraints
    cleaned_options = [opt[:100] for opt in req.options]

    try:
        app_instance = await get_ptb_app()
        poll_msg = await app_instance.bot.send_poll(
            chat_id=target_chat,
            question=req.question_text[:300],  # Telegram question limit
            options=cleaned_options,
            type="quiz",
            correct_option_id=req.correct_option_id,
            is_anonymous=True
        )

        # Mark question as published in DB
        q_item = db.query(Question).filter(Question.id == req.question_id).first()
        if q_item:
            q_item.is_published = True
            q_item.correct_option_id = req.correct_option_id
            db.commit()

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
        if os.getenv('WEBAPP_URL'):
            await app_instance.bot.set_webhook(WEBHOOK_URL)
            return {"status": f"Webhook successfully set to {WEBHOOK_URL}"}
        return {"status": "WEBAPP_URL not configured"}
    except Exception as e:
        return {"error": str(e)}
