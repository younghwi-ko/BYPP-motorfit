import type {
  CandidateScoreBreakdown,
  CandidateSearchConfig,
  PerformanceResult,
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

  const weights = config.searchPriority === "mass" ? { mass: 0.5, thrust: 0.3, pressure: 0.2 } : config.searchPriority === "thrust" ? { mass: 0.3, thrust: 0.5, pressure: 0.2 } : config.searchPriority === "balanced" ? (config.burnTimeFilterEnabled ? { mass: 0.36, thrust: 0.36, pressure: 0.18 } : { mass: 0.4, thrust: 0.4, pressure: 0.2 }) : { mass: 0.25, thrust: 0.25, pressure: 0.25 };
  const totalScore =
    100 *
    (weights.mass * (1 - clampUnit(massErrorNormalized)) +
      weights.pressure * (1 - clampUnit(pressureMarginNormalized)) +
      weights.thrust * (1 - clampUnit(averageThrustErrorNormalized)) +
      (config.searchPriority === undefined ? 0.25 * (1 - clampUnit(burnTimeErrorNormalized)) : config.burnTimeFilterEnabled ? 0.1 * (1 - clampUnit(burnTimeErrorNormalized)) : 0));

  return {
    massErrorNormalized,
    pressureMarginNormalized,
    averageThrustErrorNormalized,
    burnTimeErrorNormalized,
    totalScore,
  };
}
