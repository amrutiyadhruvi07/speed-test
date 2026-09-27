/**
 * TypeSpeed - Vanilla JavaScript Client
 * Handles real-time typing measurement, character validation,
 * live WPM / accuracy calculations, modal dialogs, and leaderboard API integration.
 */

// ==========================================
// 1. SAMPLE PARAGRAPHS (18 varied passages)
// ==========================================
const SAMPLE_PARAGRAPHS = [
  "The quick brown fox jumps over the lazy dog and runs gracefully across the green meadow under the morning sun.",
  "Programming is the art of telling a computer what to do while learning how difficult it is to be clear and precise.",
  "Clear thinking leads to clear writing and clean code is simply clear thinking made executable for others to build upon.",
  "Deep focus is like entering a quiet room where distractions fade away and creative momentum takes over every single action.",
  "The ocean waves rolled gently onto the sandy shore bringing cool breezes and the calming rhythm of the endless tide.",
  "Great software is rarely written in a single burst of inspiration but rather shaped through steady patience and careful iteration.",
  "In the quiet of early dawn the world seems full of quiet potential before bustling routines begin once more.",
  "Every journey begins with a single deliberate step forward into unknown territory guided by curiosity and determination.",
  "Learning to type quickly and accurately frees your mind to focus entirely on the ideas flowing from your imagination.",
  "The ancient library was filled with towering wooden shelves holding centuries of forgotten stories and timeless wisdom.",
  "A cup of warm coffee on a rainy afternoon provides the perfect companion for reading an inspiring book.",
  "Simplicity is not the lack of clutter but rather the presence of purpose and clarity in every single detail.",
  "Stars scattered across the clear midnight sky like diamonds dusting a velvet canvas in the vast expanse of space.",
  "The mountain trail wound sharply through dense pine forests before revealing breathtaking vistas of the distant valley below.",
  "Curiosity is the engine of achievement driving people to explore uncharted paths and uncover remarkable discoveries.",
  "Small daily improvements over time compound into massive transformations that surpass all initial expectations.",
  "Music has the extraordinary power to transport our thoughts and awaken memories that have slept for years.",
  "Consistency and practice turn difficult challenges into second nature through patience and persistent dedication."
];

// ==========================================
// 2. STATE MANAGEMENT
// ==========================================
let currentParagraph = "";
let characters = []; // Array of character spans
let currentIndex = 0;
let totalTypedCharacters = 0;
let correctCharacters = 0;
let incorrectCharacters = 0;
let isTypingActive = false;
let isTestCompleted = false;

let timerInterval = null;
let startTime = null;
let elapsedSeconds = 0;
let soundEnabled = true;

// Newly submitted score ID to highlight in the leaderboard
let highlightedScoreId = null;

// ==========================================
// 3. DOM ELEMENTS
// ==========================================
const textDisplay = document.getElementById("text-display");
const hiddenInput = document.getElementById("hidden-input");
const typingBoxWrapper = document.getElementById("typing-box-wrapper");
const focusNotice = document.getElementById("focus-notice");

// Stat elements
const statTimer = document.getElementById("stat-timer");
const statWpm = document.getElementById("stat-wpm");
const statAccuracy = document.getElementById("stat-accuracy");
const statProgress = document.getElementById("stat-progress");

// Buttons
const btnRestart = document.getElementById("btn-restart");
const btnNewText = document.getElementById("btn-new-text");
const btnSoundToggle = document.getElementById("btn-sound-toggle");
const iconSoundOn = document.getElementById("icon-sound-on");
const iconSoundOff = document.getElementById("icon-sound-off");
const btnRefreshLeaderboard = document.getElementById("btn-refresh-leaderboard");

// Leaderboard
const leaderboardTbody = document.getElementById("leaderboard-tbody");

// Modal elements
const resultsModal = document.getElementById("results-modal");
const modalFinalWpm = document.getElementById("modal-final-wpm");
const modalFinalAccuracy = document.getElementById("modal-final-accuracy");
const modalFinalTime = document.getElementById("modal-final-time");
const modalFinalChars = document.getElementById("modal-final-chars");
const submitScoreForm = document.getElementById("submit-score-form");
const playerNameInput = document.getElementById("player-name-input");
const btnSubmitScore = document.getElementById("btn-submit-score");
const btnSubmitText = document.getElementById("btn-submit-text");
const btnSubmitSpinner = document.getElementById("btn-submit-spinner");
const submitMessage = document.getElementById("submit-message");
const btnModalRetry = document.getElementById("btn-modal-retry");
const btnModalClose = document.getElementById("btn-modal-close");

// ==========================================
// 4. AUDIO FEEDBACK (Web Audio API)
// ==========================================
let audioCtx = null;

/**
 * Initializes or resumes the AudioContext safely on user interaction
 */
function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Plays a subtle key click sound for tactile feedback
 * @param {boolean} isCorrect - whether character typed was correct
 */
function playKeySound(isCorrect) {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    if (isCorrect) {
      osc.frequency.setValueAtTime(540, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(320, ctx.currentTime + 0.04);
      gain.gain.setValueAtTime(0.04, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);
    } else {
      osc.frequency.setValueAtTime(180, ctx.currentTime);
      gain.gain.setValueAtTime(0.06, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.06);
    }

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + (isCorrect ? 0.04 : 0.06));
  } catch (e) {
    // Graceful fallback if audio is blocked
  }
}

/**
 * Plays a cheerful chord when typing test is completed
 */
function playFinishSound() {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const notes = [440, 554.37, 659.25]; // A major triad
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.05, ctx.currentTime + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.08 + 0.3);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + idx * 0.08);
      osc.stop(ctx.currentTime + idx * 0.08 + 0.3);
    });
  } catch (e) {
    // Ignore audio errors
  }
}

// ==========================================
// 5. TEST INITIALIZATION & RENDERING
// ==========================================

/**
 * Formats seconds into MM:SS format
 * @param {number} totalSeconds
 * @returns {string} e.g. "01:23"
 */
function formatTime(totalSeconds) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Loads a random paragraph and renders it into the text display
 * @param {boolean} pickNew - If false, keeps current paragraph (for restart)
 */
function loadTestParagraph(pickNew = true) {
  if (pickNew || !currentParagraph) {
    // Choose a random paragraph, different from current if possible
    let newParagraph = currentParagraph;
    if (SAMPLE_PARAGRAPHS.length > 1) {
      while (newParagraph === currentParagraph) {
        const randomIndex = Math.floor(Math.random() * SAMPLE_PARAGRAPHS.length);
        newParagraph = SAMPLE_PARAGRAPHS[randomIndex];
      }
    } else {
      newParagraph = SAMPLE_PARAGRAPHS[0];
    }
    currentParagraph = newParagraph;
  }

  // Reset internal tracking variables
  clearInterval(timerInterval);
  timerInterval = null;
  startTime = null;
  elapsedSeconds = 0;
  isTypingActive = false;
  isTestCompleted = false;
  currentIndex = 0;
  totalTypedCharacters = 0;
  correctCharacters = 0;
  incorrectCharacters = 0;

  // Clear and populate character spans
  textDisplay.innerHTML = "";
  characters = [];

  for (let i = 0; i < currentParagraph.length; i++) {
    const char = currentParagraph[i];
    const span = document.createElement("span");
    span.classList.add("char");
    if (char === " ") {
      span.classList.add("is-space");
      span.textContent = " "; // keep space selectable
    } else {
      span.textContent = char;
    }
    textDisplay.appendChild(span);
    characters.push(span);
  }

  // Highlight the initial first character position
  if (characters.length > 0) {
    characters[0].classList.add("current");
  }

  // Reset live stats in UI
  statTimer.textContent = "00:00";
  statWpm.textContent = "0";
  statAccuracy.textContent = "100%";
  statProgress.textContent = "0%";

  // Reset input field and focus it
  hiddenInput.value = "";
  focusInput();
}

/**
 * Focuses the hidden input and visually marks wrapper as focused
 */
function focusInput() {
  if (isTestCompleted) return;
  hiddenInput.focus();
  typingBoxWrapper.classList.add("is-focused");
}

// ==========================================
// 6. LIVE METRIC CALCULATIONS
// ==========================================

/**
 * Computes live WPM and Accuracy
 * Formula:
 * - WPM = (correct characters / 5) / (elapsed minutes)
 * - Accuracy = (correct characters / total typed characters) * 100
 */
function updateLiveMetrics() {
  if (!startTime || elapsedSeconds <= 0) {
    statWpm.textContent = "0";
    statAccuracy.textContent = "100%";
    return;
  }

  const elapsedMinutes = elapsedSeconds / 60;
  
  // WPM calculation (avoid dividing by zero, prevent NaN/Infinity)
  let wpm = 0;
  if (elapsedMinutes > 0) {
    wpm = Math.round((correctCharacters / 5) / elapsedMinutes);
    if (!isFinite(wpm) || isNaN(wpm) || wpm < 0) {
      wpm = 0;
    }
  }

  // Accuracy calculation
  let accuracy = 100;
  if (totalTypedCharacters > 0) {
    accuracy = Math.round((correctCharacters / totalTypedCharacters) * 100);
    if (isNaN(accuracy) || accuracy < 0) {
      accuracy = 0;
    }
  }

  // Update UI values
  statWpm.textContent = wpm.toString();
  statAccuracy.textContent = `${accuracy}%`;

  // Update progress
  const progressPercent = Math.min(100, Math.round((currentIndex / characters.length) * 100));
  statProgress.textContent = `${progressPercent}%`;
}

/**
 * Starts the test timer counting up in seconds
 */
function startTimer() {
  if (timerInterval) return;
  isTypingActive = true;
  startTime = Date.now();
  elapsedSeconds = 0;

  timerInterval = setInterval(() => {
    elapsedSeconds++;
    statTimer.textContent = formatTime(elapsedSeconds);
    updateLiveMetrics();
  }, 1000);
}

/**
 * Stops the timer
 */
function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
  isTypingActive = false;
}

// ==========================================
// 7. KEYSTROKE HANDLING & TYPING LOGIC
// ==========================================

/**
 * Handles typing input events
 * Compares typed character against expected paragraph characters
 */
function handleInput(event) {
  if (isTestCompleted) return;

  const currentInputValue = hiddenInput.value;

  // Start timer on the first keystroke
  if (!isTypingActive && currentInputValue.length > 0) {
    startTimer();
  }

  const targetLength = currentInputValue.length;

  // If user used Backspace
  if (targetLength < currentIndex) {
    // User deleted characters
    for (let i = targetLength; i < currentIndex; i++) {
      if (characters[i]) {
        // Remove styling
        characters[i].classList.remove("correct", "incorrect", "current");
      }
    }
    currentIndex = targetLength;
    if (characters[currentIndex]) {
      characters[currentIndex].classList.add("current");
    }
    // Re-evaluate correct/incorrect counts
    recalculateAccuracyCounts(currentInputValue);
    updateLiveMetrics();
    return;
  }

  // Prevent typing past the end of the paragraph
  if (targetLength > characters.length) {
    hiddenInput.value = currentInputValue.slice(0, characters.length);
    return;
  }

  // Process newly typed characters up to current length
  while (currentIndex < targetLength && currentIndex < characters.length) {
    const typedChar = currentInputValue[currentIndex];
    const expectedChar = currentParagraph[currentIndex];
    const span = characters[currentIndex];

    span.classList.remove("current");

    totalTypedCharacters++;

    if (typedChar === expectedChar) {
      span.classList.add("correct");
      span.classList.remove("incorrect");
      correctCharacters++;
      playKeySound(true);
    } else {
      span.classList.add("incorrect");
      span.classList.remove("correct");
      incorrectCharacters++;
      playKeySound(false);
    }

    currentIndex++;
  }

  // Set the current cursor on the next character
  if (currentIndex < characters.length) {
    characters[currentIndex].classList.add("current");
  }

  updateLiveMetrics();

  // Check if test is completed
  if (currentIndex >= characters.length) {
    finishTest();
  }
}

/**
 * Helper to recalculate correct characters upon backspacing
 * @param {string} typedString
 */
function recalculateAccuracyCounts(typedString) {
  let corrects = 0;
  for (let i = 0; i < typedString.length; i++) {
    if (typedString[i] === currentParagraph[i]) {
      corrects++;
    }
  }
  correctCharacters = corrects;
}

/**
 * Finishes the typing test and displays the results modal
 */
function finishTest() {
  if (isTestCompleted) return;
  isTestCompleted = true;
  stopTimer();
  playFinishSound();

  // Calculate final elapsed time (ensure at least 1 second)
  const finalSeconds = Math.max(1, elapsedSeconds);
  const finalMinutes = finalSeconds / 60;

  // Calculate final WPM
  const finalWpm = Math.round((correctCharacters / 5) / finalMinutes) || 0;

  // Calculate final accuracy
  let finalAccuracy = 100;
  if (totalTypedCharacters > 0) {
    finalAccuracy = Math.round((correctCharacters / totalTypedCharacters) * 100);
  }

  // Update modal metrics
  modalFinalWpm.textContent = finalWpm.toString();
  modalFinalAccuracy.textContent = `${finalAccuracy}%`;
  modalFinalTime.textContent = `${finalSeconds}s`;
  modalFinalChars.textContent = `${correctCharacters}/${characters.length}`;

  // Populate saved player name from localStorage if available
  const savedName = localStorage.getItem("typespeed_player_name") || "";
  playerNameInput.value = savedName;
  submitMessage.textContent = "";
  submitMessage.className = "form-message";

  // Display modal
  resultsModal.classList.remove("hidden");
  setTimeout(() => {
    playerNameInput.focus();
    playerNameInput.select();
  }, 100);
}

// ==========================================
// 8. LEADERBOARD API INTEGRATION
// ==========================================

/**
 * Formats ISO date string into a user-friendly format (e.g., "Sep 26, 12:45")
 * @param {string} isoString
 * @returns {string} Formatted date
 */
function formatDate(isoString) {
  if (!isoString) return "-";
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return "-";
    const month = d.toLocaleString("default", { month: "short" });
    const day = d.getDate();
    return `${month} ${day}`;
  } catch (e) {
    return "-";
  }
}

/**
 * Fetches the top 10 scores from GET /api/scores and renders the leaderboard table
 */
async function fetchLeaderboard() {
  try {
    const response = await fetch("/api/scores");
    if (!response.ok) {
      throw new Error(`Failed to load scores: ${response.status}`);
    }
    const scores = await response.json();
    renderLeaderboard(scores);
  } catch (error) {
    console.error("Leaderboard fetch error:", error);
    leaderboardTbody.innerHTML = `
      <tr>
        <td colspan="5" class="table-empty">Unable to load leaderboard. Please try again.</td>
      </tr>
    `;
  }
}

/**
 * Renders leaderboard rows into the table body
 * @param {Array} scores
 */
function renderLeaderboard(scores) {
  if (!Array.isArray(scores) || scores.length === 0) {
    leaderboardTbody.innerHTML = `
      <tr>
        <td colspan="5" class="table-empty">No scores recorded yet. Be the first!</td>
      </tr>
    `;
    return;
  }

  leaderboardTbody.innerHTML = "";

  scores.forEach((entry, index) => {
    const rank = index + 1;
    const tr = document.createElement("tr");

    // Apply temporary glow highlight if this row matches the newly submitted score
    if (highlightedScoreId && entry.id === highlightedScoreId) {
      tr.classList.add("row-highlight");
    }

    // Rank badge styling
    let rankBadgeClass = "rank-default";
    if (rank === 1) rankBadgeClass = "rank-1";
    else if (rank === 2) rankBadgeClass = "rank-2";
    else if (rank === 3) rankBadgeClass = "rank-3";

    tr.innerHTML = `
      <td class="td-rank">
        <span class="rank-badge ${rankBadgeClass}">${rank}</span>
      </td>
      <td class="td-name" title="${escapeHtml(entry.name || 'Anonymous')}">${escapeHtml(entry.name || 'Anonymous')}</td>
      <td class="td-wpm">${entry.wpm || 0}</td>
      <td class="td-acc">${entry.accuracy || 0}%</td>
      <td class="td-date">${formatDate(entry.date)}</td>
    `;

    leaderboardTbody.appendChild(tr);
  });
}

/**
 * Helper to escape HTML entities
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Submits the player's score to the backend POST /api/scores
 */
async function submitScore(event) {
  event.preventDefault();

  const name = playerNameInput.value.trim();
  if (!name) {
    showSubmitMessage("Please enter your name.", "error");
    playerNameInput.focus();
    return;
  }

  if (name.length > 20) {
    showSubmitMessage("Name must be 20 characters or fewer.", "error");
    return;
  }

  // Parse metrics
  const wpm = parseInt(modalFinalWpm.textContent, 10) || 0;
  const accuracy = parseInt(modalFinalAccuracy.textContent.replace("%", ""), 10) || 0;

  // Show loading spinner
  btnSubmitText.textContent = "Submitting...";
  btnSubmitSpinner.classList.remove("hidden");
  btnSubmitScore.disabled = true;
  submitMessage.textContent = "";

  try {
    const response = await fetch("/api/scores", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ name, wpm, accuracy })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Failed to submit score");
    }

    // Save player name to localStorage
    localStorage.setItem("typespeed_player_name", name);

    // Track the new score id to highlight
    highlightedScoreId = data.newScoreId;

    showSubmitMessage("Score added to leaderboard!", "success");

    // Render updated leaderboard returned by the server
    if (data.leaderboard) {
      renderLeaderboard(data.leaderboard);
    } else {
      fetchLeaderboard();
    }

    // Auto-close modal after a short delay
    setTimeout(() => {
      closeModal();
      loadTestParagraph(true);
    }, 1200);

  } catch (error) {
    console.error("Submission failed:", error);
    showSubmitMessage(error.message || "Failed to submit score.", "error");
  } finally {
    btnSubmitText.textContent = "Submit Score";
    btnSubmitSpinner.classList.add("hidden");
    btnSubmitScore.disabled = false;
  }
}

/**
 * Displays status message below the submission form
 * @param {string} msg
 * @param {'error'|'success'} type
 */
function showSubmitMessage(msg, type) {
  submitMessage.textContent = msg;
  submitMessage.className = `form-message ${type}`;
}

/**
 * Closes the results modal
 */
function closeModal() {
  resultsModal.classList.add("hidden");
  focusInput();
}

// ==========================================
// 9. EVENT LISTENERS
// ==========================================

// Keystroke input
hiddenInput.addEventListener("input", handleInput);

// Keep hidden input focused when clicking on typing box
typingBoxWrapper.addEventListener("click", () => {
  focusInput();
});

// Restart button (keeps current paragraph or resets)
btnRestart.addEventListener("click", () => {
  loadTestParagraph(false);
});

// New text button (picks new random paragraph)
btnNewText.addEventListener("click", () => {
  loadTestParagraph(true);
});

// Refresh leaderboard button
btnRefreshLeaderboard.addEventListener("click", () => {
  fetchLeaderboard();
});

// Sound toggle button
btnSoundToggle.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  if (soundEnabled) {
    iconSoundOn.classList.remove("hidden");
    iconSoundOff.classList.add("hidden");
    getAudioContext();
  } else {
    iconSoundOn.classList.add("hidden");
    iconSoundOff.classList.remove("hidden");
  }
});

// Form submit
submitScoreForm.addEventListener("submit", submitScore);

// Modal action buttons
btnModalRetry.addEventListener("click", () => {
  closeModal();
  loadTestParagraph(true);
});

btnModalClose.addEventListener("click", () => {
  closeModal();
});

// Global keyboard shortcuts (Tab or Escape to restart, any key to focus)
document.addEventListener("keydown", (e) => {
  // If modal is open, Escape closes modal
  if (!resultsModal.classList.contains("hidden")) {
    if (e.key === "Escape") {
      closeModal();
    }
    return;
  }

  // Tab or Escape restarts test
  if (e.key === "Tab" || e.key === "Escape") {
    e.preventDefault();
    loadTestParagraph(false);
    return;
  }

  // If focus is not currently inside the input, redirect focus
  if (document.activeElement !== hiddenInput && document.activeElement !== playerNameInput) {
    // Avoid redirecting control keys like F5, Ctrl, Alt
    if (e.key.length === 1 || e.key === "Backspace") {
      focusInput();
    }
  }
});

// Focus state visual tracking
hiddenInput.addEventListener("focus", () => {
  typingBoxWrapper.classList.add("is-focused");
  focusNotice.style.opacity = "0";
});

hiddenInput.addEventListener("blur", () => {
  typingBoxWrapper.classList.remove("is-focused");
  if (!isTypingActive && !isTestCompleted) {
    focusNotice.style.opacity = "1";
  }
});

// ==========================================
// 10. INITIAL RUN
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
  loadTestParagraph(true);
  fetchLeaderboard();
});
