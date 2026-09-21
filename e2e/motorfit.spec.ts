import { test, expect, type Page } from "@playwright/test";

const cases = [
  ["0.287", "3.6", ""], ["0.534", "4.0", "260"], ["0.763", "3.8", "310"], ["1.246", "4.1", ""],
  ["1.583", "3.5", "420"], ["1.917", "4.0", "480"], ["2.341", "4.1", ""], ["2.786", "3.2", "600"],
] as const;

async function calculate(page: Page, mass: string, pressure: string, thrust: string) {
  const primaryCalculate = page.locator("aside").getByRole("button", { name: /^(계산 시작|다시 계산)$/ });
  await expect(primaryCalculate).toBeEnabled({ timeout: 30_000 });
  await page.waitForTimeout(500);
  const fillVisible = async (name: string, value: string) => {
    const index = name.includes("질량") ? 0 : name.includes("압력") ? 1 : 2;
    await page.locator("aside input[type=number]").nth(index).fill(value);
  };
  const waitDone = async () => {
    // The mass button is not a reliable completion signal for a later stage:
    // it may remain enabled while the worker is processing pressure/final steps.
    // Wait for the user-visible completed stage instead of inferring completion
    // from an unrelated button state.
    await expect(page.getByText(/단계 4\/4 완료/)).toBeVisible({ timeout: 300_000 });
  };
  await fillVisible("목표 연료 질량 kg", mass);
  await expect(page.locator("aside input[type=number]").nth(0)).toHaveValue(mass);
  await fillVisible("최대 허용 압력 MPa", pressure);
  await fillVisible("목표 평균 추력 N", thrust);
  await primaryCalculate.click();
  await waitDone();
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
  await page.getByRole("button", { name: "계산 시작" }).click();
  await expect(page.getByText("입력을 확인하세요")).toBeVisible();
  await page.locator("aside input[type=number]").nth(0).fill("2.786");
  await page.getByRole("button", { name: "계산 시작" }).click();
  await expect(page.getByRole("button", { name: "계산 취소" })).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "계산 취소" }).click();
  await expect(page.getByText("계산이 취소되었습니다.")).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "계산 시작" }).click();
  await expect(page.getByText(/전체\s+[\d,]+개/)).toBeVisible({ timeout: 120_000 });
});

test("AN 241개, 검색, 필터, 3개 비교, 내보내기", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear()); await page.goto("/"); await page.waitForTimeout(5000);
  await calculate(page, "0.3956", "4.1", "");
  await page.getByText(/GSRM·AN 오링 검토/).click();
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
  expect(payload.calculationFlow).toEqual(["질량 계산", "압력 조건 적용", "추력 조건 적용(입력 시)", "최종 후보 판정"]);
  expect(payload.resultSemantics.massCalculation).toContain("형상·연료 밀도·세그먼트");
  expect(payload.resultSemantics.pressureCondition).toContain("최대 압력");
  expect(payload.resultSemantics.targetThrustCondition).toBe("미입력·미계산");
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

test("외부 검증 데이터 저장·비교·백업", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear()); await page.goto("/"); await page.waitForTimeout(1000);
  await calculate(page, "0.3956", "4.1", "");
  await page.getByText("외부 검증 데이터 비교", { exact: true }).click();
  await page.getByLabel("검증 데이터 이름").fill("시험 기록 A");
  await page.getByLabel("검증 데이터 출처").fill("독립 시험 기록");
  await page.getByLabel("검증 데이터 버전").fill("test-1");
  await page.getByLabel("측정값 평균 추력").fill("200");
  await page.getByLabel("허용 오차 평균 추력").fill("1000");
  await page.getByRole("button", { name: "검증 데이터 저장" }).click();
  await expect(page.locator("p.font-bold", { hasText: "시험 기록 A" }).first()).toBeVisible();
  await expect(page.getByText("범위 내", { exact: true }).last()).toBeVisible();
  await page.getByLabel("검증 데이터 이름").fill("시험 기록 B");
  await page.getByLabel("측정값 평균 추력").fill("201");
  await page.getByLabel("허용 오차 평균 추력").fill("1000");
  await page.getByRole("button", { name: "검증 데이터 저장" }).click();
  await expect(page.getByText("연결 기록 2개", { exact: false })).toBeVisible();
  await page.getByLabel("검증 데이터 수정 대상").selectOption({ label: "시험 기록 B" });
  await page.getByLabel("검증 데이터 이름").fill("시험 기록 B 수정");
  await page.getByRole("button", { name: "검증 데이터 저장" }).click();
  await expect(page.locator("p.font-bold", { hasText: "시험 기록 B 수정" }).first()).toBeVisible();
  const download = page.waitForEvent("download"); await page.getByRole("button", { name: "검증 데이터 JSON 백업" }).click();
  const event = await download; expect(event.suggestedFilename()).toBe("motorfit-external-validation-backup.json");
  const path = await event.path(); expect(path).toBeTruthy();
  const { readFile } = await import("node:fs/promises"); const backup = JSON.parse(await readFile(path!, "utf8"));
  expect(backup.schemaVersion).toBe(1); expect(backup.records).toHaveLength(2); expect(JSON.stringify(backup)).not.toMatch(/password|api[_-]?key|secret|token|process\.env/i);
  await page.getByRole("button", { name: "삭제", exact: true }).first().click();
  await page.getByRole("button", { name: "삭제", exact: true }).first().click();
  await expect(page.getByText("선택한 계산 결과에 연결된 외부 검증 데이터가 없습니다.")).toBeVisible();
  await page.getByLabel("검증 데이터 백업 파일 선택").setInputFiles(path!);
  await expect(page.locator("p.font-bold", { hasText: "시험 기록 A" }).first()).toBeVisible();
});

test("민감도 비교 what-if 시나리오 저장·내보내기", async ({ page }) => {
  test.setTimeout(180000);
  await page.addInitScript(() => localStorage.clear()); await page.goto("/");
  await calculate(page, "0.3956", "4.1", "");
  await page.getByText("민감도 비교 · what-if 시나리오", { exact: true }).click();
  await page.getByLabel("민감도 변경 대상").selectOption("targetFuelMassKg");
  await page.getByLabel("민감도 시나리오 이름").fill("질량 변화");
  await page.getByLabel("민감도 낮은 값").fill("0.35");
  await page.getByLabel("민감도 높은 값").fill("0.45");
  await page.getByRole("button", { name: "시나리오 계산" }).click();
  await expect(page.getByRole("row").filter({ hasText: "질량 변화 · 0.35" })).toBeVisible({ timeout: 60000 });
  await expect(page.getByRole("row").filter({ hasText: "질량 변화 · 0.45" })).toBeVisible({ timeout: 60000 });
  await expect(page.getByText("what-if 비교이며 전역 최적해·안전·제작 가능 판정을 의미하지 않습니다.")).toBeVisible();
  const download = page.waitForEvent("download"); await page.getByRole("button", { name: "JSON 내보내기" }).click();
  const event = await download; const path = await event.path(); expect(path).toBeTruthy();
  const { readFile } = await import("node:fs/promises"); const payload = JSON.parse(await readFile(path!, "utf8"));
  expect(payload.sensitivityScenarios).toHaveLength(2);
  const backup = page.waitForEvent("download"); await page.getByRole("button", { name: "민감도 백업", exact: true }).click();
  const backupEvent = await backup; expect(backupEvent.suggestedFilename()).toBe("motorfit-sensitivity-backup.json");
  await page.getByRole("button", { name: "삭제", exact: true }).last().click();
});

test("민감도 비교의 전체 입력 대상과 기준 결과 보존", async ({ page }) => {
  test.setTimeout(900000);
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
  await calculate(page, "0.3956", "4.1", "");
  await page.getByText("민감도 비교 · what-if 시나리오", { exact: true }).click();
  const scenarios = [
    ["질량", "targetFuelMassKg", "0.35", "0.45"],
    ["압력", "maximumPressureMpa", "3.8", "4.2"],
    ["추력입력", "targetAverageThrustN", "200", "220"],
    ["추력공란", "targetAverageThrustN", "blank", "260"],
    ["Do", "outerDiameterMm", "40", "50"],
    ["do", "coreDiameterMm", "10", "20"],
    ["Lo", "segmentLengthMm", "75", "85"],
    ["세그먼트", "segmentCount", "2", "3"],
  ] as const;
  for (const [name, field, low, high] of scenarios) {
    await page.getByLabel("민감도 변경 대상").selectOption(field);
    await page.getByLabel("민감도 시나리오 이름").fill(name);
    await page.getByLabel("민감도 낮은 값").fill(low);
    await page.getByLabel("민감도 높은 값").fill(high);
    await page.getByRole("button", { name: "시나리오 계산" }).click();
    await expect(page.getByRole("row").filter({ hasText: `${name} · ${low}` })).toBeVisible({ timeout: 120000 });
    await expect(page.getByRole("row").filter({ hasText: `${name} · ${high}` })).toBeVisible({ timeout: 120000 });
  }
  await expect(page.getByText(/기준 결과는 변경하지 않았습니다/)).toBeVisible();
  await expect(page.getByText(/what-if 비교이며 전역 최적해·안전·제작 가능 판정을 의미하지 않습니다/)).toBeVisible();
  await expect(page.getByText(/GSRM B·AN/)).toBeVisible();
  await expect(page.getByText(/후보\/정밀\/확장/)).toBeVisible();
});

test("민감도 입력 규칙과 취소 상태", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.goto("/");
  await calculate(page, "0.3956", "4.1", "");
  await page.getByText("민감도 비교 · what-if 시나리오", { exact: true }).click();
  await page.getByLabel("민감도 변경 대상").selectOption("outerDiameterMm");
  await page.getByLabel("민감도 낮은 값").fill("41");
  await page.getByLabel("민감도 높은 값").fill("50");
  await page.getByRole("button", { name: "시나리오 계산" }).click();
  await expect(page.getByRole("status").filter({ hasText: "5 mm 배수" })).toBeVisible();
  await page.getByLabel("민감도 낮은 값").fill("50");
  await page.getByLabel("민감도 높은 값").fill("40");
  await page.getByRole("button", { name: "시나리오 계산" }).click();
  await expect(page.getByRole("status").filter({ hasText: "낮은 값은 높은 값보다" })).toBeVisible();
  await page.getByLabel("민감도 낮은 값").fill("40");
  await page.getByLabel("민감도 높은 값").fill("50");
  await page.getByRole("button", { name: "시나리오 계산" }).click();
  await expect(page.getByRole("button", { name: "민감도 계산 취소" })).toBeVisible({ timeout: 30000 });
  await page.getByRole("button", { name: "민감도 계산 취소" }).click();
  await expect(page.getByText("민감도 계산을 취소했습니다. 기준 결과는 보존됩니다.")).toBeVisible({ timeout: 30000 });
  await expect(page.getByRole("button", { name: "다시 계산" })).toBeVisible();
});

test("390px 민감도 비교와 백업 버튼 상호작용", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await calculate(page, "0.3956", "4.1", "");
  await page.getByText("민감도 비교 · what-if 시나리오", { exact: true }).click();
  await page.getByLabel("민감도 변경 대상").selectOption("segmentCount");
  await page.getByLabel("민감도 낮은 값").fill("2");
  await page.getByLabel("민감도 높은 값").fill("3");
  await expect(page.getByRole("button", { name: "민감도 백업", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("초보자 사용 설명서와 메인 화면 이동", async ({ page }) => {
  await page.goto("/guide");
  await expect(page.getByRole("heading", { name: "입력부터 결과 검토까지" })).toBeVisible();
  await expect(page.getByText("4단계로 사용합니다")).toBeVisible();
  await expect(page.getByText(/0\.3956 kg/)).toBeVisible();
  await expect(page.getByText(/목표 평균 추력 미입력/)).toBeVisible();
  await expect(page.getByText("전역 최적해를 보장하지 않습니다.")).toBeVisible();
  await page.getByRole("link", { name: "기준 예시로 시작" }).click();
  await expect(page.getByRole("heading", { name: "SRM 후보 계산 및 설계 검토" })).toBeVisible();
  const guideLink = page.getByRole("link", { name: "사용 설명서", exact: true });
  await guideLink.focus();
  await expect(guideLink).toBeFocused();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/guide");
  await expect(page.getByRole("heading", { name: "입력부터 결과 검토까지" })).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("link", { name: "사용 설명서", exact: true })).toBeVisible();
});

test("390px 첫 화면에서 기본 입력과 주 계산 행동을 우선 표시", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const inputs = page.locator("aside input[type=number]");
  await expect(inputs.nth(0)).toBeVisible();
  await expect(inputs.nth(1)).toBeVisible();
  const pressureBox = await inputs.nth(1).boundingBox();
  expect(pressureBox?.y).toBeLessThan(900);
  await expect(page.getByRole("button", { name: "계산 시작" })).toBeVisible();
  await expect(page.getByRole("button", { name: "질량 기준 계산" })).toBeHidden();
  await page.getByText("단계별 확인", { exact: false }).click();
  await expect(page.getByRole("button", { name: "질량 기준 계산" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
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
  const advanced = page.getByText(/GSRM·AN 오링 검토/); await advanced.click(); await expect(page.getByRole("button", { name: "AN 시리즈 전체 검사" })).toBeVisible();
  await page.getByText("압력·추력·Kn 그래프").click(); await expect(page.getByText("추력 · 시간")).toBeVisible();
  await page.getByText(/Fusion 설계 검토/).click(); await expect(page.getByText("Fusion 별도 검토 체크리스트", { exact: true })).toBeVisible();
  await page.getByText(/RPA 노즐 상세해석 연계/).click();
  await expect(page.getByText("챔버 압력 / MEOP", { exact: true })).toBeVisible();
  await expect(page.getByText("챔버 수", { exact: true })).toBeVisible();
  expect(await page.getByText("미입력", { exact: true }).count()).toBeGreaterThan(0);
  await page.getByLabel("RPA 결과 출처").fill("RPA 회귀 기록");
  await page.getByLabel("RPA 버전").fill("RPA-test");
  await page.getByLabel("RPA 데이터베이스").fill("CEA-test");
  await page.getByLabel("RPA 결과값").fill("Bell 결과는 별도 기록");
  await page.getByRole("button", { name: "RPA 결과 별도 저장" }).click();
  await expect(page.getByText(/RPA 회귀 기록 · RPA-test · CEA-test/)).toBeVisible();
  const rpaDownload = page.waitForEvent("download"); await page.getByRole("button", { name: "RPA JSON" }).click();
  const rpaEvent = await rpaDownload; const rpaPath = await rpaEvent.path(); expect(rpaPath).toBeTruthy();
  const { readFile: readRpaFile } = await import("node:fs/promises"); const rpaPayload = JSON.parse(await readRpaFile(rpaPath!, "utf8"));
  expect(rpaPayload.inputSummary.geometry).toBeTruthy(); expect(rpaPayload.inputSummary.values.chamberCount).toBeNull(); expect(rpaPayload.externalResults).toHaveLength(1);
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
  await page.getByRole("button", { name: "다시 계산" }).click();
  await expect(page.getByText(/UI 단계\s*4\s*\/\s*4/)).toBeVisible({ timeout: 300_000 });
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
  await page.getByRole("button", { name: "계산 시작" }).click();
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
  expect(JSON.stringify(backupPayload)).not.toMatch(/password|api[_-]?key|secret|token|process\.env/i);
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
  const stubPrint = () => { window.print = () => { document.documentElement.setAttribute("data-print-called", "true"); }; };
  await page.addInitScript(stubPrint);
  await page.context().addInitScript(stubPrint);
  await page.goto("/");
  await page.waitForTimeout(5000);
  await calculate(page, "0.3956", "4.1", "");
  const currentReportPopup = page.waitForEvent("popup");
  await page.getByRole("button", { name: /인쇄 \/ PDF로 저장 · 설계 검토 리포트/ }).click();
  const currentReport = await currentReportPopup;
  await expect(currentReport.getByText("MotorFit 설계 검토 리포트", { exact: true })).toBeVisible();
  await expect(currentReport.getByText("계산 흐름", { exact: true })).toBeVisible();
  await expect(currentReport.getByText(/질량 계산 결과/)).toBeVisible();
  await expect(currentReport.getByText(/압력 조건 판정/)).toBeVisible();
  await expect(currentReport.getByText(/추력 조건 판정/)).toBeVisible();
  await expect(currentReport.getByText(/PDF로 저장/)).toBeVisible();
  await expect.poll(() => currentReport.locator("html").getAttribute("data-print-called"), { timeout: 5_000 }).toBe("true");
  await page.getByText("계산 결과 이력", { exact: true }).click();
  await page.getByLabel("저장 결과 이름").fill("리포트 저장 결과");
  await page.getByRole("button", { name: "현재 결과 저장" }).click();
  await page.getByLabel("리포트 저장 결과 선택").selectOption({ label: "리포트 저장 결과" });
  const savedReportPopup = page.waitForEvent("popup");
  await page.getByRole("button", { name: "인쇄 / PDF로 저장" }).last().click();
  const savedReport = await savedReportPopup;
  await expect(savedReport.getByText(/MotorFit 저장 결과 · 리포트 저장 결과/)).toBeVisible();
  await expect.poll(() => savedReport.locator("html").getAttribute("data-print-called"), { timeout: 5_000 }).toBe("true");
});

test("인쇄 팝업 차단 시 명확한 오류 안내", async ({ page }) => {
  const blockPopup = () => { window.open = () => null; };
  await page.addInitScript(blockPopup);
  await page.context().addInitScript(blockPopup);
  await page.goto("/");
  await page.waitForTimeout(5000);
  await page.getByRole("button", { name: "기준 예시 불러오기" }).click();
  await calculate(page, "0.3956", "4.1", "");
  await page.getByRole("button", { name: /인쇄 \/ PDF로 저장 · 설계 검토 리포트/ }).click();
  await expect(page.getByRole("status").filter({ hasText: "인쇄용 창이 차단되었습니다" })).toBeVisible();
});

test("앱 자체 점검 실행·백업·리포트", async ({ page }) => {
  await page.addInitScript(() => localStorage.clear());
  const stubPrint = () => { window.print = () => { document.documentElement.setAttribute("data-print-called", "true"); }; };
  await page.addInitScript(stubPrint);
  await page.context().addInitScript(stubPrint);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByText("앱 자체 점검", { exact: true }).click();
  await page.getByRole("button", { name: "자체 점검 실행" }).click();
  await expect(page.getByRole("status").filter({ hasText: /자체 점검 완료/ })).toBeVisible({ timeout: 300_000 });
  await expect(page.getByText(/요약 · 전체 .* · PASS/)).toBeVisible();
  const jsonDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "JSON", exact: true }).click();
  const jsonEvent = await jsonDownload;
  expect(jsonEvent.suggestedFilename()).toBe("motorfit-self-check.json");
  const jsonPath = await jsonEvent.path();
  expect(jsonPath).toBeTruthy();
  const { readFile } = await import("node:fs/promises");
  const report = JSON.parse(await readFile(jsonPath!, "utf8"));
  expect(report.app).toBe("MotorFit");
  expect(report.report.counts.fail).toBe(0);
  const csvDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV", exact: true }).click();
  const csvEvent = await csvDownload;
  expect(csvEvent.suggestedFilename()).toBe("motorfit-self-check.csv");
  const csvPath = await csvEvent.path();
  expect(csvPath).toBeTruthy();
  expect(await readFile(csvPath!, "utf8")).toContain("case,status");
  const popupEvent = page.waitForEvent("popup");
  await page.getByRole("button", { name: "인쇄/PDF" }).click();
  const popup = await popupEvent;
  await expect(popup.getByText("MotorFit 앱 자체 점검 리포트", { exact: true })).toBeVisible();
  await expect.poll(() => popup.locator("html").getAttribute("data-print-called"), { timeout: 5_000 }).toBe("true");
});
