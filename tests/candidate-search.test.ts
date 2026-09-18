import { describe, expect, it } from "vitest";

import {
  estimateCandidateCount,
  createAutomaticCandidateSearchConfig,
  CandidateSearchCancelledError,
  CandidateSearchInputError,
  MASS_UPPER_EPSILON_KG,
  scoreCandidate,
  searchCandidates,
  searchCandidatesAsync,
  isWithinMassUpperBound,
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
  it("uses a documented epsilon only for display-level mass differences", () => {
    expect(MASS_UPPER_EPSILON_KG).toBe(0.000005);
    expect(isWithinMassUpperBound(0.395603169947702, 0.3956)).toBe(true);
    expect(isWithinMassUpperBound(0.395606, 0.3956)).toBe(false);
  });
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
    expect(() => searchCandidates({ ...BASE_CONFIG, outerDiameterMm: { min: 40, max: 46, step: 5 } })).toThrow(CandidateSearchInputError);
  });

  it("calculates every combination in a finite detailed range", () => {
    const result = searchCandidates({
      ...BASE_CONFIG,
      outerDiameterMm: { min: 40, max: 45, step: 5 },
      coreDiameterMm: { min: 10, max: 15, step: 5 },
      segmentLengthMm: { min: 75, max: 80, step: 5 },
      segmentCount: { min: 1, max: 1 },
    });
    expect(result.totalCombinations).toBe(8);
    expect(result.evaluatedCombinations).toBe(8);
    expect(result.truncated).toBe(false);
  });
});

describe("candidate score", () => {
  it("uses the fixed mass, pressure, and thrust comparison model", () => {
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
    expect(score.totalScore).toBeCloseTo(45, 11);
  });
});

describe("automatic candidate envelope", () => {
  it("expands beyond the original 40-50 mm range for a 1 kg target", () => {
    const config = createAutomaticCandidateSearchConfig({ ...BASE_CONFIG, targetFuelMassKg: 1 });
    expect(config.outerDiameterMm.min).toBeLessThan(40);
    expect(config.manufacturingStepMm).toBe(5);
    expect(config.burnTimeFilterEnabled).toBe(false);
  });

  it("mass-prefilters the baseline geometry without the former fixed 200-candidate cap", () => {
    const automatic = createAutomaticCandidateSearchConfig({
      ...BASE_CONFIG,
      maximumPressureMpa: 4.1,
      fuelMassToleranceKg: 0.005,
      averageThrustToleranceN: 5,
      targetThrustEnabled: true,
    });
    const result = searchCandidates(automatic);
    const baseline = result.candidates.find((candidate) => candidate.input.grainOuterDiameterMm === 45 && candidate.input.grainCoreDiameterMm === 15 && candidate.input.segmentLengthMm === 80 && candidate.input.segmentCount === 2);
    expect(result.totalCombinations).toBeGreaterThan(200);
    expect(result.evaluatedCombinations).toBeGreaterThan(200);
    expect(result.targetMassNearbyIncluded).toBe(true);
    expect(baseline).toBeDefined();
    expect(baseline!.grainMassKg).toBeCloseTo(0.395603169947702, 12);
    expect(baseline!.averageThrustN).toBeCloseTo(209.84475504584, 10);
    expect(baseline!.status).toBe("pass");
    expect(result.candidates[0].input).toMatchObject({ grainOuterDiameterMm: 45, grainCoreDiameterMm: 15, segmentLengthMm: 80, segmentCount: 2 });
    expect(result.warning).toContain("자동 탐색 확장 0단계");
    expect(result.warning).toContain("전역 최적해를 보장하지 않습니다");
  });

  it("keeps the closest-mass candidate when target thrust is omitted", () => {
    const automatic = createAutomaticCandidateSearchConfig({ ...BASE_CONFIG, targetThrustEnabled: false });
    const result = searchCandidates(automatic);
    expect(result.targetMassNearbyIncluded).toBe(true);
    expect(result.candidates[0].status).toBe("conditional");
  });

  it("reports the real limiting condition for a 1 kg target", () => {
    const automatic = createAutomaticCandidateSearchConfig({ ...BASE_CONFIG, targetFuelMassKg: 1, maximumPressureMpa: 4.1, targetThrustEnabled: false });
    const result = searchCandidates(automatic);
    expect(result.prefilteredCandidateCount).toBeGreaterThan(200);
    expect(result.targetMassNearbyIncluded).toBe(true);
    expect(result.warning).toMatch(/목표 질량 후보 없음|최대 압력 초과|평균 추력 불일치|동시에 만족/);
  });

  it("expands chamber diameter and Do for 1 kg and 2 kg targets", () => {
    const oneKg = createAutomaticCandidateSearchConfig({ ...BASE_CONFIG, targetFuelMassKg: 1 });
    const twoKg = createAutomaticCandidateSearchConfig({ ...BASE_CONFIG, targetFuelMassKg: 2 });
    expect(oneKg.chamberDiameterMm).toBeGreaterThan(45);
    expect(oneKg.outerDiameterMm.max).toBe(oneKg.chamberDiameterMm);
    expect(twoKg.chamberDiameterMm).toBeGreaterThan(oneKg.chamberDiameterMm);
    expect(twoKg.outerDiameterMm.max).toBeGreaterThan(oneKg.outerDiameterMm.max);
    expect(twoKg.automaticExpansionStage).toBe(2);
    expect(oneKg.coreDiameterMm.min).toBe(BASE_CONFIG.coreDiameterMm.min);
    expect(twoKg.coreDiameterMm.min).toBe(BASE_CONFIG.coreDiameterMm.min);
  });

  it("does not silently add a 5 mm core below the configured automatic minimum", () => {
    const automatic = createAutomaticCandidateSearchConfig({ ...BASE_CONFIG, targetFuelMassKg: 2, maximumPressureMpa: 4.1, targetThrustEnabled: false });
    const result = searchCandidates(automatic);
    expect(result.candidates.some((candidate) => candidate.input.grainCoreDiameterMm < BASE_CONFIG.coreDiameterMm.min)).toBe(false);
    expect(result.candidates[0].input.grainCoreDiameterMm).toBeGreaterThanOrEqual(10);
    expect(result.candidates[0].maximumPressureMpa).toBeLessThanOrEqual(4.1);
    expect(result.candidates[0].dataAndKn.knCurve.every((row) => Number.isFinite(row.kn))).toBe(true);
    expect(result.candidates[0].pressure.combustion.rows.every((row) => Number.isFinite(row.gaugePressureMpa))).toBe(true);
  });

  it("hard-filters mass overshoot for baseline, 1 kg, and 2 kg targets", () => {
    for (const targetFuelMassKg of [0.3956, 1, 2]) {
      const result = searchCandidates(createAutomaticCandidateSearchConfig({ ...BASE_CONFIG, targetFuelMassKg, maximumPressureMpa: 4.1, targetThrustEnabled: false }));
      expect(result.candidates.every((candidate) => isWithinMassUpperBound(candidate.grainMassKg, targetFuelMassKg))).toBe(true);
      expect(result.passedCandidates.every((candidate) => candidate.grainMassKg <= targetFuelMassKg + MASS_UPPER_EPSILON_KG)).toBe(true);
    }
  }, 20_000);

  it("ranks the closest below-target candidate first when no candidate passes", () => {
    const targetFuelMassKg = 2;
    const result = searchCandidates(createAutomaticCandidateSearchConfig({ ...BASE_CONFIG, targetFuelMassKg, maximumPressureMpa: 4.1, targetThrustEnabled: false }));
    const closest = result.candidates.reduce((left, right) => Math.abs(left.grainMassKg - targetFuelMassKg) <= Math.abs(right.grainMassKg - targetFuelMassKg) ? left : right);
    expect(result.candidates[0].grainMassKg).toBe(closest.grainMassKg);
    expect(result.candidates[0].grainMassKg).toBeLessThanOrEqual(targetFuelMassKg + MASS_UPPER_EPSILON_KG);
  });

  it("reports when no candidate is at or below the target mass", () => {
    const result = searchCandidates(createAutomaticCandidateSearchConfig({ ...BASE_CONFIG, targetFuelMassKg: 0.000001, targetThrustEnabled: false }));
    expect(result.candidates).toHaveLength(0);
    expect(result.diagnosis).toBe("목표 질량 이하 후보를 찾지 못했습니다.");
    expect(result.warning).toContain("목표 질량 이하 후보를 찾지 못했습니다.");
  });

  it("reports real asynchronous progress and honours cancellation between batches", async () => {
    const automatic = createAutomaticCandidateSearchConfig({ ...BASE_CONFIG, maximumPressureMpa: 4.1, targetThrustEnabled: false });
    const progress: number[] = [];
    let cancel = false;
    await expect(searchCandidatesAsync(automatic, {
      batchSize: 2,
      onProgress: ({ completed }) => {
        progress.push(completed);
        if (completed >= 2) cancel = true;
      },
      shouldCancel: () => cancel,
    })).rejects.toBeInstanceOf(CandidateSearchCancelledError);
    expect(progress).toEqual([0, 2]);
  });

  it("keeps asynchronous browser results identical to the synchronous engine", async () => {
    const synchronous = searchCandidates(BASE_CONFIG);
    const asynchronous = await searchCandidatesAsync(BASE_CONFIG, { batchSize: 1 });
    expect(asynchronous.candidates[0].grainMassKg).toBe(synchronous.candidates[0].grainMassKg);
    expect(asynchronous.candidates[0].maximumPressureMpa).toBe(synchronous.candidates[0].maximumPressureMpa);
    expect(asynchronous.candidates[0].averageThrustN).toBe(synchronous.candidates[0].averageThrustN);
    expect(asynchronous.evaluatedCombinations).toBe(synchronous.evaluatedCombinations);
  });
});
