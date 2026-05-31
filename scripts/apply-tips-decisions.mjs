/**
 * Apply tips-decisions.json (exported từ reports/tips-review.html) vào questions.json.
 *
 * Workflow:
 *   1. npm run review:tips → mở reports/tips-review.html
 *   2. Review trong browser, bấm Export → tải tips-decisions.json
 *   3. Copy file vào reports/tips-decisions.json
 *   4. npm run apply:tips
 *
 * Decisions:
 *   - accepted | edited → ghi memoryTip + tipSource="paper-note"
 *   - rejected → skip
 *
 * Constraints:
 *   - KHÔNG ghi đè memoryTip nếu tipSource hiện là "manual" hoặc "source"
 *   - Backup trước khi sửa
 *   - Verify 600 câu sau khi ghi
 */

import fs from "node:fs";
import path from "node:path";

const QUESTIONS_PATH = path.join("src", "data", "questions.json");
const DECISIONS_PATH = path.join("reports", "tips-decisions.json");
const BACKUP_PATH = path.join("reports", "questions-before-tips-apply.json");
const LOG_PATH = path.join("reports", "tips-apply-log.json");

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const force = args.includes("--force"); // ghi đè cả manual/source

if (!fs.existsSync(DECISIONS_PATH)) {
  console.error(`Cần ${DECISIONS_PATH}. Bước review chưa export.`);
  process.exit(1);
}

const decisions = JSON.parse(fs.readFileSync(DECISIONS_PATH, "utf8"));
const questions = JSON.parse(fs.readFileSync(QUESTIONS_PATH, "utf8"));
const byId = new Map(questions.map((q, i) => [q.id, i]));

if (!dryRun) {
  fs.mkdirSync(path.dirname(BACKUP_PATH), { recursive: true });
  fs.copyFileSync(QUESTIONS_PATH, BACKUP_PATH);
  console.log(`Backup: ${BACKUP_PATH}`);
}

const stats = { applied: 0, skipped: 0, rejected: 0, protected: 0, missing: 0 };
const log = [];

for (const dec of decisions) {
  if (dec.status === "rejected") {
    stats.rejected += 1;
    continue;
  }
  if (dec.status !== "accepted" && dec.status !== "edited") {
    stats.skipped += 1;
    continue;
  }
  const idx = byId.get(dec.questionId);
  if (idx === undefined) {
    stats.missing += 1;
    log.push({ id: dec.questionId, action: "missing-in-json" });
    continue;
  }
  const q = questions[idx];
  const currentSource = q.tipSource;
  if (!force && (currentSource === "manual" || currentSource === "source")) {
    stats.protected += 1;
    log.push({ id: q.id, action: "skip-protected", currentSource });
    continue;
  }
  const tipText = (dec.tipText || "").trim();
  if (!tipText) {
    stats.skipped += 1;
    log.push({ id: q.id, action: "skip-empty-tip" });
    continue;
  }
  q.memoryTip = tipText;
  q.tipSource = "paper-note";
  stats.applied += 1;
  log.push({ id: q.id, action: "applied", status: dec.status, tipLength: tipText.length });
}

console.log(`\nDecisions parsed: ${decisions.length}`);
console.log(`  applied:    ${stats.applied}`);
console.log(`  rejected:   ${stats.rejected}`);
console.log(`  skipped:    ${stats.skipped}`);
console.log(`  protected:  ${stats.protected} (manual/source — dùng --force để ghi đè)`);
console.log(`  missing:    ${stats.missing}`);

if (dryRun) {
  console.log("\n(dry-run, không ghi)");
  process.exit(0);
}

const content = JSON.stringify(questions, null, 2) + "\n";
fs.writeFileSync(QUESTIONS_PATH, content, "utf8");

try {
  const reparsed = JSON.parse(fs.readFileSync(QUESTIONS_PATH, "utf8"));
  if (reparsed.length !== 600) throw new Error(`Length ${reparsed.length} ≠ 600`);
  console.log(`\n✅ Wrote ${QUESTIONS_PATH}, verified 600 câu.`);
} catch (err) {
  console.error(`Verify fail: ${err.message}. Restoring backup.`);
  fs.copyFileSync(BACKUP_PATH, QUESTIONS_PATH);
  process.exit(1);
}

fs.writeFileSync(LOG_PATH, JSON.stringify({ appliedAt: new Date().toISOString(), stats, log }, null, 2), "utf8");
console.log(`Log: ${LOG_PATH}`);
