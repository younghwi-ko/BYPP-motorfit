export const EXTERNAL_VALIDATION_STORAGE_KEY = "motorfit-external-validation-v1";
export const EXTERNAL_VALIDATION_SCHEMA_VERSION = 1 as const;

export type ValidationMetric = "averageThrustN" | "maximumPressureMpa" | "burnTimeSec" | "totalImpulseNs";
export type ExternalValidationMeasurements = Partial<Record<ValidationMetric, number>>;
export type ExternalValidationTolerances = Partial<Record<ValidationMetric, number>>;

export interface ExternalValidationRecord {
  id: string;
  name: string;
  recordedAt: string;
  sourceDescription: string;
  calculationResultId: string;
  measured: ExternalValidationMeasurements;
  tolerances: ExternalValidationTolerances;
  conditionsMemo: string;
  dataVersion: string;
  units: Record<ValidationMetric, string>;
  appVersion: string;
  engineVersion: string;
  baselineVersion: string;
  gsrmReferenceVersion: string;
  anCatalogVersion: string;
}

export interface ExternalValidationBackup {
  app: "MotorFit";
  schemaVersion: typeof EXTERNAL_VALIDATION_SCHEMA_VERSION;
  exportedAt: string;
  records: ExternalValidationRecord[];
}

export interface ValidationComparison {
  metric: ValidationMetric;
  predicted: number | null;
  measured: number | null;
  absoluteDifference: number | null;
  relativeDifferencePercent: number | null;
  tolerance: number | null;
  status: "within" | "outside" | "unavailable" | "tolerance-unset";
}

export type ExternalValidationQualityWarning =
  | "unit-missing"
  | "unit-invalid"
  | "conditions-missing"
  | "data-version-missing"
  | "source-missing"
  | "duplicate-possible"
  | "version-mismatch"
  | "measurement-missing"
  | "tolerance-missing";

export interface ExternalValidationVersions {
  appVersion: string;
  engineVersion: string;
  baselineVersion: string;
  gsrmReferenceVersion: string;
  anCatalogVersion: string;
}

export const VALIDATION_METRICS: ReadonlyArray<{ key: ValidationMetric; label: string; unit: string }> = [
  { key: "averageThrustN", label: "평균 추력", unit: "N" },
  { key: "maximumPressureMpa", label: "최대 압력", unit: "MPa" },
  { key: "burnTimeSec", label: "연소시간", unit: "s" },
  { key: "totalImpulseNs", label: "총 충격량", unit: "N·s" },
];

export const STANDARD_UNITS = Object.freeze({
  mass: "kg",
  pressure: "MPa",
  thrust: "N",
  time: "s",
  length: "mm",
  impulse: "N·s",
  specificImpulse: "s",
} as const);

const validationMetricUnits = Object.fromEntries(VALIDATION_METRICS.map(({ key, unit }) => [key, unit])) as Record<ValidationMetric, string>;

export function isWithinValidationTolerance(difference: number, tolerance: number): boolean {
  if (!Number.isFinite(difference) || !Number.isFinite(tolerance) || tolerance < 0) return false;
  const epsilon = Number.EPSILON * Math.max(1, Math.abs(difference), Math.abs(tolerance)) * 2048;
  return difference <= tolerance + epsilon;
}

export function compareValidationMetric(metric: ValidationMetric, predicted: number | undefined, measured: number | undefined, tolerance: number | undefined): ValidationComparison {
  if (!Number.isFinite(predicted) || !Number.isFinite(measured)) return { metric, predicted: Number.isFinite(predicted) ? predicted! : null, measured: Number.isFinite(measured) ? measured! : null, absoluteDifference: null, relativeDifferencePercent: null, tolerance: Number.isFinite(tolerance) ? tolerance! : null, status: "unavailable" };
  const absoluteDifference = Math.abs(predicted! - measured!);
  const relativeDifferencePercent = predicted === 0 ? null : (absoluteDifference / Math.abs(predicted!)) * 100;
  const normalizedTolerance = Number.isFinite(tolerance) && tolerance! >= 0 ? tolerance! : null;
  return { metric, predicted: predicted!, measured: measured!, absoluteDifference, relativeDifferencePercent, tolerance: normalizedTolerance, status: normalizedTolerance === null ? "tolerance-unset" : isWithinValidationTolerance(absoluteDifference, normalizedTolerance) ? "within" : "outside" };
}

export function compareValidationRecord(record: ExternalValidationRecord, predicted: Partial<Record<ValidationMetric, number>>): ValidationComparison[] {
  return VALIDATION_METRICS.map(({ key }) => record.units?.[key] !== validationMetricUnits[key]
    ? { metric: key, predicted: null, measured: null, absoluteDifference: null, relativeDifferencePercent: null, tolerance: null, status: "unavailable" as const }
    : compareValidationMetric(key, predicted[key], record.measured[key], record.tolerances[key]));
}

export function getValidationQualityWarnings(record: ExternalValidationRecord, currentVersions: ExternalValidationVersions, records: readonly ExternalValidationRecord[] = []): ExternalValidationQualityWarning[] {
  const warnings = new Set<ExternalValidationQualityWarning>();
  for (const { key } of VALIDATION_METRICS) {
    if (!record.units?.[key]) warnings.add("unit-missing");
    else if (record.units[key] !== validationMetricUnits[key]) warnings.add("unit-invalid");
    if (record.measured?.[key] === undefined) warnings.add("measurement-missing");
    if (record.measured?.[key] !== undefined && record.tolerances?.[key] === undefined) warnings.add("tolerance-missing");
  }
  if (!record.conditionsMemo.trim()) warnings.add("conditions-missing");
  if (!record.dataVersion.trim() || record.dataVersion === "식별자 미기록") warnings.add("data-version-missing");
  if (!record.sourceDescription.trim() || record.sourceDescription === "출처 미기록") warnings.add("source-missing");
  if (record.appVersion !== currentVersions.appVersion || record.engineVersion !== currentVersions.engineVersion || record.baselineVersion !== currentVersions.baselineVersion || record.gsrmReferenceVersion !== currentVersions.gsrmReferenceVersion || record.anCatalogVersion !== currentVersions.anCatalogVersion) warnings.add("version-mismatch");
  if (records.some((other) => other.id !== record.id && other.name === record.name && other.recordedAt === record.recordedAt)) warnings.add("duplicate-possible");
  return [...warnings];
}

export function isExternalValidationRecord(value: unknown): value is ExternalValidationRecord {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ExternalValidationRecord>;
  const finiteRecordValues = (values: unknown) => values && typeof values === "object" && Object.values(values as Record<string, unknown>).every((entry) => typeof entry === "number" && Number.isFinite(entry) && entry >= 0);
  return typeof item.id === "string" && typeof item.name === "string" && typeof item.recordedAt === "string" && typeof item.sourceDescription === "string" && typeof item.calculationResultId === "string" && Boolean(item.measured && finiteRecordValues(item.measured)) && Boolean(item.tolerances && finiteRecordValues(item.tolerances)) && typeof item.conditionsMemo === "string" && typeof item.dataVersion === "string" && Boolean(item.units && typeof item.units === "object") && typeof item.appVersion === "string" && typeof item.engineVersion === "string" && typeof item.baselineVersion === "string" && typeof item.gsrmReferenceVersion === "string" && typeof item.anCatalogVersion === "string";
}

export function parseExternalValidationBackup(value: unknown): ExternalValidationRecord[] {
  if (!value || typeof value !== "object") throw new Error("검증 데이터 백업 형식이 올바르지 않습니다.");
  const backup = value as Partial<ExternalValidationBackup>;
  if (backup.app !== "MotorFit" || backup.schemaVersion !== EXTERNAL_VALIDATION_SCHEMA_VERSION || !Array.isArray(backup.records) || backup.records.some((record) => !isExternalValidationRecord(record))) throw new Error("지원하지 않는 검증 데이터 백업입니다.");
  return backup.records;
}
