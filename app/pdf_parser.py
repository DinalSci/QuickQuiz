import fitz  # PyMuPDF
import google.generativeai as genai
import json
import os
import re
from dotenv import load_dotenv

load_dotenv()

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

def extract_text_from_pdf(pdf_path: str) -> str:
    doc = fitz.open(pdf_path)
    extracted_text = ""
    for page in doc:
        extracted_text += page.get_text("text") + "\n"
    return extracted_text

def parse_mcqs_with_gemini(raw_text: str):
    model = genai.GenerativeModel('gemini-3.5-flash')
    
    prompt = f"""
You are an expert educational content parser specializing in Sinhala and English MCQ exam papers.
Analyze the raw text provided below and extract all multiple choice questions.

Output format MUST be a strict JSON array of objects without markdown formatting or code blocks.
Each object must strictly match this structure:
[
  {{
    "question_text": "Exact full question text in original language",
    "options": ["Option 1", "Option 2", "Option 3", "Option 4", "Option 5"],
    "correct_option_id": null,
    "explanation": ""
  }}
]

Rules:
1. Preserve original Sinhala typography and symbols accurately.
2. Extract up to 5 options if available, minimum 2.
3. Leave "correct_option_id" as null unless explicitly stated in the text.
4. Keep option strings concise (Telegram poll option max limit is 100 characters).

Raw Text:
{raw_text[:12000]}
"""

    response = model.generate_content(prompt)
    clean_json = response.text.strip()
    
    # Strip markdown block quotes if returned
    clean_json = re.sub(r"^```json\s*", "", clean_json)
    clean_json = re.sub(r"^```\s*", "", clean_json)
    clean_json = re.sub(r"\s*```$", "", clean_json)

    try:
        data = json.loads(clean_json)
        return data
    except json.JSONDecodeError as e:
        print("Failed to parse Gemini output as JSON:", e)
        print("Raw response:", response.text)
        return []
