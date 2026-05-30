import fs from "node:fs";
import path from "node:path";

const QUESTIONS_PATH = path.join("src", "data", "questions.json");
const REFERENCE_DIRS = [
  { type: "official-capture", dir: path.join("reference", "official-captures") },
  { type: "paper-note", dir: path.join("reference", "paper-notes") },
];

function normalize(value) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/cau\s*\d+/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value) {
  return new Set(normalize(value).split(" ").filter((token) => token.length >= 3));
}

function jaccardScore(a, b) {
  const left = tokens(a);
  const right = tokens(b);
  if (!left.size || !right.size) {
    return 0;
  }

  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) {
      intersection += 1;
    }
  }
  return intersection / (left.size + right.size - intersection);
}

function readReferenceText(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === ".txt" || extension === ".md") {
    return fs.readFileSync(filePath, "utf8");
  }
  if (extension === ".json") {
    const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return [data.question, data.answers?.join(" "), data.explanation, data.memoryTip, data.keywords?.join(" ")]
      .filter(Boolean)
      .join(" ");
  }
  return "";
}

function scanReferences() {
  const references = [];
  const skippedImages = [];

  for (const group of REFERENCE_DIRS) {
    if (!fs.existsSync(group.dir)) {
      continue;
    }

    for (const fileName of fs.readdirSync(group.dir)) {
      if (fileName.startsWith(".")) {
        continue;
      }
      const filePath = path.join(group.dir, fileName);
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) {
        continue;
      }

      const extension = path.extname(fileName).toLowerCase();
      if ([".png", ".jpg", ".jpeg", ".webp"].includes(extension)) {
        skippedImages.push({ type: group.type, file: filePath });
        continue;
      }

      const text = readReferenceText(filePath);
      if (text.trim()) {
        references.push({ type: group.type, file: filePath, text });
      }
    }
  }

  return { references, skippedImages };
}

const questions = JSON.parse(fs.readFileSync(QUESTIONS_PATH, "utf8"));
const { references, skippedImages } = scanReferences();
const matches = [];

for (const reference of references) {
  const scored = questions
    .map((question) => {
      const haystack = `${question.question} ${question.answers.join(" ")} ${question.category}`;
      return {
        id: question.id,
        question: question.question,
        score: jaccardScore(reference.text, haystack),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  matches.push({
    reference: reference.file,
    type: reference.type,
    status: scored[0]?.score >= 0.55 ? "strong" : scored[0]?.score >= 0.32 ? "weak" : "no-match",
    candidates: scored,
  });
}

console.log(
  JSON.stringify(
    {
      references: references.length,
      imagesNeedingTextOrOcr: skippedImages.length,
      matches,
      skippedImages,
      note: "Image OCR is intentionally not automatic yet. Add a .txt/.json sidecar next to captures, or OCR only selected captures before applying data changes.",
    },
    null,
    2,
  ),
);
