"use client";

import Image from "next/image";
import type { Question } from "@/lib/types";

export function QuestionCard({
  question,
  selectedAnswer,
  showResult,
  onSelect,
}: {
  question: Question;
  selectedAnswer?: number;
  showResult: boolean;
  onSelect: (answerIndex: number) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white">
      <div className="border-b border-slate-200 p-5">
        <div className="flex flex-wrap gap-2">
          <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">Câu {question.id}</span>
          <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">Chương {question.chapter}</span>
          <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">{question.category}</span>
          {question.critical ? <span className="rounded-md bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">Điểm liệt</span> : null}
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
        <div className="border-t border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-slate-700">
          <span className="font-semibold text-slate-950">Giải thích: </span>
          {question.explanation || "PDF gốc không có phần giải thích tách riêng. Bạn có thể bổ sung sau trong JSON."}
        </div>
      ) : null}
    </div>
  );
}
