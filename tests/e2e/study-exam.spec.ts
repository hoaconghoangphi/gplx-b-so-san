import { expect, test } from "@playwright/test";

test("study mode shows immediate feedback after choosing an answer", async ({ page }) => {
  await page.goto("/study");

  await expect(page.getByRole("heading", { name: /Học và thi thử lý thuyết GPLX/i })).toBeVisible();
  await page.getByRole("button", { name: /^A\./ }).first().click();

  await expect(page.getByText("Giải thích", { exact: true })).toBeVisible();
  await expect(page.getByText(/Đáp án đúng|Bạn chọn đúng|Bạn chọn sai/)).toBeVisible();
});

test("mock exam starts only after pressing START and can submit", async ({ page }) => {
  await page.goto("/exam");

  await expect(page.getByText("Chọn bộ đề trước khi bắt đầu")).toBeVisible();
  await expect(page.getByText("20:00")).toBeVisible();

  await page.getByRole("button", { name: "START" }).click();
  await expect(page.getByRole("button", { name: "Nộp bài" })).toBeVisible();
  await page.getByRole("button", { name: "Nộp bài" }).click();

  await expect(page.getByText(/Đạt|Chưa đạt/)).toBeVisible();
  await expect(page.getByText(/Review/)).toBeVisible();
});
