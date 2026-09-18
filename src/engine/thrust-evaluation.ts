import type { PerformanceResult, ThrustCurveEvaluation } from "./types";

export function evaluateThrustCurve(
  performance: PerformanceResult,
  targetThrustN: number,
): ThrustCurveEvaluation {
  if (!Number.isFinite(targetThrustN) || targetThrustN <= 0) {
    throw new Error("목표 추력은 0보다 큰 유한값이어야 합니다.");
  }
  const thrustValues = performance.rows
    .filter((row) => row.timeSec <= performance.thrustEndTimeSec)
    .map((row) => row.thrustN);
  if (thrustValues.length === 0) throw new Error("추력 곡선 데이터가 없습니다.");
  const squaredErrors = thrustValues.map((thrust) => (thrust - targetThrustN) ** 2);
  const meanSquaredErrorN2 = squaredErrors.reduce((sum, value) => sum + value, 0) / squaredErrors.length;
  const maximumDeviationN = Math.max(...thrustValues.map((thrust) => Math.abs(thrust - targetThrustN)));
  const mean = thrustValues.reduce((sum, value) => sum + value, 0) / thrustValues.length;
  const variabilityN = Math.sqrt(thrustValues.reduce((sum, value) => sum + (value - mean) ** 2, 0) / thrustValues.length);
  return { targetThrustN, meanSquaredErrorN2, rootMeanSquaredErrorN: Math.sqrt(meanSquaredErrorN2), maximumDeviationN, variabilityN };
}
