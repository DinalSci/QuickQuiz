let currentQuestions = [];

document.addEventListener("DOMContentLoaded", () => {
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
  const listEl = document.getElementById("questions-list");

  dropZone.style.display = "none";
  statusEl.style.display = "flex";
  statusText.innerText = "Extracting text from PDF...";
  
  currentQuestions = [];
  listEl.innerHTML = "";
  document.getElementById("empty-state").style.display = "none";

  try {
    const response = await fetch("/api/upload-pdf", {
      method: "POST",
      body: formData
    });

    const result = await response.json();
    
    if (response.ok) {
      statusText.innerText = "Text extracted! Processing with Gemini AI...";
      
      // Process chunks
      const rawText = result.raw_text;
      await processTextInChunks(rawText, statusText, statusEl, dropZone);
      
    } else {
      throw new Error(result.detail || "Failed to extract PDF text.");
    }
  } catch (error) {
    showError(error.message, statusText, statusEl, dropZone);
  }
}

async function processTextInChunks(rawText, statusText, statusEl, dropZone) {
    const chunkSize = 3500;
    const chunks = [];
    
    for (let i = 0; i < rawText.length; i += chunkSize) {
        chunks.push(rawText.slice(i, i + chunkSize));
    }
    
    let totalFound = 0;
    
    for (let i = 0; i < chunks.length; i++) {
        statusText.innerText = `Processing part ${i + 1} of ${chunks.length} via Gemini AI...`;
        
        try {
            const res = await fetch("/api/parse-text", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ raw_text: chunks[i] })
            });
            
            const data = await res.json();
            
            if (res.ok && data.questions && data.questions.length > 0) {
                totalFound += data.questions.length;
                currentQuestions = currentQuestions.concat(data.questions);
                renderQuestions();
            }
        } catch (e) {
            console.error("Error processing chunk", i, e);
        }
    }
    
    statusText.innerText = `Finished! Extracted ${totalFound} questions.`;
    statusEl.style.color = "var(--success-color)";
    statusEl.querySelector(".spinner").style.display = "none";
    
    setTimeout(() => {
        dropZone.style.display = "flex";
        statusEl.style.display = "none";
        statusEl.style.color = "#e2e8f0";
        statusEl.querySelector(".spinner").style.display = "block";
        document.getElementById("pdf-upload").value = "";
        
        if (totalFound === 0) {
            document.getElementById("empty-state").style.display = "block";
        }
    }, 2500);
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
    }, 4000);
}

function renderQuestions() {
  const listEl = document.getElementById("questions-list");
  listEl.innerHTML = "";
  
  currentQuestions.forEach((q, index) => {
    const card = createQuestionCard(q, index);
    listEl.appendChild(card);
  });
}

function createQuestionCard(q, index) {
  const card = document.createElement("div");
  card.className = "question-card glass-panel";
  card.id = `q-card-${q.id}`;
  
  card.style.animationDelay = `0.1s`;

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
    <div class="options-group">
      ${optionsHtml}
    </div>
    <button class="btn-send" id="btn-${q.id}" onclick="publishQuiz('${q.id}')" ${selectedIdx === null ? 'disabled' : ''}>
      <span class="icon">🚀</span>
      <span class="text">Publish to Telegram</span>
    </button>
  `;

  return card;
}

function selectOption(qId, idx) {
  const card = document.getElementById(`q-card-${qId}`);
  
  const allRadios = card.querySelectorAll(".radio-custom");
  allRadios.forEach((r, i) => {
      if (i === idx) {
          r.classList.add("selected");
      } else {
          r.classList.remove("selected");
      }
  });
  
  const allRows = card.querySelectorAll(".option-row");
  allRows.forEach((r, i) => {
      if (i === idx) {
          r.classList.add("selected-row");
      } else {
          r.classList.remove("selected-row");
      }
  });

  const btn = document.getElementById(`btn-${qId}`);
  btn.disabled = false;
  card.dataset.selectedIdx = idx;
}

async function publishQuiz(qId) {
  const card = document.getElementById(`q-card-${qId}`);
  const btn = document.getElementById(`btn-${qId}`);
  const selectedIdx = card.dataset.selectedIdx;

  if (selectedIdx === undefined) return;

  btn.disabled = true;
  btn.innerHTML = `<div class="spinner" style="width:20px;height:20px;border-width:2px;margin:0;"></div> <span class="text">Publishing...</span>`;

  // Read the current text from the contenteditable elements
  const qText = document.getElementById(`title-${qId}`).innerText;
  
  const originalQ = currentQuestions.find(q => q.id === qId);
  const options = [];
  for (let i = 0; i < originalQ.options.length; i++) {
      options.push(document.getElementById(`opt-${qId}-${i}`).innerText);
  }

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
        setTimeout(() => card.remove(), 300);
      }, 1000);
      
      if (currentQuestions.length === 0) {
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
