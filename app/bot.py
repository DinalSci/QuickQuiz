import os
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import ContextTypes

WEBAPP_URL = os.getenv("WEBAPP_URL")

async def start_command(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not WEBAPP_URL:
        await update.message.reply_text("❌ Web Dashboard URL is not configured.")
        return
        
    keyboard = InlineKeyboardMarkup([
        [InlineKeyboardButton("📝 Open Quiz Dashboard", url=WEBAPP_URL)]
    ])
    await update.message.reply_text(
        "👋 **Welcome to PDF Quiz Creator Bot!**\n\n"
        "To create a quiz, please visit the Web Dashboard. There you can upload your PDF, select the correct answers, and publish quizzes directly to your channel.\n\n"
        "Click the button below to get started in your browser:",
        reply_markup=keyboard,
        parse_mode="Markdown"
    )
