import type { CandidateResult, CandidateSearchConfig } from "../engine";

// Engine reasons record failed conditions only. An empty list is not a
// recommendation: the engine keeps an unevaluated target thrust conditional.
export function candidateReasonText(candidate: Pick<CandidateResult, "status" | "reasons">): string {
  if (candidate.reasons.length) return candidate.reasons.join(" ");
  if (candidate.status === "conditional") return "목표 추력이 미입력되어 추력 조건을 평가하지 않았습니다.";
  if (candidate.status === "pass") return "평가한 조건을 모두 충족했습니다.";
  return "기록된 탈락 사유가 없습니다. 상세 결과를 확인하세요.";
}

export function burnTimeConditionState(candidate: Pick<CandidateResult, "burnTimeSec">, config: CandidateSearchConfig): "pass" | "fail" | "not-applicable" {
  if (config.burnTimeFilterEnabled === false) return "not-applicable";
  return Math.abs(candidate.burnTimeSec - config.targetBurnTimeSec) <= config.burnTimeToleranceSec ? "pass" : "fail";
}
