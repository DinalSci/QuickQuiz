import fitz  # PyMuPDF
import google.generativeai as genai
import json
import os
import re
import time
from dotenv import load_dotenv

load_dotenv()

genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

def extract_text_from_pdf(pdf_path: str) -> str:
    """Try to extract text from a text-based PDF. Returns empty string for scanned PDFs."""
    try:
        doc = fitz.open(pdf_path)
        extracted_text = ""
        for page in doc:
            extracted_text += page.get_text("text") + "\n"
        return extracted_text.strip()
    except Exception:
        return ""

def parse_pdf_with_gemini_file_api(pdf_path: str):
    """Upload PDF directly to Gemini File API and extract MCQs. Best for scanned PDFs."""
    model = genai.GenerativeModel('gemini-3.5-flash')

    print(f"Uploading PDF to Gemini File API: {pdf_path}")
    uploaded_file = genai.upload_file(path=pdf_path, mime_type="application/pdf")

    # Wait for file to be processed
    while uploaded_file.state.name == "PROCESSING":
        time.sleep(2)
        uploaded_file = genai.get_file(uploaded_file.name)

    if uploaded_file.state.name == "FAILED":
        raise ValueError("Gemini File API failed to process the PDF.")

    prompt = """You are an expert educational content parser specializing in Sinhala and English MCQ exam papers.
Carefully read the entire PDF and extract ALL multiple choice questions you can find.

Output format MUST be a strict JSON array without any markdown formatting or code blocks.
Each object must strictly match this structure:
[
  {
    "question_text": "Exact full question text in original language",
    "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
    "correct_option_id": null,
    "explanation": ""
  }
]

Rules:
1. Preserve original Sinhala typography and symbols accurately.
2. Extract up to 5 options if available, minimum 2.
3. Leave "correct_option_id" as null - the user will select answers manually.
4. Keep each option string under 100 characters (Telegram poll limit).
5. DO NOT skip any question. Extract every single MCQ in the document.
6. Return ONLY the JSON array, no other text."""

    response = model.generate_content([uploaded_file, prompt])

    # Clean up uploaded file
    try:
        genai.delete_file(uploaded_file.name)
    except Exception:
        pass

    return _parse_gemini_json_response(response.text)

def parse_mcqs_with_gemini(raw_text: str):
    """Parse MCQs from raw text using Gemini. For text-based PDFs."""
    model = genai.GenerativeModel('gemini-1.5-flash')

    prompt = f"""You are an expert educational content parser specializing in Sinhala and English MCQ exam papers.
Analyze the raw text provided below and extract all multiple choice questions.

Output format MUST be a strict JSON array without any markdown formatting or code blocks.
Each object must strictly match this structure:
[
  {{
    "question_text": "Exact full question text in original language",
    "options": ["Option 1", "Option 2", "Option 3", "Option 4"],
    "correct_option_id": null,
    "explanation": ""
  }}
]

Rules:
1. Preserve original Sinhala typography and symbols accurately.
2. Extract up to 5 options if available, minimum 2.
3. Leave "correct_option_id" as null.
4. Keep option strings under 100 characters.
5. Return ONLY the JSON array, nothing else.

Raw Text:
{raw_text}"""

    response = model.generate_content(prompt)
    return _parse_gemini_json_response(response.text)

def _parse_gemini_json_response(text: str):
    """Common helper to parse Gemini's JSON response safely."""
    clean_json = text.strip()
    clean_json = re.sub(r"^```json\s*", "", clean_json)
    clean_json = re.sub(r"^```\s*", "", clean_json)
    clean_json = re.sub(r"\s*```$", "", clean_json)
    clean_json = clean_json.strip()

    # Try to extract JSON array if wrapped in extra text
    match = re.search(r'\[.*\]', clean_json, re.DOTALL)
    if match:
        clean_json = match.group(0)

    try:
        data = json.loads(clean_json)
        return data if isinstance(data, list) else []
    except json.JSONDecodeError as e:
        print("Failed to parse Gemini output as JSON:", e)
        print("Raw response:", text[:500])
        return []
