import type {
  CandidateScoreBreakdown,
  CandidateSearchConfig,
  PerformanceResult,
} from "./types";

const clampUnit = (value: number) => Math.max(0, Math.min(1, value));

/** Equal-weight score: mass, pressure margin, average thrust, and burn time. */
export function scoreCandidate(
  config: CandidateSearchConfig,
  metrics: {
    grainMassKg: number;
    maximumPressureMpa: number;
    burnTimeSec: number;
    performance: PerformanceResult;
  },
): CandidateScoreBreakdown {
  const massErrorNormalized =
    Math.abs(metrics.grainMassKg - config.targetFuelMassKg) /
    config.fuelMassToleranceKg;
  const pressureMarginNormalized =
    metrics.maximumPressureMpa / config.maximumPressureMpa;
  const averageThrustErrorNormalized =
    Math.abs(metrics.performance.averageThrustN - config.targetAverageThrustN) /
    config.averageThrustToleranceN;
  const burnTimeErrorNormalized =
    Math.abs(metrics.burnTimeSec - config.targetBurnTimeSec) /
    config.burnTimeToleranceSec;

  const totalScore =
    100 *
    (0.25 * (1 - clampUnit(massErrorNormalized)) +
      0.25 * (1 - clampUnit(pressureMarginNormalized)) +
      0.25 * (1 - clampUnit(averageThrustErrorNormalized)) +
      0.25 * (1 - clampUnit(burnTimeErrorNormalized)));

  return {
    massErrorNormalized,
    pressureMarginNormalized,
    averageThrustErrorNormalized,
    burnTimeErrorNormalized,
    totalScore,
  };
}
