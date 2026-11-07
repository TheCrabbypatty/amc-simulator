/* AMC Simulator — single-page app.
   Timed AMC 10 practice modeled on the AoPS online AMC environment
   (as replicated by Tesseract). No accounts, no server: attempts are
   saved in this browser's localStorage only.
*/
(function () {
  "use strict";

  var HISTORY_KEY = "amcSim.history.v1";
  var INPROGRESS_KEY = "amcSim.inProgress.v1";
  var LETTERS = ["A", "B", "C", "D", "E"];
  var TOTAL_SECONDS = 4500; // 75:00
  var CHECKPOINTS = [
    { atMin: 28, key: "28" },
    { atMin: 58, key: "58" },
  ];
  var PHASES = [
    { untilMin: 3, id: "scan", label: "0–3 min · Scan all 25 — mark solve-now / later / blank" },
    { untilMin: 28, id: "pass1", label: "3–28 min · Pass 1 — solve-now problems, 3-minute rule" },
    { untilMin: 58, id: "pass2", label: "28–58 min · Pass 2 — the later problems you marked" },
    { untilMin: 68, id: "pass3", label: "58–68 min · Pass 3 — problems 21–25, at most 1–2 set up with an equation" },
    { untilMin: 75, id: "check", label: "68–75 min · Check only — no new problems" },
  ];
  var CAUSES = [
    ["", "— label the cause —"],
    ["knowledge", "Knowledge — didn't know the concept"],
    ["recognition", "Recognition — knew it, didn't spot it"],
    ["execution", "Execution — set it up, slipped somewhere"],
    ["time", "Time — ran out / skipped under pressure"],
  ];

  /* ---------- helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function show(id) {
    ["home-screen", "loading-screen", "test-screen", "finished-screen", "review-screen"]
      .forEach(function (s) { $(s).classList.toggle("hidden", s !== id); });
    window.scrollTo(0, 0);
  }
  function fmtScore(s) { return (s % 1 === 0) ? String(s) : s.toFixed(1); }
  function fmtClock(totalSeconds) {
    var s = Math.max(0, totalSeconds);
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    return h + ":" + (m < 10 ? "0" : "") + m + ":" + (sec < 10 ? "0" : "") + sec;
  }
  function renderMath(el) {
    if (window.renderMathInElement) {
      try {
        renderMathInElement(el, {
          delimiters: [
            { left: "\\(", right: "\\)", display: false },
            { left: "\\[", right: "\\]", display: true },
          ],
          throwOnError: false,
        });
      } catch (e) { /* leave raw LaTeX visible */ }
    }
  }
  function paragraphs(text) {
    return (text || "").split(/\n\s*\n/).map(function (p) {
      return "<p>" + p.replace(/\n/g, "<br />") + "</p>";
    }).join("");
  }
  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
    catch (e) { return []; }
  }
  function saveHistory(h) { localStorage.setItem(HISTORY_KEY, JSON.stringify(h)); }
  function loadInProgress() {
    try { return JSON.parse(localStorage.getItem(INPROGRESS_KEY)) || null; }
    catch (e) { return null; }
  }
  function saveInProgress() {
    if (!state.exam) return;
    localStorage.setItem(INPROGRESS_KEY, JSON.stringify({
      examId: state.exam.examId,
      startedAt: state.startedAt,
      endAt: state.endAt,
      answers: state.answers,
      flags: state.flags,
      current: state.current,
      checkpoints: state.checkpoints,
    }));
  }
  function clearInProgress() { localStorage.removeItem(INPROGRESS_KEY); }

  /* ---------- state ---------- */
  var state = {
    exam: null,
    answers: [],
    flags: [],
    current: 0,
    startedAt: 0,
    endAt: 0,
    checkpoints: {},
    timerId: null,
    attempt: null,
    submitted: false,
  };

  /* ---------- home ---------- */
  var homeWired = false;
  function initHome() {
    if (!homeWired) {
      homeWired = true;
      document.querySelectorAll("[data-start]").forEach(function (btn) {
        btn.addEventListener("click", function () { startExam(btn.getAttribute("data-start")); });
      });
    }
    var ip = loadInProgress();
    var banner = $("resume-banner");
    if (ip && ip.endAt > Date.now()) {
      $("resume-text").textContent = examLabel(ip.examId) + " — " +
        fmtClock(Math.floor((ip.endAt - Date.now()) / 1000)) + " left, " +
        ip.answers.filter(function (a) { return a; }).length + " answered.";
      banner.classList.remove("hidden");
      $("resume-btn").onclick = function () { resumeExam(ip); };
      $("discard-btn").onclick = function () { clearInProgress(); banner.classList.add("hidden"); };
    } else if (ip) {
      clearInProgress();
    }
    renderRecentHistory();
  }
  function examLabel(examId) {
    return examId === "amc10a-2024" ? "2024 AMC 10A" : "2024 AMC 10B";
  }
  function renderRecentHistory() {
    var h = loadHistory().slice(0, 3);
    var box = $("recent-history");
    if (!h.length) { box.innerHTML = ""; return; }
    var rows = h.map(function (a) {
      var d = new Date(a.date);
      return "<tr><td>" + d.toLocaleDateString() + " " + d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) +
        "</td><td>" + a.exam + "</td><td><b>" + fmtScore(a.score) + "</b> / 150</td><td>" +
        a.correct + " correct · " + a.blank + " blank · " + a.wrong + " wrong</td>" +
        '<td><a href="./?review=' + a.id + '">Review</a></td></tr>';
    }).join("");
    box.innerHTML = "<h3>Recent attempts</h3><table class='history-table'><thead><tr>" +
      "<th>Date</th><th>Exam</th><th>Score</th><th>Breakdown</th><th></th></tr></thead><tbody>" +
      rows + "</tbody></table>";
  }

  /* ---------- exam flow ---------- */
  function fetchExam(examId) {
    return fetch("data/" + examId + ".json").then(function (r) {
      if (!r.ok) throw new Error("Could not load " + examId);
      return r.json();
    });
  }
  function startExam(examId) {
    show("loading-screen");
    $("loading-text").textContent = "Retrieving questions... please wait.";
    fetchExam(examId).then(function (exam) {
      state.exam = exam;
      state.answers = exam.problems.map(function () { return null; });
      state.flags = exam.problems.map(function () { return false; });
      state.current = 0;
      state.startedAt = Date.now();
      state.endAt = Date.now() + TOTAL_SECONDS * 1000;
      state.checkpoints = {};
      state.submitted = false;
      state.attempt = null;
      saveInProgress();
      enterTest();
    }).catch(function () {
      $("loading-text").textContent = "There was an error when retrieving the problems. Check your connection and try again.";
    });
  }
  function resumeExam(ip) {
    show("loading-screen");
    fetchExam(ip.examId).then(function (exam) {
      state.exam = exam;
      state.answers = ip.answers;
      state.flags = ip.flags;
      state.current = ip.current || 0;
      state.startedAt = ip.startedAt;
      state.endAt = ip.endAt;
      state.checkpoints = ip.checkpoints || {};
      state.submitted = false;
      enterTest();
    }).catch(function () {
      $("loading-text").textContent = "There was an error when retrieving the problems. Check your connection and try again.";
    });
  }
  function enterTest() {
    show("test-screen");
    $("contest-heading-text").textContent = state.exam.exam + " Practice Test";
    buildPalette();
    renderQuestion(state.current);
    updateStats();
    window.addEventListener("beforeunload", beforeUnloadGuard);
    state.timerId = setInterval(tick, 250);
    tick();
  }
  function beforeUnloadGuard(e) {
    if (!state.submitted && state.exam) { e.preventDefault(); e.returnValue = ""; }
  }
  function elapsedSeconds() {
    return Math.max(0, Math.floor((Date.now() - state.startedAt) / 1000));
  }
  function remainingSeconds() {
    return Math.max(0, Math.floor((state.endAt - Date.now()) / 1000));
  }
  function phaseFor(elapsedMin) {
    for (var i = 0; i < PHASES.length; i++) {
      if (elapsedMin < PHASES[i].untilMin) return PHASES[i];
    }
    return PHASES[PHASES.length - 1];
  }
  function tick() {
    var rem = remainingSeconds();
    var el = elapsedSeconds();
    var timer = $("timer");
    timer.textContent = "Time Remaining: " + fmtClock(rem);
    timer.classList.toggle("low", rem <= 300 && rem > 0);
    var phase = phaseFor(el / 60);
    $("phase-label").textContent = phase.label;
    document.querySelectorAll(".mp-seg").forEach(function (seg) {
      seg.classList.toggle("active", seg.getAttribute("data-phase") === phase.id);
      var segPhase = PHASES.find(function (p) { return p.id === seg.getAttribute("data-phase"); });
      seg.classList.toggle("done", el / 60 >= segPhase.untilMin);
    });
    CHECKPOINTS.forEach(function (cp) {
      if (state.checkpoints[cp.key] == null && el >= cp.atMin * 60) {
        state.checkpoints[cp.key] = solvedCount();
        saveInProgress();
        updateCheckpointLine();
      }
    });
    if (rem <= 0) finishTest(true);
  }
  function solvedCount() {
    return state.answers.filter(function (a) { return a; }).length;
  }
  function updateStats() {
    $("solved-counter").textContent = "✓ Solved: " + solvedCount() + " / " + state.exam.problems.length;
    updateCheckpointLine();
  }
  function updateCheckpointLine() {
    var c28 = state.checkpoints["28"], c58 = state.checkpoints["58"];
    $("checkpoint-line").textContent = "Checkpoints — ✓ at 28 min: " +
      (c28 == null ? "—" : c28) + " · ✓ at 58 min: " + (c58 == null ? "—" : c58);
  }

  /* ---------- palette + question ---------- */
  function buildPalette() {
    var pal = $("palette");
    pal.innerHTML = "";
    state.exam.problems.forEach(function (p, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = p.n;
      b.setAttribute("aria-label", "Problem " + p.n);
      b.addEventListener("click", function () { goTo(i); });
      pal.appendChild(b);
    });
    updatePalette();
  }
  function updatePalette() {
    var kids = $("palette").children;
    for (var i = 0; i < kids.length; i++) {
      kids[i].classList.toggle("answered", !!state.answers[i]);
      kids[i].classList.toggle("current", i === state.current);
      kids[i].classList.toggle("flagged", !!state.flags[i]);
    }
  }
  function goTo(i) {
    if (i < 0 || i >= state.exam.problems.length) return;
    state.current = i;
    renderQuestion(i);
    saveInProgress();
  }
  function renderQuestion(i) {
    var p = state.exam.problems[i];
    state.current = i;
    $("question-number").textContent = "Problem " + p.n;
    var flagBtn = $("flag-btn");
    flagBtn.classList.toggle("flagged", !!state.flags[i]);
    flagBtn.textContent = state.flags[i] ? "⚑ Flagged — click to unflag" : "⚑ Flag for review";
    var bubbles = $("bubbles");
    bubbles.innerHTML = "";
    LETTERS.forEach(function (L) {
      var row = document.createElement("div");
      row.className = "bubble-row";
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "bubble" + (state.answers[i] === L ? " selected" : "");
      btn.textContent = L;
      btn.setAttribute("aria-label", "Answer " + L);
      btn.addEventListener("click", function () { toggleAnswer(L); });
      var choice = document.createElement("div");
      choice.className = "bubble-choice";
      choice.innerHTML = p.choices[L];
      row.appendChild(btn);
      row.appendChild(choice);
      bubbles.appendChild(row);
    });
    var body = $("problem-body");
    body.innerHTML = p.question;
    renderMath(bubbles);
    renderMath(body);
    $("prev-btn").disabled = i === 0;
    $("next-btn").disabled = i === state.exam.problems.length - 1;
    updatePalette();
  }
  function toggleAnswer(L) {
    var i = state.current;
    state.answers[i] = (state.answers[i] === L) ? null : L;
    renderQuestion(i);
    updateStats();
    saveInProgress();
  }

  /* ---------- submit / finish ---------- */
  function counts() {
    var a = 0, b = 0, w = 0;
    state.answers.forEach(function (ans, i) {
      if (!ans) b++;
      else if (ans === state.exam.problems[i].answer) a++;
      else w++;
    });
    return { correct: a, blank: b, wrong: w };
  }
  function openSubmitModal() {
    var c = counts();
    var flagged = state.flags.filter(Boolean).length;
    $("submit-modal-text").textContent =
      "Answered: " + (c.correct + c.wrong) + " · Blank: " + c.blank +
      " · Flagged for review: " + flagged + ".";
    $("submit-modal").classList.remove("hidden");
  }
  function closeSubmitModal() { $("submit-modal").classList.add("hidden"); }
  function finishTest(timedOut) {
    if (state.submitted) return;
    state.submitted = true;
    clearInterval(state.timerId);
    window.removeEventListener("beforeunload", beforeUnloadGuard);
    clearInProgress();
    var c = counts();
    var score = 6 * c.correct + 1.5 * c.blank;
    var attempt = {
      id: "a" + Date.now().toString(36),
      date: new Date().toISOString(),
      exam: state.exam.exam,
      examId: state.exam.examId,
      score: score,
      correct: c.correct,
      blank: c.blank,
      wrong: c.wrong,
      answers: state.answers.slice(),
      checkpoints: Object.assign({}, state.checkpoints),
      classifications: {},
      timedOut: !!timedOut,
    };
    var h = loadHistory();
    h.unshift(attempt);
    saveHistory(h);
    state.attempt = attempt;
    $("finished-heading-text").textContent = state.exam.exam + " End Screen";
    $("finished-score").innerHTML = "<b>Your score: " + fmtScore(score) + " / 150</b>" +
      (timedOut ? " — time ran out." : "");
    $("finished-breakdown").innerHTML =
      "Correct: <b>" + c.correct + "</b> · Blank: <b>" + c.blank + "</b> · Wrong: <b>" + c.wrong + "</b><br />" +
      "✓ at 28 min: <b>" + (attempt.checkpoints["28"] == null ? "—" : attempt.checkpoints["28"]) + "</b>" +
      " · ✓ at 58 min: <b>" + (attempt.checkpoints["58"] == null ? "—" : attempt.checkpoints["58"]) + "</b><br />" +
      "<span class='muted'>Target for AMC 10 B is 15–16 clean solves (about 100–108 points).</span>";
    closeSubmitModal();
    show("finished-screen");
    $("view-scores").onclick = function () { showReview(attempt, state.exam); };
  }

  /* ---------- review ---------- */
  function showReview(attempt, exam) {
    show("review-screen");
    $("review-heading-text").textContent = exam.exam + " Practice Results";
    $("review-score").innerHTML = "<b>Your score: " + fmtScore(attempt.score) + " / 150</b> — " +
      attempt.correct + " correct · " + attempt.blank + " blank · " + attempt.wrong + " wrong";
    var d = new Date(attempt.date);
    $("review-meta").textContent = "Taken " + d.toLocaleDateString() + " " +
      d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) +
      " · ✓ at 28 min: " + (attempt.checkpoints["28"] == null ? "—" : attempt.checkpoints["28"]) +
      " · ✓ at 58 min: " + (attempt.checkpoints["58"] == null ? "—" : attempt.checkpoints["58"]) +
      (attempt.timedOut ? " · time ran out" : "");
    renderMissSummary(attempt);
    renderAnswersTable(attempt, exam);
    renderReviewProblems(attempt, exam);
  }
  function renderMissSummary(attempt) {
    var box = $("miss-summary");
    box.dataset.attemptId = attempt.id;
    updateMissSummary(attempt);
  }
  function updateMissSummary(attempt) {
    var exam = state.exam;
    var byCause = {};
    var unlabeled = 0, missed = 0;
    attempt.answers.forEach(function (ans, i) {
      var correctAns = exam ? exam.problems[i].answer : null;
      if (ans === correctAns) return;
      missed++;
      var cause = (attempt.classifications || {})[i + 1];
      if (cause) byCause[cause] = (byCause[cause] || 0) + 1;
      else unlabeled++;
    });
    var parts = Object.keys(byCause).map(function (k) { return k + " ×" + byCause[k]; });
    if (unlabeled) parts.push("unlabeled ×" + unlabeled);
    $("miss-summary").innerHTML = missed ?
      "<b>Misses by cause (" + missed + " missed):</b> " + (parts.join(" · ") || "none labeled yet") +
      "<br /><span class='muted'>Label each miss below — the pattern (not the score alone) is what the next mock should fix.</span>" : "";
  }
  function renderAnswersTable(attempt, exam) {
    var report = $("review-answers-report");
    report.innerHTML = "";
    var table = document.createElement("table");
    table.className = "answers";
    var html = "<thead><tr><th>Problem</th><th>Your answer</th><th>Correct</th><th>Result</th><th>Miss cause</th></tr></thead><tbody>";
    exam.problems.forEach(function (p, i) {
      var ans = attempt.answers[i];
      var ok = ans === p.answer;
      var result = !ans ? "Blank" : (ok ? "Correct" : "Wrong");
      var cls = !ans ? "" : (ok ? "correct" : "wrong");
      html += "<tr><td>" + p.n + "</td><td class='" + cls + "'>" + (ans || "—") + "</td><td>" + p.answer +
        "</td><td class='" + cls + "'>" + result + "</td><td>" +
        (ok ? "" : causeSelectHtml(attempt, p.n)) + "</td></tr>";
    });
    table.innerHTML = html + "</tbody>";
    report.appendChild(table);
    report.querySelectorAll("select.cause-select").forEach(function (sel) {
      sel.addEventListener("change", function () {
        var n = parseInt(sel.getAttribute("data-problem"), 10);
        attempt.classifications[n] = sel.value || undefined;
        if (!sel.value) delete attempt.classifications[n];
        persistAttempt(attempt);
        updateMissSummary(attempt);
        syncCauseSelects(attempt);
      });
    });
  }
  function causeSelectHtml(attempt, n) {
    var cur = (attempt.classifications || {})[n] || "";
    var opts = CAUSES.map(function (c) {
      return "<option value='" + c[0] + "'" + (c[0] === cur ? " selected" : "") + ">" + c[1] + "</option>";
    }).join("");
    return "<select class='cause-select' data-problem='" + n + "'>" + opts + "</select>";
  }
  function syncCauseSelects(attempt) {
    document.querySelectorAll("select.cause-select").forEach(function (sel) {
      var n = parseInt(sel.getAttribute("data-problem"), 10);
      sel.value = (attempt.classifications || {})[n] || "";
    });
  }
  function persistAttempt(attempt) {
    var h = loadHistory();
    var idx = h.findIndex(function (a) { return a.id === attempt.id; });
    if (idx >= 0) { h[idx] = attempt; saveHistory(h); }
  }
  function renderReviewProblems(attempt, exam) {
    var wrap = $("review-problems");
    wrap.innerHTML = "";
    exam.problems.forEach(function (p, i) {
      var ans = attempt.answers[i];
      var ok = ans === p.answer;
      var status = !ans ? "blank" : (ok ? "correct" : "wrong");
      var verdict = !ans ? "Blank — correct answer " + p.answer :
        (ok ? "Correct" : "Wrong — you picked " + ans + ", correct is " + p.answer);
      var card = document.createElement("div");
      card.className = "review-problem " + status;
      var html = "<h4>Problem " + p.n + " — <span class='verdict " + status + "'>" + verdict + "</span></h4>";
      html += "<div class='problem'><div class='bubbles'>";
      LETTERS.forEach(function (L) {
        var cls = "bubble" + (ans === L ? " selected" : "");
        var choiceCls = "bubble-choice" + (L === p.answer ? " correct-choice" : (ans === L ? " wrong-choice" : ""));
        html += "<div class='bubble-row'><button type='button' class='" + cls + "' disabled>" + L +
          "</button><div class='" + choiceCls + "'>" + p.choices[L] + "</div></div>";
      });
      html += "</div><div class='problem-body'>" + p.question + "</div></div>";
      if (p.solution) {
        html += "<details class='solution'><summary>Solution</summary><div class='solution-body'>" +
          paragraphs(p.solution) + "</div></details>";
      }
      if (!ok) {
        html += "<div class='cause-row'><label>Miss cause:</label>" + causeSelectHtml(attempt, p.n) + "</div>";
      }
      card.innerHTML = html;
      wrap.appendChild(card);
    });
    renderMath(wrap);
    wrap.querySelectorAll("select.cause-select").forEach(function (sel) {
      sel.addEventListener("change", function () {
        var n = parseInt(sel.getAttribute("data-problem"), 10);
        if (!sel.value) delete attempt.classifications[n];
        else attempt.classifications[n] = sel.value;
        persistAttempt(attempt);
        updateMissSummary(attempt);
        syncCauseSelects(attempt);
      });
    });
  }

  /* ---------- review from history (?review=id) ---------- */
  function openReviewById(id) {
    var attempt = loadHistory().find(function (a) { return a.id === id; });
    if (!attempt) { initHome(); show("home-screen"); return; }
    show("loading-screen");
    fetchExam(attempt.examId).then(function (exam) {
      state.exam = exam;
      state.attempt = attempt;
      showReview(attempt, exam);
    }).catch(function () {
      $("loading-text").textContent = "Could not load that attempt's exam data.";
    });
  }

  /* ---------- wire up ---------- */
  document.addEventListener("DOMContentLoaded", function () {
    $("prev-btn").addEventListener("click", function () { goTo(state.current - 1); });
    $("next-btn").addEventListener("click", function () { goTo(state.current + 1); });
    $("flag-btn").addEventListener("click", function () {
      state.flags[state.current] = !state.flags[state.current];
      renderQuestion(state.current);
      saveInProgress();
    });
    $("submit-btn").addEventListener("click", openSubmitModal);
    $("modal-cancel").addEventListener("click", closeSubmitModal);
    $("modal-confirm").addEventListener("click", function () { finishTest(false); });
    $("back-home-1").addEventListener("click", function () { initHome(); show("home-screen"); });
    $("back-home-2").addEventListener("click", function () { initHome(); show("home-screen"); });
    document.addEventListener("keydown", function (e) {
      if ($("test-screen").classList.contains("hidden")) return;
      if ($("submit-modal").classList.contains("hidden") === false) return;
      var k = e.key.toLowerCase();
      if (LETTERS.map(function (l) { return l.toLowerCase(); }).indexOf(k) >= 0) {
        toggleAnswer(k.toUpperCase());
      } else if (e.key === "ArrowLeft") { goTo(state.current - 1); }
      else if (e.key === "ArrowRight") { goTo(state.current + 1); }
      else if (k === "f") { $("flag-btn").click(); }
    });
    var params = new URLSearchParams(window.location.search);
    var reviewId = params.get("review");
    if (reviewId) openReviewById(reviewId);
    else { initHome(); show("home-screen"); }
  });
})();
