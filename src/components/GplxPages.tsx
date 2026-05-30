"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardCard } from "@/components/DashboardCard";
import { ProgressBar } from "@/components/ProgressBar";
import { QuestionCard } from "@/components/QuestionCard";
import { Timer } from "@/components/Timer";
import {
  AVERAGE_SECONDS_PER_QUESTION,
  B_EXAM_BLUEPRINT,
  categories,
  createPresetExamSets,
  EXAM_PRESET_COUNT,
  EXAM_SECONDS,
  EXAM_TOTAL,
  formatTime,
  getAccuracy,
  gradeBExam,
  makeBExam,
} from "@/lib/exam";
import { emptyProgress, readProgress, writeProgress } from "@/lib/storage";
import type { ExamHistoryItem, ExamResult, Question, QuestionCategory, StoredProgress } from "@/lib/types";

type StudyMode = "all" | "unlearned" | "wrong" | "critical" | "withImage" | "withTip";
type ResultReviewMode = "wrong" | "all";

const studyModes: { key: StudyMode; label: string }[] = [
  { key: "all", label: "Tất cả" },
  { key: "unlearned", label: "Chưa học" },
  { key: "wrong", label: "Câu sai" },
  { key: "critical", label: "Điểm liệt" },
  { key: "withImage", label: "Có hình" },
  { key: "withTip", label: "Có mẹo" },
];

function useStoredProgress() {
  const [progress, setProgress] = useState<StoredProgress>(emptyProgress);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setProgress(readProgress());
      setHydrated(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (hydrated) {
      writeProgress(progress);
    }
  }, [hydrated, progress]);

  return [progress, setProgress] as const;
}

function questionHasTip(question: Question) {
  return Boolean(question.memoryTip?.trim());
}

function getChapterAccuracy(questions: Question[], progress: StoredProgress) {
  return [1, 2, 3, 4, 5, 6].map((chapter) => {
    const chapterQuestions = questions.filter((question) => question.chapter === chapter);
    const answered = chapterQuestions.filter((question) => progress.answered[String(question.id)]);
    const correct = answered.filter((question) => progress.answered[String(question.id)]?.correct).length;
    return {
      chapter,
      total: chapterQuestions.length,
      answered: answered.length,
      accuracy: answered.length ? Math.round((correct / answered.length) * 100) : 0,
    };
  });
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#f6f8f5] text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">GPLX ô tô hạng B</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl">Học và thi thử lý thuyết GPLX</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">Ôn 600 câu, luyện câu sai, câu điểm liệt và làm đề mô phỏng hạng B gồm 30 câu trong 20 phút.</p>
          </div>
          <nav className="flex flex-wrap gap-2">
            {[
              ["/", "Tổng quan"],
              ["/study", "Học"],
              ["/exam", "Thi thử"],
              ["/result", "Kết quả"],
            ].map(([href, label]) => (
              <Link key={href} href={href} className="h-10 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
    </main>
  );
}

export function DashboardPage({ questions }: { questions: Question[] }) {
  const [progress] = useStoredProgress();
  const learned = Object.keys(progress.answered).length;
  const wrongCount = progress.wrongQuestionIds.length;
  const criticalTotal = questions.filter((question) => question.critical).length;
  const criticalLearned = questions.filter((question) => question.critical && progress.answered[String(question.id)]).length;
  const tipTotal = questions.filter(questionHasTip).length;
  const latestHistory = progress.examHistory.slice(0, 5);
  const chapterAccuracy = getChapterAccuracy(questions, progress);

  return (
    <Shell>
      <section className="grid gap-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <DashboardCard title="Tổng câu hỏi" value={questions.length.toString()} />
          <DashboardCard title="Đã học" value={learned.toString()} detail={`${Math.round((learned / questions.length) * 100)}% bộ câu`} />
          <DashboardCard title="Độ chính xác" value={`${getAccuracy(progress)}%`} />
          <DashboardCard title="Điểm liệt" value={`${criticalLearned}/${criticalTotal}`} detail="đã luyện" />
          <DashboardCard title="Câu sai" value={wrongCount.toString()} detail="cần luyện lại" />
          <DashboardCard title="Có mẹo" value={tipTotal.toString()} detail="câu có ghi nhớ" />
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-semibold">Tiến độ học</h2>
            <div className="mt-4 space-y-4">
              <MetricProgress label="Hoàn thành bộ câu" value={learned} total={questions.length} />
              <MetricProgress label="Câu điểm liệt" value={criticalLearned} total={criticalTotal} />
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link className="h-11 rounded-md bg-slate-950 px-4 py-3 text-sm font-medium text-white" href="/study">
                Vào chế độ học
              </Link>
              <Link className="h-11 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-800" href="/study?mode=wrong">
                Luyện câu sai
              </Link>
              <Link className="h-11 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900" href="/study?mode=critical">
                Luyện điểm liệt
              </Link>
              <Link className="h-11 rounded-md bg-emerald-700 px-4 py-3 text-sm font-medium text-white" href="/exam">
                Thi thử hạng B
              </Link>
            </div>
          </section>

          <HistoryPanel history={latestHistory} />
        </div>

        <section className="rounded-lg border border-slate-200 bg-white p-5">
          <h2 className="text-lg font-semibold">Độ chính xác theo chương</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {chapterAccuracy.map((item) => (
              <div key={item.chapter} className="rounded-md bg-slate-50 p-3">
                <MetricProgress label={`Chương ${item.chapter}`} value={item.answered} total={item.total} percent={item.accuracy} />
                <p className="mt-2 text-sm font-medium text-slate-900">{item.accuracy}% đúng</p>
              </div>
            ))}
          </div>
        </section>
      </section>
    </Shell>
  );
}

function MetricProgress({ label, value, total, percent }: { label: string; value: number; total: number; percent?: number }) {
  const progress = percent ?? (total ? (value / total) * 100 : 0);
  return (
    <div>
      <div className="mb-2 flex justify-between gap-3 text-sm text-slate-600">
        <span>{label}</span>
        <span>{value}/{total}</span>
      </div>
      <ProgressBar value={progress} />
    </div>
  );
}

function HistoryPanel({ history }: { history: ExamHistoryItem[] }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      <h2 className="text-lg font-semibold">Lịch sử thi thử</h2>
      <div className="mt-4 grid gap-3">
        {history.length ? (
          history.map((item) => (
            <div key={item.id} className="rounded-md bg-slate-50 p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{new Date(item.date).toLocaleString("vi-VN")}</span>
                <span className={item.passed ? "text-emerald-700" : "text-red-700"}>{item.passed ? "Đạt" : "Chưa đạt"}</span>
              </div>
              <p className="mt-1 text-slate-600">
                {item.score}/{item.total} đúng · {item.reason}
              </p>
            </div>
          ))
        ) : (
          <p className="rounded-md bg-slate-50 p-4 text-sm text-slate-600">Chưa có lượt thi thử nào.</p>
        )}
      </div>
    </section>
  );
}

export function StudyPage({ questions }: { questions: Question[] }) {
  const [progress, setProgress] = useStoredProgress();
  const [category, setCategory] = useState<QuestionCategory | "Tất cả">("Tất cả");
  const [mode, setMode] = useState<StudyMode>("all");
  const [query, setQuery] = useState("");
  const [current, setCurrent] = useState(0);
  const [sessionAnswers, setSessionAnswers] = useState<Record<number, number>>({});

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const modeParam = new URLSearchParams(window.location.search).get("mode");
      if (studyModes.some((item) => item.key === modeParam)) {
        setMode(modeParam as StudyMode);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const filteredQuestions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return questions.filter((question) => {
      const progressRecord = progress.answered[String(question.id)];
      const matchesCategory = category === "Tất cả" || question.category === category;
      const matchesQuery =
        !normalized ||
        question.question.toLowerCase().includes(normalized) ||
        question.answers.some((answer) => answer.toLowerCase().includes(normalized));
      const matchesMode =
        mode === "all" ||
        (mode === "unlearned" && !progressRecord) ||
        (mode === "wrong" && progress.wrongQuestionIds.includes(question.id)) ||
        (mode === "critical" && question.critical) ||
        (mode === "withImage" && Boolean(question.image)) ||
        (mode === "withTip" && questionHasTip(question));

      return matchesCategory && matchesQuery && matchesMode;
    });
  }, [category, mode, progress.answered, progress.wrongQuestionIds, query, questions]);

  const activeQuestion = filteredQuestions[current] ?? filteredQuestions[0];
  const selectedAnswer = activeQuestion ? (sessionAnswers[activeQuestion.id] ?? progress.answered[String(activeQuestion.id)]?.selectedAnswer) : undefined;
  const learnedCount = filteredQuestions.filter((question) => progress.answered[String(question.id)]).length;

  function recordAnswer(question: Question, answerIndex: number) {
    const correct = answerIndex === question.correctAnswer;
    setSessionAnswers((answers) => ({ ...answers, [question.id]: answerIndex }));
    setProgress((currentProgress) => {
      const previous = currentProgress.answered[String(question.id)];
      const wrongQuestionIds = correct
        ? currentProgress.wrongQuestionIds.filter((id) => id !== question.id)
        : Array.from(new Set([...currentProgress.wrongQuestionIds, question.id]));
      return {
        ...currentProgress,
        answered: {
          ...currentProgress.answered,
          [question.id]: {
            selectedAnswer: answerIndex,
            correct,
            attempts: (previous?.attempts ?? 0) + 1,
            lastAnsweredAt: new Date().toISOString(),
          },
        },
        wrongQuestionIds,
      };
    });
  }

  return (
    <Shell>
      <section className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-base font-semibold">Bộ lọc học</h2>
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setCurrent(0);
              }}
              placeholder="Nhập từ khóa"
              className="mt-4 h-11 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none ring-emerald-600 focus:ring-2"
            />
            <div className="mt-4 grid grid-cols-2 gap-2">
              {studyModes.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setMode(item.key);
                    setCurrent(0);
                  }}
                  className={`min-h-10 rounded-md px-3 text-left text-sm transition ${
                    mode === item.key ? "bg-slate-950 text-white" : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="mt-4 grid gap-2">
              {["Tất cả", ...categories].map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    setCategory(item as QuestionCategory | "Tất cả");
                    setCurrent(0);
                  }}
                  className={`min-h-10 rounded-md px-3 text-left text-sm transition ${
                    category === item ? "bg-emerald-700 text-white" : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="min-w-0">
          <div className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
            <MetricProgress label="Tiến độ bộ lọc" value={learnedCount} total={filteredQuestions.length} />
          </div>

          {activeQuestion ? (
            <>
              <QuestionCard
                question={activeQuestion}
                selectedAnswer={selectedAnswer}
                showResult={selectedAnswer !== undefined}
                onSelect={(answerIndex) => recordAnswer(activeQuestion, answerIndex)}
              />
              <QuestionNavigation
                questions={filteredQuestions}
                current={current}
                answeredIds={new Set(Object.keys(progress.answered).map(Number))}
                onJump={setCurrent}
                onPrev={() => setCurrent((value) => Math.max(0, value - 1))}
                onNext={() => setCurrent((value) => Math.min(filteredQuestions.length - 1, value + 1))}
              />
            </>
          ) : (
            <EmptyState title="Không có câu hỏi phù hợp" description="Hãy đổi bộ lọc hoặc bỏ từ khóa tìm kiếm." />
          )}
        </section>
      </section>
    </Shell>
  );
}

export function ExamPage({ questions }: { questions: Question[] }) {
  const [, setProgress] = useStoredProgress();
  const presetExams = useMemo(() => createPresetExamSets(questions), [questions]);
  const [selectedExam, setSelectedExam] = useState("random");
  const [examQuestions, setExamQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [current, setCurrent] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(EXAM_SECONDS);
  const [result, setResult] = useState<ExamResult | null>(null);

  function startExam() {
    const presetIndex = selectedExam.startsWith("preset-") ? Number(selectedExam.replace("preset-", "")) : -1;
    const nextQuestions = presetIndex >= 0 ? (presetExams[presetIndex] ?? makeBExam(questions)) : makeBExam(questions);
    setExamQuestions(nextQuestions);
    setAnswers({});
    setCurrent(0);
    setSecondsLeft(EXAM_SECONDS);
    setResult(null);
  }

  const submitExam = useCallback(
    (finalSecondsLeft = secondsLeft) => {
      const nextResult = gradeBExam(examQuestions, answers, finalSecondsLeft);
      const history: ExamHistoryItem = {
        id: `${Date.now()}`,
        date: new Date().toISOString(),
        score: nextResult.score,
        total: nextResult.total,
        passed: nextResult.passed,
        reason: nextResult.reason,
        wrongQuestionIds: nextResult.wrongQuestions.map((question) => question.id),
        criticalWrongIds: nextResult.criticalWrongQuestions.map((question) => question.id),
        selectedAnswers: Object.fromEntries(Object.entries(answers).map(([id, answer]) => [String(id), answer])),
        examQuestionIds: examQuestions.map((question) => question.id),
        durationSeconds: nextResult.durationSeconds,
      };
      setResult(nextResult);
      setProgress((currentProgress) => ({
        ...currentProgress,
        examHistory: [history, ...currentProgress.examHistory].slice(0, 20),
        wrongQuestionIds: Array.from(new Set([...currentProgress.wrongQuestionIds, ...history.wrongQuestionIds])),
      }));
    },
    [answers, examQuestions, secondsLeft, setProgress],
  );

  useEffect(() => {
    if (result || examQuestions.length === 0) {
      return;
    }
    const timer = window.setInterval(() => {
      setSecondsLeft((seconds) => {
        if (seconds <= 1) {
          submitExam(0);
          return 0;
        }
        return seconds - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [examQuestions.length, result, submitExam]);

  const activeQuestion = examQuestions[current];
  const answeredCount = examQuestions.filter((question) => answers[question.id] !== undefined).length;

  function restartExam() {
    setExamQuestions([]);
    setAnswers({});
    setCurrent(0);
    setSecondsLeft(EXAM_SECONDS);
    setResult(null);
  }

  return (
    <Shell>
      {result ? (
        <ResultDetails result={result} answers={answers} onRestart={restartExam} questions={examQuestions} />
      ) : examQuestions.length === 0 ? (
        <ExamStartScreen selectedExam={selectedExam} onSelectExam={setSelectedExam} onStart={startExam} presetExams={presetExams} />
      ) : (
        <section className="grid gap-5 lg:grid-cols-[320px_1fr]">
          <aside className="space-y-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <h2 className="text-base font-semibold">Thi thử GPLX ô tô hạng B</h2>
              <dl className="mt-4 grid grid-cols-2 gap-2 text-center text-sm">
                <div className="rounded-md bg-slate-50 p-3">
                  <dt className="text-slate-500">Thời gian</dt>
                  <dd className="text-2xl font-semibold"><Timer secondsLeft={secondsLeft} /></dd>
                </div>
                <div className="rounded-md bg-slate-50 p-3">
                  <dt className="text-slate-500">Đã làm</dt>
                  <dd className="text-2xl font-semibold">{answeredCount}/{EXAM_TOTAL}</dd>
                </div>
              </dl>
              <div className="mt-4">
                <MetricProgress label="Tiến độ" value={answeredCount} total={EXAM_TOTAL} />
              </div>
              <p className="mt-4 rounded-md bg-amber-50 p-3 text-sm leading-6 text-amber-900">Gợi ý nhịp làm bài: trung bình khoảng {AVERAGE_SECONDS_PER_QUESTION} giây cho mỗi câu.</p>
              <ExamBlueprint />
              <button type="button" onClick={() => submitExam()} className="mt-4 h-11 w-full rounded-md bg-red-700 px-4 text-sm font-medium text-white">
                Nộp bài
              </button>
            </div>
          </aside>

          <section className="min-w-0">
            {activeQuestion ? (
              <>
                <QuestionCard
                  question={activeQuestion}
                  selectedAnswer={answers[activeQuestion.id]}
                  showResult={false}
                  onSelect={(answerIndex) => setAnswers((currentAnswers) => ({ ...currentAnswers, [activeQuestion.id]: answerIndex }))}
                />
                <QuestionNavigation
                  questions={examQuestions}
                  current={current}
                  answeredIds={new Set(Object.keys(answers).map(Number))}
                  onJump={setCurrent}
                  onPrev={() => setCurrent((value) => Math.max(0, value - 1))}
                  onNext={() => setCurrent((value) => Math.min(examQuestions.length - 1, value + 1))}
                />
              </>
            ) : (
              <EmptyState title="Không tạo được đề thi" description="Cần rà lại dữ liệu câu hỏi hợp lệ." />
            )}
          </section>
        </section>
      )}
    </Shell>
  );
}

export function ResultPage({ questions }: { questions: Question[] }) {
  const [progress] = useStoredProgress();
  const [reviewMode, setReviewMode] = useState<ResultReviewMode>("wrong");
  const latest = progress.examHistory[0];
  const questionById = useMemo(() => new Map(questions.map((question) => [question.id, question])), [questions]);
  const examQuestions = latest?.examQuestionIds?.length ? latest.examQuestionIds.map((id) => questionById.get(id)).filter((question): question is Question => Boolean(question)) : [];
  const wrongQuestions = latest ? latest.wrongQuestionIds.map((id) => questionById.get(id)).filter((question): question is Question => Boolean(question)) : [];
  const reviewQuestions = reviewMode === "all" && examQuestions.length ? examQuestions : wrongQuestions;
  const latestAnswers = latest?.selectedAnswers ?? {};

  return (
    <Shell>
      <section className="grid gap-5">
        <HistoryPanel history={progress.examHistory.slice(0, 10)} />
        {latest ? (
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div>
                <h2 className="text-lg font-semibold">Review lượt gần nhất</h2>
                <p className="mt-2 text-sm text-slate-600">
                  {latest.score}/{latest.total} đúng · {latest.reason} · {formatTime(latest.durationSeconds)}
                </p>
              </div>
              <div className="flex gap-2">
                {(["wrong", "all"] as ResultReviewMode[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setReviewMode(item)}
                    className={`h-10 rounded-md px-3 text-sm font-medium ${reviewMode === item ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-700"}`}
                  >
                    {item === "wrong" ? "Câu sai" : "Toàn bộ đề"}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-4 grid gap-4">
              {reviewQuestions.length ? (
                reviewQuestions.map((question) => (
                  <QuestionCard
                    key={question.id}
                    question={question}
                    selectedAnswer={latestAnswers[String(question.id)]}
                    showResult
                    readOnly
                    onSelect={() => undefined}
                  />
                ))
              ) : (
                <p className="rounded-md bg-emerald-50 p-4 text-sm text-emerald-800">Không có câu sai trong lượt gần nhất.</p>
              )}
            </div>
          </div>
        ) : null}
      </section>
    </Shell>
  );
}

function ExamStartScreen({
  selectedExam,
  onSelectExam,
  onStart,
  presetExams,
}: {
  selectedExam: string;
  onSelectExam: (value: string) => void;
  onStart: () => void;
  presetExams: Question[][];
}) {
  const selectedPresetIndex = selectedExam.startsWith("preset-") ? Number(selectedExam.replace("preset-", "")) : -1;
  const selectedPreset = selectedPresetIndex >= 0 ? presetExams[selectedPresetIndex] : null;
  const criticalCount = selectedPreset?.filter((question) => question.critical).length;

  return (
    <section className="grid gap-5 lg:grid-cols-[1fr_360px]">
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Thi thử hạng B</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-normal text-slate-950">Chọn bộ đề trước khi bắt đầu</h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
          Đồng hồ 20 phút chỉ chạy sau khi bấm Start. Mỗi đề có {EXAM_TOTAL} câu và luôn có ít nhất 1 câu điểm liệt; sai câu điểm liệt sẽ không đạt dù đủ điểm.
        </p>

        <label htmlFor="exam-set" className="mt-6 block text-sm font-medium text-slate-700">
          Bộ đề
        </label>
        <select
          id="exam-set"
          value={selectedExam}
          onChange={(event) => onSelectExam(event.target.value)}
          className="mt-2 h-12 w-full rounded-md border border-slate-200 bg-white px-3 text-base outline-none ring-emerald-600 focus:ring-2"
        >
          <option value="random">Đề ngẫu nhiên - đổi mỗi lần bấm Start</option>
          {Array.from({ length: EXAM_PRESET_COUNT }, (_, index) => (
            <option key={index} value={`preset-${index}`}>
              Đề {index + 1}
            </option>
          ))}
        </select>

        <div className="mt-5 grid gap-3 rounded-lg bg-slate-50 p-4 text-sm text-slate-700 sm:grid-cols-3">
          <ExamStat label="Số câu" value={EXAM_TOTAL.toString()} />
          <ExamStat label="Thời gian" value={formatTime(EXAM_SECONDS)} />
          <ExamStat label="Điểm liệt" value={`${criticalCount ?? ">= 1"}`} tone="red" />
        </div>

        <button type="button" onClick={onStart} className="mt-6 h-12 w-full rounded-md bg-slate-950 px-5 text-base font-semibold text-white hover:bg-slate-800 sm:w-auto">
          START
        </button>
      </div>

      <aside className="rounded-lg border border-slate-200 bg-white p-5">
        <h3 className="text-base font-semibold">Cấu trúc đề</h3>
        <ExamBlueprint />
        <p className="mt-4 rounded-md bg-red-50 p-3 text-sm leading-6 text-red-800">Sai câu điểm liệt trong đề sẽ trượt ngay theo quy tắc sát hạch.</p>
      </aside>
    </section>
  );
}

function ExamStat({ label, value, tone = "slate" }: { label: string; value: string; tone?: "slate" | "red" }) {
  return (
    <div>
      <p className="text-slate-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${tone === "red" ? "text-red-700" : "text-slate-950"}`}>{value}</p>
    </div>
  );
}

function ExamBlueprint() {
  return (
    <div className="mt-4 rounded-md bg-slate-50 p-3">
      <p className="text-sm font-semibold text-slate-800">Cấu trúc đề hạng B</p>
      <ul className="mt-2 grid gap-1 text-sm text-slate-600">
        {B_EXAM_BLUEPRINT.map((section) => (
          <li key={section.key} className="flex justify-between gap-3">
            <span>{section.label}</span>
            <span className="font-medium text-slate-900">{section.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ResultDetails({
  result,
  answers,
  onRestart,
  questions,
}: {
  result: ExamResult;
  answers: Record<number, number>;
  onRestart: () => void;
  questions: Question[];
}) {
  const [reviewMode, setReviewMode] = useState<ResultReviewMode>("wrong");
  const reviewQuestions = reviewMode === "wrong" ? result.wrongQuestions : questions;

  return (
    <section className="grid gap-5">
      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <p className={result.passed ? "text-sm font-semibold text-emerald-700" : "text-sm font-semibold text-red-700"}>{result.passed ? "Đạt" : "Chưa đạt"}</p>
        <h2 className="mt-2 text-3xl font-semibold">
          {result.score}/{result.total} câu đúng
        </h2>
        <p className="mt-2 text-slate-600">
          Lý do: {result.reason}. Thời gian làm bài: {formatTime(result.durationSeconds)}.
        </p>
        <button type="button" onClick={onRestart} className="mt-4 h-11 rounded-md bg-slate-950 px-4 text-sm font-medium text-white">
          Chọn đề khác
        </button>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-5">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <h3 className="text-lg font-semibold">Review bài làm</h3>
          <div className="flex gap-2">
            {(["wrong", "all"] as ResultReviewMode[]).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setReviewMode(item)}
                className={`h-10 rounded-md px-3 text-sm font-medium ${reviewMode === item ? "bg-slate-950 text-white" : "border border-slate-200 bg-white text-slate-700"}`}
              >
                {item === "wrong" ? "Câu sai" : "Toàn bộ đề"}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 grid gap-4">
          {reviewQuestions.length ? (
            reviewQuestions.map((question) => (
              <QuestionCard
                key={question.id}
                question={question}
                selectedAnswer={answers[question.id]}
                showResult
                readOnly
                onSelect={() => undefined}
              />
            ))
          ) : (
            <p className="rounded-md bg-emerald-50 p-4 text-sm text-emerald-800">Không có câu sai.</p>
          )}
        </div>
      </div>
    </section>
  );
}

function QuestionNavigation({
  questions,
  current,
  answeredIds,
  onJump,
  onPrev,
  onNext,
}: {
  questions: Question[];
  current: number;
  answeredIds: Set<number>;
  onJump: (index: number) => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <>
      <div className="mt-4 flex flex-col justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4 sm:flex-row">
        <button type="button" onClick={onPrev} disabled={current === 0} className="h-11 rounded-md border border-slate-200 px-4 text-sm font-medium text-slate-700 disabled:opacity-40">
          Câu trước
        </button>
        <button type="button" onClick={onNext} disabled={current >= questions.length - 1} className="h-11 rounded-md bg-slate-950 px-4 text-sm font-medium text-white disabled:opacity-40">
          Câu tiếp
        </button>
      </div>

      <div className="mt-4 grid grid-cols-6 gap-2 sm:grid-cols-10">
        {questions.map((question, index) => (
          <button
            key={question.id}
            type="button"
            onClick={() => onJump(index)}
            className={`h-10 rounded-md text-xs font-semibold ${
              current === index
                ? "bg-slate-950 text-white"
                : answeredIds.has(question.id)
                  ? "bg-emerald-100 text-emerald-800"
                  : question.critical
                    ? "border border-red-200 bg-red-50 text-red-700"
                    : "border border-slate-200 bg-white text-slate-600"
            }`}
          >
            {index + 1}
          </button>
        ))}
      </div>
    </>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-10 text-center">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="mt-2 text-slate-600">{description}</p>
    </div>
  );
}
