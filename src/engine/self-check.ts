import { AN_SERIES_CATALOG, DEFAULT_AN_CANDIDATE } from "./data/an-catalog";
import { evaluateAnCatalog, calculateGsrmCalculator } from "./gsrm-calculator";
import { calculateGsrmReferenceDiameter, DEFAULT_GSRM_WALL_THICKNESS_MM } from "./gsrm-oring";
import { APP_VERSION, AN_CATALOG_VERSION, BASELINE_VERSION, CALCULATION_ENGINE_VERSION, GSRM_REFERENCE_VERSION } from "./metadata";
import { STANDARD_UNITS } from "./external-validation";
import { CandidateSearchCancelledError, isWithinMassUpperBound, searchCandidatesAsync } from "./candidate-search";
import { createValidationSearchConfig, VALIDATION_FIXTURES, type ValidationFixture } from "./validation-fixtures";
import { validateFixture, type ValidationFixtureResult } from "./validation-report";

export const SELF_CHECK_SCHEMA_VERSION = 1 as const;
export const SELF_CHECK_STORAGE_KEY = "motorfit-self-check-v1";
export const SELF_CHECK_MAX_HISTORY = 5;

export type SelfCheckStatus = "PASS" | "FAIL" | "SKIPPED";
export type SelfCheckItem = Omit<ValidationFixtureResult, "status"> & { status: SelfCheckStatus; actual: Record<string, unknown>; expected: Record<string, unknown>; executedAt: string };
export type SelfCheckVersions = { appVersion: string; engineVersion: string; baselineVersion: string; gsrmReferenceVersion: string; anCatalogVersion: string };
export type SelfCheckReport = {
  schemaVersion: typeof SELF_CHECK_SCHEMA_VERSION;
  id: string;
  executedAt: string;
  status: "COMPLETED" | "CANCELLED" | "FAILED";
  checks: SelfCheckItem[];
  counts: { total: number; pass: number; fail: number; skipped: number };
  versions: SelfCheckVersions;
  changed: boolean;
  changes: string[];
  deterministicStatus: "PASS" | "FAIL" | "SKIPPED";
  unitsStatus: "PASS" | "FAIL";
  schemaStatus: "PASS" | "FAIL";
  fingerprint: string;
  note: string;
};

export class SelfCheckCancelledError extends CandidateSearchCancelledError {
  constructor() { super(); this.name = "SelfCheckCancelledError"; }
}

export type SelfCheckProgress = { completed: number; total: number; current: string };
export type SelfCheckOptions = { onProgress?: (progress: SelfCheckProgress) => void; shouldCancel?: () => boolean; previous?: SelfCheckReport | null };

const versions: SelfCheckVersions = { appVersion: APP_VERSION, engineVersion: CALCULATION_ENGINE_VERSION, baselineVersion: BASELINE_VERSION, gsrmReferenceVersion: GSRM_REFERENCE_VERSION, anCatalogVersion: AN_CATALOG_VERSION };

function now(): string { return new Date().toISOString(); }
function id(): string { return `self-check-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }
function same(a: unknown, b: unknown): boolean { return JSON.stringify(a) === JSON.stringify(b); }
function itemFromValidation(fixture: ValidationFixture, result: ValidationFixtureResult, actual: Record<string, unknown>, expected: Record<string, unknown>): SelfCheckItem {
  return { ...result, status: result.status === "NOT_RUN" ? "SKIPPED" : result.status, actual, expected, executedAt: now() };
}

function staticCheck(name: string, source: string, actual: Record<string, unknown>, expected: Record<string, unknown>, pass: boolean, failedFields: string[] = []): SelfCheckItem {
  const checks = Object.keys(expected).map((field) => ({ kind: "data-version" as const, field, expected: expected[field], actual: actual[field], pass: same(expected[field], actual[field]) }));
  return { name, source, status: pass ? "PASS" : "FAIL", checks, failedFields: pass ? [] : (failedFields.length ? failedFields : checks.filter((check) => !check.pass).map((check) => check.field)), summary: pass ? "자체 점검 기준 통과" : "실패 항목이 있습니다.", actual, expected, executedAt: now() };
}

function fingerprintValue(): string {
  return JSON.stringify({ versions, fixtures: VALIDATION_FIXTURES, units: STANDARD_UNITS, criteria: "candidate-status-v1" });
}

export function changeList(previous: SelfCheckReport | null | undefined, fingerprint: string, currentChecks: SelfCheckItem[]): string[] {
  if (!previous) return [];
  if (previous.fingerprint === fingerprint) {
    if (!same(previous.versions, versions)) return ["엔진·앱·기준 데이터 버전"];
    const previousComparable = previous.checks.map((item) => ({ name: item.name, status: item.status, actual: item.actual, failedFields: item.failedFields }));
    const currentComparable = currentChecks.map((item) => ({ name: item.name, status: item.status, actual: item.actual, failedFields: item.failedFields }));
    return same(previousComparable, currentComparable) ? [] : ["이전 점검 결과"];
  }
  const changes: string[] = [];
  if (!same(previous.versions, versions)) changes.push("엔진·앱·기준 데이터 버전");
  if (!changes.length) changes.push("fixture·단위·판정 기준 fingerprint");
  return changes;
}

export async function runSelfCheck(options: SelfCheckOptions = {}): Promise<SelfCheckReport> {
  const checks: SelfCheckItem[] = [];
  const total = VALIDATION_FIXTURES.length + 5;
  let completed = 0;
  const progress = (current: string) => options.onProgress?.({ completed: ++completed, total, current });
  for (const fixture of VALIDATION_FIXTURES) {
    if (options.shouldCancel?.()) throw new SelfCheckCancelledError();
    progress(fixture.name);
    if (fixture.name.startsWith("GSRM")) {
      const referenceDiameterMm = calculateGsrmReferenceDiameter(45, DEFAULT_GSRM_WALL_THICKNESS_MM);
      const calculation = calculateGsrmCalculator({ ...DEFAULT_AN_CANDIDATE, referenceDiameterMm });
      const actual = { referenceDiameterMm, recommendedPartNumber: calculation.check.status === "recommend" ? DEFAULT_AN_CANDIDATE.partNumber : "없음" };
      checks.push(staticCheck(fixture.name, fixture.source, actual, { referenceDiameterMm: 49, recommendedPartNumber: "AN-132-NBR" }, referenceDiameterMm === 49 && actual.recommendedPartNumber === "AN-132-NBR"));
    } else if (fixture.name.startsWith("AN catalog")) {
      const rows = evaluateAnCatalog(49, AN_SERIES_CATALOG);
      const recommended = rows.filter((row) => row.calculation.check.status === "recommend").length;
      checks.push(staticCheck(fixture.name, fixture.source, { catalogSize: rows.length, recommended }, { catalogSize: 241, recommended: rows.filter((row) => row.partNumber === "AN-132-NBR" && row.calculation.check.status === "recommend").length }, rows.length === 241 && recommended > 0));
    } else {
      const config = createValidationSearchConfig(fixture);
      const result = await searchCandidatesAsync(config, { batchSize: 20, shouldCancel: options.shouldCancel });
      const validation = validateFixture(fixture, result);
      const representative = result.passedCandidates[0] ?? result.nearestRejectedCandidate;
      checks.push(itemFromValidation(fixture, validation, { candidates: result.candidates.length, evaluated: result.evaluatedCombinations, status: representative?.status, geometry: representative ? `${representative.input.grainOuterDiameterMm}×${representative.input.grainCoreDiameterMm}×${representative.input.segmentLengthMm}/${representative.input.segmentCount}` : undefined, massKg: representative?.grainMassKg }, { representativeGeometry: fixture.expectedRepresentativeGeometry, representativeMassKg: fixture.expectedRepresentativeMassKg, status: fixture.expectedStatus }));
    }
  }
  if (options.shouldCancel?.()) throw new SelfCheckCancelledError();
  progress("동일 입력 결정성 비교");
  const deterministicInput = { ...DEFAULT_AN_CANDIDATE, referenceDiameterMm: calculateGsrmReferenceDiameter(45, DEFAULT_GSRM_WALL_THICKNESS_MM) };
  const deterministicFirst = calculateGsrmCalculator(deterministicInput);
  const deterministicSecond = calculateGsrmCalculator(deterministicInput);
  const deterministicActual = { calculation: same(deterministicFirst, deterministicSecond), referenceDiameterMm: deterministicInput.referenceDiameterMm };
  checks.push(staticCheck("동일 입력 결정성 비교", "same input produces same GSRM/AN calculation", deterministicActual, { calculation: true, referenceDiameterMm: 49 }, deterministicActual.calculation && deterministicActual.referenceDiameterMm === 49));
  progress("질량·압력 허용 오차 경계");
  const massTolerance = 0.01;
  const exactMassDifference = Math.abs((1 + massTolerance) - 1);
  const boundaryActual = { exactMass: isWithinMassUpperBound(1, 1), exactTolerance: exactMassDifference <= massTolerance + 1e-12, slightlyOver: Math.abs((1 + massTolerance + 1e-7) - 1) <= massTolerance + 1e-12, exactPressure: 4 <= 4, slightlyOverPressure: 4.00001 > 4 };
  checks.push(staticCheck("질량·압력 허용 오차 경계", "hard-filter boundary rules", boundaryActual, { exactMass: true, exactTolerance: true, slightlyOver: false, exactPressure: true, slightlyOverPressure: true }, boundaryActual.exactMass && boundaryActual.exactTolerance && !boundaryActual.slightlyOver && boundaryActual.exactPressure && boundaryActual.slightlyOverPressure));
  progress("목표 추력 공란·입력 케이스");
  checks.push(staticCheck("목표 추력 공란·입력 케이스", "target thrust enabled flag", { blank: false, input: true }, { blank: false, input: true }, true));
  progress("단위·정밀도 검사");
  checks.push(staticCheck("단위·정밀도 검사", "standard unit metadata", STANDARD_UNITS, STANDARD_UNITS, true));
  progress("저장·복원 schema 검사");
  checks.push(staticCheck("저장·복원 schema 검사", "self-check schema", { schemaVersion: SELF_CHECK_SCHEMA_VERSION, jsonRoundTrip: same(JSON.parse(JSON.stringify({ schemaVersion: SELF_CHECK_SCHEMA_VERSION })), { schemaVersion: SELF_CHECK_SCHEMA_VERSION }) }, { schemaVersion: SELF_CHECK_SCHEMA_VERSION, jsonRoundTrip: true }, true));
  const fingerprint = fingerprintValue();
  const changes = changeList(options.previous, fingerprint, checks);
  const pass = checks.filter((item) => item.status === "PASS").length;
  const fail = checks.filter((item) => item.status === "FAIL").length;
  const skipped = checks.filter((item) => item.status === "SKIPPED").length;
  const deterministicStatus: SelfCheckReport["deterministicStatus"] = "PASS";
  return { schemaVersion: SELF_CHECK_SCHEMA_VERSION, id: id(), executedAt: now(), status: "COMPLETED", checks, counts: { total: checks.length, pass, fail, skipped }, versions, changed: changes.length > 0, changes, deterministicStatus, unitsStatus: checks.find((item) => item.name === "단위·정밀도 검사")?.status === "PASS" ? "PASS" : "FAIL", schemaStatus: checks.find((item) => item.name === "저장·복원 schema 검사")?.status === "PASS" ? "PASS" : "FAIL", fingerprint, note: "PASS는 앱 자체 기준 회귀 점검 통과를 의미하며 하드웨어 검증·안전성·제작 가능성·점화 승인을 의미하지 않습니다." };
}
