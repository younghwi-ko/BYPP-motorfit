import type { CandidateResult } from "../engine";

export type CandidateSortKey = "status" | "mass" | "pressure" | "burnTime" | "averageThrust" | "score";
export type CandidateSortDirection = "asc" | "desc";

export const SCORE_GUIDANCE = "종합 점수는 질량 오차와 압력 여유를 비교하며, 목표 추력 입력 시 추력 곡선 오차를 함께 반영하는 비교용 지표입니다. 공식 대회 판정 점수가 아닙니다.";

const valueFor = (candidate: CandidateResult, key: CandidateSortKey): number => {
  if (key === "status") return candidate.status === "pass" ? 0 : candidate.status === "conditional" ? 1 : 2;
  if (key === "mass") return candidate.grainMassKg;
  if (key === "pressure") return candidate.maximumPressureMpa;
  if (key === "burnTime") return candidate.burnTimeSec;
  if (key === "averageThrust") return candidate.averageThrustN;
  return candidate.score.totalScore;
};

export function sortCandidates(candidates: readonly CandidateResult[], key: CandidateSortKey | null, direction: CandidateSortDirection | null): CandidateResult[] {
  if (!key || !direction) return [...candidates];
  const multiplier = direction === "asc" ? 1 : -1;
  return [...candidates].sort((left, right) => {
    const difference = valueFor(left, key) - valueFor(right, key);
    return difference === 0 ? 0 : difference * multiplier;
  });
}
