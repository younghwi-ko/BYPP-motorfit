import { describe, expect, it } from "vitest";
import { buildCadDesignSummary } from "../src/engine/cad-summary";
import type { CandidateResult } from "../src/engine/types";

function candidate(): CandidateResult {
  return { input: { grainOuterDiameterMm: 60, grainCoreDiameterMm: 20, segmentLengthMm: 105, segmentCount: 2, chamberDiameterMm: 49, chamberLengthMm: 210 } as CandidateResult["input"], grainMassKg: 0.7, maximumPressureMpa: 3.8, burnTimeSec: 2, thrustEndTimeSec: 2, maximumThrustN: 300, averageThrustN: 280, totalImpulseNs: 560, specificImpulseSec: 100, motorClass: "A", score: {} as CandidateResult["score"], status: "fail", reasons: [], dataAndKn: {} as CandidateResult["dataAndKn"], pressure: { combustion: { rows: [{ throatAreaMm2: 12, nozzleMassFlowKgPerSec: 0 }], atmosphericPressureMpa: 0 } } as unknown as CandidateResult["pressure"], performance: { rows: [], nozzleExitAreaMm2: 30, nozzleExitDiameterMm: 6.18, averageOptimumExpansionRatio: 2.5 } as unknown as CandidateResult["performance"] };
}

describe("Fusion 설계 검토 요약", () => {
  it("기존 SRM 값과 출처를 분리해 요약하고 미확인 값을 미입력으로 둔다", () => {
    const summary = buildCadDesignSummary(candidate(), 49);
    expect(summary.chamber.diameterMm).toBe(49);
    expect(summary.nozzle.throatAreaMm2).toBe(12);
    expect(summary.bulkhead.chamberCount).toBeNull();
    expect(summary.gsrm.referenceDiameterMm).toBe(49);
    expect(summary.nozzle.source).toContain("SRM");
    expect(summary.checklist).toContain("스냅링 규격 확인");
  });
});
