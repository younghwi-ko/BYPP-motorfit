import { describe, expect, it } from "vitest";
import { searchCandidates } from "../src/engine";
import { SCORE_GUIDANCE, sortCandidates } from "../src/app/candidate-table";
import type { CandidateSearchConfig } from "../src/engine";

const config: CandidateSearchConfig = {
  chamberDiameterMm: 45, chamberLengthMm: 165, propellant: "KNSB coarse",
  targetFuelMassKg: 0.3956, fuelMassToleranceKg: 0.01, maximumPressureMpa: 5,
  targetAverageThrustN: 209, averageThrustToleranceN: 20, targetBurnTimeSec: 2.17,
  burnTimeToleranceSec: 0.2, targetPressureMpa: 4,
  outerDiameterMm: { min: 40, max: 50, step: 5 }, coreDiameterMm: { min: 10, max: 20, step: 5 },
  segmentLengthMm: { min: 75, max: 85, step: 5 }, segmentCount: { min: 2, max: 2 },
  outerSurface: "Inhibited", coreSurface: "Exposed", endsSurface: "Exposed", densityRatio: 0.95, nozzleErosionMm: 0,
};

describe("candidate table sorting", () => {
  const candidates = searchCandidates(config).candidates;
  it("sorts mass and pressure numerically in both directions", () => {
    const ascending = sortCandidates(candidates, "mass", "asc");
    const descending = sortCandidates(candidates, "mass", "desc");
    expect(ascending[0].grainMassKg).toBeLessThanOrEqual(ascending.at(-1)!.grainMassKg);
    expect(descending[0].grainMassKg).toBeGreaterThanOrEqual(descending.at(-1)!.grainMassKg);
    const pressure = sortCandidates(candidates, "pressure", "asc");
    expect(pressure[0].maximumPressureMpa).toBeLessThanOrEqual(pressure.at(-1)!.maximumPressureMpa);
  });
  it("sorts status with pass before fail and score numerically", () => {
    const status = sortCandidates(candidates, "status", "asc");
    expect(status.findIndex((candidate) => candidate.status === "fail")).toBeGreaterThanOrEqual(status.findIndex((candidate) => candidate.status === "pass"));
    const scores = sortCandidates(candidates, "score", "desc");
    expect(scores[0].score.totalScore).toBeGreaterThanOrEqual(scores.at(-1)!.score.totalScore);
  });
  it("restores the existing engine order when sort is cleared", () => {
    expect(sortCandidates(candidates, null, null).map((candidate) => candidate.input.grainOuterDiameterMm)).toEqual(candidates.map((candidate) => candidate.input.grainOuterDiameterMm));
  });
  it("keeps candidate object identity so selection survives sorting", () => {
    const selected = candidates[0];
    expect(sortCandidates(candidates, "burnTime", "asc")).toContain(selected);
  });
  it("exposes the score guidance shown above the table", () => {
    expect(SCORE_GUIDANCE).toContain("공식 대회 판정 점수가 아닙니다");
    expect(SCORE_GUIDANCE).toContain("추력 곡선 오차");
  });
});
