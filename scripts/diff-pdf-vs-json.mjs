/**
 * So sánh correctAnswer giữa PDF chính thức (extract qua scripts/extract-pdf-answers.py)
 * và src/data/questions.json hiện tại.
 *
 * Mục đích: tìm các câu mà JSON có correctAnswer khác PDF gốc → cần fix.
 *
 * Cần chạy trước:
 *   python3 scripts/extract-pdf-answers.py
 *
 * Output:
 *   reports/pdf-vs-json-diff.json — list các câu mismatch
 *   reports/pdf-vs-json-summary.md — báo cáo cho user
 */

import fs from "node:fs";
import path from "node:path";

const PDF_ANSWERS_PATH = path.join("reports", "pdf-correct-answers.json");
const QUESTIONS_PATH = path.join("src", "data", "questions.json");
const OUT_DIFF = path.join("reports", "pdf-vs-json-diff.json");
const OUT_SUMMARY = path.join("reports", "pdf-vs-json-summary.md");

if (!fs.existsSync(PDF_ANSWERS_PATH)) {
  console.error(`Chưa có ${PDF_ANSWERS_PATH}. Chạy: python3 scripts/extract-pdf-answers.py`);
  process.exit(1);
}

const pdfAnswers = JSON.parse(fs.readFileSync(PDF_ANSWERS_PATH, "utf8"));
const questions = JSON.parse(fs.readFileSync(QUESTIONS_PATH, "utf8"));
const byId = new Map(questions.map((q) => [q.id, q]));

function normalize(text) {
  return (text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function similarity(a, b) {
  // Token Jaccard
  const ta = new Set(a.split(/\s+/));
  const tb = new Set(b.split(/\s+/));
  const inter = [...ta].filter((t) => tb.has(t)).length;
  const union = new Set([...ta, ...tb]).size;
  return union ? inter / union : 0;
}

const matches = [];
const mismatches = [];
const indexMismatchOnly = []; // PDF says index X, JSON says Y, but JSON.answers[X] text matches PDF text
const textMismatch = [];
const missingInJson = [];
const missingInPdf = [];

for (const [pdfIdStr, pdfData] of Object.entries(pdfAnswers)) {
  const id = Number(pdfIdStr);
  const q = byId.get(id);
  if (!q) {
    missingInJson.push({ pdfId: id, pdfData });
    continue;
  }

  const pdfIdx = pdfData.correctIndex;
  const pdfText = pdfData.answerText.trim();
  const pdfNorm = normalize(pdfText);

  const jsonIdx = q.correctAnswer;
  const jsonAnswerTextAtPdfIdx = q.answers[pdfIdx] || "";
  const jsonNormAtPdfIdx = normalize(jsonAnswerTextAtPdfIdx);

  // Tính sim giữa PDF text và JSON's answer at PDF's index
  const simAtPdfIdx = similarity(pdfNorm, jsonNormAtPdfIdx);

  // Cũng tìm index khớp text nhất trong JSON answers
  let bestIdx = -1;
  let bestSim = 0;
  for (let i = 0; i < q.answers.length; i += 1) {
    const sim = similarity(pdfNorm, normalize(q.answers[i]));
    if (sim > bestSim) {
      bestSim = sim;
      bestIdx = i;
    }
  }

  if (pdfIdx === jsonIdx) {
    // Same index → just verify text agrees
    matches.push({ id, pdfIdx, jsonIdx, simAtPdfIdx });
    continue;
  }

  // Index khác nhau
  if (simAtPdfIdx >= 0.8) {
    // JSON's answer at PDF's index DOES match PDF text → JSON's correctAnswer index is WRONG
    indexMismatchOnly.push({
      id,
      chapter: q.chapter,
      pdfIdx,
      jsonIdx,
      pdfText,
      jsonAnswerAtPdfIdx: jsonAnswerTextAtPdfIdx,
      jsonAnswerAtJsonIdx: q.answers[jsonIdx],
      simAtPdfIdx,
    });
  } else if (bestIdx === jsonIdx && bestSim >= 0.8) {
    // JSON's answer at JSON's index matches PDF text best → maybe PDF order differs
    textMismatch.push({
      id,
      chapter: q.chapter,
      pdfIdx,
      jsonIdx,
      pdfText,
      jsonAnswerAtPdfIdx: jsonAnswerTextAtPdfIdx,
      jsonAnswerAtJsonIdx: q.answers[jsonIdx],
      simAtPdfIdx,
      bestIdx,
      bestSim,
      note: "PDF text matches JSON.answers[jsonIdx] best — có thể PDF in thứ tự khác. Cần verify thủ công.",
    });
  } else {
    mismatches.push({
      id,
      chapter: q.chapter,
      pdfIdx,
      jsonIdx,
      pdfText,
      jsonAnswerAtPdfIdx: jsonAnswerTextAtPdfIdx,
      jsonAnswerAtJsonIdx: q.answers[jsonIdx],
      simAtPdfIdx,
      bestIdx,
      bestSim,
    });
  }
}

// Tìm câu có trong JSON nhưng không có trong PDF result
for (const q of questions) {
  if (!(String(q.id) in pdfAnswers)) {
    missingInPdf.push({ id: q.id, chapter: q.chapter });
  }
}

const report = {
  matches: matches.length,
  indexMismatchOnly,
  textMismatch,
  mismatches,
  missingInJson,
  missingInPdf,
};

fs.writeFileSync(OUT_DIFF, JSON.stringify(report, null, 2), "utf8");

const md = [
  "# PDF vs JSON correctAnswer diff",
  "",
  `> Generated: ${new Date().toISOString()}`,
  "",
  "## Tổng kết",
  "",
  `- PDF câu trích được: ${Object.keys(pdfAnswers).length} / 600`,
  `- JSON câu: ${questions.length}`,
  `- ✅ Khớp (index giống nhau): ${matches.length}`,
  `- ⚠️ **Index sai trong JSON** (auto-fixable, ${indexMismatchOnly.length} câu)`,
  `- ⚠️ Text mismatch (cần review, ${textMismatch.length} câu)`,
  `- ❌ Mismatch hoàn toàn (${mismatches.length} câu)`,
  `- 🆖 Trong PDF nhưng không trong JSON: ${missingInJson.length}`,
  `- 🆖 Trong JSON nhưng không trong PDF (image-only?): ${missingInPdf.length}`,
  "",
  "## Câu cần fix tự động (index khác, text khớp)",
  "",
  "Đây là các câu **safe to auto-fix** — JSON `correctAnswer` chỉ vào index sai, nhưng text tại PDF's index khớp với PDF.",
  "",
  ...(indexMismatchOnly.length
    ? indexMismatchOnly.map((e) => `- **Câu ${e.id}** (ch.${e.chapter}): JSON correctAnswer ${e.jsonIdx} → **${e.pdfIdx}** (sim ${e.simAtPdfIdx.toFixed(2)})`)
    : ["_Không có câu nào_"]),
  "",
  "## Câu cần review thủ công (text mismatch)",
  "",
  ...(textMismatch.length
    ? textMismatch.flatMap((e) => [
        `### Câu ${e.id} (ch.${e.chapter})`,
        `- PDF correctIndex: ${e.pdfIdx}`,
        `- PDF text: "${e.pdfText.slice(0, 150)}…"`,
        `- JSON.answers[${e.pdfIdx}]: "${e.jsonAnswerAtPdfIdx.slice(0, 150)}…"`,
        `- JSON.answers[${e.jsonIdx}] (current): "${e.jsonAnswerAtJsonIdx.slice(0, 150)}…"`,
        `- Note: ${e.note}`,
        "",
      ])
    : ["_Không có câu nào_"]),
  "",
  "## Câu mismatch hoàn toàn",
  "",
  ...(mismatches.length
    ? mismatches.flatMap((e) => [
        `### Câu ${e.id} (ch.${e.chapter})`,
        `- PDF: idx ${e.pdfIdx} text "${e.pdfText.slice(0, 100)}…"`,
        `- JSON: idx ${e.jsonIdx} text "${e.jsonAnswerAtJsonIdx.slice(0, 100)}…"`,
        `- Best sim ${e.bestSim.toFixed(2)} at JSON idx ${e.bestIdx}`,
        "",
      ])
    : ["_Không có câu nào_"]),
  "",
  "## Câu missing trong PDF (có thể là chương 5 biển báo, image-only)",
  "",
  missingInPdf.length
    ? `IDs: ${missingInPdf.map((e) => e.id).join(", ")}`
    : "_Không có_",
  "",
].join("\n");

fs.writeFileSync(OUT_SUMMARY, md, "utf8");

console.log(JSON.stringify(
  {
    matches: matches.length,
    indexMismatchOnly: indexMismatchOnly.length,
    textMismatch: textMismatch.length,
    mismatches: mismatches.length,
    missingInJson: missingInJson.length,
    missingInPdf: missingInPdf.length,
    outputs: [OUT_DIFF, OUT_SUMMARY],
  },
  null,
  2,
));
