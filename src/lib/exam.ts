import type { Question, QuestionCategory, StoredProgress } from "./types";

export const EXAM_TOTAL = 30;
export const EXAM_MINUTES = 20;
export const EXAM_SECONDS = EXAM_MINUTES * 60;
export const PASS_SCORE = 27;
export const AVERAGE_SECONDS_PER_QUESTION = Math.round(EXAM_SECONDS / EXAM_TOTAL);
export const EXAM_PRESET_COUNT = 20;

type RandomSource = () => number;

type ExamSectionKey =
  | "critical"
  | "rules"
  | "culture"
  | "drivingTechnique"
  | "vehicleStructure"
  | "signs"
  | "situations";

export const B_EXAM_BLUEPRINT: { key: ExamSectionKey; label: string; count: number }[] = [
  { key: "rules", label: "Quy định chung và quy tắc giao thông", count: 8 },
  { key: "critical", label: "Tình huống mất an toàn nghiêm trọng", count: 1 },
  { key: "culture", label: "Văn hóa, đạo đức, PCCC và cứu hộ", count: 1 },
  { key: "drivingTechnique", label: "Kỹ thuật lái xe", count: 1 },
  { key: "vehicleStructure", label: "Cấu tạo và sửa chữa", count: 1 },
  { key: "signs", label: "Báo hiệu đường bộ", count: 9 },
  { key: "situations", label: "Sa hình và xử lý tình huống", count: 9 },
];

export const categories: QuestionCategory[] = [
  "Quy định chung và quy tắc giao thông đường bộ",
  "Văn hóa giao thông, đạo đức người lái xe, PCCC và cứu hộ cứu nạn",
  "Kỹ thuật lái xe",
  "Cấu tạo và sửa chữa",
  "Báo hiệu đường bộ",
  "Giải thế sa hình và kỹ năng xử lý tình huống giao thông",
];

export function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60)
    .toString()
    .padStart(2, "0");
  const rest = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

export function isExamEligible(question: Question) {
  return question.answers.length >= 2 && question.correctAnswer >= 0 && question.correctAnswer < question.answers.length;
}

export function createSeededRandom(seed: number): RandomSource {
  let value = seed >>> 0;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 0x100000000;
  };
}

export function shuffle<T>(items: T[], random: RandomSource = Math.random) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function getSectionPool(section: ExamSectionKey, questions: Question[]) {
  switch (section) {
    case "critical":
      return questions.filter((question) => question.critical);
    case "rules":
      return questions.filter((question) => question.chapter === 1 && !question.critical);
    case "culture":
      return questions.filter((question) => question.chapter === 2 && !question.critical);
    case "drivingTechnique":
      return questions.filter((question) => question.chapter === 3 && !question.critical);
    case "vehicleStructure":
      return questions.filter((question) => question.chapter === 4 && !question.critical);
    case "signs":
      return questions.filter((question) => question.chapter === 5 && !question.critical);
    case "situations":
      return questions.filter((question) => question.chapter === 6 && !question.critical);
    default:
      return [];
  }
}

export function makeBExam(questions: Question[], random: RandomSource = Math.random) {
  const eligible = questions.filter(isExamEligible);
  const selected: Question[] = [];
  const selectedIds = new Set<number>();

  for (const section of B_EXAM_BLUEPRINT) {
    const pool = shuffle(getSectionPool(section.key, eligible).filter((question) => !selectedIds.has(question.id)), random);
    const picked = pool.slice(0, section.count);
    picked.forEach((question) => {
      selected.push(question);
      selectedIds.add(question.id);
    });
  }

  if (selected.length < EXAM_TOTAL) {
    const hasCritical = selected.some((question) => question.critical);
    const fallbackPool = shuffle(eligible.filter((question) => !selectedIds.has(question.id) && (!question.critical || !hasCritical)), random);
    fallbackPool.slice(0, EXAM_TOTAL - selected.length).forEach((question) => {
      selected.push(question);
      selectedIds.add(question.id);
    });
  }

  return shuffle(selected, random).slice(0, EXAM_TOTAL);
}

export function createPresetExamSets(questions: Question[], count = EXAM_PRESET_COUNT) {
  return Array.from({ length: count }, (_, index) => makeBExam(questions, createSeededRandom(20250512 + index * 9973)));
}

export function getAccuracy(progress: StoredProgress) {
  const records = Object.values(progress.answered);
  if (!records.length) {
    return 0;
  }

  return Math.round((records.filter((record) => record.correct).length / records.length) * 100);
}
