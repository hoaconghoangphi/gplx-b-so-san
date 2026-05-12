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
  makeBExam,
  PASS_SCORE,
} from "@/lib/exam";
import { emptyProgress, readProgress, writeProgress } from "@/lib/storage";
import type { ExamHistoryItem, ExamResult, Question, QuestionCategory, StoredProgress } from "@/lib/types";

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

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-[#f6f8f5] text-slate-950">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">GPLX ô tô hạng B</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal text-slate-950 sm:text-4xl">Học và thi thử lý thuyết GPLX</h1>
            <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600">Ôn 600 câu, theo dõi tiến độ học và làm đề mô phỏng hạng B gồm 30 câu trong 20 phút.</p>
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
  const criticalTotal = questions.filter((question) => question.critical).length;
  const criticalLearned = questions.filter((question) => question.critical && progress.answered[String(question.id)]).length;
  const latestHistory = progress.examHistory.slice(0, 5);

  return (
    <Shell>
      <section className="grid gap-6">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <DashboardCard title="Tổng câu hỏi" value={questions.length.toString()} />
          <DashboardCard title="Đã học" value={learned.toString()} detail={`${Math.round((learned / questions.length) * 100)}% bộ câu`} />
          <DashboardCard title="Độ chính xác" value={`${getAccuracy(progress)}%`} />
          <DashboardCard title="Câu điểm liệt" value={`${criticalLearned}/${criticalTotal}`} detail="đã luyện" />
          <DashboardCard title="Lịch sử thi" value={progress.examHistory.length.toString()} detail="lượt thi thử" />
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-semibold">Tiến độ học</h2>
            <div className="mt-4 space-y-4">
              <div>
                <div className="mb-2 flex justify-between text-sm text-slate-600">
                  <span>Hoàn thành bộ câu</span>
                  <span>{learned}/{questions.length}</span>
                </div>
                <ProgressBar value={(learned / questions.length) * 100} />
              </div>
              <div>
                <div className="mb-2 flex justify-between text-sm text-slate-600">
                  <span>Câu điểm liệt</span>
                  <span>{criticalLearned}/{criticalTotal}</span>
                </div>
                <ProgressBar value={criticalTotal ? (criticalLearned / criticalTotal) * 100 : 0} />
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link className="h-11 rounded-md bg-slate-950 px-4 py-3 text-sm font-medium text-white" href="/study">
                Vào chế độ học
              </Link>
              <Link className="h-11 rounded-md bg-emerald-700 px-4 py-3 text-sm font-medium text-white" href="/exam">
                Thi thử hạng B
              </Link>
            </div>
          </section>

          <HistoryPanel history={latestHistory} />
        </div>
      </section>
    </Shell>
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
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [current, setCurrent] = useState(0);
  const [sessionAnswers, setSessionAnswers] = useState<Record<number, number>>({});

  const filteredQuestions = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return questions.filter((question) => {
      const matchesCategory = category === "Tất cả" || question.category === category;
      const matchesCritical = !criticalOnly || question.critical;
      const matchesQuery =
        !normalized ||
        question.question.toLowerCase().includes(normalized) ||
        question.answers.some((answer) => answer.toLowerCase().includes(normalized));
      return matchesCategory && matchesCritical && matchesQuery;
    });
  }, [category, criticalOnly, query, questions]);

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
            <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
              <input
                checked={criticalOnly}
                onChange={(event) => {
                  setCriticalOnly(event.target.checked);
                  setCurrent(0);
                }}
                type="checkbox"
                className="h-4 w-4 accent-emerald-700"
              />
              Chỉ câu điểm liệt
            </label>
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
            <div className="mb-2 flex justify-between text-sm text-slate-600">
              <span>Tiến độ bộ lọc</span>
              <span>{learnedCount}/{filteredQuestions.length}</span>
            </div>
            <ProgressBar value={filteredQuestions.length ? (learnedCount / filteredQuestions.length) * 100 : 0} />
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
      const wrongQuestions = examQuestions.filter((question) => answers[question.id] !== question.correctAnswer);
      const criticalWrongQuestions = wrongQuestions.filter((question) => question.critical);
      const score = EXAM_TOTAL - wrongQuestions.length;
      const passed = score >= PASS_SCORE && criticalWrongQuestions.length === 0;
      const reason = passed
        ? "Đạt yêu cầu hạng B"
        : criticalWrongQuestions.length
          ? `Sai ${criticalWrongQuestions.length} câu điểm liệt`
          : `Điểm dưới ${PASS_SCORE}/${EXAM_TOTAL}`;
      const durationSeconds = EXAM_SECONDS - finalSecondsLeft;
      const nextResult = { score, total: EXAM_TOTAL, passed, reason, wrongQuestions, criticalWrongQuestions, durationSeconds };
      const history: ExamHistoryItem = {
        id: `${Date.now()}`,
        date: new Date().toISOString(),
        score,
        total: EXAM_TOTAL,
        passed,
        reason,
        wrongQuestionIds: wrongQuestions.map((question) => question.id),
        criticalWrongIds: criticalWrongQuestions.map((question) => question.id),
        durationSeconds,
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
        <ResultDetails result={result} answers={answers} onRestart={restartExam} />
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
                <div className="mb-2 flex justify-between text-sm text-slate-600">
                  <span>Tiến độ</span>
                  <span>{Math.round((answeredCount / EXAM_TOTAL) * 100)}%</span>
                </div>
                <ProgressBar value={(answeredCount / EXAM_TOTAL) * 100} />
              </div>
              <p className="mt-4 rounded-md bg-amber-50 p-3 text-sm leading-6 text-amber-900">Gợi ý nhịp làm bài: trung bình khoảng {AVERAGE_SECONDS_PER_QUESTION} giây cho mỗi câu.</p>
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
  const latest = progress.examHistory[0];
  const wrongQuestions = latest ? questions.filter((question) => latest.wrongQuestionIds.includes(question.id)) : [];

  return (
    <Shell>
      <section className="grid gap-5">
        <HistoryPanel history={progress.examHistory.slice(0, 10)} />
        {latest ? (
          <div className="rounded-lg border border-slate-200 bg-white p-5">
            <h2 className="text-lg font-semibold">Review lượt gần nhất</h2>
            <p className="mt-2 text-sm text-slate-600">
              {latest.score}/{latest.total} đúng · {latest.reason} · {formatTime(latest.durationSeconds)}
            </p>
            <div className="mt-4 grid gap-3">
              {wrongQuestions.map((question) => (
                <div key={question.id} className="rounded-md border border-slate-200 p-3">
                  <p className="font-medium">Câu {question.id}: {question.question}</p>
                  <p className="mt-1 text-sm text-emerald-700">Đáp án đúng: {question.answers[question.correctAnswer]}</p>
                </div>
              ))}
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
          <div>
            <p className="text-slate-500">Số câu</p>
            <p className="mt-1 text-xl font-semibold text-slate-950">{EXAM_TOTAL}</p>
          </div>
          <div>
            <p className="text-slate-500">Thời gian</p>
            <p className="mt-1 text-xl font-semibold text-slate-950">{formatTime(EXAM_SECONDS)}</p>
          </div>
          <div>
            <p className="text-slate-500">Điểm liệt</p>
            <p className="mt-1 text-xl font-semibold text-red-700">{criticalCount ?? ">= 1"}</p>
          </div>
        </div>

        <button type="button" onClick={onStart} className="mt-6 h-12 w-full rounded-md bg-slate-950 px-5 text-base font-semibold text-white hover:bg-slate-800 sm:w-auto">
          START
        </button>
      </div>

      <aside className="rounded-lg border border-slate-200 bg-white p-5">
        <h3 className="text-base font-semibold">Cấu trúc đề</h3>
        <ul className="mt-4 grid gap-2 text-sm text-slate-600">
          {B_EXAM_BLUEPRINT.map((section) => (
            <li key={section.key} className="flex justify-between gap-3 rounded-md bg-slate-50 px-3 py-2">
              <span>{section.label}</span>
              <span className="font-semibold text-slate-950">{section.count}</span>
            </li>
          ))}
        </ul>
        <p className="mt-4 rounded-md bg-red-50 p-3 text-sm leading-6 text-red-800">Sai câu điểm liệt trong đề sẽ trượt ngay theo quy tắc sát hạch.</p>
      </aside>
    </section>
  );
}

function ResultDetails({ result, answers, onRestart }: { result: ExamResult; answers: Record<number, number>; onRestart: () => void }) {
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
        <h3 className="text-lg font-semibold">Review câu sai</h3>
        <div className="mt-4 grid gap-4">
          {result.wrongQuestions.length ? (
            result.wrongQuestions.map((question) => (
              <div key={question.id} className="rounded-lg border border-slate-200 p-4">
                <p className="font-medium leading-7">Câu {question.id}: {question.question}</p>
                <p className="mt-2 text-sm text-red-700">Bạn chọn: {answers[question.id] !== undefined ? question.answers[answers[question.id]] : "Chưa chọn"}</p>
                <p className="mt-1 text-sm text-emerald-700">Đáp án đúng: {question.answers[question.correctAnswer]}</p>
              </div>
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
