import { describe, expect, it } from "vitest";

import {
  estimateCandidateCount,
  createAutomaticCandidateSearchConfig,
  CandidateSearchInputError,
  scoreCandidate,
  searchCandidates,
} from "../src/engine";
import type { CandidateSearchConfig, PerformanceResult } from "../src/engine";

const BASE_CONFIG: CandidateSearchConfig = {
  chamberDiameterMm: 45,
  chamberLengthMm: 165,
  propellant: "KNSB coarse",
  targetFuelMassKg: 0.395603169947702,
  fuelMassToleranceKg: 0.001,
  maximumPressureMpa: 4,
  targetAverageThrustN: 209.84475504584,
  averageThrustToleranceN: 0.2,
  targetBurnTimeSec: 2.17673154764489,
  burnTimeToleranceSec: 0.01,
  targetPressureMpa: 4,
  outerDiameterMm: { min: 45, max: 45 },
  coreDiameterMm: { min: 15, max: 15 },
  segmentLengthMm: { min: 80, max: 80 },
  segmentCount: { min: 2, max: 2 },
  outerSurface: "Inhibited",
  coreSurface: "Exposed",
  endsSurface: "Exposed",
  densityRatio: 0.95,
  nozzleErosionMm: 0,
};

describe("candidate search", () => {
  it("counts inclusive 5 mm ranges and integer segment ranges", () => {
    expect(
      estimateCandidateCount({
        ...BASE_CONFIG,
        outerDiameterMm: { min: 35, max: 45 },
        coreDiameterMm: { min: 5, max: 15 },
        segmentLengthMm: { min: 70, max: 80 },
        segmentCount: { min: 1, max: 2 },
      }),
    ).toBe(54);
  });

  it("runs the baseline through the full engine and applies target filters", () => {
    const result = searchCandidates(BASE_CONFIG);
    expect(result.totalCombinations).toBe(1);
    expect(result.evaluatedCombinations).toBe(1);
    expect(result.passedCandidates).toHaveLength(1);
    expect(result.passedCandidates[0].input).toMatchObject({
      grainOuterDiameterMm: 45,
      grainCoreDiameterMm: 15,
      segmentLengthMm: 80,
      segmentCount: 2,
    });
    expect(result.passedCandidates[0].status).toBe("pass");

    const failing = searchCandidates({
      ...BASE_CONFIG,
      maximumPressureMpa: 3,
    });
    expect(failing.passedCandidates).toHaveLength(0);
    expect(failing.candidates[0].reasons).toContain("최대 압력 제한을 초과했습니다.");
  });

  it("caps oversized searches and reports a warning", () => {
    const result = searchCandidates({
      ...BASE_CONFIG,
      outerDiameterMm: { min: 35, max: 55 },
      coreDiameterMm: { min: 5, max: 25 },
      segmentLengthMm: { min: 70, max: 90 },
      segmentCount: { min: 1, max: 3 },
      maxCandidateCount: 10,
    });
    expect(result.totalCombinations).toBe(375);
    expect(result.evaluatedCombinations).toBe(10);
    expect(result.truncated).toBe(true);
    expect(result.warning).toContain("375");
  });

  it("allows decimal dimensions in Excel reproduction mode", () => {
    const result = searchCandidates({
      ...BASE_CONFIG,
      mode: "excel",
      outerDiameterMm: { min: 44.5, max: 44.5, step: 1 },
      coreDiameterMm: { min: 14.5, max: 14.5, step: 1 },
      segmentLengthMm: { min: 80.5, max: 80.5, step: 1 },
    });
    expect(result.evaluatedCombinations).toBe(1);
    expect(result.rejectedByValidation).toBe(0);
    expect(result.candidates[0].input.grainOuterDiameterMm).toBe(44.5);
  });

  it("rejects nonpositive or nonfinite tolerances before calculation", () => {
    expect(() => searchCandidates({ ...BASE_CONFIG, fuelMassToleranceKg: 0 })).toThrow(CandidateSearchInputError);
    expect(() => searchCandidates({ ...BASE_CONFIG, averageThrustToleranceN: Number.NaN })).toThrow(CandidateSearchInputError);
    expect(() => searchCandidates({ ...BASE_CONFIG, outerDiameterMm: { min: 50, max: 45 } })).toThrow(CandidateSearchInputError);
    expect(() => searchCandidates({ ...BASE_CONFIG, segmentCount: { min: 0, max: 2 } })).toThrow(CandidateSearchInputError);
  });
});

describe("candidate score", () => {
  it("combines four normalized components with equal weights", () => {
    const score = scoreCandidate(BASE_CONFIG, {
      grainMassKg: BASE_CONFIG.targetFuelMassKg + 0.0005,
      maximumPressureMpa: 3,
      burnTimeSec: BASE_CONFIG.targetBurnTimeSec + 0.005,
      performance: {
        averageThrustN: BASE_CONFIG.targetAverageThrustN + 0.1,
        thrustEndTimeSec: BASE_CONFIG.targetBurnTimeSec + 0.005,
      } as PerformanceResult,
    });
    expect(score.massErrorNormalized).toBeCloseTo(0.5, 12);
    expect(score.pressureMarginNormalized).toBeCloseTo(0.75, 12);
    expect(score.averageThrustErrorNormalized).toBeCloseTo(0.5, 12);
    expect(score.burnTimeErrorNormalized).toBeCloseTo(0.5, 12);
    expect(score.totalScore).toBeCloseTo(43.75, 11);
  });
});

describe("automatic candidate envelope", () => {
  it("expands beyond the original 40-50 mm range for a 1 kg target", () => {
    const config = createAutomaticCandidateSearchConfig({ ...BASE_CONFIG, targetFuelMassKg: 1 });
    expect(config.outerDiameterMm.min).toBeLessThan(40);
    expect(config.manufacturingStepMm).toBe(5);
    expect(config.burnTimeFilterEnabled).toBe(false);
  });

  it("mass-prefilters the baseline geometry into a 200-candidate precision budget", () => {
    const automatic = createAutomaticCandidateSearchConfig({
      ...BASE_CONFIG,
      maximumPressureMpa: 4.1,
      fuelMassToleranceKg: 0.005,
      averageThrustToleranceN: 5,
      maxCandidateCount: 200,
      searchPriority: "balanced",
    });
    const result = searchCandidates(automatic);
    const baseline = result.candidates.find((candidate) => candidate.input.grainOuterDiameterMm === 45 && candidate.input.grainCoreDiameterMm === 15 && candidate.input.segmentLengthMm === 80 && candidate.input.segmentCount === 2);
    expect(result.totalCombinations).toBeGreaterThan(200);
    expect(result.evaluatedCombinations).toBe(200);
    expect(result.targetMassNearbyIncluded).toBe(true);
    expect(baseline).toBeDefined();
    expect(baseline!.grainMassKg).toBeCloseTo(0.395603169947702, 12);
    expect(baseline!.averageThrustN).toBeCloseTo(209.84475504584, 10);
    expect(baseline!.status).toBe("pass");
    expect(result.candidates[0].input).toMatchObject({ grainOuterDiameterMm: 45, grainCoreDiameterMm: 15, segmentLengthMm: 80, segmentCount: 2 });
    expect(result.warning).toContain("목표 질량 근처 후보를 우선 평가했습니다");
  });

  it("does not let priority weighting remove the closest-mass candidate", () => {
    for (const searchPriority of ["mass", "thrust", "balanced"] as const) {
      const automatic = createAutomaticCandidateSearchConfig({ ...BASE_CONFIG, maxCandidateCount: 20, searchPriority });
      const result = searchCandidates(automatic);
      expect(result.targetMassNearbyIncluded).toBe(true);
      expect(result.evaluatedCombinations).toBe(20);
    }
  });

  it("reports the real limiting condition for a 1 kg target", () => {
    const automatic = createAutomaticCandidateSearchConfig({ ...BASE_CONFIG, targetFuelMassKg: 1, maximumPressureMpa: 4.1, maxCandidateCount: 200, searchPriority: "balanced" });
    const result = searchCandidates(automatic);
    expect(result.prefilteredCandidateCount).toBeGreaterThan(200);
    expect(result.targetMassNearbyIncluded).toBe(true);
    expect(result.warning).toMatch(/목표 질량 후보 없음|최대 압력 초과|평균 추력 불일치|동시에 만족/);
  });
});
