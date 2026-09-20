import { test, expect } from "@playwright/test";

test.setTimeout(360_000);
test("대규모 탐색 진행률과 취소 응답 시간", async ({ page }) => {
  await page.addInitScript(() => { localStorage.clear(); localStorage.setItem("motorfit-input-v1", JSON.stringify({ automaticMode: false })); }); await page.goto("/"); await page.waitForTimeout(5000);
  await page.getByRole("button", { name: /상세 설정 열기/ }).click();
  await page.getByRole("spinbutton", { name: "목표 연료 질량" }).last().fill("20");
  await page.getByRole("spinbutton", { name: "챔버 직경 mm" }).last().fill("200");
  await page.getByRole("spinbutton", { name: "챔버 길이 mm" }).last().fill("500");
  for (const [name, value] of [["Do · 외경 min", "40"], ["Do · 외경 max", "200"], ["do · 코어 직경 min", "10"], ["do · 코어 직경 max", "180"], ["Lo · 세그먼트 길이 min", "25"], ["Lo · 세그먼트 길이 max", "500"], ["세그먼트 수 최소", "1"], ["세그먼트 수 최대", "8"]] as const) {
    await page.getByRole("spinbutton", { name }).fill(value);
  }
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
