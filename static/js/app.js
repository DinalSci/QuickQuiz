let currentQuestions = [];
let GEMINI_API_KEY = "";

const GEMINI_PROMPT = `You are an expert educational content parser specializing in Sinhala and English MCQ exam papers.
Carefully examine the entire document and extract ALL multiple choice questions.

Output format MUST be a strict JSON array, no markdown, no code blocks, just raw JSON.
[
  {
    "question_text": "Exact full question text in original language",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correct_option_id": null
  }
]

Rules:
1. Preserve original Sinhala and English text accurately.
2. Extract ALL questions - do not skip any.
3. Keep each option under 100 characters.
4. Set correct_option_id to null always.
5. Return ONLY the JSON array.`;

document.addEventListener("DOMContentLoaded", async () => {
  // Load Gemini API key from backend config
  try {
    const res = await fetch("/api/config");
    const cfg = await res.json();
    GEMINI_API_KEY = cfg.gemini_api_key;
  } catch (e) {
    console.error("Failed to load config:", e);
  }

  setupDragAndDrop();
});

function setupDragAndDrop() {
  const dropZone = document.getElementById("drop-zone");
  const fileInput = document.getElementById("pdf-upload");

  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, (e) => { e.preventDefault(); e.stopPropagation(); });
  });

  ['dragenter', 'dragover'].forEach(e => {
    dropZone.addEventListener(e, () => dropZone.classList.add('dragover'));
  });
  ['dragleave', 'drop'].forEach(e => {
    dropZone.addEventListener(e, () => dropZone.classList.remove('dragover'));
  });

  dropZone.addEventListener('drop', (e) => handleFiles(e.dataTransfer.files));
  fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
}

async function handleFiles(files) {
  if (!files || files.length === 0) return;
  const file = files[0];

  if (file.type !== "application/pdf") {
    alert("Please upload a valid PDF file.");
    return;
  }

  if (!GEMINI_API_KEY) {
    alert("Gemini API key not configured. Check server environment variables.");
    return;
  }

  const statusEl = document.getElementById("upload-status");
  const statusText = document.getElementById("upload-status-text");
  const dropZone = document.getElementById("drop-zone");
  const listEl = document.getElementById("questions-list");

  dropZone.style.display = "none";
  statusEl.style.display = "flex";
  statusText.innerText = "Reading PDF...";
  currentQuestions = [];
  listEl.innerHTML = "";
  document.getElementById("empty-state").style.display = "none";

  try {
    // Read PDF as base64 directly in the browser
    const base64Data = await fileToBase64(file);
    statusText.innerText = "Sending to Gemini AI... (this may take 20-40 seconds for large PDFs)";

    const questions = await callGeminiWithPDF(base64Data);

    if (questions && questions.length > 0) {
      questions.forEach(q => {
        q.id = generateId();
        currentQuestions.push(q);
        const card = createQuestionCard(q, currentQuestions.length - 1);
        listEl.appendChild(card);
      });

      statusText.innerText = `Successfully extracted ${questions.length} questions!`;
      statusEl.style.color = "var(--success-color)";
    } else {
      statusText.innerText = "No questions found. Please check the PDF content.";
      statusEl.style.color = "#f59e0b";
      document.getElementById("empty-state").style.display = "block";
    }

    statusEl.querySelector(".spinner").style.display = "none";
    setTimeout(() => {
      dropZone.style.display = "flex";
      statusEl.style.display = "none";
      statusEl.style.color = "#e2e8f0";
      statusEl.querySelector(".spinner").style.display = "block";
      document.getElementById("pdf-upload").value = "";
    }, 3000);

  } catch (error) {
    console.error(error);
    showError(error.message, statusText, statusEl, dropZone);
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function callGeminiWithPDF(base64Data) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

  const body = {
    contents: [{
      parts: [
        {
          inline_data: {
            mime_type: "application/pdf",
            data: base64Data
          }
        },
        { text: GEMINI_PROMPT }
      ]
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 8192
    }
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || "Gemini API call failed");
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
  return parseGeminiJSON(rawText);
}

function parseGeminiJSON(text) {
  let clean = text.trim();
  clean = clean.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();

  // Try to extract JSON array
  const match = clean.match(/\[[\s\S]*\]/);
  if (match) clean = match[0];

  try {
    const parsed = JSON.parse(clean);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error("JSON parse error:", e, "\nRaw:", text.slice(0, 300));
    return [];
  }
}

function generateId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function showError(msg, statusText, statusEl, dropZone) {
  statusText.innerText = `Error: ${msg}`;
  statusEl.style.color = "#ef4444";
  statusEl.querySelector(".spinner").style.display = "none";
  setTimeout(() => {
    dropZone.style.display = "flex";
    statusEl.style.display = "none";
    statusEl.style.color = "#e2e8f0";
    statusEl.querySelector(".spinner").style.display = "block";
    document.getElementById("pdf-upload").value = "";
  }, 5000);
}

function createQuestionCard(q, index) {
  const card = document.createElement("div");
  card.className = "question-card glass-panel";
  card.id = `q-card-${q.id}`;

  let selectedIdx = q.correct_option_id;

  let optionsHtml = q.options.map((opt, idx) => `
    <div class="option-row ${selectedIdx === idx ? 'selected-row' : ''}" id="row-${q.id}-${idx}">
      <div class="radio-container" onclick="selectOption('${q.id}', ${idx})">
        <div class="radio-custom ${selectedIdx === idx ? 'selected' : ''}" id="radio-${q.id}-${idx}"></div>
      </div>
      <div class="option-text" contenteditable="true" id="opt-${q.id}-${idx}">${opt}</div>
    </div>
  `).join("");

  card.innerHTML = `
    <div class="question-title" contenteditable="true" id="title-${q.id}">${q.question_text}</div>
    <div class="options-group">${optionsHtml}</div>
    <button class="btn-send" id="btn-${q.id}" onclick="publishQuiz('${q.id}')" ${selectedIdx === null || selectedIdx === undefined ? 'disabled' : ''}>
      <span class="icon">🚀</span>
      <span class="text">Publish to Telegram</span>
    </button>
  `;
  return card;
}

function selectOption(qId, idx) {
  const card = document.getElementById(`q-card-${qId}`);
  card.querySelectorAll(".radio-custom").forEach((r, i) => {
    r.classList.toggle("selected", i === idx);
  });
  card.querySelectorAll(".option-row").forEach((r, i) => {
    r.classList.toggle("selected-row", i === idx);
  });
  document.getElementById(`btn-${qId}`).disabled = false;
  card.dataset.selectedIdx = idx;
}

async function publishQuiz(qId) {
  const card = document.getElementById(`q-card-${qId}`);
  const btn = document.getElementById(`btn-${qId}`);
  const selectedIdx = card.dataset.selectedIdx;
  if (selectedIdx === undefined) return;

  btn.disabled = true;
  btn.innerHTML = `<div class="spinner" style="width:20px;height:20px;border-width:2px;margin:0;"></div> <span class="text">Publishing...</span>`;

  const qText = document.getElementById(`title-${qId}`).innerText;
  const originalQ = currentQuestions.find(q => q.id === qId);
  const options = originalQ.options.map((_, i) => document.getElementById(`opt-${qId}-${i}`).innerText);

  try {
    const res = await fetch("/api/publish-quiz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question_id: qId,
        correct_option_id: parseInt(selectedIdx),
        question_text: qText,
        options: options
      })
    });

    const data = await res.json();
    if (res.ok) {
      btn.classList.add("success");
      btn.innerHTML = `<span class="icon">✅</span><span class="text">Published!</span>`;
      card.style.borderColor = "var(--success-color)";
      currentQuestions = currentQuestions.filter(q => q.id !== qId);
      setTimeout(() => {
        card.style.opacity = '0';
        card.style.transform = 'scale(0.9)';
        setTimeout(() => {
          card.remove();
          if (currentQuestions.length === 0) {
            document.getElementById("empty-state").style.display = "block";
          }
        }, 300);
      }, 1000);
    } else {
      alert("Error: " + data.detail);
      btn.disabled = false;
      btn.innerHTML = `<span class="icon">🚀</span><span class="text">Try Again</span>`;
    }
  } catch (err) {
    alert("Request failed: " + err.message);
    btn.disabled = false;
    btn.innerHTML = `<span class="icon">🚀</span><span class="text">Try Again</span>`;
  }
}
