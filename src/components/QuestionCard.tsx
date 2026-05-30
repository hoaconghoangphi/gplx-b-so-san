"use client";

import Image from "next/image";
import type { ExplanationReview, ExplanationSource, Question, TipSource } from "@/lib/types";

const explanationSourceLabels: Record<ExplanationSource, string> = {
  "official-capture": "Nguồn hệ thống chính thức",
  "paper-note": "Tài liệu giấy",
  source: "Nguồn tham khảo",
  "ai-draft": "AI nháp",
  manual: "Nhập tay",
};

const tipSourceLabels: Record<TipSource, string> = {
  "paper-note": "Tài liệu giấy",
  source: "Nguồn tham khảo",
  "ai-draft": "AI nháp",
  manual: "Nhập tay",
};

const reviewLabels: Record<ExplanationReview, string> = {
  verified: "Đã kiểm chứng",
  "needs-review": "Cần rà lại",
};

function SourceBadge({ children, tone = "slate" }: { children: React.ReactNode; tone?: "slate" | "amber" | "emerald" }) {
  const toneClass =
    tone === "emerald"
      ? "bg-emerald-100 text-emerald-800"
      : tone === "amber"
        ? "bg-amber-100 text-amber-900"
        : "bg-slate-100 text-slate-700";

  return <span className={`rounded-md px-2 py-1 text-xs font-medium ${toneClass}`}>{children}</span>;
}

export function QuestionCard({
  question,
  selectedAnswer,
  showResult,
  onSelect,
  readOnly = false,
}: {
  question: Question;
  selectedAnswer?: number;
  showResult: boolean;
  onSelect: (answerIndex: number) => void;
  readOnly?: boolean;
}) {
  const hasSelectedAnswer = selectedAnswer !== undefined;
  const selectedIsCorrect = hasSelectedAnswer && selectedAnswer === question.correctAnswer;

  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-5">
        <div className="flex flex-wrap gap-2">
          <SourceBadge>Câu {question.id}</SourceBadge>
          <SourceBadge>Chương {question.chapter}</SourceBadge>
          <SourceBadge>{question.category}</SourceBadge>
          {question.critical ? <SourceBadge tone="amber">Điểm liệt</SourceBadge> : null}
        </div>
        <h2 className="mt-4 text-xl font-semibold leading-8">{question.question}</h2>
      </div>

      <div className="grid gap-3 p-5">
        {question.image ? (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
            <Image src={question.image} alt={`Hình minh họa câu ${question.id}`} width={960} height={540} className="h-auto w-full object-contain" unoptimized />
          </div>
        ) : null}

        {question.answers.map((answer, index) => {
          const selected = selectedAnswer === index;
          const correct = question.correctAnswer === index;
          return (
            <button
              key={`${question.id}-${index}-${answer}`}
              type="button"
              disabled={readOnly}
              onClick={() => onSelect(index)}
              className={`min-h-16 rounded-lg border px-4 py-3 text-left text-base leading-7 transition ${
                showResult && correct
                  ? "border-emerald-600 bg-emerald-50 text-emerald-950"
                  : showResult && selected
                    ? "border-red-500 bg-red-50 text-red-950"
                    : selected
                      ? "border-slate-950 bg-slate-950 text-white"
                      : "border-slate-200 bg-white text-slate-800 hover:bg-slate-50"
              }`}
            >
              <span className="font-semibold">{String.fromCharCode(65 + index)}.</span> {answer}
            </button>
          );
        })}
      </div>

      {showResult ? (
        <div className="grid gap-4 border-t border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-slate-700">
          {hasSelectedAnswer ? (
            <div className={selectedIsCorrect ? "rounded-md bg-emerald-50 p-3 text-emerald-900" : "rounded-md bg-red-50 p-3 text-red-900"}>
              <span className="font-semibold">{selectedIsCorrect ? "Bạn chọn đúng." : "Bạn chọn sai."}</span>{" "}
              Đáp án đúng: <span className="font-semibold">{String.fromCharCode(65 + question.correctAnswer)}. {question.answers[question.correctAnswer]}</span>
            </div>
          ) : null}

          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="font-semibold text-slate-950">Giải thích</span>
              {question.explanationSource ? <SourceBadge>{explanationSourceLabels[question.explanationSource]}</SourceBadge> : null}
              {question.explanationReview ? <SourceBadge tone={question.explanationReview === "verified" ? "emerald" : "amber"}>{reviewLabels[question.explanationReview]}</SourceBadge> : null}
            </div>
            <p>{question.explanation || "Chưa có giải thích riêng. Câu này sẽ được đưa vào danh sách cần bổ sung từ nguồn chính thức, tài liệu giấy hoặc ghi chú đã rà."}</p>
            {question.verifiedAgainst ? <p className="mt-2 text-xs text-slate-500">Đối chiếu: {question.verifiedAgainst}</p> : null}
          </div>

          {question.memoryTip ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-950">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="font-semibold">Mẹo nhớ</span>
                {question.tipSource ? <SourceBadge tone="amber">{tipSourceLabels[question.tipSource]}</SourceBadge> : null}
              </div>
              <p>{question.memoryTip}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
