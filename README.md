# PDF to Telegram Quiz Creator (Web Dashboard + Vercel)

A complete web-based tool and Telegram integration system for parsing multiple-choice question (MCQ) PDF papers. 

## Features
- **Serverless Ready:** Built for Vercel deployment with Webhooks.
- **Premium UI:** Glassmorphism, dark-mode ready, interactive animations.
- **Web-based PDF Upload:** Upload PDFs directly from your browser without using Telegram.
- **AI Powered:** Gemini 1.5 Flash integration for precise Sinhala/English PDF extraction.

## Deployment Instructions

### 1. Database Setup
Since Vercel has an ephemeral filesystem, you cannot use SQLite. 
Create a free PostgreSQL database on [Vercel Postgres](https://vercel.com/docs/storage/vercel-postgres), [Supabase](https://supabase.com/), or [Neon](https://neon.tech/).

### 2. Vercel Deployment
1. Install Vercel CLI or deploy via GitHub.
2. Go to your Vercel Dashboard -> Project Settings -> Environment Variables and add the following:
   - `TELEGRAM_BOT_TOKEN`
   - `GEMINI_API_KEY`
   - `TARGET_CHAT_ID` (e.g. `@mychannel`)
   - `DATABASE_URL` (Your PostgreSQL connection string)
   - `WEBAPP_URL` (Your Vercel deployment URL, e.g. `https://my-quiz-app.vercel.app`)

### 3. Initialize the Bot Webhook
After your app is deployed on Vercel, open this URL in your browser once:
`https://<your-vercel-url>/api/set-webhook`

This will tell Telegram to send messages to your Vercel app.

### 4. Setup Telegram WebApp Button (Optional)
Open `@BotFather` on Telegram:
1. Send `/mybots` -> Select your bot -> **Bot Settings** -> **Menu Button** -> **Configure menu button**
2. Send the URL of your Vercel deployment (`https://my-quiz-app.vercel.app`).
3. Now you can open the Admin panel directly from the bot menu!

## How to use
1. Open the Web Dashboard in your browser (`https://my-quiz-app.vercel.app`).
2. Drag and drop a PDF file into the upload area.
3. Wait for the Gemini AI to extract the questions.
4. Review the extracted questions, select the correct answers, and click "Publish to Telegram".

## Local Development (Optional)
```bash
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```
Use `ngrok http 8000` to expose it and set the webhook locally.
