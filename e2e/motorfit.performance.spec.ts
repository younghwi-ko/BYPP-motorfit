import { test, expect } from "@playwright/test";

test.setTimeout(360_000);
test("대규모 탐색 진행률과 취소 응답 시간", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear()); await page.goto("/"); await page.waitForTimeout(5000);
  await page.locator("aside input[type=number]").nth(0).fill("2.786");
  const start = Date.now();
  await page.getByRole("button", { name: "질량 기준 계산" }).click();
  const cancelButton = page.getByRole("button", { name: "계산 취소" });
  await expect(cancelButton).toBeVisible({ timeout: 15_000 });
  const progressStart = Date.now();
  await cancelButton.click();
  await expect(page.getByText("계산이 취소되었습니다.")).toBeVisible({ timeout: 30_000 });
  const cancelMs = Date.now() - progressStart;
  expect(cancelMs).toBeLessThan(30_000);
  await page.getByRole("button", { name: "질량 기준 계산" }).click();
  await expect(page.getByText(/전체\s+[\d,]+개/)).toBeVisible({ timeout: 120_000 });
  const totalMs = Date.now() - start;
  expect(totalMs).toBeLessThan(180_000);
});
