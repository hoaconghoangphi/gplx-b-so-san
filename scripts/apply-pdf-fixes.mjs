/**
 * Apply correctAnswer fixes từ reports/pdf-vs-json-diff.json vào src/data/questions.json.
 *
 * Mặc định CHỈ apply nhóm `indexMismatchOnly` (auto-fixable: text khớp, chỉ index sai).
 * Các nhóm khác (textMismatch, mismatches) giữ nguyên — yêu cầu user xử lý thủ công.
 *
 * Để override: pass `--include-text-mismatch` để apply cả textMismatch.
 *
 * Cần chạy trước:
 *   npm run extract:pdf
 *   npm run diff:pdf-json
 *
 * Usage:
 *   npm run apply:pdf-fixes
 *   npm run apply:pdf-fixes -- --dry-run
 */

import fs from "node:fs";
import path from "node:path";

const DIFF_PATH = path.join("reports", "pdf-vs-json-diff.json");
const QUESTIONS_PATH = path.join("src", "data", "questions.json");
const BACKUP_PATH = path.join("reports", "questions-before-pdf-fix.json");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const includeTextMismatch = args.includes("--include-text-mismatch");

if (!fs.existsSync(DIFF_PATH)) {
  console.error(`Chưa có ${DIFF_PATH}. Chạy trước:`);
  console.error(`  python3 scripts/extract-pdf-answers.py`);
  console.error(`  node scripts/diff-pdf-vs-json.mjs`);
  process.exit(1);
}

const diff = JSON.parse(fs.readFileSync(DIFF_PATH, "utf8"));
const questions = JSON.parse(fs.readFileSync(QUESTIONS_PATH, "utf8"));

const targets = [...(diff.indexMismatchOnly || [])];
if (includeTextMismatch) {
  targets.push(...(diff.textMismatch || []));
}

if (!targets.length) {
  console.log("Không có câu nào để fix.");
  process.exit(0);
}

// Backup before changes
if (!dryRun) {
  fs.mkdirSync(path.dirname(BACKUP_PATH), { recursive: true });
  fs.copyFileSync(QUESTIONS_PATH, BACKUP_PATH);
  console.log(`Backup saved: ${BACKUP_PATH}`);
}

const idMap = new Map(questions.map((q, i) => [q.id, i]));
const changes = [];

for (const t of targets) {
  const idx = idMap.get(t.id);
  if (idx === undefined) {
    console.warn(`Câu ${t.id} không có trong JSON, skip`);
    continue;
  }
  const q = questions[idx];
  const oldVal = q.correctAnswer;
  const newVal = t.pdfIdx;

  if (oldVal === newVal) continue;

  // Sanity: pdfIdx must be in range
  if (newVal < 0 || newVal >= q.answers.length) {
    console.warn(`Câu ${t.id}: pdfIdx ${newVal} ngoài range answers (${q.answers.length}), skip`);
    continue;
  }

  changes.push({ id: t.id, chapter: q.chapter, from: oldVal, to: newVal });
  q.correctAnswer = newVal;
}

console.log(`\nDry-run: ${dryRun}`);
console.log(`Sẽ apply ${changes.length} thay đổi:`);
changes.slice(0, 20).forEach((c) => {
  console.log(`  Câu ${c.id} (ch.${c.chapter}): ${c.from} → ${c.to}`);
});
if (changes.length > 20) console.log(`  …và ${changes.length - 20} câu khác`);

if (dryRun) {
  console.log("\n(dry-run, không ghi file)");
  process.exit(0);
}

// Write back — single shot with verify
const content = JSON.stringify(questions, null, 2) + "\n";
fs.writeFileSync(QUESTIONS_PATH, content, "utf8");

// Verify
try {
  const reparsed = JSON.parse(fs.readFileSync(QUESTIONS_PATH, "utf8"));
  if (reparsed.length !== 600) {
    console.error(`Verify FAIL: re-parsed length ${reparsed.length} ≠ 600. Restoring backup.`);
    fs.copyFileSync(BACKUP_PATH, QUESTIONS_PATH);
    process.exit(1);
  }
  console.log(`\n✅ Applied ${changes.length} fixes. Verified 600 câu.`);
} catch (err) {
  console.error(`Verify FAIL: ${err.message}. Restoring backup.`);
  fs.copyFileSync(BACKUP_PATH, QUESTIONS_PATH);
  process.exit(1);
}

// Save change log
const logPath = path.join("reports", "pdf-fix-applied.json");
fs.writeFileSync(logPath, JSON.stringify({ appliedAt: new Date().toISOString(), changes }, null, 2), "utf8");
console.log(`Change log: ${logPath}`);
