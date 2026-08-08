let currentQuestions = [];
let GEMINI_API_KEY = "";
let isProcessing = false;

const GEMINI_PROMPT = `You are an expert MCQ exam paper parser for Sinhala and English.
Look at this exam paper page image carefully. Extract ALL multiple choice questions visible.

Output ONLY a raw JSON array (no markdown, no explanation):
[{"question_text":"full question","options":["A","B","C","D"],"correct_option_id":null}]

Rules:
- Keep every option under 100 characters
- Preserve Sinhala text exactly
- If no MCQ questions on this page, return empty array: []
- Return ONLY the JSON array, nothing else`;

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const res = await fetch("/api/config");
    const cfg = await res.json();
    GEMINI_API_KEY = cfg.gemini_api_key || "";
    if (!GEMINI_API_KEY) console.warn("No Gemini API key returned from /api/config");
  } catch (e) {
    console.error("Config load failed:", e);
  }
  setupDragAndDrop();
});

function setupDragAndDrop() {
  const dropZone = document.getElementById("drop-zone");
  const fileInput = document.getElementById("pdf-upload");
  ['dragenter','dragover','dragleave','drop'].forEach(ev => {
    dropZone.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); });
  });
  ['dragenter','dragover'].forEach(ev => dropZone.addEventListener(ev, () => dropZone.classList.add('dragover')));
  ['dragleave','drop'].forEach(ev => dropZone.addEventListener(ev, () => dropZone.classList.remove('dragover')));
  dropZone.addEventListener('drop', e => handleFiles(e.dataTransfer.files));
  fileInput.addEventListener('change', e => handleFiles(e.target.files));
}

async function handleFiles(files) {
  if (!files || files.length === 0 || isProcessing) return;
  const file = files[0];

  if (file.type !== "application/pdf") {
    alert("Please upload a valid PDF file.");
    return;
  }
  if (!GEMINI_API_KEY) {
    alert("Gemini API Key not configured. Set GEMINI_API_KEY in Vercel environment variables.");
    return;
  }

  isProcessing = true;
  const statusEl   = document.getElementById("upload-status");
  const statusText = document.getElementById("upload-status-text");
  const dropZone   = document.getElementById("drop-zone");
  const listEl     = document.getElementById("questions-list");

  dropZone.style.display = "none";
  statusEl.style.display = "flex";
  statusEl.style.color   = "#e2e8f0";
  statusEl.querySelector(".spinner").style.display = "block";
  currentQuestions = [];
  listEl.innerHTML = "";
  document.getElementById("empty-state").style.display = "none";

  try {
    // Load PDF.js dynamically
    await loadPdfJs();

    const arrayBuffer = await file.arrayBuffer();
    const pdfDoc = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const totalPages = pdfDoc.numPages;
    statusText.innerText = `PDF loaded — ${totalPages} pages. Processing...`;

    let totalFound = 0;

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      statusText.innerText = `Scanning page ${pageNum} of ${totalPages}... (${totalFound} questions found so far)`;

      try {
        const imageBase64 = await renderPageToBase64(pdfDoc, pageNum);
        const questions   = await callGeminiWithImage(imageBase64);

        questions.forEach(q => {
          const isDup = currentQuestions.some(
            ex => ex.question_text.trim().slice(0,50) === q.question_text.trim().slice(0,50)
          );
          if (!isDup) {
            q.id = generateId();
            currentQuestions.push(q);
            totalFound++;
            const card = createQuestionCard(q, currentQuestions.length - 1);
            listEl.appendChild(card);
          }
        });
      } catch (pageErr) {
        console.error(`Page ${pageNum} error:`, pageErr);
      }
    }

    const msg = totalFound > 0
      ? `✅ Successfully extracted ${totalFound} questions from ${totalPages} pages!`
      : "⚠️ No questions found. This PDF may not contain MCQ questions.";
    statusText.innerText = msg;
    statusEl.style.color = totalFound > 0 ? "var(--success-color)" : "#f59e0b";
    statusEl.querySelector(".spinner").style.display = "none";

    if (totalFound === 0) {
      document.getElementById("empty-state").style.display = "block";
    }

  } catch (error) {
    console.error("Processing error:", error);
    statusText.innerText = `Error: ${error.message}`;
    statusEl.style.color = "#ef4444";
    statusEl.querySelector(".spinner").style.display = "none";
  } finally {
    isProcessing = false;
    document.getElementById("pdf-upload").value = "";
    setTimeout(() => {
      dropZone.style.display = "flex";
      statusEl.style.display = "none";
      statusEl.style.color = "#e2e8f0";
      statusEl.querySelector(".spinner").style.display = "block";
    }, 4000);
  }
}

function loadPdfJs() {
  return new Promise((resolve, reject) => {
    if (window.pdfjsLib) return resolve();
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload = () => {
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      resolve();
    };
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

async function renderPageToBase64(pdfDoc, pageNum) {
  const page     = await pdfDoc.getPage(pageNum);
  const scale    = 2.0; // Higher = better quality for Gemini to read
  const viewport = page.getViewport({ scale });
  const canvas   = document.createElement('canvas');
  canvas.width   = viewport.width;
  canvas.height  = viewport.height;
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;
  // Return as JPEG base64 (smaller than PNG)
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  return dataUrl.split(',')[1];
}

async function callGeminiWithImage(imageBase64) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

  const body = {
    contents: [{
      parts: [
        { inline_data: { mime_type: "image/jpeg", data: imageBase64 } },
        { text: GEMINI_PROMPT }
      ]
    }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 4096 }
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || `Gemini API error ${response.status}`);
  }

  const data    = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
  return parseGeminiJSON(rawText);
}

function parseGeminiJSON(text) {
  let clean = text.trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  const match = clean.match(/\[[\s\S]*\]/);
  if (match) clean = match[0];
  try {
    const parsed = JSON.parse(clean);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function generateId() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function createQuestionCard(q, index) {
  const card = document.createElement("div");
  card.className = "question-card glass-panel";
  card.id = `q-card-${q.id}`;

  const selectedIdx = q.correct_option_id;
  const optionsHtml = q.options.map((opt, idx) => `
    <div class="option-row ${selectedIdx === idx ? 'selected-row' : ''}" id="row-${q.id}-${idx}">
      <div class="radio-container" onclick="selectOption('${q.id}', ${idx})">
        <div class="radio-custom ${selectedIdx === idx ? 'selected' : ''}" id="radio-${q.id}-${idx}"></div>
      </div>
      <div class="option-text" contenteditable="true" id="opt-${q.id}-${idx}">${opt}</div>
    </div>`).join("");

  card.innerHTML = `
    <div class="question-title" contenteditable="true" id="title-${q.id}">${q.question_text}</div>
    <div class="options-group">${optionsHtml}</div>
    <button class="btn-send" id="btn-${q.id}" onclick="publishQuiz('${q.id}')" disabled>
      <span class="icon">🚀</span>
      <span class="text">Select Answer & Publish</span>
    </button>`;
  return card;
}

function selectOption(qId, idx) {
  const card = document.getElementById(`q-card-${qId}`);
  card.querySelectorAll(".radio-custom").forEach((r, i) => r.classList.toggle("selected", i === idx));
  card.querySelectorAll(".option-row").forEach((r, i) => r.classList.toggle("selected-row", i === idx));
  document.getElementById(`btn-${qId}`).disabled = false;
  document.getElementById(`btn-${qId}`).innerHTML = `<span class="icon">🚀</span><span class="text">Publish to Telegram</span>`;
  card.dataset.selectedIdx = idx;
}

async function publishQuiz(qId) {
  const card = document.getElementById(`q-card-${qId}`);
  const btn  = document.getElementById(`btn-${qId}`);
  const selectedIdx = card.dataset.selectedIdx;
  if (selectedIdx === undefined) return;

  btn.disabled = true;
  btn.innerHTML = `<div class="spinner" style="width:20px;height:20px;border-width:2px;margin:0;"></div><span class="text">Publishing...</span>`;

  const qText   = document.getElementById(`title-${qId}`).innerText;
  const origQ   = currentQuestions.find(q => q.id === qId);
  const options = origQ.options.map((_, i) => document.getElementById(`opt-${qId}-${i}`).innerText);

  try {
    const res = await fetch("/api/publish-quiz", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question_id: qId,
        correct_option_id: parseInt(selectedIdx),
        question_text: qText,
        options
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
          if (currentQuestions.length === 0)
            document.getElementById("empty-state").style.display = "block";
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
