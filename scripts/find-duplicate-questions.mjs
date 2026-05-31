/**
 * Tìm tất cả nhóm câu trong questions.json có question text trùng nhau.
 *
 * Quan trọng vì fuzzy match khi ingest captures có thể nhầm câu nếu nhiều câu
 * cùng question text — và tiebreaker answer-set cũng có thể fail khi answers overlap.
 *
 * Usage:
 *   npm run find:duplicates
 *
 * Output:
 *   - In ra console danh sách nhóm duplicate
 *   - Ghi reports/duplicate-questions.json để debug
 */

import fs from "node:fs";
import path from "node:path";

const DATA_PATH = path.join("src", "data", "questions.json");
const OUT = path.join("reports", "duplicate-questions.json");

const raw = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));

// Normalize text giống logic fuzzy match: lowercase, remove diacritics, punctuation, whitespace.
function normalize(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const buckets = new Map();
for (const q of raw) {
  const key = normalize(q.question);
  if (!buckets.has(key)) buckets.set(key, []);
  buckets.get(key).push(q);
}

const duplicates = [];
for (const [, group] of buckets) {
  if (group.length > 1) duplicates.push(group);
}

duplicates.sort((a, b) => b.length - a.length);

// Build report.
const report = duplicates.map((group) => ({
  count: group.length,
  questionText: group[0].question,
  ids: group.map((q) => q.id),
  chapters: [...new Set(group.map((q) => q.chapter))],
  criticals: group.map((q) => ({ id: q.id, critical: q.critical })),
  correctAnswers: group.map((q) => ({
    id: q.id,
    correctAnswer: q.correctAnswer,
    text: q.answers[q.correctAnswer],
  })),
  answerOverlap: computeAnswerOverlap(group),
}));

function computeAnswerOverlap(group) {
  const allAnswers = group.map((q) => new Set(q.answers.map(normalize)));
  let totalPairs = 0;
  let overlapPairs = 0;
  for (let i = 0; i < group.length; i += 1) {
    for (let j = i + 1; j < group.length; j += 1) {
      for (const a of allAnswers[i]) {
        totalPairs += 1;
        if (allAnswers[j].has(a)) overlapPairs += 1;
      }
    }
  }
  return totalPairs ? Math.round((overlapPairs / totalPairs) * 100) / 100 : 0;
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2), "utf8");

// Console summary.
console.log(`Tổng số câu: ${raw.length}`);
console.log(`Số nhóm duplicate question text: ${duplicates.length}`);
console.log(`Tổng số câu nằm trong nhóm duplicate: ${duplicates.reduce((sum, g) => sum + g.length, 0)}`);
console.log();
console.log("Top 10 nhóm duplicate (sắp theo size giảm dần):");
console.log();
report.slice(0, 10).forEach((entry, index) => {
  const preview = entry.questionText.replace(/\s+/g, " ").slice(0, 80);
  console.log(`  ${index + 1}. [${entry.count}x] ids=${entry.ids.join(",")} ch=${entry.chapters.join(",")} overlap=${entry.answerOverlap}`);
  console.log(`     "${preview}${preview.length >= 80 ? "…" : ""}"`);
});

console.log();
console.log(`Full report: ${OUT}`);
