document.addEventListener("DOMContentLoaded", () => {
  fetchQuestions();
  setupDragAndDrop();
});

// Setup File Upload Logic
function setupDragAndDrop() {
  const dropZone = document.getElementById("drop-zone");
  const fileInput = document.getElementById("pdf-upload");

  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, preventDefaults, false);
  });

  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  ['dragenter', 'dragover'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover'), false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover'), false);
  });

  dropZone.addEventListener('drop', handleDrop, false);
  fileInput.addEventListener('change', (e) => handleFiles(e.target.files));

  function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    handleFiles(files);
  }
}

async function handleFiles(files) {
  if (!files || files.length === 0) return;
  const file = files[0];
  
  if (file.type !== "application/pdf") {
    alert("Please upload a valid PDF file.");
    return;
  }

  const formData = new FormData();
  formData.append("file", file);

  const statusEl = document.getElementById("upload-status");
  const statusText = document.getElementById("upload-status-text");
  const dropZone = document.getElementById("drop-zone");

  dropZone.style.display = "none";
  statusEl.style.display = "flex";
  statusText.innerText = "Processing PDF via Gemini AI... (This may take a moment)";

  try {
    const response = await fetch("/api/upload-pdf", {
      method: "POST",
      body: formData
    });

    const result = await response.json();
    
    if (response.ok) {
      statusText.innerText = `Successfully extracted ${result.count} questions!`;
      statusEl.style.color = "var(--success-color)";
      statusEl.querySelector(".spinner").style.display = "none";
      
      setTimeout(() => {
        dropZone.style.display = "flex";
        statusEl.style.display = "none";
        statusEl.style.color = "#e2e8f0";
        statusEl.querySelector(".spinner").style.display = "block";
        document.getElementById("pdf-upload").value = "";
        fetchQuestions();
      }, 2000);
    } else {
      throw new Error(result.detail || "Failed to process PDF.");
    }
  } catch (error) {
    statusText.innerText = `Error: ${error.message}`;
    statusEl.style.color = "#ef4444";
    statusEl.querySelector(".spinner").style.display = "none";
    
    setTimeout(() => {
      dropZone.style.display = "flex";
      statusEl.style.display = "none";
      statusEl.style.color = "#e2e8f0";
      statusEl.querySelector(".spinner").style.display = "block";
      document.getElementById("pdf-upload").value = "";
    }, 4000);
  }
}


async function fetchQuestions() {
  const loadingEl = document.getElementById("loading");
  const listEl = document.getElementById("questions-list");
  const emptyEl = document.getElementById("empty-state");

  listEl.innerHTML = "";
  emptyEl.style.display = "none";
  loadingEl.style.display = "flex";

  try {
    const res = await fetch("/api/questions");
    const questions = await res.json();

    loadingEl.style.display = "none";

    if (!questions || questions.length === 0) {
      emptyEl.style.display = "block";
      return;
    }

    questions.forEach((q, index) => {
      const card = createQuestionCard(q, index);
      listEl.appendChild(card);
    });
  } catch (err) {
    loadingEl.innerHTML = `<p style="color: #ef4444;">Error loading questions: ${err.message}</p>`;
  }
}

function createQuestionCard(q, index) {
  const card = document.createElement("div");
  card.className = "question-card glass-panel";
  card.id = `q-card-${q.id}`;
  card.style.animationDelay = `${index * 0.1}s`;

  let selectedIdx = q.correct_option_id;

  let optionsHtml = q.options.map((opt, idx) => `
    <label class="option-item ${selectedIdx === idx ? 'selected' : ''}" onclick="selectOption(${q.id}, ${idx})">
      <input type="radio" name="q_${q.id}" value="${idx}" ${selectedIdx === idx ? 'checked' : ''} />
      <div class="radio-custom"></div>
      <span class="option-text">${opt}</span>
    </label>
  `).join("");

  card.innerHTML = `
    <div class="question-title">${q.question_text}</div>
    <div class="options-group">
      ${optionsHtml}
    </div>
    <button class="btn-send" id="btn-${q.id}" onclick="publishQuiz(${q.id})" ${selectedIdx === null ? 'disabled' : ''}>
      <span class="icon">🚀</span>
      <span class="text">Publish to Telegram</span>
    </button>
  `;

  return card;
}

function selectOption(qId, idx) {
  const card = document.getElementById(`q-card-${qId}`);
  const labels = card.querySelectorAll(".option-item");
  labels.forEach((lbl, lIdx) => {
    if (lIdx === idx) {
      lbl.classList.add("selected");
      lbl.querySelector("input").checked = true;
    } else {
      lbl.classList.remove("selected");
    }
  });

  const btn = document.getElementById(`btn-${qId}`);
  btn.disabled = false;
  card.dataset.selectedIdx = idx;
}

async function publishQuiz(qId) {
  const card = document.getElementById(`q-card-${qId}`);
  const btn = document.getElementById(`btn-${qId}`);
  const selectedIdx = card.dataset.selectedIdx || card.querySelector("input[type='radio']:checked")?.value;

  if (selectedIdx === undefined) return;

  btn.disabled = true;
  btn.innerHTML = `<div class="spinner" style="width:20px;height:20px;border-width:2px;margin:0;"></div> <span class="text">Publishing...</span>`;

  const qText = card.querySelector(".question-title").innerText;
  const options = Array.from(card.querySelectorAll(".option-text")).map(s => s.innerText);

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
      
      // Animate out
      setTimeout(() => {
        card.style.opacity = '0';
        card.style.transform = 'scale(0.9)';
        setTimeout(() => card.remove(), 300);
      }, 1000);
      
      // Check if any cards left
      const remainingCards = document.querySelectorAll(".question-card");
      if (remainingCards.length <= 1) {
          setTimeout(() => {
              document.getElementById("empty-state").style.display = "block";
          }, 1000);
      }
      
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
