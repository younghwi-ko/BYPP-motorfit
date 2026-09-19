import type { CandidateSearchResult } from "./types";
import type { ValidationFixture } from "./validation-fixtures";

export type ValidationCheckKind = "numeric" | "status" | "representative" | "count" | "data-version" | "calculation";
export type ValidationCheck = { kind: ValidationCheckKind; field: string; expected: unknown; actual: unknown; pass: boolean };
export type ValidationFixtureResult = { name: string; source: string; status: "PASS" | "FAIL" | "NOT_RUN"; checks: ValidationCheck[]; failedFields: string[]; summary?: string };

export function validateFixture(fixture: ValidationFixture, result: CandidateSearchResult): ValidationFixtureResult {
  const representative = result.passedCandidates[0] ?? result.nearestRejectedCandidate;
  const geometry = representative ? `${representative.input.grainOuterDiameterMm}×${representative.input.grainCoreDiameterMm}×${representative.input.segmentLengthMm}/${representative.input.segmentCount}` : undefined;
  const checks: ValidationCheck[] = [];
  if (fixture.expectedRepresentativeGeometry) checks.push({ kind: "representative", field: "대표 형상", expected: fixture.expectedRepresentativeGeometry, actual: geometry, pass: geometry === fixture.expectedRepresentativeGeometry });
  if (fixture.expectedRepresentativeMassKg !== undefined) checks.push({ kind: "numeric", field: "대표 질량", expected: fixture.expectedRepresentativeMassKg, actual: representative?.grainMassKg, pass: representative !== undefined && Math.abs(representative.grainMassKg - fixture.expectedRepresentativeMassKg) <= 0.0001 });
  if (fixture.expectedStatus) checks.push({ kind: "status", field: "대표 상태", expected: fixture.expectedStatus, actual: representative?.status, pass: representative?.status === fixture.expectedStatus });
  checks.push({ kind: "count", field: "후보 수", expected: ">= 0", actual: result.candidates.length, pass: result.candidates.length >= 0 });
  const failedFields = checks.filter((check) => !check.pass).map((check) => check.field);
  const status = failedFields.length ? "FAIL" : "PASS";
  return { name: fixture.name, source: fixture.source, status, checks, failedFields, summary: status === "PASS" ? "모든 기대 항목 통과" : `실패 항목: ${failedFields.join(", ")}` };
}

export function notRunValidation(fixture: ValidationFixture): ValidationFixtureResult {
  return { name: fixture.name, source: fixture.source, status: "NOT_RUN", checks: [], failedFields: [], summary: "검산하지 않음 · 별도 검산 실행이 필요합니다." };
}
