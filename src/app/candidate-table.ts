import type { CandidateResult } from "../engine";

export type CandidateSortKey = "status" | "mass" | "pressure" | "burnTime" | "averageThrust" | "score";
export type CandidateSortDirection = "asc" | "desc";

export const SCORE_GUIDANCE = "종합 점수는 선택한 우선순위에 따라 질량·평균 추력·압력 여유를 비교하며, 기본 구성은 동일한 비중의 비교용 지표입니다. 공식 대회 판정 점수가 아닙니다.";

const valueFor = (candidate: CandidateResult, key: CandidateSortKey): number => {
  if (key === "status") return candidate.status === "pass" ? 0 : 1;
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
