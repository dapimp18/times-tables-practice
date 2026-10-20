(() => {
  "use strict";

  const STATS_KEY = "tt_stats_v1";

  // ---------- Stats (persisted) ----------

  function loadStats() {
    try {
      const raw = localStorage.getItem(STATS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  }

  function saveStats(stats) {
    try {
      localStorage.setItem(STATS_KEY, JSON.stringify(stats));
    } catch {
      /* ignore storage errors */
    }
  }

  function factKey(a, b) {
    const lo = Math.min(a, b), hi = Math.max(a, b);
    return `${lo}x${hi}`;
  }

  function recordFact(stats, a, b, correct) {
    const key = factKey(a, b);
    if (!stats[key]) stats[key] = { attempts: 0, correct: 0 };
    stats[key].attempts += 1;
    if (correct) stats[key].correct += 1;
  }

  // ---------- Screens ----------

  const screens = {
    setup: document.getElementById("screen-setup"),
    game: document.getElementById("screen-game"),
    results: document.getElementById("screen-results"),
    progress: document.getElementById("screen-progress"),
  };

  function showScreen(name) {
    Object.values(screens).forEach(s => s.classList.remove("active"));
    screens[name].classList.add("active");
  }

  // ---------- Setup screen ----------

  const tableGrid = document.getElementById("table-grid");
  const selectedTables = new Set([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);

  function buildTableGrid() {
    tableGrid.innerHTML = "";
    for (let n = 1; n <= 12; n++) {
      const chip = document.createElement("div");
      chip.className = "table-chip" + (selectedTables.has(n) ? " selected" : "");
      chip.textContent = n;
      chip.dataset.n = n;
      chip.addEventListener("click", () => {
        if (selectedTables.has(n)) {
          selectedTables.delete(n);
          chip.classList.remove("selected");
        } else {
          selectedTables.add(n);
          chip.classList.add("selected");
        }
      });
      tableGrid.appendChild(chip);
    }
  }

  document.getElementById("select-all").addEventListener("click", () => {
    for (let n = 1; n <= 12; n++) selectedTables.add(n);
    buildTableGrid();
  });

  document.getElementById("select-none").addEventListener("click", () => {
    selectedTables.clear();
    buildTableGrid();
  });

  const practiceOptions = document.getElementById("practice-options");
  const timedOptions = document.getElementById("timed-options");

  document.querySelectorAll('input[name="mode"]').forEach(radio => {
    radio.addEventListener("change", () => {
      const isTimed = document.querySelector('input[name="mode"]:checked').value === "timed";
      practiceOptions.classList.toggle("hidden", isTimed);
      timedOptions.classList.toggle("hidden", !isTimed);
    });
  });

  document.getElementById("start-btn").addEventListener("click", startSession);
  document.getElementById("progress-btn").addEventListener("click", () => {
    renderProgress();
    showScreen("progress");
  });

  // ---------- Game session ----------

  let session = null; // active session state

  function startSession() {
    if (selectedTables.size === 0) {
      alert("Pick at least one times table first.");
      return;
    }
    const mode = document.querySelector('input[name="mode"]:checked').value;
    const tables = Array.from(selectedTables);

    session = {
      mode,
      tables,
      index: 0,
      correct: 0,
      total: 0,
      maxQuestions: 0,
      timeLeft: 0,
      timerId: null,
      lastKey: null,
      awaitingNext: false,
      currentA: null,
      currentB: null,
      stats: loadStats(),
      startedAt: Date.now(),
    };

    if (mode === "practice") {
      session.maxQuestions = Number(
        document.querySelector('input[name="qcount"]:checked').value
      );
    } else {
      session.timeLeft = Number(
        document.querySelector('input[name="duration"]:checked').value
      );
    }

    showScreen("game");
    buildKeypad();
    updateGameTop();
    if (mode === "timed") startTimer();
    nextQuestion();
  }

  const questionText = document.getElementById("question-text");
  const answerInput = document.getElementById("answer-input");
  const feedback = document.getElementById("feedback");
  const submitBtn = document.getElementById("submit-btn");
  const gameStatLeft = document.getElementById("game-stat-left");
  const gameStatRight = document.getElementById("game-stat-right");
  const answerForm = document.getElementById("answer-form");

  function updateGameTop() {
    if (session.mode === "practice") {
      const totalLabel = session.maxQuestions === 0 ? "" : ` / ${session.maxQuestions}`;
      gameStatLeft.textContent = `Question ${session.total + (session.awaitingNext ? 0 : 1)}${totalLabel}`;
    } else {
      gameStatLeft.textContent = `Time left: ${session.timeLeft}s`;
    }
    gameStatRight.textContent = `Score: ${session.correct}`;
  }

  function startTimer() {
    session.timerId = setInterval(() => {
      session.timeLeft -= 1;
      updateGameTop();
      if (session.timeLeft <= 0) {
        clearInterval(session.timerId);
        endSession();
      }
    }, 1000);
  }

  function pickQuestion() {
    const tables = session.tables;
    let a, b, key;
    do {
      a = tables[Math.floor(Math.random() * tables.length)];
      b = Math.floor(Math.random() * 12) + 1;
      if (Math.random() < 0.5) [a, b] = [b, a];
      key = factKey(a, b);
    } while (key === session.lastKey && tables.length * 12 > 1);
    session.lastKey = key;
    return [a, b];
  }

  function nextQuestion() {
    if (session.mode === "practice" && session.maxQuestions !== 0 && session.total >= session.maxQuestions) {
      endSession();
      return;
    }
    const [a, b] = pickQuestion();
    session.currentA = a;
    session.currentB = b;
    session.awaitingNext = false;
    session.questionStart = Date.now();

    questionText.textContent = `${a} × ${b} =`;
    answerInput.value = "";
    feedback.textContent = "";
    feedback.className = "feedback";
    submitBtn.textContent = "Submit";
    answerInput.disabled = false;
    updateGameTop();
    answerInput.focus();
  }

  function handleSubmit() {
    if (session.awaitingNext) {
      nextQuestion();
      return;
    }

    const value = answerInput.value.trim();
    if (value === "") {
      answerInput.focus();
      return;
    }

    const a = session.currentA, b = session.currentB;
    const correctAnswer = a * b;
    const given = Number(value);
    const isCorrect = given === correctAnswer;

    session.total += 1;
    if (isCorrect) session.correct += 1;
    recordFact(session.stats, a, b, isCorrect);
    saveStats(session.stats);

    if (isCorrect) {
      feedback.textContent = "Correct!";
      feedback.className = "feedback correct";
    } else {
      feedback.textContent = `Not quite — ${a} × ${b} = ${correctAnswer}`;
      feedback.className = "feedback incorrect";
    }

    answerInput.disabled = true;
    updateGameTop();

    if (session.mode === "timed") {
      session.awaitingNext = true;
      setTimeout(() => {
        if (session.mode === "timed" && session.timeLeft > 0) nextQuestion();
      }, 500);
    } else {
      session.awaitingNext = true;
      submitBtn.textContent = "Next";
    }
  }

  answerForm.addEventListener("submit", e => {
    e.preventDefault();
    handleSubmit();
  });
  submitBtn.addEventListener("click", handleSubmit);

  document.getElementById("quit-btn").addEventListener("click", () => {
    if (session && session.timerId) clearInterval(session.timerId);
    endSession();
  });

  // On-screen keypad for touch devices
  function buildKeypad() {
    const keypad = document.getElementById("keypad");
    keypad.innerHTML = "";
    const keys = ["1","2","3","4","5","6","7","8","9","⌫","0","Enter"];
    keys.forEach(k => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = k;
      btn.addEventListener("click", () => {
        if (k === "⌫") {
          answerInput.value = answerInput.value.slice(0, -1);
        } else if (k === "Enter") {
          handleSubmit();
        } else {
          if (!answerInput.disabled) answerInput.value += k;
        }
        answerInput.focus();
      });
      keypad.appendChild(btn);
    });
  }

  // ---------- Results ----------

  function endSession() {
    if (session.timerId) clearInterval(session.timerId);
    renderResults();
    showScreen("results");
  }

  function renderResults() {
    const summary = document.getElementById("results-summary");
    const accuracy = session.total > 0 ? Math.round((session.correct / session.total) * 100) : 0;
    const elapsedSec = Math.round((Date.now() - session.startedAt) / 1000);

    let extra = "";
    if (session.mode === "timed") {
      extra = `<p>Questions answered: ${session.total}</p>`;
    } else {
      extra = `<p>Time taken: ${elapsedSec}s</p>`;
    }

    summary.innerHTML = `
      <p><strong>Score: ${session.correct} / ${session.total}</strong></p>
      <p>Accuracy: ${accuracy}%</p>
      ${extra}
    `;

    // Weak facts from this session only
    const weak = Object.entries(session.stats)
      .filter(([key]) => {
        return true;
      })
      .map(([key, s]) => ({ key, ...s }))
      .filter(f => f.attempts > 0 && f.correct < f.attempts)
      .sort((a, b) => (a.correct / a.attempts) - (b.correct / b.attempts))
      .slice(0, 8);

    const weakFactsEl = document.getElementById("weak-facts");
    if (weak.length === 0) {
      weakFactsEl.innerHTML = "<p>Great job — no mistakes to review!</p>";
    } else {
      weakFactsEl.innerHTML = weak.map(f => {
        const [lo, hi] = f.key.split("x");
        const pct = Math.round((f.correct / f.attempts) * 100);
        return `<div class="fact-row"><span>${lo} × ${hi}</span><span class="fact-acc">${pct}% (${f.correct}/${f.attempts})</span></div>`;
      }).join("");
    }
  }

  document.getElementById("again-btn").addEventListener("click", startSession);
  document.getElementById("setup-btn").addEventListener("click", () => showScreen("setup"));

  // ---------- Progress screen (all-time stats) ----------

  function renderProgress() {
    const stats = loadStats();
    const entries = Object.entries(stats);
    const summaryEl = document.getElementById("progress-summary");

    if (entries.length === 0) {
      summaryEl.innerHTML = "<p>No practice recorded yet — start a session!</p>";
      document.getElementById("progress-table").innerHTML = "";
      return;
    }

    let totalAttempts = 0, totalCorrect = 0;
    entries.forEach(([, s]) => { totalAttempts += s.attempts; totalCorrect += s.correct; });
    const overallAcc = Math.round((totalCorrect / totalAttempts) * 100);

    summaryEl.innerHTML = `
      <p><strong>Overall accuracy: ${overallAcc}%</strong></p>
      <p>Total questions answered: ${totalAttempts}</p>
    `;

    const sorted = entries
      .map(([key, s]) => ({ key, ...s, acc: s.correct / s.attempts }))
      .sort((a, b) => a.acc - b.acc);

    document.getElementById("progress-table").innerHTML = sorted.map(f => {
      const [lo, hi] = f.key.split("x");
      const pct = Math.round(f.acc * 100);
      return `<div class="fact-row"><span>${lo} × ${hi}</span><span class="fact-acc">${pct}% (${f.correct}/${f.attempts})</span></div>`;
    }).join("");
  }

  document.getElementById("progress-back-btn").addEventListener("click", () => showScreen("setup"));
  document.getElementById("reset-progress-btn").addEventListener("click", () => {
    if (confirm("Reset all saved progress? This can't be undone.")) {
      localStorage.removeItem(STATS_KEY);
      renderProgress();
    }
  });

  // ---------- Init ----------

  buildTableGrid();
  showScreen("setup");
})();
