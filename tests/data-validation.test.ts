import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { questionBank } from "@/data/questions";

describe("question data validation", () => {
  it("passes the official validator", () => {
    expect(() => execFileSync(process.execPath, ["scripts/validate-data.mjs"], { stdio: "pipe" })).not.toThrow();
  });

  it("keeps the expected high-level data shape", () => {
    expect(questionBank).toHaveLength(600);
    expect(questionBank.filter((question) => question.critical)).toHaveLength(60);
    expect(questionBank.filter((question) => question.image)).toHaveLength(318);
  });
});
