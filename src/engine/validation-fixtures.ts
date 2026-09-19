import type { CandidateSearchConfig } from "./types";
import { createAutomaticCandidateSearchConfig } from "./candidate-search";

export type ValidationFixture = {
  name: string;
  targetFuelMassKg: number;
  maximumPressureMpa: number;
  targetAverageThrustN?: number;
  fuelMassToleranceKg: number;
  expectedRepresentativeGeometry?: string;
  expectedRepresentativeMassKg?: number;
  expectedStatus?: "pass" | "conditional" | "fail";
  source: string;
};

export const VALIDATION_FIXTURES: readonly ValidationFixture[] = [
  { name: "SRM Excel 기준 예시", targetFuelMassKg: 0.3956, maximumPressureMpa: 4.1, fuelMassToleranceKg: 0.01, expectedRepresentativeGeometry: "45×15×80/2", expectedRepresentativeMassKg: 0.395603169947702, expectedStatus: "conditional", source: "SRM_2023.xls golden baseline" },
  { name: "참고용 탈락 0.763 kg", targetFuelMassKg: 0.763, maximumPressureMpa: 3.8, targetAverageThrustN: 310, fuelMassToleranceKg: 0.01, expectedRepresentativeGeometry: "55×20×105/2", expectedRepresentativeMassKg: 0.7572, expectedStatus: "fail", source: "candidate-search nearest rejected golden test" },
  { name: "2 kg 조건부", targetFuelMassKg: 2, maximumPressureMpa: 4, fuelMassToleranceKg: 0.01, expectedRepresentativeMassKg: 1.9904, expectedStatus: "conditional", source: "mass tolerance regression" },
  ...[
    ["8개 자동 추천 0.287", 0.287, 3.6, undefined], ["8개 자동 추천 0.534", 0.534, 4, 260], ["8개 자동 추천 0.763", 0.763, 3.8, 310], ["8개 자동 추천 1.246", 1.246, 4.1, undefined],
    ["8개 자동 추천 1.583", 1.583, 3.5, 420], ["8개 자동 추천 1.917", 1.917, 4, 480], ["8개 자동 추천 2.341", 2.341, 4.1, undefined], ["8개 자동 추천 2.786", 2.786, 3.2, 600],
  ].map(([name, targetFuelMassKg, maximumPressureMpa, targetAverageThrustN]) => ({ name: String(name), targetFuelMassKg: Number(targetFuelMassKg), maximumPressureMpa: Number(maximumPressureMpa), targetAverageThrustN: targetAverageThrustN === undefined ? undefined : Number(targetAverageThrustN), fuelMassToleranceKg: 0.01, source: "8-case browser regression" })),
  { name: "GSRM 기준 B=49 mm", targetFuelMassKg: 0, maximumPressureMpa: 0, fuelMassToleranceKg: 0.01, source: "GSRM engineering golden: B=49 mm, AN-132-NBR" },
  { name: "AN catalog 241개", targetFuelMassKg: 0, maximumPressureMpa: 0, fuelMassToleranceKg: 0.01, source: "AS568A supplied catalog count" },
];

export function createValidationSearchConfig(fixture: ValidationFixture): CandidateSearchConfig {
  const base: CandidateSearchConfig = {
    mode: "candidate", chamberDiameterMm: 45, chamberLengthMm: 165, propellant: "KNSB coarse", targetFuelMassKg: fixture.targetFuelMassKg, fuelMassToleranceKg: fixture.fuelMassToleranceKg, maximumPressureMpa: fixture.maximumPressureMpa, targetAverageThrustN: fixture.targetAverageThrustN ?? 209.84475504584, targetThrustEnabled: fixture.targetAverageThrustN !== undefined, averageThrustToleranceN: 5, targetBurnTimeSec: 2.17673154764489, burnTimeToleranceSec: 0.03, targetPressureMpa: 4, outerDiameterMm: { min: 40, max: 50, step: 5 }, coreDiameterMm: { min: 10, max: 20, step: 5 }, segmentLengthMm: { min: 75, max: 85, step: 5 }, segmentCount: { min: 2, max: 2 }, outerSurface: "Inhibited", coreSurface: "Exposed", endsSurface: "Exposed", densityRatio: 0.95, nozzleErosionMm: 0, manufacturingStepMm: 5, maxCandidateCount: 200,
  };
  // Larger golden cases use the same automatic envelope as the production UI;
  // the calculation engine and its formulas remain unchanged.
  return fixture.targetFuelMassKg > 0.4 ? createAutomaticCandidateSearchConfig(base) : base;
}
