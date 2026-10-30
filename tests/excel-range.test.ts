import { describe, expect, it } from "vitest";
import { CandidateSearchCancelledError, CandidateSearchInputError, createAutomaticCandidateSearchConfig, createExcelRangeSearchConfig, createValidationSearchConfig, estimateCandidateCount, searchCandidates, searchCandidatesAsync, VALIDATION_FIXTURES } from "../src/engine";
import type { CandidateSearchConfig } from "../src/engine";
import { SRM_2023_BASELINE_EXPECTED } from "./fixtures/srm-2023-baseline";

const baseline = createValidationSearchConfig(VALIDATION_FIXTURES[0]);
const rangeConfig: CandidateSearchConfig = {
  ...baseline, mode: "excel",
  targetFuelMassKg: 10, targetThrustEnabled: false, maxCandidateCount: 2000,
  outerDiameterMm: { min: 40, max: 42, step: 5 },
  coreDiameterMm: { min: 10, max: 12, step: 5 },
  segmentLengthMm: { min: 78, max: 80, step: 5 }, segmentCount: { min: 1, max: 2 },
};
const dimensions = (result: ReturnType<typeof searchCandidates>, key: "grainOuterDiameterMm" | "grainCoreDiameterMm" | "segmentLengthMm" | "segmentCount") => [...new Set(result.candidates.map((candidate) => candidate.input[key]))].sort((a, b) => a - b);

describe("Excel 최소값 기준 1 mm 범위 탐색", () => {
  it("추정과 실제 생성에서 같은 치수 목록과 54개 조합을 사용한다", () => {
    const result = searchCandidates(rangeConfig);
    expect(estimateCandidateCount(rangeConfig)).toBe(54);
    expect(result.totalCombinations).toBe(54);
    expect(result.evaluatedCombinations).toBe(54);
    expect(result.candidates).toHaveLength(54);
    expect(dimensions(result, "grainOuterDiameterMm")).toEqual([40, 41, 42]);
    expect(dimensions(result, "grainCoreDiameterMm")).toEqual([10, 11, 12]);
    expect(dimensions(result, "segmentLengthMm")).toEqual([78, 79, 80]);
    expect(dimensions(result, "segmentCount")).toEqual([1, 2]);
    expect(result.candidates.every((candidate) => candidate.thrustEvaluation === undefined)).toBe(true);
  });

  it("소수 최소값과 간격에 맞지 않는 최대값을 그대로 보존한다", () => {
    const config = { ...rangeConfig, outerDiameterMm: { min: 40.5, max: 42.5 }, coreDiameterMm: { min: 10.25, max: 11.6 }, segmentLengthMm: { min: 78.125, max: 79.6 } };
    const result = searchCandidates(config);
    expect(estimateCandidateCount(config)).toBe(24);
    expect(result.evaluatedCombinations).toBe(24);
    expect(dimensions(result, "grainOuterDiameterMm")).toEqual([40.5, 41.5, 42.5]);
    expect(dimensions(result, "grainCoreDiameterMm")).toEqual([10.25, 11.25]);
    expect(dimensions(result, "segmentLengthMm")).toEqual([78.125, 79.125]);
    expect(result.searchEnvelope?.coreDiameterMm).toEqual({ min: 10.25, max: 11.6, step: 1 });
  });

  it("상한 바로 아래 값에 epsilon으로 끝점을 추가하지 않는다", () => {
    const config = { ...rangeConfig, outerDiameterMm: { min: 40.5, max: 42.4999999999 } };
    const result = searchCandidates(config);
    expect(dimensions(result, "grainOuterDiameterMm")).toEqual([40.5, 41.5]);
    expect(result.totalCombinations).toBe(estimateCandidateCount(config));
    expect(result.candidates.every((candidate) => candidate.input.grainOuterDiameterMm <= config.outerDiameterMm.max)).toBe(true);
  });

  it("소수 최소값을 표시용 12자리로 반올림하지 않는다", () => {
    const minimum = 40.1234567890123;
    const result = searchCandidates({ ...rangeConfig, outerDiameterMm: { min: minimum, max: minimum } });
    expect(dimensions(result, "grainOuterDiameterMm")).toEqual([minimum]);
  });

  it("차감 반올림으로 정확한 1 mm 끝점을 누락하지 않는다", () => {
    expect(1.9 - 0.9).toBeLessThan(1);
    const config = { ...rangeConfig, coreDiameterMm: { min: 0.9, max: 1.9 } };
    const result = searchCandidates(config);
    expect(estimateCandidateCount(config)).toBe(36);
    expect(result.totalCombinations).toBe(36);
    expect(result.evaluatedCombinations).toBe(36);
    expect(dimensions(result, "grainCoreDiameterMm")).toEqual([0.9, 1.9]);
  });

  it("최소=최대인 기존 Excel 기준 케이스의 물리 계산값을 유지한다", () => {
    const result = searchCandidates({ ...baseline, mode: "excel", outerDiameterMm: { min: 45, max: 45 }, coreDiameterMm: { min: 15, max: 15 }, segmentLengthMm: { min: 80, max: 80 } });
    expect(result.totalCombinations).toBe(1);
    expect(result.evaluatedCombinations).toBe(1);
    const candidate = result.candidates[0];
    expect(candidate.grainMassKg).toBeCloseTo(SRM_2023_BASELINE_EXPECTED.grainMassKg, 13);
    expect(candidate.maximumPressureMpa).toBeCloseTo(SRM_2023_BASELINE_EXPECTED.pressure.maximumGaugePressureMpa, 10);
    expect(candidate.status).toBe("conditional");
    expect(candidate.thrustEvaluation).toBeUndefined();
  });

  it("자동 범위·5 mm 간격·세그먼트 최소값으로 덮어쓰지 않는다", () => {
    const before = JSON.stringify(rangeConfig);
    const config = createExcelRangeSearchConfig({ ...rangeConfig, searchOrder: "target-mass", automaticExpansionStage: 3 });
    expect(config.outerDiameterMm).toEqual({ min: 40, max: 42, step: 1 });
    expect(config.segmentCount).toEqual({ min: 1, max: 2 });
    expect(config.searchOrder).toBe("range");
    expect(config.automaticExpansionStage).toBe(0);
    expect(config.targetThrustEnabled).toBe(false);
    expect(createAutomaticCandidateSearchConfig(rangeConfig)).toEqual(createExcelRangeSearchConfig(rangeConfig));
    expect(JSON.stringify(rangeConfig)).toBe(before);
  });

  it("정밀 계산 제한을 적용해도 범위·전체 조합 수를 보존하고 제한을 기록한다", () => {
    const result = searchCandidates({ ...rangeConfig, maxCandidateCount: 4 });
    expect(result.totalCombinations).toBe(54);
    expect(result.evaluatedCombinations).toBe(4);
    expect(result.truncated).toBe(true);
    expect(result.warning).toContain("54개 중 4개만");
    expect(result.metadata?.input.maxCandidateCount).toBe(4);
    expect(result.metadata?.input.outerDiameterMm).toEqual({ min: 40, max: 42, step: 1 });
    expect(result.searchEnvelope?.segmentCount).toEqual({ min: 1, max: 2 });
  });

  it("동일 범위에서 상한 이후의 유효 후보를 상한 증가 시 실제 평가한다", () => {
    const config = { ...baseline, mode: "excel" as const, fuelMassToleranceKg: 0.001, outerDiameterMm: { min: 45, max: 46 }, coreDiameterMm: { min: 15, max: 15 }, segmentLengthMm: { min: 78, max: 80 }, segmentCount: { min: 2, max: 2 } };
    const low = searchCandidates({ ...config, maxCandidateCount: 1 });
    const full = searchCandidates({ ...config, maxCandidateCount: 10 });
    expect(low.precisionEvaluation).toMatchObject({ totalCombinations: 6, eligibleCandidates: 3, attemptedCandidates: 1, excludedByLimit: 2, maxCandidateCount: 1, limited: true, scope: "evaluated-subset", selectionOrder: "range" });
    expect(full.precisionEvaluation).toMatchObject({ totalCombinations: 6, eligibleCandidates: 3, attemptedCandidates: 3, excludedByLimit: 0, maxCandidateCount: 10, limited: false, scope: "all-preprocessed-candidates" });
    expect(low.massFilteredCount).toBe(3);
    expect(low.passedCandidates).toHaveLength(0);
    expect(low.candidates.map((candidate) => candidate.input.segmentLengthMm)).toEqual([78]);
    expect(full.candidates.find((candidate) => candidate.input.segmentLengthMm === 80)?.status).toBe("conditional");
    expect(full.candidates.find((candidate) => candidate.input.segmentLengthMm === 78)).toEqual(low.candidates[0]);
    expect(full.metadata?.precisionEvaluation).toEqual(full.precisionEvaluation);
    expect(low.diagnosis).toContain("미평가 후보");
    expect(low.precisionEvaluation?.note).toContain("앞부분만 평가");
    expect(low.searchEnvelope).toEqual(full.searchEnvelope);
  });

  it("평가 시도 수는 형상 탈락·계산 실패와 구분하며 상한 제외 수와 중복하지 않는다", () => {
    const result = searchCandidates({ ...rangeConfig, outerDiameterMm: { min: 40, max: 40 }, coreDiameterMm: { min: 41, max: 42 }, segmentLengthMm: { min: 80, max: 80 }, segmentCount: { min: 1, max: 1 }, maxCandidateCount: 1 });
    expect(result.precisionEvaluation).toMatchObject({ totalCombinations: 2, eligibleCandidates: 2, attemptedCandidates: 1, excludedByLimit: 1 });
    expect(result.precisionValidationRejectedCount).toBe(1);
    expect(result.candidates).toHaveLength(0);
  });

  it("Excel 정밀 상한은 양의 안전한 정수만 허용한다", () => {
    for (const maxCandidateCount of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => searchCandidates({ ...rangeConfig, maxCandidateCount })).toThrow(/정밀 계산 최대 후보 수/);
    }
    expect(searchCandidates({ ...rangeConfig, maxCandidateCount: 200 }).metadata?.input.maxCandidateCount).toBe(200);
  });

  it("범위 역전과 비정수 세그먼트 범위를 오류로 처리한다", () => {
    expect(() => searchCandidates({ ...rangeConfig, outerDiameterMm: { min: 42, max: 40 } })).toThrow(CandidateSearchInputError);
    expect(() => searchCandidates({ ...rangeConfig, segmentCount: { min: 2, max: 1 } })).toThrow(CandidateSearchInputError);
    expect(() => searchCandidates({ ...rangeConfig, segmentCount: { min: 1.5, max: 2 } })).toThrow(CandidateSearchInputError);
  });

  it("진행률·취소 후 재계산과 동기 엔진 결정성을 유지한다", async () => {
    let cancel = false;
    const progress: number[] = [];
    await expect(searchCandidatesAsync(rangeConfig, { batchSize: 1, shouldCancel: () => cancel, onProgress: ({ completed }) => { progress.push(completed); if (completed >= 2) cancel = true; } })).rejects.toBeInstanceOf(CandidateSearchCancelledError);
    expect(progress).toEqual([0, 1, 2]);
    const result = await searchCandidatesAsync(rangeConfig, { batchSize: 5 });
    expect(result.candidates).toEqual(searchCandidates(rangeConfig).candidates);
    expect(result.evaluatedCombinations).toBe(54);
  });
});
