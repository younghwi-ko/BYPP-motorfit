import { test, expect, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function result(page: Page) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name: "JSON 내보내기", exact: true }).click();
  const file = await pending;
  return JSON.parse(await readFile((await file.path())!, "utf8"));
}
async function run(page: Page) {
  await page.locator("aside").getByRole("button", { name: /^(계산 시작|다시 계산)$/ }).click();
  await expect(page.getByText(/단계 4\/4 완료/)).toBeVisible({ timeout: 120000 });
  return result(page);
}
async function ranges(page: Page, values: string[]) {
  for (const [index, name] of ["Do · 외경 min", "Do · 외경 max", "do · 코어 직경 min", "do · 코어 직경 max", "Lo · 세그먼트 길이 min", "Lo · 세그먼트 길이 max", "세그먼트 수 최소", "세그먼트 수 최대"].entries()) await page.getByRole("spinbutton", { name }).fill(values[index]);
}

for (const mode of ["제작 후보 모드", "Excel 재현 모드"]) {
  test(`초기 .4 kg / 4 MPa · ${mode} · 상세 설정 토글은 순수 표시 동작`, async ({ page }, info) => {
    await page.goto("/");
    if (mode === "Excel 재현 모드") await page.getByRole("button", { name: mode, exact: true }).click();
    await page.locator("aside input[type=number]").nth(0).fill("0.4");
    await page.locator("aside input[type=number]").nth(1).fill("4");
    const before = await run(page);
    expect(before.metadata.input.burnTimeFilterEnabled).toBe(false);
    expect(before.metadata.input.searchOrder).toBe("target-mass");
    await page.getByRole("button", { name: /상세 설정 열기/ }).click();
    await expect(page.getByLabel("연소시간 필터 적용", { exact: true })).not.toBeChecked();
    if (mode === "제작 후보 모드") await expect(page.getByLabel("탐색 범위 설정", { exact: true })).toHaveValue("automatic");
    await page.getByRole("button", { name: /상세 설정 닫기/ }).click();
    await expect(page.getByRole("alert").filter({ hasText: "재계산 필요" })).toHaveCount(0);
    const toggled = await result(page);
    expect(toggled.metadata).toEqual(before.metadata);
    expect(toggled.search).toEqual(before.search);
    expect(toggled.candidates).toEqual(before.candidates);
    const after = await run(page);
    expect(after.candidates).toEqual(before.candidates);
    expect(after.search).toEqual(before.search);
    await expect(page.getByTestId("search-conditions")).toContainText("비활성 · 판정 제외");
    await info.attach("initial-mode-result", { body: JSON.stringify(before, null, 2), contentType: "application/json" });
    if (mode === "Excel 재현 모드") {
      expect(before.search.precisionEvaluation).toMatchObject({ eligibleCandidates: 706, attemptedCandidates: 200, excludedByLimit: 506, selectionOrder: "target-mass" });
      await page.getByRole("button", { name: /상세 설정 열기/ }).click();
      await page.getByLabel("정밀 계산 최대 후보 수", { exact: true }).fill("2000");
      const full = await run(page);
      expect(full.search.precisionEvaluation).toMatchObject({ eligibleCandidates: 706, attemptedCandidates: 706, excludedByLimit: 0 });
      expect(full.search.searchEnvelope).toEqual(before.search.searchEnvelope);
      await info.attach("full-excel-result", { body: JSON.stringify(full, null, 2), contentType: "application/json" });
    } else {
      expect(before.search.totalCombinations).toBe(1344);
      expect(before.search.evaluatedCombinations).toBe(600);
      expect(before.search.counts).toEqual({ recommend: 0, conditional: 2, referenceRejected: 0, rejected: 562 });
    }
  });
}

test("390px 공통 후보 · 명시적 연소시간 필터 · 화면/다운로드/리포트 조건 일치", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.context().addInitScript(() => { window.print = () => document.documentElement.setAttribute("data-print-called", "true"); });
  await page.goto("/");
  await page.locator("aside input[type=number]").nth(0).fill("0.4");
  await page.locator("aside input[type=number]").nth(1).fill("4");
  await page.getByRole("button", { name: /상세 설정 열기/ }).click();
  await page.getByLabel("탐색 범위 설정", { exact: true }).selectOption("manual");
  await ranges(page, ["45", "45", "10", "10", "75", "75", "2", "2"]);
  const manufacturing = await run(page);
  expect(manufacturing.candidates[0].status).toBe("conditional");
  await page.getByRole("button", { name: "Excel 재현 모드", exact: true }).click();
  const excel = await run(page);
  expect(excel.candidates).toEqual(manufacturing.candidates);
  await page.getByLabel("연소시간 필터 적용", { exact: true }).check();
  await expect(page.getByRole("alert").filter({ hasText: "재계산 필요" })).toBeVisible();
  // Old result must retain the old filter until recalculation, including exports.
  expect((await result(page)).input.burnTimeFilterEnabled).toBe(false);
  const filtered = await run(page);
  expect(filtered.candidates[0].status).toBe("fail");
  expect(filtered.candidates[0].reasons).toBe("연소 시간 허용 범위를 벗어났습니다.");
  expect({ ...filtered.candidates[0], status: "conditional", reasons: "" }).toEqual(excel.candidates[0]);
  await expect(page.getByTestId("search-conditions")).toContainText("활성 · 2.1767 s ± 0.03 s");
  const popup = page.waitForEvent("popup");
  await page.getByRole("button", { name: "인쇄 / PDF로 저장 · 설계 검토 리포트", exact: true }).click();
  const report = await popup;
  await expect(report.getByText("연소시간 필터", { exact: true }).locator("..")).toContainText("활성 · 2.1767 s ± 0.03 s");
  await expect(report.getByText("정밀 대상 선정", { exact: true }).locator("..")).toContainText("목표 질량 절대 오차");
  await expect.poll(() => report.locator("html").getAttribute("data-print-called")).toBe("true");
  await report.close();
  await page.reload();
  await page.getByRole("button", { name: /상세 설정 열기/ }).click();
  await expect(page.getByLabel("연소시간 필터 적용", { exact: true })).toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= 390)).toBe(true);
});
