import type {
  CandidateScoreBreakdown,
  CandidateSearchConfig,
  PerformanceResult,
  ThrustCurveEvaluation,
} from "./types";

const clampUnit = (value: number) => Math.max(0, Math.min(1, value));

/** Priority-weighted comparison score. Pressure margin remains a hard constraint in search. */
export function scoreCandidate(
  config: CandidateSearchConfig,
  metrics: {
    grainMassKg: number;
    maximumPressureMpa: number;
    burnTimeSec: number;
    performance: PerformanceResult;
    thrustEvaluation?: ThrustCurveEvaluation;
  },
): CandidateScoreBreakdown {
  const massErrorNormalized =
    Math.abs(metrics.grainMassKg - config.targetFuelMassKg) /
    config.fuelMassToleranceKg;
  const pressureMarginNormalized =
    metrics.maximumPressureMpa / config.maximumPressureMpa;
  const averageThrustErrorNormalized = config.targetThrustEnabled === false
    ? 0
    : Math.abs(metrics.performance.averageThrustN - config.targetAverageThrustN) /
      config.averageThrustToleranceN;
  const burnTimeErrorNormalized =
    Math.abs(metrics.burnTimeSec - config.targetBurnTimeSec) /
    config.burnTimeToleranceSec;

  const thrustCurveErrorNormalized = metrics.thrustEvaluation
    ? metrics.thrustEvaluation.rootMeanSquaredErrorN / config.averageThrustToleranceN
    : averageThrustErrorNormalized;
  const totalScore = 100 * (config.targetThrustEnabled === false
    ? 0.7 * (1 - clampUnit(massErrorNormalized)) + 0.3 * (1 - clampUnit(pressureMarginNormalized))
    : 0.45 * (1 - clampUnit(massErrorNormalized)) + 0.2 * (1 - clampUnit(pressureMarginNormalized)) + 0.35 * (1 - clampUnit(thrustCurveErrorNormalized)));

  return {
    massErrorNormalized,
    pressureMarginNormalized,
    averageThrustErrorNormalized,
    burnTimeErrorNormalized,
    totalScore,
  };
}
