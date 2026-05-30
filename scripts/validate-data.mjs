import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

const DATA_PATH = path.join("src", "data", "questions.json");
const PUBLIC_DIR = "public";

const categoryRanges = [
  { chapter: 1, start: 1, end: 180, category: "Quy định chung và quy tắc giao thông đường bộ" },
  { chapter: 2, start: 181, end: 205, category: "Văn hóa giao thông, đạo đức người lái xe, PCCC và cứu hộ cứu nạn" },
  { chapter: 3, start: 206, end: 263, category: "Kỹ thuật lái xe" },
  { chapter: 4, start: 264, end: 300, category: "Cấu tạo và sửa chữa" },
  { chapter: 5, start: 301, end: 485, category: "Báo hiệu đường bộ" },
  { chapter: 6, start: 486, end: 600, category: "Giải thế sa hình và kỹ năng xử lý tình huống giao thông" },
];

const criticalIds = new Set([
  19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 30, 32, 34, 35, 47, 48, 52, 53, 55, 58,
  63, 64, 65, 66, 67, 68, 70, 71, 72, 73, 74, 85, 86, 87, 88, 89, 90, 91, 92, 93,
  97, 98, 102, 117, 163, 165, 167, 197, 198, 206, 215, 226, 234, 245, 246, 252,
  253, 254, 255, 260,
]);

const questionSchema = z.object({
  id: z.number().int().min(1).max(600),
  category: z.string().min(1),
  chapter: z.number().int().min(1).max(6),
  question: z.string().min(1),
  answers: z.array(z.string().min(1)).min(2).max(6),
  correctAnswer: z.number().int().min(0),
  explanation: z.string(),
  explanationSource: z.enum(["official-capture", "paper-note", "source", "ai-draft", "manual"]).optional(),
  explanationReview: z.enum(["verified", "needs-review"]).optional(),
  verifiedAgainst: z.string().optional(),
  memoryTip: z.string().optional(),
  tipSource: z.enum(["paper-note", "source", "ai-draft", "manual"]).optional(),
  critical: z.boolean(),
  image: z.string().nullable(),
  sourceImage: z.string().optional(),
});

function fail(errors, message) {
  errors.push(message);
}

function warn(warnings, message) {
  warnings.push(message);
}

function expectedForId(id) {
  return categoryRanges.find((range) => id >= range.start && id <= range.end);
}

const raw = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
const errors = [];
const warnings = [];

if (!Array.isArray(raw)) {
  fail(errors, "questions.json must be an array.");
} else {
  if (raw.length !== 600) {
    fail(errors, `Expected 600 questions, found ${raw.length}.`);
  }

  const ids = new Set();
  const duplicateIds = new Set();
  let imageCount = 0;
  let explanationCount = 0;
  let memoryTipCount = 0;
  let criticalCount = 0;

  for (const [index, item] of raw.entries()) {
    const parsed = questionSchema.safeParse(item);
    if (!parsed.success) {
      fail(errors, `Question at index ${index} has invalid schema: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`);
      continue;
    }

    const question = parsed.data;
    if (ids.has(question.id)) {
      duplicateIds.add(question.id);
    }
    ids.add(question.id);

    if (question.correctAnswer >= question.answers.length) {
      fail(errors, `Question ${question.id} correctAnswer ${question.correctAnswer} is outside answers length ${question.answers.length}.`);
    }

    const expected = expectedForId(question.id);
    if (!expected) {
      fail(errors, `Question ${question.id} is outside all chapter ranges.`);
    } else {
      if (question.chapter !== expected.chapter) {
        fail(errors, `Question ${question.id} has chapter ${question.chapter}, expected ${expected.chapter}.`);
      }
      if (question.category !== expected.category) {
        fail(errors, `Question ${question.id} has category "${question.category}", expected "${expected.category}".`);
      }
    }

    if (question.critical !== criticalIds.has(question.id)) {
      fail(errors, `Question ${question.id} has critical=${question.critical}, expected ${criticalIds.has(question.id)}.`);
    }

    if (question.critical) {
      criticalCount += 1;
    }

    if (question.image) {
      imageCount += 1;
      const imagePath = path.join(PUBLIC_DIR, question.image.replace(/^\//, ""));
      if (!fs.existsSync(imagePath)) {
        fail(errors, `Question ${question.id} references missing image: ${question.image}.`);
      }
    }

    if (question.explanation.trim()) {
      explanationCount += 1;
      if (!question.explanationSource) {
        warn(warnings, `Question ${question.id} has explanation but no explanationSource.`);
      }
      if (!question.explanationReview) {
        warn(warnings, `Question ${question.id} has explanation but no explanationReview.`);
      }
    }

    if (question.memoryTip?.trim()) {
      memoryTipCount += 1;
      if (!question.tipSource) {
        warn(warnings, `Question ${question.id} has memoryTip but no tipSource.`);
      }
    }
  }

  for (let id = 1; id <= 600; id += 1) {
    if (!ids.has(id)) {
      fail(errors, `Missing question id ${id}.`);
    }
  }

  if (duplicateIds.size) {
    fail(errors, `Duplicate question ids: ${Array.from(duplicateIds).join(", ")}.`);
  }

  if (criticalCount !== criticalIds.size) {
    fail(errors, `Expected ${criticalIds.size} critical questions, found ${criticalCount}.`);
  }

  const missingExplanation = raw.length - explanationCount;
  const missingMemoryTip = raw.length - memoryTipCount;
  if (missingExplanation) {
    warn(warnings, `${missingExplanation} questions do not have explanation yet.`);
  }
  if (missingMemoryTip) {
    warn(warnings, `${missingMemoryTip} questions do not have memoryTip yet.`);
  }

  console.log(
    JSON.stringify(
      {
        total: raw.length,
        imageCount,
        criticalCount,
        explanationCount,
        memoryTipCount,
        warnings: warnings.length,
        errors: errors.length,
      },
      null,
      2,
    ),
  );
}

if (warnings.length) {
  console.warn("\nData warnings:");
  warnings.slice(0, 40).forEach((message) => console.warn(`- ${message}`));
  if (warnings.length > 40) {
    console.warn(`- ...and ${warnings.length - 40} more warnings.`);
  }
}

if (errors.length) {
  console.error("\nData validation failed:");
  errors.forEach((message) => console.error(`- ${message}`));
  process.exit(1);
}
