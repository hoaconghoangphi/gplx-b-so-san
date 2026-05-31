import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createWorker } from "tesseract.js";

const DATA_PATH = "src/data/questions.json";
const CAPTURE_DIR = "reference/official-captures";
const REPORT_DIR = "reports";
const DEFAULT_THRESHOLD = 0.92;
const UNCERTAIN_THRESHOLD = 0.75;
const SIDEBAR_CROP_RATIO = 0.22;
const TOP_HEADER_DETECT_RATIO = 0.1;
const TOP_HEADER_CROP_RATIO = 0.08;
const V2_EXPLANATION_COUNT = 129;
const PRE_INGEST_EXPLANATION_COUNT = 9;
const MAX_CONSECUTIVE_OCR_FAILURES = 10;
const REPORT_FILES = {
  applied: "captures-applied.json",
  uncertain: "captures-uncertain.json",
  unmatched: "captures-unmatched.json",
  conflicts: "captures-conflicts.json",
  duplicates: "captures-duplicates.json",
  summary: "ingest-summary.md",
};

function parseArgs(argv) {
  const args = { dryRun: false, threshold: DEFAULT_THRESHOLD };
  for (const arg of argv) {
    if (arg === "--dry-run") {
      args.dryRun = true;
    } else if (arg.startsWith("--threshold=")) {
      const value = Number(arg.slice("--threshold=".length));
      if (!Number.isFinite(value) || value <= 0 || value > 1) {
        throw new Error(`Invalid threshold: ${arg}`);
      }
      args.threshold = value;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function stripDiacritics(value) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

function normalize(value) {
  return stripDiacritics(value)
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/cau\s*(hoi)?\s*\d+\s*\/\s*\d+/g, " ")
    .replace(/phan\s*\d+\.?/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeDigitAggressive(value) {
  return normalize(value)
    .split(" ")
    .map((token) =>
      token
        .replace(/[oóố]/gi, "0")
        .replace(/[li|]/gi, "1")
        .replace(/g$/gi, "9"),
    )
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizedVariants(value) {
  return [...new Set([normalize(value), normalizeDigitAggressive(value)])];
}

function cleanText(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+([,.;:?!])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalQuestionKey(value) {
  return normalize(value).replace(/\b(cau|hoi|chon|dap|an)\b/g, " ").replace(/\s+/g, " ").trim();
}

function levenshteinDistance(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  const current = new Array(b.length + 1);
  for (let i = 1; i <= a.length; i += 1) {
    current[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[b.length];
}

function levenshteinRatio(a, b) {
  if (!a && !b) return 1;
  const maxLength = Math.max(a.length, b.length);
  return maxLength ? 1 - levenshteinDistance(a, b) / maxLength : 0;
}

function bestLevenshteinRatio(a, b) {
  let best = 0;
  for (const left of normalizedVariants(a)) {
    for (const right of normalizedVariants(b)) {
      best = Math.max(best, levenshteinRatio(left, right));
    }
  }
  return best;
}

function tokenSetRatio(a, b) {
  return tokenSetRatioWithNormalizer(a, b, normalize);
}

function tokenSetRatioWithNormalizer(a, b, normalizer) {
  const left = new Set(normalizer(a).split(" ").filter(Boolean));
  const right = new Set(normalizer(b).split(" ").filter(Boolean));
  if (!left.size && !right.size) return 1;
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  return (2 * intersection) / (left.size + right.size);
}

function bestTokenSetRatio(a, b) {
  return Math.max(tokenSetRatioWithNormalizer(a, b, normalize), tokenSetRatioWithNormalizer(a, b, normalizeDigitAggressive));
}

function tokenCoverageWithNormalizer(needle, haystack, normalizer) {
  const left = new Set(normalizer(needle).split(" ").filter((token) => token.length >= 2));
  const right = new Set(normalizer(haystack).split(" ").filter((token) => token.length >= 2));
  if (!left.size) return 0;
  let intersection = 0;
  for (const token of left) {
    if (right.has(token)) intersection += 1;
  }
  return intersection / left.size;
}

function bestTokenCoverage(needle, haystack) {
  return Math.max(tokenCoverageWithNormalizer(needle, haystack, normalize), tokenCoverageWithNormalizer(needle, haystack, normalizeDigitAggressive));
}

function bestAnswerSimilarity(a, b) {
  return Math.max(bestTokenSetRatio(a, b), bestTokenCoverage(a, b), bestTokenCoverage(b, a));
}

function fullAnswerSetScore(captureAnswers, jsonAnswers) {
  const capture = captureAnswers.map((answer) => answer.text).filter(Boolean);
  const expected = jsonAnswers.filter(Boolean);
  if (!capture.length || !expected.length) return 0;

  const used = new Set();
  let total = 0;
  for (const answer of capture) {
    let bestIndex = -1;
    let bestScore = 0;
    for (const [index, expectedAnswer] of expected.entries()) {
      if (used.has(index)) continue;
      const score = bestAnswerSimilarity(answer, expectedAnswer);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }
    if (bestIndex >= 0) used.add(bestIndex);
    total += bestScore;
  }
  return total / capture.length;
}

function getPngSize(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.toString("ascii", 1, 4) !== "PNG") {
    throw new Error(`Unsupported image format: ${filePath}`);
  }
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function cropRectangleFor(imagePath) {
  const { width, height } = getPngSize(imagePath);
  const left = Math.floor(width * SIDEBAR_CROP_RATIO);
  return { left, top: 0, width: width - left, height };
}

function topHeaderDetectRectangleFor(sidebarRectangle) {
  return {
    ...sidebarRectangle,
    height: Math.max(1, Math.floor(sidebarRectangle.height * TOP_HEADER_DETECT_RATIO)),
  };
}

function cropTopHeader(sidebarRectangle) {
  const top = Math.floor(sidebarRectangle.height * TOP_HEADER_CROP_RATIO);
  return {
    left: sidebarRectangle.left,
    top,
    width: sidebarRectangle.width,
    height: sidebarRectangle.height - top,
  };
}

function hasTopHeader(text) {
  return /\b(han cuoi|hoan thanh|diem va tien do)\b/i.test(normalize(text));
}

function linesFromText(text) {
  return text.split(/\r?\n/).map(cleanText).filter(Boolean);
}

function isSegmentAnchor(line) {
  const normalized = normalize(line);
  return /\d+\s*cau hoi chon mot dap an/.test(normalized);
}

function splitQuestionSegments(text) {
  const lines = linesFromText(text);
  const anchors = [];
  lines.forEach((line, index) => {
    if (isSegmentAnchor(line)) anchors.push(index);
  });

  if (!anchors.length) {
    return [{ index: 0, text, lines, anchorCount: 0 }];
  }

  return anchors.map((start, segmentIndex) => {
    const end = anchors[segmentIndex + 1] ?? lines.length;
    const segmentLines = lines.slice(start, end);
    return {
      index: segmentIndex,
      text: segmentLines.join("\n"),
      lines: segmentLines,
      anchorCount: anchors.length,
    };
  });
}

function findLineIndex(lines, patterns) {
  return lines.findIndex((line) => patterns.some((pattern) => pattern.test(normalize(line))));
}

function removeUiNoise(line) {
  const normalized = normalize(line);
  if (/^(truoc|tiep|ket thuc|nop bai|chon cau|cau hoi|thoi gian|dong ho|phan \d|chuong|video|on luyen|kiem tra)$/.test(normalized)) {
    return "";
  }
  if (
    /\b(cau hoi\s*\d+\s*\d+|day la cau diem liet|ket thuc luyen thi|gop y|muc truoc|tiep theo|phuong thuc tinh diem|xem cach tinh diem)\b/.test(
      normalized,
    )
  ) {
    return "";
  }
  if (/^(on luyen|khai niem|giai cac|van hoa|ky thuat|cau tao|bao hieu)\b/.test(normalized)) {
    return "";
  }
  if (/^\d+\s*\/\s*\d+$/.test(line) || /^\s*\d+\s*m\s*\d+\s*s?\s*$/iu.test(line)) {
    return "";
  }
  return line;
}

function cleanContentLine(line) {
  return cleanText(line)
    .replace(/^[^\p{L}\p{N}]*/u, "")
    .replace(/^(?:v\s*)?p\d+\s*[-:]?\s*c\d+\s*[-:]?\s*\d+\s*/iu, "")
    .replace(/^\d+\s*m\s*\d+\s*s?\s*/iu, "")
    .replace(/^[^\p{L}\p{N}]*/u, "")
    .trim();
}

function parseAnswerLine(line) {
  const direct = line.match(/^\s*(?:([1-6])|([A-Fa-f]))\s*[-.)：:]\s*(.+)$/u);
  const prefixed = direct ? null : line.match(/^\s*(?:[^\p{L}\p{N}]|[lIoOC@®©()]){0,12}([1-6])\s*[-.)：:]\s*(.+)$/u);
  const match = direct ?? prefixed;
  if (!match) return null;
  const marker = direct ? direct[1] ?? direct[2] : prefixed[1];
  const text = cleanAnswerText(direct ? direct[3] : prefixed[2]);
  if (/^(cau hoi|phan hoi|giai thich|chinh xac|chua chinh xac|muc truoc|tiep theo)\b/.test(normalize(text))) {
    return null;
  }
  return {
    index: /^\d+$/.test(marker) ? Number(marker) - 1 : marker.toUpperCase().charCodeAt(0) - 65,
    text,
  };
}

function cleanAnswerText(value) {
  return cleanText(value)
    .replace(/\b(Phương thức tính điểm|Xem cách tính điểm|Câu trả lời chính xác là|Phản hồi)\b.*$/iu, "")
    .replace(/\/\*.*$/u, "")
    .trim();
}

function parseCorrectCandidate(candidate) {
  const cleaned = cleanText(candidate)
    .replace(/^\s*\d+\s*m\s*\d+\s*s?\s*/iu, "")
    .replace(/^\s*\d+\s*[:.]\s*\d+\s*/u, "");

  const direct = parseAnswerLine(cleaned);
  if (direct) return direct;

  const numeric = cleaned.match(/(?:^|[\s|])([1-6])\s*[-.)：:]\s*(.+)$/u);
  if (numeric) return { index: Number(numeric[1]) - 1, text: cleanText(numeric[2]) };

  const alpha = cleaned.match(/(?:^|[\s|])([A-Fa-f])\s*[-.)：:]\s*(.+)$/u);
  if (alpha) return { index: alpha[1].toUpperCase().charCodeAt(0) - 65, text: cleanText(alpha[2]) };

  return null;
}

function parseCorrectAnswer(lines) {
  const anchorIndex = findLineIndex(lines, [/cau tra loi chinh xac la/, /cau tra loi chinh xac/]);
  if (anchorIndex < 0) return null;

  const sameLine = lines[anchorIndex].replace(/^.*?(?:là|la)\s*[:：]?\s*/iu, "");
  const candidates = [sameLine, ...lines.slice(anchorIndex + 1, anchorIndex + 4)].map(cleanText).filter(Boolean);
  for (const candidate of candidates) {
    const parsed = parseCorrectCandidate(candidate);
    if (parsed) return parsed;
  }
  return null;
}

function cleanOcrExplanation(raw) {
  let next = cleanText(raw);
  const before = next;

  next = next.replace(/\b(Trước|Tiếp|Mục trước|Tiếp theo|Kiểm tra|Trạng thái)\b.*$/iu, "");
  next = next.replace(/[+\-*]+\s*$/u, "");

  const sidebarMatch = next.search(/\b(Phần|Chương|Video chương|P\d+\s*[-:]?\s*C\d+)\b|.{0,12}Câu hỏi chọn một đáp án/iu);
  if (sidebarMatch >= 0) {
    next = next.slice(0, sidebarMatch);
  }

  next = cleanText(next);
  const lastSentenceEnd = Math.max(next.lastIndexOf("."), next.lastIndexOf("!"), next.lastIndexOf("?"));
  if (lastSentenceEnd >= 0 && lastSentenceEnd < next.length - 1) {
    const tail = next.slice(lastSentenceEnd + 1).trim();
    const mostlyGarbage =
      tail.length < 50 &&
      (tail.replace(/[^a-zàáâãèéêìíòóôõùúýăđĩũơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹA-Z0-9\s,.;:()/-]/giu, "").length /
        Math.max(tail.length, 1) <
        0.6);
    if (tail.length < 15 || mostlyGarbage || /\b(truoc|tiep|muc truoc|tiep theo|kiem tra|trang thai)\b/i.test(normalize(tail))) {
      next = next.slice(0, lastSentenceEnd + 1);
    }
  }

  next = cleanNumericOcrInText(cleanText(next).replace(/\s+/g, " "));
  if (next.length < 10 || !/\p{L}/u.test(next)) {
    next = "";
  }

  return { text: next, wasCleaned: next !== before };
}

function cleanNumericOcrInText(value) {
  return value
    .replace(/\b[OÓóo](?=[,.]\d)/gu, "0")
    .replace(/[óÓ][O0](?=\s*(?:km\/?h|[-–]))/gu, "60")
    .replace(/[óÓ]0(?=\s*(?:km\/?h|[-–]))/gu, "60")
    .replace(/(?<=\d)[OÓóo](?=\s*(?:km\/?h|km|m|;|,|\.|$))/gu, "0");
}

function parseExplanation(lines) {
  const anchorIndex = findLineIndex(lines, [/phan hoi/, /giai thich/]);
  if (anchorIndex < 0) return { raw: "", text: "", wasCleaned: false };

  const anchorLine = lines[anchorIndex];
  const sameLine = anchorLine.replace(/^.*?(?:Phản hồi|Phan hoi|Giải thích|Giai thich)\s*[:：]?\s*/iu, "");
  const parts = [];
  if (sameLine && sameLine !== anchorLine) {
    const cleanedSameLine = cleanContentLine(sameLine);
    if (cleanedSameLine) parts.push(cleanedSameLine);
  }

  for (const line of lines.slice(anchorIndex + 1)) {
    const cleaned = cleanContentLine(removeUiNoise(line));
    if (cleaned) parts.push(cleaned);
  }

  const raw = cleanText(parts.join(" "));
  const cleaned = cleanOcrExplanation(raw);
  return { raw, ...cleaned };
}

function parseQuestionText(lines) {
  const answerStart = lines.findIndex((line) => parseAnswerLine(line));
  const searchLines = answerStart >= 0 ? lines.slice(0, answerStart) : lines;
  const candidates = [];
  let collecting = false;

  for (const rawLine of searchLines) {
    if (isSegmentAnchor(rawLine)) {
      collecting = true;
      continue;
    }
    const line = removeUiNoise(rawLine);
    if (!line) continue;
    const normalized = normalize(line);
    if (/^(khai niem|giai cac|van hoa|ky thuat|cau tao|bao hieu|phan \d)/.test(normalized)) continue;
    if (!collecting && (line.includes("?") || line.length > 35)) collecting = true;
    if (collecting) {
      candidates.push(line);
      if (line.includes("?")) break;
    }
  }

  const question = cleanText(candidates.join(" "));
  return question.includes("?") ? question.slice(0, question.indexOf("?") + 1) : question;
}

function parseAnswers(lines) {
  const answers = [];
  let current = null;
  for (const line of lines) {
    const normalized = normalize(line);
    if (/^(chinh xac|cau tra loi|phan hoi|giai thich|chua chinh xac)\b/.test(normalized)) {
      break;
    }

    const parsed = parseAnswerLine(line);
    if (parsed) {
      if (current) answers.push(current);
      current = parsed;
      continue;
    }

    if (!current) continue;
    const cleaned = cleanAnswerText(cleanContentLine(removeUiNoise(line)));
    if (!cleaned) continue;
    current.text = cleanAnswerText(`${current.text} ${cleaned}`);
  }
  if (current) answers.push(current);
  return answers.filter((answer) => answer.index >= 0 && answer.text);
}

function hasCriticalBanner(text) {
  return /day la cau diem liet/i.test(normalize(text));
}

function isWrongAnswerCapture(text) {
  const normalized = normalize(text);
  return /chua chinh xac/.test(normalized) || /chua c?linh xac/.test(normalized);
}

function extractFields(segment) {
  const lines = segment.lines.length ? segment.lines : linesFromText(segment.text);
  const explanation = parseExplanation(lines);
  return {
    segmentIndex: segment.index,
    lines,
    question: parseQuestionText(lines),
    answers: parseAnswers(lines),
    correctAnswer: parseCorrectAnswer(lines),
    explanation: explanation.text,
    rawExplanation: explanation.raw,
    wasCleaned: explanation.wasCleaned,
    hasCriticalBanner: hasCriticalBanner(segment.text),
    wrongAnswerMarker: isWrongAnswerCapture(segment.text),
  };
}

function buildLookup(questions) {
  return questions.map((question) => ({
    id: question.id,
    question,
  }));
}

function matchQuestion(extracted, lookup) {
  const allCandidates = lookup.map((item) => {
    const scoreQ = Math.max(
      bestLevenshteinRatio(canonicalQuestionKey(extracted.question), canonicalQuestionKey(item.question.question)),
      bestTokenCoverage(item.question.question, extracted.question),
    );
    const answerSetScore = fullAnswerSetScore(extracted.answers, item.question.answers);
    const jsonCorrectAnswer = item.question.answers[item.question.correctAnswer] ?? "";
    const correctAnswerScore =
      extracted.correctAnswer?.index === item.question.correctAnswer ? bestAnswerSimilarity(extracted.correctAnswer.text, jsonCorrectAnswer) : 0;
    const scoreAFull = Math.max(answerSetScore, correctAnswerScore);
    return {
      questionId: item.id,
      scoreQ,
      scoreAFull,
      answerSetScore,
      correctAnswerScore,
      confidence: 0.5 * scoreQ + 0.5 * scoreAFull,
      question: item.question.question,
    };
  });

  const eligible = allCandidates.filter((candidate) => candidate.scoreQ >= 0.85);
  const pool = eligible.length ? eligible : allCandidates;
  const sorted = pool.sort(
    (a, b) =>
      b.confidence - a.confidence ||
      b.answerSetScore - a.answerSetScore ||
      (extracted.hasCriticalBanner ? Number(b.question.critical) - Number(a.question.critical) : 0) ||
      b.scoreAFull - a.scoreAFull ||
      b.scoreQ - a.scoreQ,
  );
  const best = sorted[0] ?? null;
  if (!best) return null;

  return {
    ...best,
    eligibleCandidateCount: eligible.length,
    matchedByFullAnswer: eligible.length > 1,
  };
}

function canOverwrite(question) {
  return !question.explanationSource || question.explanationSource === "official-capture";
}

function clearOfficialCaptureFields(questions) {
  for (const question of questions) {
    if (question.explanationSource === "official-capture") {
      question.explanation = "";
      delete question.explanationSource;
      delete question.explanationReview;
      delete question.verifiedAgainst;
    }
  }
}

function makeUnmatched(image, segmentIndex, reason, extracted, bestMatch = null) {
  return {
    image,
    segmentIndex,
    reason,
    bestMatch,
    extracted: {
      question: extracted?.question ?? "",
      correctAnswer: extracted?.correctAnswer ?? null,
      explanationLength: extracted?.explanation?.length ?? 0,
      answerCount: extracted?.answers?.length ?? 0,
    },
  };
}

function makeAppliedEntry(candidate) {
  return {
    questionId: candidate.question.id,
    image: candidate.image,
    segmentIndex: candidate.segmentIndex,
    confidence: Number(candidate.match.confidence.toFixed(4)),
    scoreQ: Number(candidate.match.scoreQ.toFixed(4)),
    scoreAFull: Number(candidate.match.scoreAFull.toFixed(4)),
    answerSetScore: Number(candidate.match.answerSetScore.toFixed(4)),
    correctAnswerScore: Number(candidate.match.correctAnswerScore.toFixed(4)),
    explanationLength: candidate.extracted.explanation.length,
    wasCleaned: candidate.extracted.wasCleaned,
    matchedByFullAnswer: candidate.match.matchedByFullAnswer,
    criticalMatchConfirmed: candidate.extracted.hasCriticalBanner ? candidate.question.critical === true : false,
  };
}

function countExplanations(questions) {
  return questions.filter((question) => question.explanation?.trim()).length;
}

function assertOnlyAllowedFieldsChanged(before, after) {
  const allowed = new Set(["explanation", "explanationSource", "explanationReview", "verifiedAgainst"]);
  const errors = [];
  for (let index = 0; index < before.length; index += 1) {
    const previous = before[index];
    const next = after[index];
    const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
    for (const key of keys) {
      if (allowed.has(key)) continue;
      if (JSON.stringify(previous[key]) !== JSON.stringify(next[key])) {
        errors.push({ questionId: previous.id, field: key });
      }
    }
  }
  if (errors.length) {
    throw new Error(`Refusing to write: non-allowed fields changed: ${JSON.stringify(errors.slice(0, 10))}`);
  }
}

function writeJsonReport(fileName, data) {
  fs.writeFileSync(path.join(REPORT_DIR, fileName), `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function writeQuestionsWithVerification(content) {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    fs.writeFileSync(DATA_PATH, content, "utf8");
    try {
      const parsed = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
      if (parsed.length !== 600) throw new Error(`Expected 600 questions, got ${parsed.length}`);
      return;
    } catch (error) {
      execFileSync("git", ["checkout", "HEAD", "--", DATA_PATH], { stdio: "inherit" });
      if (attempt === 2) {
        throw new Error(`questions.json write verification failed twice: ${error.message}`);
      }
    }
  }
}

function createSummary({
  totalImages,
  totalSegments,
  emptySegmentsSkipped,
  topHeaderCrops,
  singleQuestionImages,
  multiQuestionImages,
  applied,
  uncertain,
  unmatched,
  conflicts,
  duplicates,
  criticalBannerConfirm,
  criticalBannerMismatch,
  afterExplanationCount,
  dryRun,
  threshold,
}) {
  const deltaVsV2 = afterExplanationCount - V2_EXPLANATION_COUNT;
  return `# Ingest Summary v3

${dryRun ? "**Dry run:** questions.json was not modified.\n" : ""}Threshold: ${threshold}

\`\`\`text
=== INGEST SUMMARY (v3) ===
Tong anh:                   ${totalImages}
Segments tong:              ${totalSegments}
Empty segments skipped:     ${emptySegmentsSkipped}
Top header crops:           ${topHeaderCrops}
1-cau anh:                  ${singleQuestionImages}
Multi-cau anh:              ${multiQuestionImages}

Applied (>=0.92):           ${applied.length}   (v2: 127)
  + cleaned OCR noise:      ${applied.filter((entry) => entry.wasCleaned).length}
  + matched by full-answer: ${applied.filter((entry) => entry.matchedByFullAnswer).length}
Uncertain (0.75-0.92):      ${uncertain.length}
Unmatched (<0.75):          ${unmatched.length}   (v2: 14)
Conflict:                   ${conflicts.length}   (v2: 2)
Duplicate:                  ${duplicates.length}

Critical banner confirm:    ${criticalBannerConfirm}
Critical banner mismatch:   ${criticalBannerMismatch}

Pre-flight fixes applied:
  - q527 correctAnswer 2->0
  - q107 cleared (IMG_91 remapped to q165)

Cau co explanation:         ${PRE_INGEST_EXPLANATION_COUNT} -> ${afterExplanationCount}
So voi v2 (${V2_EXPLANATION_COUNT}):            ${deltaVsV2 >= 0 ? "+" : ""}${deltaVsV2}
\`\`\`
`;
}

async function createWorkerWithVietnamese() {
  return createWorker("vie", 1, { langPath: ".", gzip: false });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const originalQuestions = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  const nextQuestions = JSON.parse(JSON.stringify(originalQuestions));
  clearOfficialCaptureFields(nextQuestions);

  const questionsById = new Map(nextQuestions.map((question) => [question.id, question]));
  const lookup = buildLookup(nextQuestions);
  const images = fs
    .readdirSync(CAPTURE_DIR)
    .filter((file) => /^IMG_\d+\.png$/i.test(file))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  fs.mkdirSync(REPORT_DIR, { recursive: true });

  const worker = await createWorkerWithVietnamese();
  const highConfidence = [];
  const uncertain = [];
  const unmatched = [];
  const conflicts = [];
  const duplicates = [];
  const imageSegmentCounts = [];
  let consecutiveOcrFailures = 0;
  let emptySegmentsSkipped = 0;
  let topHeaderCrops = 0;

  try {
    for (const [index, image] of images.entries()) {
      const imagePath = path.join(CAPTURE_DIR, image);
      const sidebarRectangle = cropRectangleFor(imagePath);
      const headerProbe = await worker.recognize(imagePath, { rectangle: topHeaderDetectRectangleFor(sidebarRectangle) });
      const rectangle = hasTopHeader(headerProbe.data.text ?? "") ? cropTopHeader(sidebarRectangle) : sidebarRectangle;
      if (rectangle.top > 0) topHeaderCrops += 1;
      console.log(`OCR ${index + 1}/${images.length}: ${image} crop=${JSON.stringify(rectangle)}`);
      const ocr = await worker.recognize(imagePath, { rectangle });
      const text = ocr.data.text ?? "";
      const segments = splitQuestionSegments(text);
      imageSegmentCounts.push(segments.length);

      const normalizedText = normalize(text);
      const ocrLooksGarbage = normalizedText.split(" ").length < 8;
      consecutiveOcrFailures = ocrLooksGarbage ? consecutiveOcrFailures + 1 : 0;
      if (consecutiveOcrFailures >= MAX_CONSECUTIVE_OCR_FAILURES) {
        throw new Error(`OCR produced unusable text for ${MAX_CONSECUTIVE_OCR_FAILURES} consecutive images. Stopping without applying changes.`);
      }

      for (const segment of segments) {
        const extracted = extractFields(segment);
        if (segment.index > 0 && (extracted.question.length < 30 || !extracted.answers.length)) {
          emptySegmentsSkipped += 1;
          continue;
        }
        if (!extracted.question || !extracted.correctAnswer) {
          unmatched.push(makeUnmatched(image, segment.index, "extract-failed", extracted));
          continue;
        }

        const match = matchQuestion(extracted, lookup);
        if (!match) {
          unmatched.push(makeUnmatched(image, segment.index, "no-candidate", extracted));
          continue;
        }

        const question = questionsById.get(match.questionId);
        const candidate = { image, segmentIndex: segment.index, extracted, match, question };
        if (match.confidence >= args.threshold) {
          highConfidence.push(candidate);
        } else if (match.confidence >= UNCERTAIN_THRESHOLD) {
          uncertain.push({
            image,
            segmentIndex: segment.index,
            questionId: match.questionId,
            confidence: Number(match.confidence.toFixed(4)),
            scoreQ: Number(match.scoreQ.toFixed(4)),
            scoreAFull: Number(match.scoreAFull.toFixed(4)),
            answerSetScore: Number(match.answerSetScore.toFixed(4)),
            correctAnswerScore: Number(match.correctAnswerScore.toFixed(4)),
            eligibleCandidateCount: match.eligibleCandidateCount,
            extractedQuestion: extracted.question,
            matchedQuestion: question.question,
            extractedCorrectAnswer: extracted.correctAnswer,
          });
        } else {
          unmatched.push(makeUnmatched(image, segment.index, "low-confidence", extracted, {
            questionId: match.questionId,
            confidence: Number(match.confidence.toFixed(4)),
            question: question.question,
          }));
        }
      }
    }
  } finally {
    await worker.terminate();
  }

  const byQuestionId = new Map();
  for (const candidate of highConfidence) {
    const current = byQuestionId.get(candidate.question.id);
    if (!current) {
      byQuestionId.set(candidate.question.id, candidate);
      continue;
    }

    const currentRank = [current.extracted.explanation.length, current.match.confidence];
    const nextRank = [candidate.extracted.explanation.length, candidate.match.confidence];
    const keepNext = nextRank[0] > currentRank[0] || (nextRank[0] === currentRank[0] && nextRank[1] > currentRank[1]);
    const kept = keepNext ? candidate : current;
    const dropped = keepNext ? current : candidate;
    duplicates.push({
      questionId: candidate.question.id,
      kept: kept.image,
      keptSegmentIndex: kept.segmentIndex,
      dropped: dropped.image,
      droppedSegmentIndex: dropped.segmentIndex,
      reason: "duplicate-capture",
      keptExplanationLength: kept.extracted.explanation.length,
      droppedExplanationLength: dropped.extracted.explanation.length,
    });
    byQuestionId.set(candidate.question.id, kept);
  }

  const applied = [];
  let criticalBannerConfirm = 0;
  let criticalBannerMismatch = 0;

  for (const candidate of byQuestionId.values()) {
    const { image, segmentIndex, extracted, match, question } = candidate;
    if (!canOverwrite(question)) {
      duplicates.push({
        questionId: question.id,
        kept: question.explanationSource,
        dropped: image,
        droppedSegmentIndex: segmentIndex,
        reason: "non-official source preserved",
      });
      continue;
    }

    if (extracted.correctAnswer.index !== question.correctAnswer) {
      conflicts.push({
        questionId: question.id,
        image,
        segmentIndex,
        type: "correctAnswer",
        confidence: Number(match.confidence.toFixed(4)),
        jsonCorrectAnswer: question.correctAnswer,
        captureCorrectAnswer: extracted.correctAnswer.index,
        captureCorrectAnswerText: extracted.correctAnswer.text,
      });
      continue;
    }

    if (extracted.hasCriticalBanner) {
      if (question.critical) {
        criticalBannerConfirm += 1;
      } else {
        criticalBannerMismatch += 1;
        conflicts.push({
          questionId: question.id,
          image,
          segmentIndex,
          type: "critical",
          confidence: Number(match.confidence.toFixed(4)),
          jsonCritical: question.critical,
          captureCriticalBanner: true,
        });
        continue;
      }
    }

    question.explanation = extracted.explanation;
    question.explanationSource = "official-capture";
    question.explanationReview = "verified";
    question.verifiedAgainst = image;
    applied.push(makeAppliedEntry(candidate));
  }

  const appliedIds = new Set(applied.map((entry) => `${entry.questionId}:${entry.image}:${entry.segmentIndex}`));
  const conflictIds = new Set(conflicts.map((entry) => `${entry.questionId}:${entry.image}:${entry.segmentIndex}`));
  const overlap = [...appliedIds].filter((id) => conflictIds.has(id));
  if (overlap.length) throw new Error(`QA failed: applied/conflict overlap: ${overlap.join(", ")}`);

  assertOnlyAllowedFieldsChanged(originalQuestions, nextQuestions);
  const afterExplanationCount = args.dryRun ? countExplanations(originalQuestions) : countExplanations(nextQuestions);
  const summary = createSummary({
    totalImages: images.length,
    totalSegments: imageSegmentCounts.reduce((total, count) => total + count, 0),
    emptySegmentsSkipped,
    topHeaderCrops,
    singleQuestionImages: imageSegmentCounts.filter((count) => count <= 1).length,
    multiQuestionImages: imageSegmentCounts.filter((count) => count > 1).length,
    applied,
    uncertain,
    unmatched,
    conflicts,
    duplicates,
    criticalBannerConfirm,
    criticalBannerMismatch,
    afterExplanationCount,
    dryRun: args.dryRun,
    threshold: args.threshold,
  });

  if (!args.dryRun) {
    writeQuestionsWithVerification(`${JSON.stringify(nextQuestions, null, 2)}\n`);
  }

  writeJsonReport(REPORT_FILES.applied, applied);
  writeJsonReport(REPORT_FILES.uncertain, uncertain);
  writeJsonReport(REPORT_FILES.unmatched, unmatched);
  writeJsonReport(REPORT_FILES.conflicts, conflicts);
  writeJsonReport(REPORT_FILES.duplicates, duplicates);
  fs.writeFileSync(path.join(REPORT_DIR, REPORT_FILES.summary), summary, "utf8");
  console.log(summary);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
