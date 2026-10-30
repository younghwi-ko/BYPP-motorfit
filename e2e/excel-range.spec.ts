import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

test.describe.configure({ timeout: 180_000 });

async function setupExcel(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Excel 재현 모드", exact: true }).click();
  await expect(page.getByText(/최소값부터 1 mm 간격으로 탐색/)).toBeVisible();
  await page.getByRole("button", { name: /상세 설정 열기/ }).click();
  await page.locator("aside input[type=number]").nth(0).fill("1");
}

async function setRanges(page: Page, values: readonly string[]) {
  const names = ["Do · 외경 min", "Do · 외경 max", "do · 코어 직경 min", "do · 코어 직경 max", "Lo · 세그먼트 길이 min", "Lo · 세그먼트 길이 max", "세그먼트 수 최소", "세그먼트 수 최대"];
  for (let index = 0; index < names.length; index++) await page.getByRole("spinbutton", { name: names[index] }).fill(values[index]);
}

async function calculate(page: Page) {
  await page.locator("aside").getByRole("button", { name: /^(계산 시작|다시 계산)$/ }).click();
  await expect(page.getByText(/단계 4\/4 완료/)).toBeVisible({ timeout: 120_000 });
}

async function download(page: Page, name: string) {
  const pending = page.waitForEvent("download");
  await page.getByRole("button", { name, exact: true }).click();
  const file = await pending;
  const path = await file.path();
  expect(path).toBeTruthy();
  const text = await readFile(path!, "utf8");
  expect(text.length).toBeGreaterThan(0);
  return { text, path: path!, filename: file.suggestedFilename() };
}

test("Excel 소수 범위 24개 · 저장·복원·CSV/JSON·인쇄의 실제 간격 보존", async ({ page }) => {
  await page.context().addInitScript(() => { window.print = () => document.documentElement.setAttribute("data-print-called", "true"); });
  await setupExcel(page);
  await setRanges(page, ["40.5", "42.5", "10.25", "11.6", "78.125", "79.6", "1", "2"]);
  await calculate(page);
  await expect(page.getByTestId("excel-search-limit")).toContainText("제한 미적용");
  const json = await download(page, "JSON 내보내기");
  const payload = JSON.parse(json.text);
  expect(json.filename).toBe("motorfit-results.json");
  expect(payload.search.totalCombinations).toBe(24);
  expect(payload.search.evaluatedCombinations).toBe(24);
  expect(payload.search.truncated).toBe(false);
  expect(payload.search.automaticExpansionStage).toBe(0);
  expect(payload.metadata.engineVersion).toBe("candidate-search-2");
  expect(payload.input.mode).toBe("excel");
  expect(payload.input.targetThrustEnabled).toBe(false);
  expect(payload.input.targetThrustText).toBe("");
  expect(payload.resultSemantics.targetThrustCondition).toBe("미입력·미계산");
  const envelope = payload.search.searchEnvelope;
  expect(envelope.outerDiameterMm).toEqual({ min: 40.5, max: 42.5, step: 1 });
  expect(envelope.coreDiameterMm).toEqual({ min: 10.25, max: 11.6, step: 1 });
  expect(envelope.segmentLengthMm).toEqual({ min: 78.125, max: 79.6, step: 1 });
  expect(envelope.segmentCount).toEqual({ min: 1, max: 2 });
  expect(payload.metadata.input.outerDiameterMm).toEqual(envelope.outerDiameterMm);
  expect(payload.input.outerDiameterMm).toEqual(envelope.outerDiameterMm);
  expect(payload.candidates).toHaveLength(24);
  expect([...new Set(payload.candidates.map((row: { geometry: string }) => row.geometry.split("×")[0]))].sort()).toEqual(["40.5", "41.5", "42.5"]);
  await expect(page.getByText("평균제곱오차", { exact: true })).toHaveCount(0);

  // Editing a range must not rewrite the provenance of the completed result.
  await page.getByRole("spinbutton", { name: "Do · 외경 max" }).fill("43.5");
  await expect(page.getByRole("alert").filter({ hasText: "재계산 필요" })).toBeVisible();
  const csv = await download(page, "CSV 내보내기");
  expect(csv.filename).toBe("motorfit-results.csv");
  const csvSection = (name: string) => JSON.parse(csv.text.split("\n").find((line) => line.startsWith(`${name},`))!.slice(name.length + 1));
  expect(csvSection("input").outerDiameterMm).toEqual(envelope.outerDiameterMm);
  expect(csvSection("search")).toEqual(payload.search);
  expect(csvSection("metadata")).toEqual(payload.metadata);
  await page.getByText("계산 결과 이력", { exact: true }).click();
  await page.getByLabel("저장 결과 이름").fill("Excel 1 mm 범위");
  await page.getByRole("button", { name: "현재 결과 저장", exact: true }).click();
  const backup = await download(page, "전체 이력 JSON 백업");
  expect(backup.filename).toBe("motorfit-calculation-history-backup.json");
  const saved = JSON.parse(backup.text).results[0];
  expect(saved.payload.input.outerDiameterMm).toEqual(envelope.outerDiameterMm);
  expect(saved.payload.search).toEqual(payload.search);
  await page.getByRole("button", { name: "삭제", exact: true }).click();
  await expect(page.getByText("저장된 계산 결과가 없습니다.")).toBeVisible();
  await page.getByLabel("계산 결과 백업 파일 선택").setInputFiles(backup.path);
  await page.getByRole("button", { name: "기존 이력에 추가", exact: true }).click();
  await page.getByRole("button", { name: "불러오기", exact: true }).click();
  const restored = JSON.parse((await download(page, "JSON")).text);
  expect(restored.input).toEqual(saved.payload.input);
  expect(restored.metadata).toEqual(saved.payload.metadata);
  expect(restored.search).toEqual(saved.payload.search);
  await page.getByLabel("리포트 저장 결과 선택").selectOption({ label: "Excel 1 mm 범위" });
  const pendingPopup = page.waitForEvent("popup");
  await page.getByRole("button", { name: "인쇄 / PDF로 저장", exact: true }).click();
  const report = await pendingPopup;
  await expect(report.getByText("실제 탐색 범위", { exact: true }).locator("..")).toContainText("Do 40.5~42.5 mm (간격 1 mm)");
  await expect(report.getByText("실제 탐색 범위", { exact: true }).locator("..")).toContainText("세그먼트 1~2 (간격 1)");
  await expect.poll(() => report.locator("html").getAttribute("data-print-called")).toBe("true");
  await report.close();
  await page.reload();
  await page.getByRole("button", { name: /상세 설정 열기/ }).click();
  await expect(page.getByRole("spinbutton", { name: "Do · 외경 max" })).toHaveValue("43.5");
  await expect(page.getByText(/최소값부터 1 mm 간격으로 탐색/)).toBeVisible();
});

test("Excel 최소=최대 기준 케이스와 범위 역전 오류", async ({ page }) => {
  await setupExcel(page);
  await page.locator("aside input[type=number]").nth(0).fill("0.3956");
  await setRanges(page, ["45", "45", "15", "15", "80", "80", "2", "2"]);
  await calculate(page);
  const payload = JSON.parse((await download(page, "JSON 내보내기")).text);
  expect(payload.search.totalCombinations).toBe(1);
  expect(payload.search.evaluatedCombinations).toBe(1);
  expect(payload.representativeCandidate.geometry).toBe("45×15×80/2");
  expect(payload.representativeCandidate.massKg).toBeCloseTo(0.395603169947702, 13);
  expect(payload.representativeCandidate.status).toBe("conditional");
  await page.getByRole("spinbutton", { name: "Do · 외경 min" }).fill("46");
  await page.locator("aside").getByRole("button", { name: "다시 계산", exact: true }).click();
  await expect(page.getByText(/Do 범위의 최소·최대값을 확인하세요/)).toBeVisible();
});

test("390px Excel 정수 범위·세그먼트 입력과 실행", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setupExcel(page);
  await expect(page.getByRole("spinbutton", { name: "정밀 계산 최대 후보 수", exact: true })).toHaveValue("200");
  await page.getByRole("spinbutton", { name: "정밀 계산 최대 후보 수", exact: true }).fill("6");
  await setRanges(page, ["40", "42", "10", "10", "80", "80", "1", "2"]);
  await calculate(page);
  const payload = JSON.parse((await download(page, "JSON 내보내기")).text);
  expect(payload.search.totalCombinations).toBe(6);
  expect(payload.search.evaluatedCombinations).toBe(6);
  expect(payload.candidates).toHaveLength(6);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= 390)).toBe(true);
});

test("Excel Worker 진행률·취소 후 동일 범위 재계산과 제한 표시", async ({ page }) => {
  await setupExcel(page);
  await page.getByRole("spinbutton", { name: "정밀 계산 최대 후보 수", exact: true }).fill("600");
  await page.locator("aside input[type=number]").nth(0).fill("10");
  await setRanges(page, ["30", "45", "10", "25", "25", "65", "1", "3"]);
  await page.locator("aside").getByRole("button", { name: "계산 시작", exact: true }).click();
  await expect(page.getByText(/\d+ \/ 600개 정밀 계산/, { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "계산 취소", exact: true }).click();
  await expect(page.getByText("계산이 취소되었습니다.")).toBeVisible();
  await calculate(page);
  await expect(page.getByTestId("excel-search-limit")).toContainText("제한 적용");
  const payload = JSON.parse((await download(page, "JSON 내보내기")).text);
  expect(payload.search.totalCombinations).toBe(31_488);
  expect(payload.search.evaluatedCombinations).toBe(600);
  expect(payload.search.truncated).toBe(true);
  expect(payload.search.searchEnvelope.outerDiameterMm).toEqual({ min: 30, max: 45, step: 1 });
  expect(payload.search.searchEnvelope.segmentCount).toEqual({ min: 1, max: 3 });
  expect(payload.metadata.precisionEvaluation).toEqual(payload.search.precisionEvaluation);
  expect(payload.search.precisionEvaluation.attemptedCandidates).toBe(600);
  expect(payload.search.precisionEvaluation.excludedByLimit).toBe(payload.search.precisionEvaluation.eligibleCandidates - 600);
});

for (const mobile of [false, true]) {
  test(`Excel 상한 1→10 · 나중 후보 평가·저장 metadata · ${mobile ? "390px" : "데스크톱"}`, async ({ page }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    await page.context().addInitScript(() => { window.print = () => document.documentElement.setAttribute("data-print-called", "true"); });
    await setupExcel(page);
    const limit = page.getByRole("spinbutton", { name: "정밀 계산 최대 후보 수", exact: true });
    await expect(limit).toHaveValue("200");
    await page.locator("aside input[type=number]").nth(0).fill("0.3956");
    await page.getByRole("spinbutton", { name: "질량 허용 오차", exact: false }).fill("0.001");
    await setRanges(page, ["45", "46", "15", "15", "78", "80", "2", "2"]);
    await limit.fill("1");
    await calculate(page);
    const low = JSON.parse((await download(page, "JSON 내보내기")).text);
    const expected = { totalCombinations: 6, eligibleCandidates: 3, attemptedCandidates: 1, excludedByLimit: 2, maxCandidateCount: 1, limited: true, selectionOrder: "range", scope: "evaluated-subset" };
    expect(low.search.precisionEvaluation).toMatchObject(expected);
    expect(low.metadata.precisionEvaluation).toEqual(low.search.precisionEvaluation);
    expect(low.input.maxCandidateCount).toBe(1);
    expect(low.candidates.map((item: { geometry: string }) => item.geometry)).toEqual(["45×15×78/2"]);
    const panel = page.getByTestId("excel-search-limit");
    for (const [label, value] of [["전체 조합 수", "6개"], ["전처리 후 정밀 계산 대상 후보 수", "3개"], ["실제 정밀 평가 시도 수", "1개"], ["상한 때문에 평가하지 못한 후보 수", "2개"]]) {
      await expect(panel.getByText(label, { exact: true }).locator("..")).toContainText(value);
    }
    await expect(panel).toContainText("앞부분만 평가");
    await expect(page.getByTestId("representative-candidate")).toContainText("평가한 일부 후보 중 대표");
    expect(low.search.diagnosis).toContain("미평가 후보");
    await limit.fill("10");
    await expect(page.getByRole("alert").filter({ hasText: "재계산 필요" })).toBeVisible();
    const csv = (await download(page, "CSV 내보내기")).text;
    const csvSearch = JSON.parse(csv.split("\n").find((line) => line.startsWith("search,"))!.slice(7));
    expect(csvSearch.precisionEvaluation).toEqual(low.search.precisionEvaluation);
    expect(JSON.parse((await download(page, "JSON 내보내기")).text).input.maxCandidateCount).toBe(1);
    await page.getByText("계산 결과 이력", { exact: true }).click();
    await page.getByLabel("저장 결과 이름").fill("부분 평가 상한 1");
    await page.getByRole("button", { name: "현재 결과 저장", exact: true }).click();
    const backup = await download(page, "전체 이력 JSON 백업");
    expect(JSON.parse(backup.text).results[0].payload.metadata.precisionEvaluation).toEqual(low.search.precisionEvaluation);
    await page.getByRole("button", { name: "삭제", exact: true }).click();
    await page.getByLabel("계산 결과 백업 파일 선택").setInputFiles(backup.path);
    await page.getByRole("button", { name: "기존 이력에 추가", exact: true }).click();
    const restored = JSON.parse((await download(page, "JSON")).text);
    expect(restored.metadata.precisionEvaluation).toEqual(low.search.precisionEvaluation);
    expect(restored.input.maxCandidateCount).toBe(1);
    await page.getByLabel("리포트 저장 결과 선택").selectOption({ label: "부분 평가 상한 1" });
    const popupEvent = page.waitForEvent("popup");
    await page.getByRole("button", { name: "인쇄 / PDF로 저장", exact: true }).click();
    const report = await popupEvent;
    await expect(report.getByRole("heading", { name: "평가한 일부 후보 중 대표 후보 판정", exact: true })).toBeVisible();
    await expect(report.getByText("상한 때문에 평가하지 못한 후보 수", { exact: true }).locator("..")).toContainText("2");
    await expect(report.getByText(/전처리 후 범위 나열 순서/)).toBeVisible();
    await expect.poll(() => report.locator("html").getAttribute("data-print-called")).toBe("true");
    await report.close();
    await calculate(page);
    const full = JSON.parse((await download(page, "JSON 내보내기")).text);
    expect(full.search.precisionEvaluation).toMatchObject({ ...expected, maxCandidateCount: 10, attemptedCandidates: 3, excludedByLimit: 0, limited: false, scope: "all-preprocessed-candidates" });
    expect(full.search.searchEnvelope).toEqual(low.search.searchEnvelope);
    expect(full.representativeCandidate.geometry).toBe("45×15×80/2");
    expect(full.representativeCandidate.status).toBe("conditional");
    await expect(page.getByTestId("representative-candidate")).toContainText("대표 후보 요약");
    await expect(page.getByTestId("representative-candidate")).not.toContainText("평가한 일부 후보 중 대표");
    if (mobile) expect(await page.evaluate(() => document.documentElement.scrollWidth <= 390)).toBe(true);
    await page.reload();
    await page.getByRole("button", { name: /상세 설정 열기/ }).click();
    await expect(page.getByRole("spinbutton", { name: "정밀 계산 최대 후보 수", exact: true })).toHaveValue("10");
  });
}

test("이전 Excel 부분 결과의 리포트는 상세 집계를 만들지 않고 범위를 한정한다", async ({ page }) => {
  await page.context().addInitScript(() => { window.print = () => document.documentElement.setAttribute("data-print-called", "true"); });
  await setupExcel(page);
  await setRanges(page, ["45", "45", "15", "15", "78", "80", "2", "2"]);
  await page.getByRole("spinbutton", { name: "정밀 계산 최대 후보 수", exact: true }).fill("1");
  await calculate(page);
  await page.getByText("계산 결과 이력", { exact: true }).click();
  await page.getByLabel("저장 결과 이름").fill("이전 부분 평가");
  await page.getByRole("button", { name: "현재 결과 저장", exact: true }).click();
  // Simulate the earlier schema by removing only the new optional metadata
  // from this isolated test result; do not replace any calculation values.
  await page.evaluate(() => {
    const history = JSON.parse(localStorage.getItem("motorfit-calculation-history-v1")!);
    delete history[0].payload.metadata.precisionEvaluation;
    delete history[0].payload.search.precisionEvaluation;
    localStorage.setItem("motorfit-calculation-history-v1", JSON.stringify(history));
  });
  await page.reload();
  // History tools are in the existing result area. A new current calculation
  // reveals that area without recalculating or overwriting the saved snapshot.
  await calculate(page);
  await page.getByText("계산 결과 이력", { exact: true }).click();
  const saved = JSON.parse((await download(page, "JSON")).text);
  expect(saved.search.truncated).toBe(true);
  expect(saved.metadata).not.toHaveProperty("precisionEvaluation");
  expect(saved.search).not.toHaveProperty("precisionEvaluation");
  await page.getByLabel("리포트 저장 결과 선택").selectOption({ label: "이전 부분 평가" });
  const popupEvent = page.waitForEvent("popup");
  await page.getByRole("button", { name: "인쇄 / PDF로 저장", exact: true }).click();
  const report = await popupEvent;
  await expect(report.getByRole("heading", { name: "평가한 일부 후보 중 대표 후보 판정", exact: true })).toBeVisible();
  await expect(report.getByText(/상세 집계는 미기록/)).toBeVisible();
  await expect(report.getByText("전처리 후 정밀 계산 대상 후보 수", { exact: true })).toHaveCount(0);
  await expect.poll(() => report.locator("html").getAttribute("data-print-called")).toBe("true");
});

test("Excel 정밀 상한의 0·음수·소수·공란·정밀도 초과 입력 거부", async ({ page }) => {
  await setupExcel(page);
  const limit = page.getByRole("spinbutton", { name: "정밀 계산 최대 후보 수", exact: true });
  for (const value of ["0", "-1", "1.5", "", "9007199254740992"]) {
    await limit.fill(value);
    await expect(limit).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByRole("alert").filter({ hasText: "정밀 계산 최대 후보 수는" })).toBeVisible();
    await expect(page.locator("aside").getByRole("button", { name: "계산 시작", exact: true })).toBeDisabled();
  }
  await limit.fill("200");
  await expect(limit).toHaveAttribute("aria-invalid", "false");
  await expect(page.locator("aside").getByRole("button", { name: "계산 시작", exact: true })).toBeEnabled();
});
