/**
 * Generate a self-contained HTML review tool for paper-tips draft.
 *
 * Output: reports/tips-review.html
 *   Inline cả questions.json + paper-tips-draft.json để mở bằng browser
 *   không cần server. Lưu quyết định Accept/Reject vào localStorage.
 *   Khi xong, bấm "Export" → tải tips-decisions.json để apply.
 *
 * Usage:
 *   npm run review:tips
 *   → mở reports/tips-review.html bằng browser
 */

import fs from "node:fs";
import path from "node:path";

const QUESTIONS_PATH = path.join("src", "data", "questions.json");
const DRAFT_PATH = path.join("reports", "paper-tips-draft.json");
const OUT_PATH = path.join("reports", "tips-review.html");

if (!fs.existsSync(DRAFT_PATH)) {
  console.error(`Cần file ${DRAFT_PATH}. Chạy ingest paper-notes trước.`);
  process.exit(1);
}

const questions = JSON.parse(fs.readFileSync(QUESTIONS_PATH, "utf8"));
const drafts = JSON.parse(fs.readFileSync(DRAFT_PATH, "utf8"));

// Index questions by id for fast lookup
const qById = Object.fromEntries(questions.map((q) => [q.id, q]));

// Trim down data injected into HTML to keep file size small.
const slimQuestions = {};
for (const d of drafts) {
  const q = qById[d.questionId];
  if (q) {
    slimQuestions[q.id] = {
      id: q.id,
      chapter: q.chapter,
      question: q.question,
      answers: q.answers,
      correctAnswer: q.correctAnswer,
      critical: q.critical,
      hasImage: Boolean(q.image),
      currentMemoryTip: q.memoryTip || "",
    };
  }
}

const html = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<title>GPLX — Review paper-tips drafts</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="https://cdn.tailwindcss.com"></script>
<style>
  body { font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  .kbd { font-family: monospace; background:#e2e8f0; padding:2px 6px; border-radius:4px; font-size:12px; }
  .card { transition: all 0.15s; }
  .card.accepted { border-color: #10b981; background: #ecfdf5; }
  .card.rejected { border-color: #ef4444; background: #fef2f2; opacity: 0.55; }
  .card.edited { border-color: #f59e0b; background: #fffbeb; }
</style>
</head>
<body class="bg-slate-50 text-slate-900">

<div id="root" class="mx-auto max-w-5xl px-4 py-6">
  <header class="mb-6 rounded-lg bg-white border border-slate-200 p-5">
    <h1 class="text-2xl font-bold">Review paper-tips drafts</h1>
    <p class="text-sm text-slate-600 mt-2">
      Duyệt từng câu, quyết định Accept / Reject / Edit memoryTip đề xuất. Quyết định lưu localStorage.
    </p>
    <div class="mt-4 grid gap-3 sm:grid-cols-4 text-sm">
      <div class="rounded bg-slate-50 p-3"><div class="text-slate-500">Tổng</div><div id="stat-total" class="text-xl font-semibold"></div></div>
      <div class="rounded bg-emerald-50 p-3"><div class="text-emerald-700">Accepted</div><div id="stat-accepted" class="text-xl font-semibold text-emerald-800"></div></div>
      <div class="rounded bg-red-50 p-3"><div class="text-red-700">Rejected</div><div id="stat-rejected" class="text-xl font-semibold text-red-800"></div></div>
      <div class="rounded bg-amber-50 p-3"><div class="text-amber-700">Edited</div><div id="stat-edited" class="text-xl font-semibold text-amber-800"></div></div>
    </div>
    <div class="mt-4 flex flex-wrap items-center gap-2">
      <label class="text-sm font-medium">Lọc:</label>
      <select id="filter-status" class="rounded border-slate-200 text-sm px-2 py-1 border">
        <option value="all">Tất cả</option>
        <option value="pending">Chưa quyết</option>
        <option value="accepted">Accepted</option>
        <option value="rejected">Rejected</option>
        <option value="edited">Edited</option>
      </select>
      <select id="filter-chapter" class="rounded border-slate-200 text-sm px-2 py-1 border">
        <option value="all">Mọi chương</option>
        <option value="1">Chương 1</option>
        <option value="2">Chương 2</option>
        <option value="3">Chương 3</option>
        <option value="4">Chương 4</option>
        <option value="5">Chương 5</option>
        <option value="6">Chương 6</option>
      </select>
      <select id="filter-topic" class="rounded border-slate-200 text-sm px-2 py-1 border"></select>
      <button id="reset-all" class="ml-auto rounded bg-slate-200 hover:bg-slate-300 text-sm px-3 py-1">Reset all decisions</button>
      <button id="export" class="rounded bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium px-4 py-1.5">Export decisions JSON</button>
    </div>
    <p class="mt-3 text-xs text-slate-500">
      Shortcut khi focus card: <span class="kbd">A</span> Accept · <span class="kbd">R</span> Reject · <span class="kbd">E</span> Edit · <span class="kbd">J/↓</span> Next · <span class="kbd">K/↑</span> Prev
    </p>
  </header>

  <div id="list" class="grid gap-4"></div>

  <footer class="mt-8 text-center text-xs text-slate-400">
    Quyết định lưu trong <span class="kbd">localStorage</span> (key: gplx-tips-decisions). Export để chạy apply script.
  </footer>
</div>

<script>
const QUESTIONS = ${JSON.stringify(slimQuestions)};
const DRAFTS = ${JSON.stringify(drafts)};
const STORAGE_KEY = "gplx-tips-decisions-v1";

// State: { [questionId+'_'+chunkId]: { status: 'accepted'|'rejected'|'edited', editedTip?: string } }
let decisions = {};
try { decisions = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}"); } catch (e) {}

function entryKey(d) { return d.questionId + "_" + d.chunkId; }
function saveDecisions() { localStorage.setItem(STORAGE_KEY, JSON.stringify(decisions)); renderStats(); }

const listEl = document.getElementById("list");
const filterStatus = document.getElementById("filter-status");
const filterChapter = document.getElementById("filter-chapter");
const filterTopic = document.getElementById("filter-topic");

// Populate topic filter
const topics = [...new Set(DRAFTS.map(d => d.topic || "(no topic)"))].sort();
filterTopic.innerHTML = '<option value="all">Mọi topic</option>' + topics.map(t => '<option value="' + escapeAttr(t) + '">' + escapeHTML(t) + '</option>').join("");

function escapeHTML(s) { return String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
function escapeAttr(s) { return String(s).replace(/"/g, "&quot;"); }

function statusOf(d) {
  return decisions[entryKey(d)]?.status || "pending";
}
function tipFor(d) {
  const dec = decisions[entryKey(d)];
  if (dec?.status === "edited" && dec.editedTip) return dec.editedTip;
  return d.tipText;
}

function renderStats() {
  document.getElementById("stat-total").textContent = DRAFTS.length;
  let a=0,r=0,e=0;
  for (const d of DRAFTS) {
    const s = statusOf(d);
    if (s==="accepted") a++; else if (s==="rejected") r++; else if (s==="edited") e++;
  }
  document.getElementById("stat-accepted").textContent = a;
  document.getElementById("stat-rejected").textContent = r;
  document.getElementById("stat-edited").textContent = e;
}

function renderCards() {
  const fs = filterStatus.value;
  const fc = filterChapter.value;
  const ft = filterTopic.value;
  listEl.innerHTML = "";
  let visible = 0;
  for (let i=0; i<DRAFTS.length; i++) {
    const d = DRAFTS[i];
    const q = QUESTIONS[d.questionId];
    if (!q) continue;
    const status = statusOf(d);
    if (fs !== "all" && fs !== status) continue;
    if (fc !== "all" && String(q.chapter) !== fc) continue;
    if (ft !== "all" && (d.topic || "(no topic)") !== ft) continue;
    listEl.appendChild(renderCard(d, q, i, status));
    visible++;
  }
  if (visible === 0) listEl.innerHTML = '<div class="rounded bg-white border border-slate-200 p-6 text-center text-slate-500">Không có entry phù hợp.</div>';
}

function renderCard(d, q, idx, status) {
  const card = document.createElement("div");
  card.className = "card rounded-lg border border-slate-200 bg-white p-5";
  card.classList.add(status);
  card.tabIndex = 0;
  card.dataset.idx = idx;

  const tipText = tipFor(d);
  const matchPct = Math.round((d.matchScore || 0) * 100);

  card.innerHTML = \`
    <div class="flex flex-wrap items-center gap-2 mb-3 text-xs">
      <span class="rounded bg-slate-100 px-2 py-0.5 font-mono">Câu \${q.id}</span>
      <span class="rounded bg-slate-100 px-2 py-0.5">Chương \${q.chapter}</span>
      \${q.critical ? '<span class="rounded bg-amber-100 text-amber-900 px-2 py-0.5">Điểm liệt</span>' : ""}
      <span class="rounded bg-indigo-100 text-indigo-900 px-2 py-0.5">\${escapeHTML(d.topic || "(no topic)")}</span>
      <span class="rounded bg-slate-100 px-2 py-0.5">match \${matchPct}%</span>
      <span class="rounded bg-slate-100 px-2 py-0.5">page \${d.page ?? "?"}</span>
      \${q.hasImage ? '<span class="rounded bg-slate-100 px-2 py-0.5">📷 có hình</span>' : ""}
      <span class="ml-auto rounded px-2 py-0.5 \${status==='accepted'?'bg-emerald-200 text-emerald-900':status==='rejected'?'bg-red-200 text-red-900':status==='edited'?'bg-amber-200 text-amber-900':'bg-slate-200 text-slate-700'}">\${status}</span>
    </div>

    <h3 class="font-semibold leading-7">\${escapeHTML(q.question)}</h3>
    <ul class="mt-2 grid gap-1 text-sm">
      \${q.answers.map((a, i) => \`
        <li class="rounded px-2 py-1 \${i === q.correctAnswer ? 'bg-emerald-50 text-emerald-900 font-medium' : 'text-slate-700'}">
          \${i === q.correctAnswer ? '✅ ' : ''}\${String.fromCharCode(65+i)}. \${escapeHTML(a)}
        </li>
      \`).join("")}
    </ul>

    \${q.currentMemoryTip ? \`
      <div class="mt-3 rounded bg-slate-100 px-3 py-2 text-xs text-slate-600">
        <span class="font-semibold">memoryTip hiện có:</span> \${escapeHTML(q.currentMemoryTip)}
      </div>
    \` : ""}

    <div class="mt-3 rounded border border-amber-200 bg-amber-50 p-3">
      <div class="text-xs font-semibold text-amber-900 mb-1">Tip đề xuất:</div>
      <textarea class="tip-edit w-full bg-transparent text-sm text-amber-950 leading-6 resize-none focus:outline-none focus:ring-1 focus:ring-amber-400 rounded p-1" rows="3">\${escapeHTML(tipText)}</textarea>
    </div>

    <div class="mt-3 flex gap-2">
      <button data-act="accept" class="flex-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium py-2">Accept <span class="kbd">A</span></button>
      <button data-act="edit" class="flex-1 rounded bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium py-2">Edit <span class="kbd">E</span></button>
      <button data-act="reject" class="flex-1 rounded bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-2">Reject <span class="kbd">R</span></button>
    </div>
  \`;

  const onAction = (act) => {
    const ta = card.querySelector(".tip-edit");
    const key = entryKey(d);
    if (act === "accept") decisions[key] = { status: "accepted" };
    else if (act === "reject") decisions[key] = { status: "rejected" };
    else if (act === "edit") decisions[key] = { status: "edited", editedTip: ta.value.trim() };
    saveDecisions();
    card.className = "card rounded-lg border border-slate-200 bg-white p-5 " + decisions[key].status;
    const badge = card.querySelector(".ml-auto");
    if (badge) {
      const s = decisions[key].status;
      badge.className = "ml-auto rounded px-2 py-0.5 " + (s==='accepted'?'bg-emerald-200 text-emerald-900':s==='rejected'?'bg-red-200 text-red-900':'bg-amber-200 text-amber-900');
      badge.textContent = s;
    }
  };

  card.querySelectorAll("button[data-act]").forEach(btn => {
    btn.addEventListener("click", () => onAction(btn.dataset.act));
  });

  card.addEventListener("keydown", (ev) => {
    if (ev.target.tagName === "TEXTAREA") return;
    if (ev.key === "a" || ev.key === "A") { ev.preventDefault(); onAction("accept"); focusNext(card); }
    else if (ev.key === "r" || ev.key === "R") { ev.preventDefault(); onAction("reject"); focusNext(card); }
    else if (ev.key === "e" || ev.key === "E") { ev.preventDefault(); card.querySelector(".tip-edit").focus(); }
    else if (ev.key === "j" || ev.key === "ArrowDown") { ev.preventDefault(); focusNext(card); }
    else if (ev.key === "k" || ev.key === "ArrowUp") { ev.preventDefault(); focusPrev(card); }
  });

  return card;
}

function focusNext(card) {
  const next = card.nextElementSibling;
  if (next) { next.focus(); next.scrollIntoView({block:"center", behavior:"smooth"}); }
}
function focusPrev(card) {
  const prev = card.previousElementSibling;
  if (prev) { prev.focus(); prev.scrollIntoView({block:"center", behavior:"smooth"}); }
}

[filterStatus, filterChapter, filterTopic].forEach(el => el.addEventListener("change", renderCards));

document.getElementById("reset-all").addEventListener("click", () => {
  if (!confirm("Xoá toàn bộ quyết định đã lưu?")) return;
  decisions = {};
  saveDecisions();
  renderCards();
});

document.getElementById("export").addEventListener("click", () => {
  const out = [];
  for (const d of DRAFTS) {
    const key = entryKey(d);
    const dec = decisions[key];
    if (!dec) continue;
    const entry = {
      questionId: d.questionId,
      chunkId: d.chunkId,
      topic: d.topic,
      status: dec.status,
    };
    if (dec.status === "accepted") entry.tipText = d.tipText;
    else if (dec.status === "edited") entry.tipText = dec.editedTip;
    out.push(entry);
  }
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "tips-decisions.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

renderStats();
renderCards();
</script>
</body>
</html>`;

fs.writeFileSync(OUT_PATH, html, "utf8");
const sizeKB = Math.round(html.length / 1024);
console.log(`✅ ${OUT_PATH} (${sizeKB} KB, ${drafts.length} drafts inline)`);
console.log(`→ Mở file đó bằng browser. Quyết định lưu localStorage, bấm Export để tải tips-decisions.json.`);
