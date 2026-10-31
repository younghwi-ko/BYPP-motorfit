import { describe, expect, it } from "vitest";
import { createAutomaticCandidateSearchConfig, createExcelRangeSearchConfig, createValidationSearchConfig, searchCandidates, VALIDATION_FIXTURES } from "../src/engine";
import type { CandidateResult, CandidateSearchConfig } from "../src/engine";

const base: CandidateSearchConfig = { ...createValidationSearchConfig(VALIDATION_FIXTURES[0]), targetFuelMassKg: 0.4, maximumPressureMpa: 4, burnTimeFilterEnabled: false };
const key = (candidate: CandidateResult) => [candidate.input.grainOuterDiameterMm, candidate.input.grainCoreDiameterMm, candidate.input.segmentLengthMm, candidate.input.segmentCount].join("/");

describe("두 생성 모드의 공통 형상·명시적 판정 조건", () => {
  it("초기 .4 kg의 실제 범위·정밀 상한 차이를 보존하고 Excel 200을 질량 오차 순으로 선정한다", () => {
    const automatic = searchCandidates(createAutomaticCandidateSearchConfig(base));
    const excel = searchCandidates({ ...base, mode: "excel", maxCandidateCount: 200 });
    const full = searchCandidates({ ...base, mode: "excel", maxCandidateCount: 2000 });
    expect(automatic.totalCombinations).toBe(1344);
    expect(automatic.evaluatedCombinations).toBe(600);
    expect(automatic.metadata?.counts).toEqual({ recommend: 0, conditional: 2, referenceRejected: 0, rejected: 562 });
    expect(excel.precisionEvaluation).toMatchObject({ totalCombinations: 1331, eligibleCandidates: 706, attemptedCandidates: 200, excludedByLimit: 506, selectionOrder: "target-mass" });
    expect(full.precisionEvaluation).toMatchObject({ eligibleCandidates: 706, attemptedCandidates: 706, excludedByLimit: 0 });
    const validByMass = [...full.candidates].sort((a, b) => Math.abs(a.grainMassKg - .4) - Math.abs(b.grainMassKg - .4));
    expect(excel.candidates.some((candidate) => key(candidate) === key(validByMass[0]))).toBe(true);
    expect(searchCandidates({ ...base, mode: "excel", maxCandidateCount: 200 }).candidates).toEqual(excel.candidates);
  }, 20000);

  it.each([[false, false], [false, true], [true, false], [true, true]])("5 mm 16개 후보는 1 mm 집합에 포함되고 계산값·판정이 같다: 추력 %s / 시간 %s", (targetThrustEnabled, burnTimeFilterEnabled) => {
    const config = { ...base, targetFuelMassKg: 1, maxCandidateCount: 10000, outerDiameterMm: { min: 40, max: 45, step: 5 }, coreDiameterMm: { min: 10, max: 15, step: 5 }, segmentLengthMm: { min: 75, max: 80, step: 5 }, segmentCount: { min: 1, max: 2 } };
    const input = { ...config, targetThrustEnabled, burnTimeFilterEnabled };
    const manufacturing = searchCandidates({ ...input, mode: "candidate" });
    const excel = searchCandidates({ ...input, mode: "excel" });
    expect(manufacturing.candidates).toHaveLength(16);
    expect(excel.candidates).toHaveLength(432);
    const byGeometry = new Map(excel.candidates.map((candidate) => [key(candidate), candidate]));
    for (const candidate of manufacturing.candidates) expect(byGeometry.get(key(candidate))).toEqual(candidate);
  });

  it("자동·수동과 독립적으로 명시한 시간 필터만 동일 후보의 시간 판정을 바꾼다", () => {
    const input = { ...base, outerDiameterMm: { min: 45, max: 45 }, coreDiameterMm: { min: 10, max: 10 }, segmentLengthMm: { min: 75, max: 75 }, segmentCount: { min: 2, max: 2 } };
    for (const mode of ["candidate", "excel"] as const) {
      const off = searchCandidates({ ...input, mode, burnTimeFilterEnabled: false }).candidates[0];
      const on = searchCandidates({ ...input, mode, burnTimeFilterEnabled: true }).candidates[0];
      expect(off.status).toBe("conditional");
      expect(on.status).toBe("fail");
      expect(on.reasons).toEqual(["연소 시간 허용 범위를 벗어났습니다."]);
      expect({ ...on, status: off.status, reasons: off.reasons }).toEqual(off);
      expect(createAutomaticCandidateSearchConfig({ ...input, mode, burnTimeFilterEnabled: true }).burnTimeFilterEnabled).toBe(true);
      expect(createExcelRangeSearchConfig({ ...input, mode, burnTimeFilterEnabled: false }).burnTimeFilterEnabled).toBe(false);
    }
  });
});
