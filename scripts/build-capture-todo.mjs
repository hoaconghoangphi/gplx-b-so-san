/**
 * Generate a prioritized capture to-do list from src/data/questions.json.
 *
 * Output:
 *   docs/capture-todo.md  — human-readable checklist
 *   docs/capture-todo.json — machine-readable tiering
 *
 * Tiers:
 *   A. critical (điểm liệt) — must capture
 *   B. contains hard data (numbers + unit) — should capture
 *   C. chapter 6 sa hình + has image — capture when convenient
 *
 * A question that already has an explanation from "official-capture" +
 * explanationReview === "verified" is removed from the list automatically.
 */

import fs from "node:fs";
import path from "node:path";

const DATA_PATH = path.join("src", "data", "questions.json");
const OUT_MD = path.join("docs", "capture-todo.md");
const OUT_JSON = path.join("docs", "capture-todo.json");

// Pattern that marks a question as containing legally-binding numeric data.
// Numbers paired with a unit. "lần" and "điểm" are intentionally excluded
// because they generate too many false positives ("02 lần vận chuyển", "0 điểm").
const DATA_PATTERN =
  /(\d+([.,]\d+)?\s*(km\/h|km|cm|mm|m\b|%|năm|tháng|tuần|ngày|giờ|phút|giây|mg\b|ml|kg|tấn|tuổi|chỗ|người|đồng|triệu|nghìn|tỷ))/i;

function hasHardData(question) {
  if (DATA_PATTERN.test(question.question)) return true;
  return question.answers.some((answer) => DATA_PATTERN.test(answer));
}

function isAlreadyVerified(question) {
  return (
    question.explanationSource === "official-capture" &&
    question.explanationReview === "verified" &&
    Boolean(question.explanation?.trim())
  );
}

function classify(question) {
  if (isAlreadyVerified(question)) return null;
  if (question.critical) return "A";
  if (hasHardData(question)) return "B";
  if (question.chapter === 6 && question.image) return "C";
  return null;
}

function answerLetter(index) {
  return String.fromCharCode(65 + index);
}

function questionBlock(question) {
  const lines = [];
  lines.push(`### Câu ${question.id} — Chương ${question.chapter}`);
  lines.push("");
  lines.push(`**Hỏi:** ${question.question.replace(/\s+/g, " ").trim()}`);
  lines.push("");
  question.answers.forEach((answer, index) => {
    const marker = index === question.correctAnswer ? " ✅" : "";
    lines.push(`- ${answerLetter(index)}. ${answer.replace(/\s+/g, " ").trim()}${marker}`);
  });
  if (question.image) {
    lines.push("");
    lines.push(`> Có hình: \`${question.image}\``);
  }
  lines.push("");
  return lines.join("\n");
}

function tierSection(title, summary, list) {
  const out = [];
  out.push(`## ${title} (${list.length} câu)`);
  out.push("");
  out.push(summary);
  out.push("");
  if (!list.length) {
    out.push("_Không còn câu nào trong tier này._");
    out.push("");
    return out.join("\n");
  }
  out.push("Checklist nhanh:");
  out.push("");
  list.forEach((question) => {
    const preview = question.question.replace(/\s+/g, " ").trim().slice(0, 70);
    out.push(`- [ ] **Câu ${question.id}** (Ch.${question.chapter}) — ${preview}${preview.length === 70 ? "…" : ""}`);
  });
  out.push("");
  out.push("---");
  out.push("");
  list.forEach((question) => {
    out.push(questionBlock(question));
    out.push("---");
    out.push("");
  });
  return out.join("\n");
}

const raw = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
const buckets = { A: [], B: [], C: [] };

for (const question of raw) {
  const tier = classify(question);
  if (tier) buckets[tier].push(question);
}

for (const tier of Object.keys(buckets)) {
  buckets[tier].sort((a, b) => a.id - b.id);
}

const total = buckets.A.length + buckets.B.length + buckets.C.length;

const md = [
  "# Capture To-Do — Câu cần chụp từ hệ thống chính thức",
  "",
  `> Generated: ${new Date().toISOString()}`,
  "",
  `**Tổng cần capture:** ${total} câu`,
  "",
  `- Tier A (điểm liệt): ${buckets.A.length}`,
  `- Tier B (có số liệu): ${buckets.B.length}`,
  `- Tier C (sa hình ch.6 có hình): ${buckets.C.length}`,
  "",
  "Câu đã có `explanationSource=\"official-capture\"` + `explanationReview=\"verified\"` được loại tự động khỏi list.",
  "",
  "Xem `docs/capture-guide.md` để biết cách chụp.",
  "",
  tierSection(
    "Tier A — Điểm liệt (bắt buộc)",
    "Sai 1 câu trong nhóm này là trượt thi. Mọi câu ở đây phải có explanation chính thức từ hệ thống, verified.",
    buckets.A,
  ),
  tierSection(
    "Tier B — Có số liệu / mốc luật",
    "Câu chứa số đi kèm đơn vị (km/h, m, %, năm, tháng, mg, kg, tuổi, đồng, …). AI không được đoán — phải có nguồn chính thức.",
    buckets.B,
  ),
  tierSection(
    "Tier C — Sa hình phức tạp có hình (chương 6)",
    "Câu sa hình mà hình minh hoạ có nhiều xe/hướng đi. Diễn giải bằng chữ thường không đủ rõ.",
    buckets.C,
  ),
].join("\n");

fs.mkdirSync(path.dirname(OUT_MD), { recursive: true });
fs.writeFileSync(OUT_MD, md, "utf8");

const json = {
  generatedAt: new Date().toISOString(),
  total,
  tiers: {
    A: buckets.A.map((q) => ({ id: q.id, chapter: q.chapter, question: q.question, hasImage: Boolean(q.image) })),
    B: buckets.B.map((q) => ({ id: q.id, chapter: q.chapter, question: q.question, hasImage: Boolean(q.image) })),
    C: buckets.C.map((q) => ({ id: q.id, chapter: q.chapter, question: q.question, hasImage: Boolean(q.image) })),
  },
};
fs.writeFileSync(OUT_JSON, JSON.stringify(json, null, 2), "utf8");

console.log(
  JSON.stringify(
    {
      total,
      tierA: buckets.A.length,
      tierB: buckets.B.length,
      tierC: buckets.C.length,
      outputs: [OUT_MD, OUT_JSON],
    },
    null,
    2,
  ),
);
