export type QuestionCategory =
  | "Quy định chung và quy tắc giao thông đường bộ"
  | "Văn hóa giao thông, đạo đức người lái xe, PCCC và cứu hộ cứu nạn"
  | "Kỹ thuật lái xe"
  | "Cấu tạo và sửa chữa"
  | "Báo hiệu đường bộ"
  | "Giải thế sa hình và kỹ năng xử lý tình huống giao thông";

export type ExplanationSource = "official-capture" | "paper-note" | "source" | "ai-draft" | "manual";
export type ExplanationReview = "verified" | "needs-review";
export type TipSource = "paper-note" | "source" | "ai-draft" | "manual";

export type Question = {
  id: number;
  category: QuestionCategory;
  chapter: number;
  question: string;
  answers: string[];
  correctAnswer: number;
  explanation: string;
  explanationSource?: ExplanationSource;
  explanationReview?: ExplanationReview;
  verifiedAgainst?: string;
  memoryTip?: string;
  tipSource?: TipSource;
  critical: boolean;
  image: string | null;
  sourceImage?: string;
};

export type ProgressRecord = {
  selectedAnswer: number;
  correct: boolean;
  attempts: number;
  lastAnsweredAt: string;
};

export type ExamHistoryItem = {
  id: string;
  date: string;
  score: number;
  total: number;
  passed: boolean;
  reason: string;
  wrongQuestionIds: number[];
  criticalWrongIds: number[];
  selectedAnswers?: Record<string, number>;
  examQuestionIds?: number[];
  durationSeconds: number;
};

export type StoredProgress = {
  answered: Record<string, ProgressRecord>;
  wrongQuestionIds: number[];
  examHistory: ExamHistoryItem[];
};

export type ExamResult = {
  score: number;
  total: number;
  passed: boolean;
  reason: string;
  wrongQuestions: Question[];
  criticalWrongQuestions: Question[];
  durationSeconds: number;
};
