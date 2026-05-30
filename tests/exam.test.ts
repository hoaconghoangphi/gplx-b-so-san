import { describe, expect, it } from "vitest";
import { questionBank } from "@/data/questions";
import { B_EXAM_BLUEPRINT, EXAM_TOTAL, formatTime, gradeBExam, makeBExam, PASS_SCORE } from "@/lib/exam";

function answerAllCorrect(examQuestions = makeBExam(questionBank)) {
  return Object.fromEntries(examQuestions.map((question) => [question.id, question.correctAnswer]));
}

describe("GPLX B exam generation", () => {
  it("generates exactly 30 questions with at least one critical question", () => {
    const exam = makeBExam(questionBank);

    expect(exam).toHaveLength(EXAM_TOTAL);
    expect(exam.some((question) => question.critical)).toBe(true);
    expect(new Set(exam.map((question) => question.id)).size).toBe(EXAM_TOTAL);
  });

  it("matches the required B exam chapter blueprint", () => {
    const exam = makeBExam(questionBank);

    expect(exam.filter((question) => question.chapter === 1 && !question.critical)).toHaveLength(B_EXAM_BLUEPRINT[0].count);
    expect(exam.filter((question) => question.critical)).toHaveLength(B_EXAM_BLUEPRINT[1].count);
    expect(exam.filter((question) => question.chapter === 2 && !question.critical)).toHaveLength(B_EXAM_BLUEPRINT[2].count);
    expect(exam.filter((question) => question.chapter === 3 && !question.critical)).toHaveLength(B_EXAM_BLUEPRINT[3].count);
    expect(exam.filter((question) => question.chapter === 4 && !question.critical)).toHaveLength(B_EXAM_BLUEPRINT[4].count);
    expect(exam.filter((question) => question.chapter === 5 && !question.critical)).toHaveLength(B_EXAM_BLUEPRINT[5].count);
    expect(exam.filter((question) => question.chapter === 6 && !question.critical)).toHaveLength(B_EXAM_BLUEPRINT[6].count);
  });
});

describe("GPLX B exam grading", () => {
  it("passes at the official score threshold", () => {
    const exam = makeBExam(questionBank);
    const answers = answerAllCorrect(exam);
    const nonCritical = exam.filter((question) => !question.critical).slice(0, EXAM_TOTAL - PASS_SCORE);

    for (const question of nonCritical) {
      answers[question.id] = (question.correctAnswer + 1) % question.answers.length;
    }

    const result = gradeBExam(exam, answers);

    expect(result.score).toBe(PASS_SCORE);
    expect(result.passed).toBe(true);
  });

  it("fails immediately when a critical question is wrong", () => {
    const exam = makeBExam(questionBank);
    const answers = answerAllCorrect(exam);
    const critical = exam.find((question) => question.critical);
    expect(critical).toBeDefined();

    answers[critical!.id] = (critical!.correctAnswer + 1) % critical!.answers.length;
    const result = gradeBExam(exam, answers);

    expect(result.score).toBe(EXAM_TOTAL - 1);
    expect(result.passed).toBe(false);
    expect(result.criticalWrongQuestions).toHaveLength(1);
  });

  it("formats time as mm:ss", () => {
    expect(formatTime(0)).toBe("00:00");
    expect(formatTime(65)).toBe("01:05");
    expect(formatTime(20 * 60)).toBe("20:00");
  });
});
