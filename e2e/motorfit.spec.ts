import { test, expect, type Page } from "@playwright/test";

const cases = [
  ["0.287", "3.6", ""], ["0.534", "4.0", "260"], ["0.763", "3.8", "310"], ["1.246", "4.1", ""],
  ["1.583", "3.5", "420"], ["1.917", "4.0", "480"], ["2.341", "4.1", ""], ["2.786", "3.2", "600"],
] as const;

async function calculate(page: Page, mass: string, pressure: string, thrust: string) {
  await expect(page.getByRole("button", { name: "질량 기준 계산" })).toBeEnabled({ timeout: 30_000 });
  await page.waitForTimeout(500);
  const fillVisible = async (name: string, value: string) => {
    const index = name.includes("질량") ? 0 : name.includes("압력") ? 1 : 2;
    await page.locator("aside input[type=number]").nth(index).fill(value);
  };
  const waitDone = async () => {
    const massButton = page.getByRole("button", { name: "질량 기준 계산" });
    try { await expect(massButton).toBeDisabled({ timeout: 5_000 }); } catch { /* very fast calculation */ }
    await expect(massButton).toBeEnabled({ timeout: 300_000 });
  };
  await fillVisible("목표 연료 질량 kg", mass);
  await expect(page.locator("aside input[type=number]").nth(0)).toHaveValue(mass);
  await fillVisible("최대 허용 압력 MPa", pressure);
  await fillVisible("목표 평균 추력 N", thrust);
  await page.getByRole("button", { name: "최종 추천 계산" }).click();
  await waitDone();
  await expect(page.getByText(/UI 단계\s*3\s*\/\s*3/)).toBeVisible({ timeout: 300_000 });
}

test.describe.configure({ timeout: 360_000 });
test.describe("MotorFit 8개 자동 추천 케이스", () => {
  for (const [mass, pressure, thrust] of cases) {
    test(`${mass} kg / ${pressure} MPa / ${thrust || "추력 공란"}`, async ({ page }) => {
      await page.addInitScript(() => localStorage.clear()); await page.goto("/");
      await page.waitForTimeout(5000);
      await calculate(page, mass, pressure, thrust);
      await expect(page.getByText("자동 확장 단계", { exact: true })).toBeVisible();
      await expect(page.getByText(/전체\s+[\d,]+개 · 정밀 계산/)).toBeVisible();
      await expect(page.getByText(/전역 최적해를 보장하지 않습니다/)).toBeVisible();
      await expect(page.getByText(/^추천\s+\d+$/)).toBeVisible();
      await expect(page.getByText(/^조건부\s+\d+$/)).toBeVisible();
      await expect(page.getByText(/^참고용 탈락\s+\d+$/)).toBeVisible();
      await expect(page.getByText(/^탈락\s+\d+$/)).toBeVisible();
      if (!thrust) {
        await expect(page.getByText("추력 목표가 비어 있어 MSE·최대 편차·추력 변동성·추력 점수는 계산하지 않습니다.")).toBeVisible();
        await expect(page.getByText("평균제곱오차")).toHaveCount(0);
      }
    });
  }
});

test("잘못된 입력, 취소 후 재계산", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear()); await page.goto("/"); await page.waitForTimeout(5000);
  await page.getByRole("button", { name: /상세 설정 열기/ }).click();
  for (const [name, value] of [["Do · 외경 min", "40"], ["Do · 외경 max", "80"], ["do · 코어 직경 min", "10"], ["do · 코어 직경 max", "30"], ["Lo · 세그먼트 길이 min", "75"], ["Lo · 세그먼트 길이 max", "125"], ["세그먼트 수 최소", "2"], ["세그먼트 수 최대", "4"]] as const) { const field = page.getByRole("spinbutton", { name }); if (await field.count()) await field.fill(value); }
  await page.locator("aside input[type=number]").nth(0).fill("0");
  await page.getByRole("button", { name: "질량 기준 계산" }).click();
  await expect(page.getByText("입력을 확인하세요")).toBeVisible();
  await page.locator("aside input[type=number]").nth(0).fill("2.786");
  await page.getByRole("button", { name: "질량 기준 계산" }).click();
  await expect(page.getByRole("button", { name: "계산 취소" })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "계산 취소" }).click();
  await expect(page.getByText("계산이 취소되었습니다.")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "질량 기준 계산" }).click();
  await expect(page.getByText(/전체\s+[\d,]+개/)).toBeVisible({ timeout: 120_000 });
});

test("AN 241개, 검색, 필터, 3개 비교, 내보내기", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear()); await page.goto("/"); await page.waitForTimeout(5000);
  await calculate(page, "0.3956", "4.1", "");
  await page.getByRole("button", { name: "AN 시리즈 전체 검사" }).click();
  await expect(page.getByText("검사 241개")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("AN-132-NBR")).toBeVisible();
  const search = page.getByLabel("AN 형번 검색");
  await search.fill("AN-337-NBR"); await expect(page.getByText("AN-337-NBR")).toBeVisible();
  await search.fill("AN-338-NBR"); await expect(page.getByText("AN-338-NBR")).toBeVisible();
  await page.getByRole("checkbox", { name: "탈락" }).click();
  await expect(page.getByText("후보 필터·비교·내보내기")).toBeVisible();
  const compareButtons = page.getByRole("button", { name: "비교 후보 선택" });
  expect(await compareButtons.count()).toBeGreaterThan(0);
  for (let i = 0; i < Math.min(3, await compareButtons.count()); i++) await compareButtons.nth(i).click();
  await expect(page.getByText(/선택 후보 비교 \(/)).toBeVisible();
  const download = page.waitForEvent("download"); await page.getByRole("button", { name: "CSV 내보내기" }).click();
  const csvEvent = await download; const csvPath = await csvEvent.path(); expect(csvPath).toBeTruthy(); expect(csvEvent.suggestedFilename()).toBe("motorfit-results.csv");
  const { readFile } = await import("node:fs/promises");
  const csv = await readFile(csvPath!, "utf8");
  expect(csv).toContain("targetThrustEnabled"); expect(csv).toContain("referenceCandidate"); expect(csv).toContain("AN");
  const jsonDownload = page.waitForEvent("download"); await page.getByRole("button", { name: "JSON 내보내기" }).click();
  const jsonEvent = await jsonDownload; const jsonPath = await jsonEvent.path(); expect(jsonPath).toBeTruthy(); expect(jsonEvent.suggestedFilename()).toBe("motorfit-results.json");
  const payload = JSON.parse(await readFile(jsonPath!, "utf8"));
  expect(payload.input).toBeTruthy(); expect(payload.search).toBeTruthy(); expect(payload.referenceCandidate).toBeDefined();
  expect(payload.an.catalogSize).toBe(241); expect(payload.an.query).toBeDefined(); expect(payload.an.page).toBeDefined(); expect(payload.referenceRule).toContain("추천·조건부"); expect((await readFile(csvPath!, "utf8")).length).toBeGreaterThan(100);
  expect(payload.input.fuelMassToleranceDisplay).toBe("0.010 kg"); expect(payload.search.counts.referenceRejected).toBe(0); expect(payload.representativeCandidate).toBeDefined();
  expect(payload.metadata.engineVersion).toBe("candidate-search-1"); expect(payload.metadata.status).toBe("completed"); expect(payload.metadata.anCatalogItemCount).toBe(241); expect(payload.metadata.calculatedAt).toBeTruthy();
  expect(payload.modelValidationLevel).toContain("기준 모델"); expect(payload.baselineReproductionStatus).toBe("확인됨"); expect(payload.deterministicCalculationStatus).toBe("확인됨"); expect(payload.hardwareValidationStatus).toBe("확인되지 않음"); expect(payload.productionApprovalStatus).toBe("제공하지 않음"); expect(payload.validationDataAvailable).toBe(false); expect(payload.assumptions.length).toBeGreaterThan(0); expect(payload.limitations.length).toBeGreaterThan(0);
  expect(payload.validation.status).toBe("NOT_RUN"); expect(payload.validation.summary).toContain("실행하지 않음"); expect(payload.validation.baselineStatus).toBe("PASS"); expect(payload.validation.fixtures.length).toBeGreaterThan(0);
  expect(csv).toContain("validation"); expect(csv).toContain("modelValidationLevel"); expect(csv).toContain("hardwareValidationStatus"); expect(csv).toContain("validationDataAvailable");
  await expect(page.getByText("설계 검토 리포트", { exact: true })).toBeVisible();
  await page.getByText("계산 결과 이력", { exact: true }).click();
  await page.getByLabel("저장 결과 이름").fill("배포 회귀 결과 A"); await page.getByRole("button", { name: "현재 결과 저장" }).click();
  await expect(page.getByText("“배포 회귀 결과 A” 결과를 저장했습니다.")).toBeVisible();
  const history = await page.evaluate(() => JSON.parse(localStorage.getItem("motorfit-calculation-history-v1") ?? "[]"));
  expect(history).toHaveLength(1); expect(history[0].payload.validation.status).toBe("NOT_RUN");
  await page.getByLabel("저장 결과 이름").fill("배포 회귀 결과 B"); await page.getByRole("button", { name: "현재 결과 저장" }).click();
  await page.getByLabel("비교 결과 1").selectOption({ label: "배포 회귀 결과 A" }); await page.getByLabel("비교 결과 2").selectOption({ label: "배포 회귀 결과 B" });
  await expect(page.getByText(/저장 결과 비교 · 차이만 강조/)).toBeVisible();
});

test("초보자 사용 설명서와 메인 화면 이동", async ({ page }) => {
  await page.goto("/guide");
  await expect(page.getByRole("heading", { name: "처음이라면, 이 순서로 보세요." })).toBeVisible();
  await expect(page.getByText("3단계 빠른 시작")).toBeVisible();
  await expect(page.getByText(/0\.3956 kg/)).toBeVisible();
  await expect(page.getByText(/목표 평균 추력 미입력/)).toBeVisible();
  await expect(page.getByText("전역 최적해를 보장하지 않습니다.")).toBeVisible();
  await page.getByRole("link", { name: "계산 시작하기" }).click();
  await expect(page.getByRole("heading", { name: "형상 후보를 계산하고 비교합니다." })).toBeVisible();
  const guideLink = page.getByRole("link", { name: "사용 설명서 열기" });
  await guideLink.focus();
  await expect(guideLink).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/guide");
  await expect(page.getByRole("heading", { name: "처음이라면, 이 순서로 보세요." })).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("link", { name: "사용 설명서 열기" })).toBeVisible();
});

test("후보 유형별 상세보기와 비교 선택 분리", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
  await page.waitForTimeout(5000);
  await calculate(page, "0.763", "3.8", "310");
  await expect(page.getByText(/Do 55 × do 20 × Lo 105 \/ 2/)).toBeVisible();
  const detailButtons = page.getByRole("button", { name: /상세 보기/ });
  expect(await detailButtons.count()).toBeGreaterThan(0);
  await detailButtons.first().click();
  await expect(page.getByText(/추천 후보 상세|조건부 후보 상세|탈락 후보 상세|참고용 탈락 후보 상세/)).toBeVisible();
  const comparisonButton = page.getByRole("button", { name: "비교 후보 선택" }).first();
  await comparisonButton.click();
  await expect(page.getByText(/선택 후보 비교 \(1\/3\)/)).toBeVisible();
  await expect(page.getByText(/추천 후보 상세|조건부 후보 상세|탈락 후보 상세|참고용 탈락 후보 상세/)).toBeVisible();
});

test("참고용 탈락 후보 집계와 카드 표시가 동일한 규칙을 따른다", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear()); await page.goto("/"); await page.waitForTimeout(1000);
  await calculate(page, "0.763", "3.8", "310");
  await expect(page.getByText(/^참고용 탈락 1$/)).toBeVisible();
  await expect(page.getByText("참고용 탈락 후보", { exact: true }).last()).toBeVisible();
  await expect(page.getByTestId("representative-candidate").getByText(/0\.7572/)).toBeVisible();
  await calculate(page, "2.000", "4.0", "");
  await expect(page.getByText(/^참고용 탈락 0$/)).toBeVisible();
  await expect(page.getByText("참고용 탈락 후보", { exact: true })).toHaveCount(0);
});

test("2.000 kg 기본 질량 허용 오차 분류와 상세보기", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
  await page.waitForTimeout(5000);
  await calculate(page, "2.000", "4.0", "");
  const nearTargetRow = page.getByRole("row").filter({ hasText: "1.9904 kg" }).first();
  await expect(nearTargetRow.getByRole("status", { name: "조건부 후보" })).toBeVisible();
  await nearTargetRow.getByRole("button", { name: /상세 보기/ }).click();
  await expect(page.getByText("조건부 후보 상세", { exact: true })).toBeVisible();
  await expect(page.getByRole("spinbutton", { name: "목표 평균 추력" })).toHaveValue("");
  await expect(page.getByText("추천 후보 없음 · 조건부 후보를 확인하세요")).toBeVisible();
  await expect(page.getByRole("button", { name: "조건부 후보 상세 보기" })).toBeVisible();
});

test("390px에서 후보 상세·비교·고급 영역을 직접 조작", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear()); await page.setViewportSize({ width: 390, height: 844 }); await page.goto("/"); await page.waitForTimeout(1000);
  await calculate(page, "0.534", "4.0", "260");
  await page.getByRole("button", { name: /상세 보기/ }).first().click();
  await expect(page.getByText(/후보 상세/).first()).toBeVisible();
  const compare = page.getByRole("button", { name: /비교에 추가|비교 후보 선택/ }).first(); await compare.click(); await expect(page.getByText(/선택 후보 비교 \(1\/3\)/)).toBeVisible(); await compare.click();
  const advanced = page.getByText("고급 검증 · GSRM / AN 검사"); await advanced.click(); await advanced.click(); await expect(page.getByRole("button", { name: "AN 시리즈 전체 검사" })).toBeVisible();
  await page.getByText("압력·추력·Kn 그래프").click(); await expect(page.getByText("추력 · 시간")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= 390)).toBe(true);
});

test("질량 허용 오차 기본값과 저장값 마이그레이션", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
  await expect(page.getByText(/현재 적용 중인 질량 허용 오차: 0\.010 kg/)).toBeVisible();
  const saved = await page.evaluate(() => JSON.parse(window.localStorage.getItem("motorfit-input-v1") ?? "{}"));
  saved.config.fuelMassToleranceKg = 0.005;
  await page.evaluate((value) => window.localStorage.setItem("motorfit-input-v1", JSON.stringify(value)), saved);
  await page.reload();
  await expect(page.getByText(/현재 적용 중인 질량 허용 오차: 0\.010 kg/)).toBeVisible();
  await page.waitForTimeout(5000);
  await calculate(page, "0.3956", "4.1", "");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "JSON 내보내기" }).click();
  const jsonPath = await (await download).path();
  expect(jsonPath).toBeTruthy();
  const { readFile } = await import("node:fs/promises");
  const payload = JSON.parse(await readFile(jsonPath!, "utf8"));
  expect(payload.input.fuelMassToleranceKg).toBe(0.01);
  const csvDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV 내보내기" }).click();
  const csvPath = await (await csvDownload).path();
  expect(csvPath).toBeTruthy();
  expect(await readFile(csvPath!, "utf8")).toContain('"fuelMassToleranceKg":0.01');
});

test("동일 입력은 동일한 대표 후보를 유지하고 모바일 요약을 우선 표시", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.waitForTimeout(1500);
  await calculate(page, "2.000", "4.0", "");
  const first = await page.getByTestId("representative-candidate").innerText();
  const firstCounts = await page.getByText(/전체\s+[\d,]+개 · 정밀 계산/).first().innerText();
  await page.getByRole("button", { name: "최종 추천 계산" }).click();
  await expect(page.getByText(/UI 단계\s*3\s*\/\s*3/)).toBeVisible({ timeout: 300_000 });
  const second = await page.getByTestId("representative-candidate").innerText();
  const secondCounts = await page.getByText(/전체\s+[\d,]+개 · 정밀 계산/).first().innerText();
  expect(second).toBe(first);
  expect(secondCounts).toBe(firstCounts);
});

test("저장 이력 손상 복구", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("motorfit-calculation-history-v1", "{broken-json");
  });
  await page.goto("/");
  await page.getByRole("button", { name: "최종 추천 계산" }).click();
  await page.getByText("계산 결과 이력", { exact: true }).click();
  await expect(page.getByText(/저장된 결과 데이터가 손상되어 무시했습니다/)).toBeVisible({ timeout: 120000 });
  expect(await page.evaluate(() => localStorage.getItem("motorfit-calculation-history-v1"))).toBe("[]");
});

test("계산 결과 이력 JSON 백업·복원과 잘못된 파일 거부", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
  await page.waitForTimeout(1000);
  await calculate(page, "0.3956", "4.1", "");
  await page.getByText("계산 결과 이력", { exact: true }).click();
  await page.getByLabel("저장 결과 이름").fill("백업 원본");
  await page.getByRole("button", { name: "현재 결과 저장" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "전체 이력 JSON 백업" }).click();
  const backup = await download;
  expect(backup.suggestedFilename()).toBe("motorfit-calculation-history-backup.json");
  const backupPath = await backup.path();
  expect(backupPath).toBeTruthy();
  const { readFile } = await import("node:fs/promises");
  const backupPayload = JSON.parse(await readFile(backupPath!, "utf8"));
  expect(backupPayload.app).toBe("MotorFit");
  expect(backupPayload.schemaVersion).toBe(1);
  expect(backupPayload.results).toHaveLength(1);
  await page.getByRole("button", { name: "삭제" }).click();
  await expect(page.getByText("저장된 계산 결과가 없습니다.")).toBeVisible();
  const fileInput = page.getByLabel("계산 결과 백업 파일 선택");
  await fileInput.setInputFiles(backupPath!);
  await expect(page.getByText(/백업 1개를 확인했습니다/)).toBeVisible();
  await page.getByRole("button", { name: "기존 이력에 추가" }).click();
  await expect(page.getByText("백업 원본").first()).toBeVisible();
  await fileInput.setInputFiles({ name: "invalid.json", mimeType: "application/json", buffer: Buffer.from("{broken") });
  await expect(page.getByText(/백업을 불러오지 않았습니다/)).toBeVisible();
});

test("설계 검토 리포트 인쇄와 저장 결과 리포트", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
  await page.waitForTimeout(1000);
  await calculate(page, "0.3956", "4.1", "");
  await page.getByRole("button", { name: /인쇄 \/ PDF로 저장 · 설계 검토 리포트/ }).click();
  await expect(page.getByRole("button", { name: /인쇄 \/ PDF로 저장 · 설계 검토 리포트/ })).toBeVisible();
  await page.getByText("계산 결과 이력", { exact: true }).click();
  await page.getByLabel("저장 결과 이름").fill("리포트 저장 결과");
  await page.getByRole("button", { name: "현재 결과 저장" }).click();
  await page.getByLabel("리포트 저장 결과 선택").selectOption({ label: "리포트 저장 결과" });
  await page.getByRole("button", { name: "인쇄 / PDF로 저장" }).last().click();
  await expect(page.getByRole("button", { name: "인쇄 / PDF로 저장" }).last()).toBeVisible();
});
