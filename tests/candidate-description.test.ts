import { describe, expect, it } from "vitest";
import { searchCandidates, VALIDATION_FIXTURES, createValidationSearchConfig } from "../src/engine";
import { burnTimeConditionState, candidateReasonText } from "../src/app/candidate-description";

describe("candidate explanation follows the existing engine verdict", () => {
  const config = createValidationSearchConfig(VALIDATION_FIXTURES[0]);
  const result = searchCandidates(config);
  const candidate = result.candidates.find((item) => item.status === "conditional")!;

  it("explains the baseline conditional status even when no condition failed", () => {
    expect(candidate).toBeDefined();
    expect(candidate.reasons).toEqual([]);
    expect(candidate.thrustEvaluation).toBeUndefined();
    expect(candidateReasonText(candidate)).toBe("목표 추력이 미입력되어 추력 조건을 평가하지 않았습니다.");
    expect(candidate.grainMassKg).toBeCloseTo(VALIDATION_FIXTURES[0].expectedRepresentativeMassKg!, 10);
  });

  it("does not treat excluded burn time as passed or as the conditional trigger", () => {
    expect(burnTimeConditionState(candidate, { ...config, burnTimeFilterEnabled: false })).toBe("not-applicable");
    expect(burnTimeConditionState(candidate, config)).toBe("pass");
    expect(candidateReasonText(candidate)).not.toContain("연소시간");
  });

  it("preserves the engine failure reasons and distinguishes an evaluated pass", () => {
    const rejected = result.candidates.find((item) => item.status === "fail")!;
    expect(candidateReasonText(rejected)).toBe(rejected.reasons.join(" "));
    const evaluated = searchCandidates({ ...config, targetThrustEnabled: true }).candidates.find((item) => item.status === "pass")!;
    expect(evaluated).toBeDefined();
    expect(candidateReasonText(evaluated)).toBe("평가한 조건을 모두 충족했습니다.");
  });

  it("does not mutate status, reasons, metrics or ordering", () => {
    const before = JSON.stringify(result);
    result.candidates.forEach((item) => { candidateReasonText(item); burnTimeConditionState(item, config); });
    expect(JSON.stringify(result)).toBe(before);
  });
});
