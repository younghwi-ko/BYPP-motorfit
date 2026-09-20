"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { AN_SERIES_CATALOG, AN_CATALOG_VERSION, APP_VERSION, BASELINE_VERSION, CALCULATION_ENGINE_VERSION, CandidateSearchCancelledError, CandidateSearchInputError, calculateGsrmReferenceDiameter, DEFAULT_GSRM_WALL_THICKNESS_MM, evaluateAnCatalog, GSRM_REFERENCE_VERSION, VALIDATION_FIXTURES, notRunValidation, MODEL_VALIDATION_LEVEL, BASELINE_REPRODUCTION_STATUS, DETERMINISTIC_CALCULATION_STATUS, HARDWARE_VALIDATION_STATUS, PRODUCTION_APPROVAL_STATUS, VALIDATION_DATA_AVAILABLE, MODEL_ASSUMPTIONS, MODEL_LIMITATIONS, SELF_CHECK_MAX_HISTORY, SELF_CHECK_STORAGE_KEY, SELF_CHECK_SCHEMA_VERSION, buildRpaInputSummary, parseRpaBackup, RPA_LINK_SCHEMA_VERSION, RPA_LINK_STORAGE_KEY, buildCadDesignSummary } from "../engine";
import type { SelfCheckReport, RpaInputSummary, RpaResultRecord } from "../engine";
import type { GsrmBatchResult } from "../engine";
import { SCORE_GUIDANCE, sortCandidates } from "./candidate-table";
import type { CandidateSortDirection, CandidateSortKey } from "./candidate-table";
import type {
  CandidateResult,
  CandidateSearchConfig,
  CandidateSearchResult,
} from "../engine";
import { DEMO_INPUT } from "./demo-config";
import { EXTERNAL_VALIDATION_SCHEMA_VERSION, EXTERNAL_VALIDATION_STORAGE_KEY, STANDARD_UNITS, VALIDATION_METRICS, compareValidationRecord, getValidationQualityWarnings, parseExternalValidationBackup } from "../engine/external-validation";
import type { ExternalValidationRecord, ValidationMetric } from "../engine/external-validation";

const DEFAULT_FUEL_MASS_TOLERANCE_KG = 0.010;

const DEFAULT_CONFIG: CandidateSearchConfig = {
  mode: "candidate",
  chamberDiameterMm: 45,
  chamberLengthMm: 165,
  propellant: "KNSB coarse",
  targetFuelMassKg: DEMO_INPUT.targetFuelMassKg,
  fuelMassToleranceKg: DEFAULT_FUEL_MASS_TOLERANCE_KG,
  maximumPressureMpa: DEMO_INPUT.maximumPressureMpa,
  targetAverageThrustN: 209.845,
  targetThrustEnabled: false,
  averageThrustToleranceN: 5,
  targetBurnTimeSec: 2.1767,
  burnTimeToleranceSec: 0.03,
  targetPressureMpa: 4,
  outerDiameterMm: { min: 40, max: 50, step: 5 },
  coreDiameterMm: { min: 10, max: 20, step: 5 },
  segmentLengthMm: { min: 75, max: 85, step: 5 },
  segmentCount: { min: 2, max: 2 },
  outerSurface: "Inhibited",
  coreSurface: "Exposed",
  endsSurface: "Exposed",
  densityRatio: 0.95,
  nozzleErosionMm: 0,
  manufacturingStepMm: 5,
  maxCandidateCount: 200,
};

const PROPELLANTS = [
  "KNDX",
  "KNSB fine",
  "KNSB coarse",
  "KNSU",
  "KNER coarse",
  "KNMN coarse",
  "KNPSB",
  "KNFR",
] as const;

const formatNumber = (value: number, digits = 3) =>
  Number.isFinite(value) ? (Object.is(value, -0) ? 0 : value).toLocaleString("ko-KR", { maximumFractionDigits: digits }) : "미표시";

const formatMassTolerance = (value: number) => `${value.toFixed(3)} kg`;

const VALIDATION_WARNING_LABELS = {
  "unit-missing": "단위 누락",
  "unit-invalid": "단위 불일치",
  "conditions-missing": "측정 조건 누락",
  "data-version-missing": "데이터 버전 누락",
  "source-missing": "출처 누락",
  "duplicate-possible": "동일 이름·시각 중복 가능성",
  "version-mismatch": "계산 결과와 데이터 버전 불일치",
  "measurement-missing": "측정값 없는 항목 있음",
  "tolerance-missing": "허용 오차 없는 항목 있음",
} as const;

function migrateStoredConfig(config: CandidateSearchConfig): CandidateSearchConfig {
  return config.fuelMassToleranceKg === 0.005
    ? { ...config, fuelMassToleranceKg: DEFAULT_FUEL_MASS_TOLERANCE_KG }
    : config;
}

function Field({ label, value, step = "any", onChange, suffix, help }: { label: string; value: number; step?: number | "any"; onChange: (value: number) => void; suffix?: string; help?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>
      <span className="relative block">
        <input className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100" type="number" step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
        {suffix ? <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-slate-400">{suffix}</span> : null}
      </span>
      {help ? <span className="mt-1 block text-[11px] leading-4 text-slate-600">{help}</span> : null}
    </label>
  );
}

function candidateNextCheck(candidate: CandidateResult) {
  if (!candidate.reasons.length) return "추천 이유와 그래프를 확인하세요.";
  if (candidate.reasons.some((reason) => reason.includes("질량"))) return "목표 질량과 질량 허용 오차를 조정해 다시 계산하세요.";
  if (candidate.reasons.some((reason) => reason.includes("압력"))) return "최대 허용 압력과 노즐·형상 범위를 확인하세요.";
  if (candidate.reasons.some((reason) => reason.includes("추력"))) return "목표 추력 또는 추력 허용 오차를 확인하세요.";
  if (candidate.reasons.some((reason) => reason.includes("연소"))) return "목표 연소시간과 시간 허용 오차를 확인하세요.";
  return "상세 조건과 입력 범위를 확인한 뒤 다시 계산하세요.";
}

function OptionalField({ label, value, onChange, suffix }: { label: string; value: string; onChange: (value: string) => void; suffix?: string }) {
  return <label className="block">
<span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>
<span className="relative block">
<input className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100" type="number" step="any" placeholder="선택 입력" value={value} onChange={(event) => onChange(event.target.value)} />{suffix ? <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-slate-400">{suffix}</span> : null}</span>
</label>;
}

function RangeField({ label, range, onChange, suffix = "mm", disabled = false, inputStep = 5 }: { label: string; range: { min: number; max: number; step?: number }; onChange: (bound: "min" | "max", value: number) => void; suffix?: string; disabled?: boolean; inputStep?: number | "any" }) {
  return (
    <div>
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>
      <div className="grid grid-cols-2 gap-2">
        {(["min", "max"] as const).map((bound) => <label key={bound} className="relative block">
<span className="sr-only">{label} {bound}</span>
<input className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 pr-10 text-sm text-slate-900 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-100" type="number" step={inputStep} disabled={disabled} value={range[bound]} onChange={(event) => onChange(bound, Number(event.target.value))} />
<span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[11px] text-slate-400">{suffix}</span>
</label>)}
      </div>
      <p className="mt-1 text-[11px] text-slate-400">최소 · 최대</p>
    </div>
  );
}

function StatusPill({ status, reference = false }: { status: "pass" | "conditional" | "fail"; reference?: boolean }) {
  if (status === "pass") return <span role="status" aria-label="추천 후보" className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">추천</span>;
  if (status === "conditional") return <span role="status" aria-label="조건부 후보" className="rounded-full bg-cyan-100 px-2.5 py-1 text-xs font-bold text-cyan-700">조건부</span>;
  return <span role="status" aria-label={reference ? "참고용 탈락 후보" : "탈락 후보"} className={`rounded-full px-2.5 py-1 text-xs font-bold ${reference ? "bg-violet-100 text-violet-700" : "bg-amber-100 text-amber-700"}`}>{reference ? "참고용 탈락" : "탈락"}</span>;
}

type ConditionState = "pass" | "fail" | "unset" | "not-applicable";

function ConditionBadge({ label, state, detail }: { label: string; state: ConditionState; detail?: string }) {
  const styles = state === "pass"
    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
    : state === "fail"
      ? "border-rose-200 bg-rose-50 text-rose-800"
      : "border-slate-200 bg-slate-50 text-slate-600";
  const stateLabel = state === "pass" ? "통과" : state === "fail" ? "초과" : state === "unset" ? "미입력" : "미적용";
  return <div className={`rounded-xl border px-3 py-2 ${styles}`}><div className="flex items-center justify-between gap-2 text-xs"><span className="font-semibold">{label}</span><span className="font-bold">{stateLabel}</span></div>{detail ? <p className="mt-1 text-[11px] leading-4 opacity-80">{detail}</p> : null}</div>;
}

function CandidateConditionSummary({ candidate, config, targetThrustEnabled, automaticMode }: { candidate: CandidateResult; config: CandidateSearchConfig; targetThrustEnabled: boolean; automaticMode: boolean }) {
  const massFailed = candidate.reasons.some((reason) => reason.includes("목표 연료 질량") || reason.includes("연료 질량 허용"));
  const pressurePass = candidate.maximumPressureMpa <= config.maximumPressureMpa;
  const thrustPass = targetThrustEnabled && Math.abs(candidate.averageThrustN - config.targetAverageThrustN) <= config.averageThrustToleranceN;
  const burnPass = Math.abs(candidate.burnTimeSec - config.targetBurnTimeSec) <= config.burnTimeToleranceSec;
  return <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-bold text-slate-800">조건별 판정</p><StatusPill status={candidate.status} /></div><div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><ConditionBadge label="질량 조건" state={massFailed ? "fail" : "pass"} detail={`${formatNumber(candidate.grainMassKg, 4)} / 목표 ${formatNumber(config.targetFuelMassKg, 4)} kg`} /><ConditionBadge label="압력 조건" state={pressurePass ? "pass" : "fail"} detail={pressurePass ? `${formatNumber(candidate.maximumPressureMpa, 4)} / 허용 ${formatNumber(config.maximumPressureMpa, 4)} MPa` : `압력 허용 범위 초과 · ${formatNumber(candidate.maximumPressureMpa, 4)} / 허용 ${formatNumber(config.maximumPressureMpa, 4)} MPa`} /><ConditionBadge label="목표 추력 조건" state={targetThrustEnabled ? (thrustPass ? "pass" : "fail") : "unset"} detail={targetThrustEnabled ? `${formatNumber(candidate.averageThrustN, 2)} / 목표 ${formatNumber(config.targetAverageThrustN, 2)} N` : "목표 추력이 입력되지 않았습니다."} /><ConditionBadge label="연소시간 조건" state={burnPass ? "pass" : "fail"} detail={`${formatNumber(candidate.burnTimeSec, 4)} / 목표 ${formatNumber(config.targetBurnTimeSec, 4)} s${automaticMode ? " · 자동 탐색에서는 판정 제외" : ""}`} /></div>{candidate.status === "conditional" ? <p className="mt-3 rounded-xl border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-semibold leading-5 text-cyan-900">조건부 판정: 목표 추력 미입력 또는 자동 탐색의 연소시간 판정 제외 상태입니다. 추천 후보와 동일한 확정 판정이 아닙니다.</p> : candidate.reasons.length ? <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold leading-5 text-rose-900">판정 사유: {candidate.reasons.join(" ")}</p> : null}</div>;
}

function SortHeader({ label, sortKey, activeKey, direction, onSort }: { label: string; sortKey: CandidateSortKey; activeKey: CandidateSortKey | null; direction: CandidateSortDirection | null; onSort: (key: CandidateSortKey) => void }) {
  const icon = activeKey === sortKey ? (direction === "asc" ? "↑" : "↓") : "↕";
  return <th className={`px-4 py-3 ${activeKey === sortKey ? "text-cyan-700" : ""}`}>
<button type="button" onClick={() => onSort(sortKey)} className="inline-flex items-center gap-1 rounded-md font-bold hover:text-cyan-700 focus:outline-none focus:ring-2 focus:ring-cyan-300" aria-label={`${label} ${activeKey === sortKey ? (direction === "asc" ? "오름차순" : "내림차순") : "정렬 안 함"}. 클릭하여 정렬 변경`}>{label}<span aria-hidden="true" className="text-sm">{icon}</span>
</button>
</th>;
}

function LineChart({ points, color, xLabel, yLabel, targetY }: { points: Array<{ x: number; y: number }>; color: string; xLabel: string; yLabel: string; targetY?: number }) {
  const width = 720;
  const height = 240;
  const padding = 30;
  const xMax = Math.max(...points.map((point) => point.x), 1);
  const yMax = Math.max(...points.map((point) => point.y), targetY ?? 0, 1);
  const polyline = points.map((point) => `${padding + (point.x / xMax) * (width - padding * 2)},${height - padding - (point.y / yMax) * (height - padding * 2)}`).join(" ");
  return <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 p-3">
<div className="mb-2 flex items-center justify-between text-[11px] text-slate-400">
<span>x축: {xLabel}</span>
<span>y축: {yLabel}</span>
</div>
<svg viewBox={`0 0 ${width} ${height}`} className="h-52 w-full" role="img" aria-label={`${xLabel}에 따른 ${yLabel} 그래프`}>
<line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#334155" />
<line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#334155" />
{targetY !== undefined ? <line x1={padding} y1={height - padding - (targetY / yMax) * (height - padding * 2)} x2={width - padding} y2={height - padding - (targetY / yMax) * (height - padding * 2)} stroke="#f8fafc" strokeWidth="2" strokeDasharray="8 6"><title>{`목표 평균 추력: ${formatNumber(targetY, 2)} N`}</title></line> : null}
<polyline points={polyline} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />{points.map((point, index) => <circle key={`${point.x}-${point.y}-${index}`} cx={padding + (point.x / xMax) * (width - padding * 2)} cy={height - padding - (point.y / yMax) * (height - padding * 2)} r="3" fill={color}>
<title>{`${xLabel}: ${formatNumber(point.x, 4)} · ${yLabel}: ${formatNumber(point.y, 4)}`}</title>
</circle>)}</svg>
</div>;
}

function GraphKpis({ items }: { items: Array<{ label: string; value: string }> }) {
  return <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">{items.map((item) => <div key={item.label} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
<p className="text-[10px] font-semibold text-slate-500">{item.label}</p>
<p className="mt-1 text-sm font-bold text-slate-900">{item.value}</p>
</div>)}</div>;
}

function MetricCard({ label, value, unit, tone = "slate" }: { label: string; value: string; unit: string; tone?: "slate" | "cyan" | "amber" }) {
  const tones = { slate: "border-slate-200", cyan: "border-cyan-300", amber: "border-amber-300" };
  return <div className={`rounded-lg border bg-white p-3 ${tones[tone]}`}>
<p className="text-xs font-semibold text-slate-500">{label}</p>
<p className="mt-2 font-mono text-xl font-bold tracking-tight text-slate-950">{value} <span className="font-sans text-xs font-medium text-slate-500">{unit}</span></p>
</div>;
}

function RecommendationRow({ label, value, tone = "slate" }: { label: string; value: string; tone?: "slate" | "emerald" | "amber" }) {
  const colors = { slate: "text-slate-700", emerald: "text-emerald-700", amber: "text-amber-700" };
  return <li className="flex items-start justify-between gap-4 border-b border-slate-100 py-2 last:border-0">
<span className="text-slate-500">{label}</span>
<span className={`text-right font-semibold ${colors[tone]}`}>{value}</span>
</li>;
}

type AnExportState = { query: string; page: number; pageCount: number; total: number; recommend: number; conditional: number; fail: number };

type SavedCalculation = {
  id: string;
  name: string;
  savedAt: string;
  // Export payload is intentionally schema-compatible JSON from the calculator.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: Record<string, any>;
};

const SAVED_RESULTS_SCHEMA_VERSION = 1 as const;
type SavedResultsBackup = {
  app: "MotorFit";
  schemaVersion: typeof SAVED_RESULTS_SCHEMA_VERSION;
  exportedAt: string;
  results: SavedCalculation[];
};

type ExternalValidationBackupFile = {
  app: "MotorFit";
  schemaVersion: typeof EXTERNAL_VALIDATION_SCHEMA_VERSION;
  exportedAt: string;
  records: ExternalValidationRecord[];
};

type SensitivityField = "targetFuelMassKg" | "maximumPressureMpa" | "targetAverageThrustN" | "outerDiameterMm" | "coreDiameterMm" | "segmentLengthMm" | "segmentCount";
type SensitivityVersions = {
  appVersion: string;
  engineVersion: string;
  baselineVersion: string;
  gsrmReferenceVersion: string;
  anCatalogVersion: string;
};
type SensitivityScenario = {
  id: string;
  name: string;
  field: SensitivityField;
  baseValue: string;
  comparisonValue: string;
  changeDescription: string;
  createdAt: string;
  status: "completed" | "cancelled" | "failed";
  error?: string;
  versions?: SensitivityVersions;
  result?: {
    input: Record<string, unknown>;
    totalCombinations: number;
    evaluatedCombinations: number;
    automaticExpansionStage: number;
    counts: { recommend: number; conditional: number; referenceRejected: number; rejected: number };
    representativeCandidate: Record<string, unknown> | null;
    gsrmB: number | null;
    an: { total: number; recommend: number; conditional: number; fail: number };
    calculationFailures: number;
  };
};

const CURRENT_SENSITIVITY_VERSIONS: SensitivityVersions = {
  appVersion: APP_VERSION,
  engineVersion: CALCULATION_ENGINE_VERSION,
  baselineVersion: BASELINE_VERSION,
  gsrmReferenceVersion: GSRM_REFERENCE_VERSION,
  anCatalogVersion: AN_CATALOG_VERSION,
};

function sensitivityVersionMismatch(versions?: SensitivityVersions) {
  if (!versions) return true;
  return Object.keys(CURRENT_SENSITIVITY_VERSIONS).some((key) => versions[key as keyof SensitivityVersions] !== CURRENT_SENSITIVITY_VERSIONS[key as keyof SensitivityVersions]);
}

function isSensitivityScenario(value: unknown): value is SensitivityScenario {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<SensitivityScenario>;
  const fields: SensitivityField[] = ["targetFuelMassKg", "maximumPressureMpa", "targetAverageThrustN", "outerDiameterMm", "coreDiameterMm", "segmentLengthMm", "segmentCount"];
  return typeof item.id === "string" && typeof item.name === "string" && fields.includes(item.field as SensitivityField) && typeof item.baseValue === "string" && typeof item.comparisonValue === "string" && typeof item.changeDescription === "string" && typeof item.createdAt === "string" && ["completed", "cancelled", "failed"].includes(item.status ?? "") && (!item.versions || typeof item.versions === "object");
}

const SENSITIVITY_STORAGE_KEY = "motorfit-sensitivity-v1";
const SENSITIVITY_BACKUP_SCHEMA_VERSION = 1 as const;

const EMPTY_VALIDATION_FORM: Record<ValidationMetric, string> = {
  averageThrustN: "",
  maximumPressureMpa: "",
  burnTimeSec: "",
  totalImpulseNs: "",
};

const VALIDATION_UNITS: Record<ValidationMetric, string> = {
  averageThrustN: "N",
  maximumPressureMpa: "MPa",
  burnTimeSec: "s",
  totalImpulseNs: "N·s",
};

function createSavedCalculationId() { return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`; }
function createSavedCalculationTimestamp() { return new Date().toISOString(); }

function predictedMetricsForReport(candidate: unknown): Partial<Record<ValidationMetric, number>> {
  if (!candidate || typeof candidate !== "object") return {};
  const item = candidate as Partial<Record<ValidationMetric, number>>;
  return { averageThrustN: item.averageThrustN, maximumPressureMpa: item.maximumPressureMpa, burnTimeSec: item.burnTimeSec, totalImpulseNs: item.totalImpulseNs };
}

function summarizeSensitivityResult(result: CandidateSearchResult, input: CandidateSearchConfig, targetThrustText: string, mode: "candidate" | "excel", automaticMode: boolean, wallThicknessMm: number): SensitivityScenario["result"] {
  const representative = result.candidates.find((candidate) => candidate.status !== "fail") ?? result.nearestRejectedCandidate;
  const anRows = representative ? evaluateAnCatalog(calculateGsrmReferenceDiameter(representative.input.chamberDiameterMm, wallThicknessMm), AN_SERIES_CATALOG) : [];
  return {
    input: { ...input, targetThrustText, mode, automaticMode },
    totalCombinations: result.totalCombinations,
    evaluatedCombinations: result.evaluatedCombinations,
    automaticExpansionStage: result.automaticExpansionStage ?? 0,
    counts: {
      recommend: result.candidates.filter((candidate) => candidate.status === "pass").length,
      conditional: result.candidates.filter((candidate) => candidate.status === "conditional").length,
      referenceRejected: result.nearestRejectedCandidate && !result.candidates.some((candidate) => candidate.status !== "fail") ? 1 : 0,
      rejected: result.candidates.filter((candidate) => candidate.status === "fail" && candidate !== result.nearestRejectedCandidate).length,
    },
    representativeCandidate: representative ? { geometry: `${representative.input.grainOuterDiameterMm}×${representative.input.grainCoreDiameterMm}×${representative.input.segmentLengthMm}/${representative.input.segmentCount}`, massKg: representative.grainMassKg, maximumPressureMpa: representative.maximumPressureMpa, burnTimeSec: representative.burnTimeSec, averageThrustN: representative.averageThrustN, status: representative.status } : null,
    gsrmB: representative ? calculateGsrmReferenceDiameter(representative.input.chamberDiameterMm, wallThicknessMm) : null,
    an: { total: anRows.length || 241, recommend: anRows.filter((row) => row.calculation.check.status === "recommend").length, conditional: anRows.filter((row) => row.calculation.check.status === "conditional").length, fail: anRows.filter((row) => row.calculation.check.status === "fail").length },
    calculationFailures: result.calculationFailures,
  };
}

const SAVED_RESULTS_KEY = "motorfit-calculation-history-v1";
const MAX_SAVED_RESULTS = 20;

function isSavedCalculation(value: unknown): value is SavedCalculation {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<SavedCalculation>;
  return typeof item.id === "string" && typeof item.name === "string" && typeof item.savedAt === "string" && Boolean(item.payload && typeof item.payload === "object");
}

function migrateBackup(value: unknown): SavedCalculation[] {
  if (!value || typeof value !== "object") throw new Error("백업 형식이 올바르지 않습니다.");
  const backup = value as Partial<SavedResultsBackup>;
  if (backup.app !== "MotorFit") throw new Error("MotorFit 백업 파일이 아닙니다.");
  if (backup.schemaVersion !== SAVED_RESULTS_SCHEMA_VERSION) throw new Error(`지원하지 않는 백업 schema version입니다: ${String(backup.schemaVersion ?? "없음")}`);
  if (!Array.isArray(backup.results) || backup.results.some((item) => !isSavedCalculation(item))) throw new Error("저장 결과 항목이 올바르지 않습니다.");
  return backup.results.slice(0, MAX_SAVED_RESULTS);
}

// 브라우저 인쇄 대화상자를 사용하므로 서버·외부 네트워크가 필요하지 않습니다.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function printReviewReport(payload: Record<string, any> | null, status: string, title = "MotorFit 설계 검토 리포트", onStatus?: (message: string) => void, selfCheck?: SelfCheckReport | null) {
  if (!payload) { onStatus?.("리포트 데이터 없음"); return false; }
  const escapeHtml = (value: unknown) => String(value ?? "미기록").replace(/[&<>\"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[character] ?? character));
  const metadata = payload?.metadata ?? {};
  const input = payload?.input ?? {};
  const search = payload?.search ?? {};
  const counts = search.counts ?? metadata.counts ?? {};
  const candidate = payload?.representativeCandidate;
  const reportStatus = payload ? payload.validation?.calculationStatus ?? status.toUpperCase() : status.toUpperCase();
  const rows: Array<[string, unknown]> = [
    ["생성 시각", new Date().toLocaleString("ko-KR")], ["계산 상태", reportStatus], ["목표 질량", `${input.targetFuelMassKg ?? "미기록"} kg`], ["최대 허용 압력", `${input.maximumPressureMpa ?? "미기록"} MPa`], ["목표 평균 추력", input.targetThrustEnabled ? `${input.targetThrustText ?? "미기록"} N` : "미입력"], ["질량 허용 오차", input.fuelMassToleranceDisplay ?? `${input.fuelMassToleranceKg ?? "미기록"} kg`], ["탐색 모드", metadata.searchMode ?? "미기록"], ["자동 확장 단계", search.automaticExpansionStage ?? metadata.automaticExpansionStage ?? "미기록"], ["전체 후보 수", search.totalCombinations ?? metadata.totalCombinations ?? "미기록"], ["정밀 계산 수", search.evaluatedCombinations ?? metadata.evaluatedCombinations ?? "미기록"], ["계산 실패 수", metadata.calculationFailures ?? "미기록"], ["추천·조건부·참고·탈락", `${counts.recommend ?? 0} · ${counts.conditional ?? 0} · ${counts.referenceRejected ?? 0} · ${counts.rejected ?? 0}`], ["대표 후보", candidate?.geometry ?? "없음"], ["대표 후보 질량", candidate?.massKg == null ? "미기록" : `${candidate.massKg} kg`], ["대표 후보 최대 압력", candidate?.maximumPressureMpa == null ? "미기록" : `${candidate.maximumPressureMpa} MPa`], ["대표 후보 연소시간", candidate?.burnTimeSec == null ? "미기록" : `${candidate.burnTimeSec} s`], ["대표 후보 평균 추력", candidate?.averageThrustN == null ? "미기록" : `${candidate.averageThrustN} N`], ["GSRM B", payload?.gsrm?.referenceDiameterMm == null ? "미기록" : `${payload.gsrm.referenceDiameterMm} mm`], ["AN 검사", payload?.an?.catalogSize ?? 241], ["AN 판정", `${payload?.an?.recommend ?? 0} · ${payload?.an?.conditional ?? 0} · ${payload?.an?.fail ?? 0}`], ["엔진·앱 버전", `${metadata.engineVersion ?? "미기록"} · ${metadata.appVersion ?? "미기록"}`], ["기준 데이터 버전", `${metadata.baselineVersion ?? "미기록"} · ${metadata.gsrmReferenceVersion ?? "미기록"} · ${metadata.anCatalogVersion ?? "미기록"}`], ["검산 상태", payload?.validation?.summary ?? "현재 결과에 대한 별도 fixture 재검산: 실행하지 않음"],
  ];
  const externalRecords = Array.isArray(payload?.externalValidation) ? payload.externalValidation as ExternalValidationRecord[] : [];
  const sensitivityRecords = Array.isArray(payload?.sensitivityScenarios) ? payload.sensitivityScenarios as SensitivityScenario[] : [];
  const sensitivityHtml = sensitivityRecords.length ? sensitivityRecords.map((scenario) => `<div class="row"><div class="label">민감도 · ${escapeHtml(scenario.name)}</div><div class="value">${escapeHtml(scenario.changeDescription)} · 상태 ${escapeHtml(scenario.status)}${sensitivityVersionMismatch(scenario.versions) ? " · 버전 불일치 또는 정보 없음" : ""}${scenario.result ? ` · 후보 ${escapeHtml(scenario.result.totalCombinations)} · 정밀 ${escapeHtml(scenario.result.evaluatedCombinations)} · 추천 ${escapeHtml(scenario.result.counts.recommend)} · 조건부 ${escapeHtml(scenario.result.counts.conditional)} · 참고 ${escapeHtml(scenario.result.counts.referenceRejected)} · 탈락 ${escapeHtml(scenario.result.counts.rejected)} · 대표 ${escapeHtml(scenario.result.representativeCandidate?.geometry ?? "없음")} · GSRM B ${escapeHtml(scenario.result.gsrmB == null ? "미기록" : `${scenario.result.gsrmB} mm`)} · AN ${escapeHtml(`${scenario.result.an.total}개 (${scenario.result.an.recommend}/${scenario.result.an.conditional}/${scenario.result.an.fail})`)}` : ""}</div></div>`).join("") : `<p class="small">저장된 민감도 시나리오가 없습니다.</p>`;
  const predicted = predictedMetricsForReport(candidate);
  const externalHtml = externalRecords.length ? externalRecords.map((record) => {
    const comparisons = compareValidationRecord(record, predicted);
    const warnings = getValidationQualityWarnings(record, { appVersion: APP_VERSION, engineVersion: CALCULATION_ENGINE_VERSION, baselineVersion: BASELINE_VERSION, gsrmReferenceVersion: GSRM_REFERENCE_VERSION, anCatalogVersion: AN_CATALOG_VERSION }, externalRecords);
    return `<div class="row"><div class="label">외부 검증 · ${escapeHtml(record.name)}</div><div class="value">${escapeHtml(record.sourceDescription)}<br>${comparisons.map((item) => `${escapeHtml(item.metric)}: 예측 ${escapeHtml(item.predicted ?? "비교 불가")} · 측정 ${escapeHtml(item.measured ?? "비교 불가")} · 차이 ${escapeHtml(item.absoluteDifference ?? "비교 불가")} · ${escapeHtml(item.status)}`).join("<br>")}${warnings.length ? `<br>품질 경고: ${escapeHtml(warnings.map((warning) => VALIDATION_WARNING_LABELS[warning]).join(" · "))}` : ""}</div></div>`;
  }).join("") : `<p class="small">연결된 외부 검증 데이터가 없습니다.</p>`;
  rows.push(["모델 검증 수준", payload?.modelValidationLevel ?? MODEL_VALIDATION_LEVEL], ["기준 모델 재현", payload?.baselineReproductionStatus ?? BASELINE_REPRODUCTION_STATUS], ["계산 재현성", payload?.deterministicCalculationStatus ?? DETERMINISTIC_CALCULATION_STATUS], ["하드웨어 시험 검증", payload?.hardwareValidationStatus ?? HARDWARE_VALIDATION_STATUS], ["제작 승인", payload?.productionApprovalStatus ?? PRODUCTION_APPROVAL_STATUS], ["시험 데이터 등록", payload?.validationDataAvailable ? "있음" : "없음"], ["모델 가정", (payload?.assumptions ?? MODEL_ASSUMPTIONS).join(" / ")], ["모델 한계", (payload?.limitations ?? MODEL_LIMITATIONS).join(" / ")]);
  rows.push(["계산 흐름", "1. 질량 계산 → 2. 압력 조건 적용 → 3. 추력 조건 적용(입력 시) → 4. 최종 후보 판정"], ["질량 계산 결과", candidate?.massKg == null ? "후보 질량 미기록" : `형상·연료 밀도·세그먼트로 계산된 후보 질량 ${candidate.massKg} kg`], ["압력 조건 판정", candidate?.maximumPressureMpa == null ? "후보 압력 미기록" : `후보 최대 압력 ${candidate.maximumPressureMpa} MPa를 허용 압력 ${input.maximumPressureMpa ?? "미기록"} MPa와 비교`], ["추력 조건 판정", input.targetThrustEnabled ? `평균 추력 ${candidate?.averageThrustN ?? "미기록"} N을 목표 ${input.targetThrustText ?? "미기록"} N과 비교` : "목표 추력 미입력·추력 지표 미계산"]);
  const rpaPayload = payload?.rpa as { inputSummary?: { geometry?: string; values?: Record<string, unknown>; separateInputs?: string[] }; externalResults?: Array<{ source: string; version: string; database: string; resultValues: string }> } | null | undefined;
  if (rpaPayload?.inputSummary) rows.push(["RPA 연계 입력", `${rpaPayload.inputSummary.geometry ?? "미기록"} · ${JSON.stringify(rpaPayload.inputSummary.values ?? {})}`], ["RPA 별도 입력", (rpaPayload.inputSummary.separateInputs ?? []).join(" / ")], ["RPA 외부 결과", rpaPayload.externalResults?.length ? `${rpaPayload.externalResults.length}개 기록` : "등록된 별도 해석 결과 없음"]);
  const cadPayload = payload?.cadDesign;
  if (cadPayload) rows.push(["Fusion 설계 검토 요약", cadPayload.geometry ?? "미기록"], ["챔버", `D ${cadPayload.chamber?.diameterMm ?? "미입력"} mm · L ${cadPayload.chamber?.lengthMm ?? "미입력"} mm · 세그먼트 ${cadPayload.chamber?.segments ?? "미입력"}`], ["노즐", `목 ${cadPayload.nozzle?.throatAreaMm2 ?? "미입력"} mm² · 출구 ${cadPayload.nozzle?.exitAreaMm2 ?? "미입력"} mm² · 면적비 ${cadPayload.nozzle?.areaRatio ?? "미입력"}`], ["벌크헤드", cadPayload.bulkhead?.chamberCount == null ? "미입력" : `${cadPayload.bulkhead.chamberCount}개`], ["GSRM", cadPayload.gsrm?.referenceDiameterMm == null ? "미입력" : `${cadPayload.gsrm.referenceDiameterMm} mm`], ["Fusion 별도 검토", (cadPayload.checklist ?? []).join(" / ")]);
  // Export payloads flatten candidate reasons for CSV/JSON rows, while the
  // interactive candidate keeps them as an array. Normalize both shapes so
  // report generation cannot fail before opening the print window.
  const reasons = Array.isArray(candidate?.reasons) ? candidate.reasons : candidate?.reasons ? [String(candidate.reasons)] : [];
  const selfCheckHtml = selfCheck ? `<h2>앱 자체 점검</h2><p class="small">자체 점검 상태: ${escapeHtml(selfCheck.status)} · 실행 시각: ${escapeHtml(selfCheck.executedAt)}</p><p class="small">PASS ${selfCheck.counts.pass} · FAIL ${selfCheck.counts.fail} · SKIPPED ${selfCheck.counts.skipped}</p><div class="grid">${selfCheck.checks.map((item) => `<div class="row"><div class="label">${escapeHtml(item.name)}</div><div class="value">${escapeHtml(item.status)} · ${escapeHtml(item.failedFields.join(", ") || item.summary || "기준 통과")}</div></div>`).join("")}</div><p class="small">${escapeHtml(selfCheck.note)}</p>` : "";
  const report = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>@page{size:A4;margin:16mm}*{box-sizing:border-box}body{font-family:Arial,"Malgun Gothic",sans-serif;color:#172033;line-height:1.5;font-size:11pt}h1{font-size:22pt;margin:0 0 4pt}h2{font-size:14pt;border-bottom:2px solid #0e7490;padding-bottom:4pt;margin-top:18pt}p{margin:5pt 0}.meta{color:#475569;font-size:9pt}.notice{background:#fff7ed;border:1px solid #fdba74;padding:8pt;border-radius:6pt}.grid{display:grid;grid-template-columns:1fr 1fr;gap:5pt 16pt}.row{border-bottom:1px solid #e2e8f0;padding:4pt 0;break-inside:avoid}.label{color:#64748b;font-size:9pt}.value{font-weight:700}.candidate{border:2px solid #0e7490;padding:9pt;border-radius:7pt}.status{font-weight:700}.small{font-size:9pt;color:#475569}@media print{button{display:none}h2{break-after:avoid}.grid{break-inside:avoid}}</style></head><body><h1>${escapeHtml(title)}</h1><p class="meta">프로젝트: BYPP MotorFit · 보고서 생성 시각: ${escapeHtml(new Date().toLocaleString("ko-KR"))}</p><div class="notice"><b>제한:</b> 자동 탐색은 전역 최적해를 보장하지 않습니다. 본 결과는 교육·설계 검토용이며 실제 제작·점화 승인용이 아닙니다. 민감도 결과는 what-if 비교일 뿐 안전·제작 가능 판정이 아닙니다.</div><h2>계산 요약</h2><div class="grid">${rows.map(([label, value]) => `<div class="row"><div class="label">${escapeHtml(label)}</div><div class="value">${escapeHtml(value)}</div></div>`).join("")}</div><h2>대표 후보 판정</h2><div class="candidate"><p><b>상태:</b> <span class="status">${escapeHtml(candidate?.status ?? "선택 후보 없음")}</span></p><p><b>형상:</b> ${escapeHtml(candidate?.geometry ?? "없음")}</p><p><b>판정 이유:</b> ${escapeHtml(reasons.join(" ") || "기록된 실패 사유 없음")}</p><p class="small">목표 추력이 미입력인 경우 MSE·최대 편차·추력 변동성·추력 점수는 계산하지 않습니다.</p></div><h2>GSRM·AN 요약</h2><p>GSRM B 변환값과 AN 카탈로그 판정은 저장된 계산 결과의 metadata를 사용했습니다. ${escapeHtml(payload?.gsrm?.note ?? "AN 검사가 실행되지 않았거나 저장되지 않았습니다.")}</p><p>AN 검사 수: ${escapeHtml(payload?.an?.catalogSize ?? 241)}개 · 추천 ${escapeHtml(payload?.an?.recommend ?? 0)}개 · 조건부 ${escapeHtml(payload?.an?.conditional ?? 0)}개 · 탈락 ${escapeHtml(payload?.an?.fail ?? 0)}개</p><h2>민감도 비교</h2><div class="grid">${sensitivityHtml}</div><h2>외부 검증 데이터 비교</h2><div class="grid">${externalHtml}</div><p class="small">측정값과 계산값의 차이는 모델·입력·측정 조건의 차이를 포함할 수 있으며, 단일 측정은 일반적 신뢰성을 증명하지 않습니다. 데이터 품질과 출처는 사용자가 확인해야 합니다. 비교는 설계 검토용이며 제작·점화 승인이나 안전 판정이 아닙니다.</p>${selfCheckHtml}<h2>재현 정보</h2><p class="small">앱 ${escapeHtml(metadata.appVersion)} · 엔진 ${escapeHtml(metadata.engineVersion)} · SRM ${escapeHtml(metadata.baselineVersion)} · GSRM ${escapeHtml(metadata.gsrmReferenceVersion)} · AN ${escapeHtml(metadata.anCatalogVersion)}</p><p class="small">검산 상태: ${escapeHtml(payload?.validation?.summary ?? "검산하지 않음")}</p><button onclick="window.print()">인쇄 / PDF로 저장</button></body></html>`;
  const reportWindow = window.open("", "_blank", "width=900,height=700");
  if (!reportWindow) { onStatus?.("인쇄용 창이 차단되었습니다. 브라우저 주소창의 팝업 허용 아이콘을 눌러 이 사이트의 팝업을 허용한 뒤 다시 시도하세요."); return false; }
  reportWindow.document.write(report);
  reportWindow.document.close();
  let printStarted = false;
  const startPrint = () => {
    if (printStarted || reportWindow.closed) return;
    printStarted = true;
    try { reportWindow.focus(); reportWindow.print(); onStatus?.("인쇄 대화상자 열림"); } catch { onStatus?.("인쇄용 창에서 인쇄를 시작하지 못했습니다."); }
  };
  reportWindow.addEventListener("afterprint", () => { onStatus?.("리포트 생성 완료"); reportWindow.close(); }, { once: true });
  reportWindow.addEventListener("load", () => window.setTimeout(startPrint, 100), { once: true });
  window.setTimeout(startPrint, 300);
  onStatus?.("인쇄용 리포트 생성 중");
  return true;
}

function AnCatalogPanel({ referenceDiameterMm, onStateChange }: { referenceDiameterMm: number; onStateChange?: (state: AnExportState) => void }) {
  const [results, setResults] = useState<GsrmBatchResult[] | null>(null);
  const [running, setRunning] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const run = () => { setRunning(true); window.setTimeout(() => { try { setResults(evaluateAnCatalog(referenceDiameterMm, AN_SERIES_CATALOG)); } finally { setRunning(false); } }, 0); };
  const filtered = results?.filter((row) => row.partNumber.toLowerCase().includes(query.trim().toLowerCase())) ?? [];
  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = filtered.slice(page * pageSize, (page + 1) * pageSize);
  useEffect(() => {
    if (!results) return;
    onStateChange?.({ query, page: page + 1, pageCount, total: results.length, recommend: results.filter((r) => r.calculation.check.status === "recommend").length, conditional: results.filter((r) => r.calculation.check.status === "conditional").length, fail: results.filter((r) => r.calculation.check.status === "fail").length });
  }, [onStateChange, page, pageCount, query, results]);
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
<div>
<p className="text-sm font-bold text-slate-950">AN 시리즈 전체 검사</p>
<p className="mt-1 text-xs leading-5 text-slate-500">AS 568A O-Ring 규격표의 표시 행을 GSRM Calculator 모드로 반복 적용합니다. B = {referenceDiameterMm.toFixed(2)} mm, NBR 70 경도.</p>
</div>
<button type="button" onClick={run} disabled={running} className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-violet-700 disabled:cursor-wait disabled:opacity-60">{running ? "검사 중…" : "AN 시리즈 전체 검사"}</button>
</div>{results ? <div className="mt-4 rounded-2xl border border-violet-100 bg-violet-50/40 p-3"><div className="mb-3 flex items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-violet-700">AN 카탈로그 검증</p><p className="mt-1 text-[11px] text-violet-800">전체 241개 규격을 판정별로 확인하고 형번으로 검색합니다.</p></div><span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-violet-700">GSRM / NBR 70</span></div>
<div className="grid gap-2 text-xs sm:grid-cols-4">
<div className="rounded-xl bg-slate-50 px-3 py-2">검사 {results.length}개</div>
<div className="rounded-xl bg-emerald-50 px-3 py-2 text-emerald-800">GSRM 기준 추천 {results.filter((r) => r.calculation.check.status === "recommend").length}개</div>
<div className="rounded-xl bg-cyan-50 px-3 py-2 text-cyan-800">조건부 {results.filter((r) => r.calculation.check.status === "conditional").length}개</div><div className="rounded-xl bg-amber-50 px-3 py-2 text-amber-800">GSRM 기준 탈락 {results.filter((r) => r.calculation.check.status === "fail").length}개</div>
</div>
<div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="형번 검색 (예: AN-337-NBR)" aria-label="AN 형번 검색" className="w-full rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs shadow-sm sm:w-64" /><p className="text-[11px] text-slate-500">판정 합계 {results.length}개 · {page + 1}/{pageCount}쪽</p></div>
<div className="mt-3 overflow-x-auto">
<table className="w-full min-w-[760px] text-left text-xs">
<thead className="bg-slate-50 text-[11px] text-slate-500">
<tr>
<th className="px-3 py-2">형번</th>
<th className="px-3 py-2">ID</th>
<th className="px-3 py-2">T</th>
<th className="px-3 py-2">OD</th>
<th className="px-3 py-2">신장률</th>
<th className="px-3 py-2">압축량</th>
<th className="px-3 py-2">압축률</th>
<th className="px-3 py-2">홈 충전율</th>
<th className="px-3 py-2">백업 링</th>
<th className="px-3 py-2">판정</th>
<th className="px-3 py-2">이유</th>
</tr>
</thead>
<tbody className="divide-y divide-slate-100">{pageRows.map((row) => <tr key={row.partNumber} className={row.sizeNo === 132 ? "bg-cyan-50" : undefined}>
<td className="px-3 py-2 font-semibold">{row.partNumber}{row.sizeNo === 132 ? " · GSRM 기준" : ""}</td>
<td className="px-3 py-2">{row.innerDiameterMm.toFixed(2)} mm</td>
<td className="px-3 py-2">{row.crossSectionMm.toFixed(2)} mm</td>
<td className="px-3 py-2">{row.calculation.outsideDiameterMm.toFixed(2)} mm</td>
<td className="px-3 py-2">{row.calculation.stretchPercent.toFixed(2)}%</td>
<td className="px-3 py-2">{row.calculation.compressionMm.toFixed(2)} mm</td>
<td className="px-3 py-2">{row.calculation.compressionPercent.toFixed(1)}%</td>
<td className="px-3 py-2">{row.calculation.grooveFillPercent.toFixed(1)}%</td>
<td className="px-3 py-2">{row.calculation.backupRingRequired ? "검토 필요" : "불필요"}</td>
<td className="px-3 py-2 font-bold">{row.calculation.check.status === "recommend" ? "GSRM 기준 추천" : row.calculation.check.status === "conditional" ? "조건부 추천" : "GSRM 기준 탈락"}</td>
<td className="px-3 py-2 text-slate-500">{row.calculation.check.reasons.join(", ") || "기하학적 조건 통과"}</td>
</tr>)}</tbody>
</table>
</div>
<div className="mt-3 flex items-center justify-between"><button type="button" disabled={page === 0} onClick={() => setPage((value) => Math.max(0, value - 1))} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs disabled:opacity-40">이전</button><button type="button" disabled={page + 1 >= pageCount} onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs disabled:opacity-40">다음</button></div>
<p className="mt-3 text-[11px] leading-5 text-slate-500">본 결과는 SRM 계산 결과와 GSRM Calculator의 기하학적 Engineering Check를 기반으로 한 교육 및 설계 검토 결과입니다. 실제 압력·온도·재질·조립 조건에 대한 최종 적합성을 보증하지 않습니다.</p>
</div> : <p className="mt-3 text-xs text-slate-500">버튼을 눌러 선택된 SRM 후보의 GSRM 기준 직경으로 전체 규격을 검사하세요.</p>}</div>;
}

function SavedComparison({ first, second }: { first: SavedCalculation; second: SavedCalculation }) {
  const a = first.payload;
  const b = second.payload;
  const rows: Array<[string, unknown, unknown]> = [
    ["목표 입력", a.input?.targetFuelMassKg, b.input?.targetFuelMassKg],
    ["최대 허용 압력", a.input?.maximumPressureMpa, b.input?.maximumPressureMpa],
    ["질량 허용 오차", a.input?.fuelMassToleranceDisplay, b.input?.fuelMassToleranceDisplay],
    ["탐색 범위", JSON.stringify(a.search?.searchEnvelope), JSON.stringify(b.search?.searchEnvelope)],
    ["전체 후보 수", a.search?.totalCombinations, b.search?.totalCombinations],
    ["추천·조건부·참고·탈락", JSON.stringify(a.search?.counts), JSON.stringify(b.search?.counts)],
    ["대표 후보", a.representativeCandidate?.geometry, b.representativeCandidate?.geometry],
    ["대표 질량", a.representativeCandidate?.massKg, b.representativeCandidate?.massKg],
    ["최대 압력", a.representativeCandidate?.maximumPressureMpa, b.representativeCandidate?.maximumPressureMpa],
    ["연소시간", a.representativeCandidate?.burnTimeSec, b.representativeCandidate?.burnTimeSec],
    ["평균 추력", a.representativeCandidate?.averageThrustN, b.representativeCandidate?.averageThrustN],
    ["GSRM B", a.gsrm?.referenceDiameterMm, b.gsrm?.referenceDiameterMm],
    ["AN 집계", JSON.stringify(a.an), JSON.stringify(b.an)],
    ["엔진·데이터 버전", `${a.metadata?.engineVersion}/${a.metadata?.baselineVersion}/${a.metadata?.gsrmReferenceVersion}/${a.metadata?.anCatalogVersion}`, `${b.metadata?.engineVersion}/${b.metadata?.baselineVersion}/${b.metadata?.gsrmReferenceVersion}/${b.metadata?.anCatalogVersion}`],
  ];
  return <div className="mt-3 overflow-x-auto rounded-xl border border-violet-200 bg-white p-3"><p className="text-xs font-bold text-slate-900">저장 결과 비교 · 차이만 강조하며 우열은 판단하지 않습니다.</p><table className="mt-2 w-full min-w-[620px] text-[11px]"><thead><tr className="border-b border-slate-100 text-left text-slate-500"><th className="px-2 py-1">항목</th><th className="px-2 py-1">{first.name}</th><th className="px-2 py-1">{second.name}</th></tr></thead><tbody>{rows.map(([label, left, right]) => { const different = JSON.stringify(left) !== JSON.stringify(right); return <tr key={label} className={different ? "bg-amber-50" : ""}><td className="px-2 py-1 font-semibold text-slate-600">{label}</td><td className="px-2 py-1 font-mono">{String(left ?? "미기록")}</td><td className="px-2 py-1 font-mono">{String(right ?? "미기록")}</td></tr>; })}</tbody></table></div>;
}

export default function Home() {
  const [mode, setMode] = useState<"candidate" | "excel">("candidate");
  const [config, setConfig] = useState<CandidateSearchConfig>(DEFAULT_CONFIG);
  const [search, setSearch] = useState<CandidateSearchResult | null>(null);
  const [selected, setSelected] = useState<CandidateResult | null>(null);
  const [running, setRunning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<CandidateSortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<CandidateSortDirection | null>(null);
  const [gsrmWallThicknessMm, setGsrmWallThicknessMm] = useState(DEFAULT_GSRM_WALL_THICKNESS_MM);
  const [automaticMode, setAutomaticMode] = useState(true);
  const [targetThrustText, setTargetThrustText] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [progressText, setProgressText] = useState("");
  const [progressPercent, setProgressPercent] = useState(0);
  const [completedStage, setCompletedStage] = useState(0);
  const [runningStage, setRunningStage] = useState<number | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const [lastCalculationStatus, setLastCalculationStatus] = useState<"idle" | "running" | "completed" | "cancelled" | "failed">("idle");
  const [statusFilters, setStatusFilters] = useState<Array<"pass" | "conditional" | "fail">>(["pass", "conditional", "fail"]);
  const [comparison, setComparison] = useState<CandidateResult[]>([]);
  const [calculatedSignature, setCalculatedSignature] = useState<string | null>(null);
  const [restoredFromStorage, setRestoredFromStorage] = useState(false);
  const [anExportState, setAnExportState] = useState<AnExportState | null>(null);
  const [savedResults, setSavedResults] = useState<SavedCalculation[]>([]);
  const [historyHydrated, setHistoryHydrated] = useState(false);
  const [comparisonResultIds, setComparisonResultIds] = useState<[string, string]>(["", ""]);
  const [saveName, setSaveName] = useState("");
  const [historyNotice, setHistoryNotice] = useState<string | null>(null);
  const [pendingImport, setPendingImport] = useState<{ results: SavedCalculation[]; versionMismatch: boolean } | null>(null);
  const [reportResultId, setReportResultId] = useState("");
  const [reportNotice, setReportNotice] = useState<string | null>(null);
  const [externalValidationRecords, setExternalValidationRecords] = useState<ExternalValidationRecord[]>([]);
  const [externalValidationHydrated, setExternalValidationHydrated] = useState(false);
  const [validationNotice, setValidationNotice] = useState<string | null>(null);
  const [validationName, setValidationName] = useState("");
  const [validationSource, setValidationSource] = useState("");
  const [validationDataVersion, setValidationDataVersion] = useState("");
  const [validationConditions, setValidationConditions] = useState("");
  const [validationCalculationId, setValidationCalculationId] = useState("current");
  const [validationMeasured, setValidationMeasured] = useState<Record<ValidationMetric, string>>(EMPTY_VALIDATION_FORM);
  const [validationTolerances, setValidationTolerances] = useState<Record<ValidationMetric, string>>(EMPTY_VALIDATION_FORM);
  const [editingValidationId, setEditingValidationId] = useState<string | null>(null);
  const [sensitivityScenarios, setSensitivityScenarios] = useState<SensitivityScenario[]>([]);
  const [sensitivityField, setSensitivityField] = useState<SensitivityField>("targetFuelMassKg");
  const [sensitivityLow, setSensitivityLow] = useState("");
  const [sensitivityHigh, setSensitivityHigh] = useState("");
  const [sensitivityName, setSensitivityName] = useState("");
  const [sensitivityRunning, setSensitivityRunning] = useState(false);
  const [sensitivityNotice, setSensitivityNotice] = useState<string | null>(null);
  const [selfCheckReport, setSelfCheckReport] = useState<SelfCheckReport | null>(null);
  const [selfCheckHistory, setSelfCheckHistory] = useState<SelfCheckReport[]>([]);
  const [selfCheckHydrated, setSelfCheckHydrated] = useState(false);
  const [selfCheckRunning, setSelfCheckRunning] = useState(false);
  const [selfCheckNotice, setSelfCheckNotice] = useState<string | null>(null);
  const [rpaRecords, setRpaRecords] = useState<RpaResultRecord[]>([]);
  const [rpaHydrated, setRpaHydrated] = useState(false);
  const [rpaNotice, setRpaNotice] = useState<string | null>(null);
  const [rpaSource, setRpaSource] = useState("");
  const [rpaVersion, setRpaVersion] = useState("");
  const [rpaDatabase, setRpaDatabase] = useState("");
  const [rpaInputConditions, setRpaInputConditions] = useState("");
  const [rpaResultValues, setRpaResultValues] = useState("");
  const [rpaMemo, setRpaMemo] = useState("");
  const rpaBackupInput = useRef<HTMLInputElement | null>(null);
  const selfCheckWorker = useRef<Worker | null>(null);
  const selfCheckBackupInput = useRef<HTMLInputElement | null>(null);
  const sensitivityBackupInput = useRef<HTMLInputElement | null>(null);
  const validationBackupInput = useRef<HTMLInputElement | null>(null);
  const backupFileInput = useRef<HTMLInputElement | null>(null);
const cancelRequested = useRef(false);
const requestCancel = () => { cancelRequested.current = true; searchWorker.current?.postMessage({ type: "cancel" }); selfCheckWorker.current?.postMessage({ type: "cancel" }); setProgressText("계산 취소 요청 중… 마지막 완료 단계로 돌아갑니다."); if (selfCheckRunning) setSelfCheckNotice("자체 점검 취소 요청 중…"); };
  const searchWorker = useRef<Worker | null>(null);

  const inputSignature = useMemo(() => JSON.stringify({ config, targetThrustText, mode, automaticMode }), [automaticMode, config, mode, targetThrustText]);
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("motorfit-input-v1");
      if (saved) {
        const parsed = JSON.parse(saved) as { config?: CandidateSearchConfig; targetThrustText?: string; mode?: "candidate" | "excel"; automaticMode?: boolean; calculatedSignature?: string };
        window.setTimeout(() => {
          if (parsed.config) setConfig(migrateStoredConfig(parsed.config));
          if (typeof parsed.targetThrustText === "string") setTargetThrustText(parsed.targetThrustText);
          if (parsed.mode) setMode(parsed.mode);
          if (typeof parsed.automaticMode === "boolean") setAutomaticMode(parsed.automaticMode);
          if (parsed.calculatedSignature) setCalculatedSignature(parsed.calculatedSignature);
          setRestoredFromStorage(true);
        }, 0);
      }
    } catch { /* storage is unavailable; continue with defaults */ }
  }, []);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SAVED_RESULTS_KEY);
      if (!raw) { window.setTimeout(() => setHistoryHydrated(true), 0); return; }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error("invalid history");
      window.setTimeout(() => { setSavedResults(parsed.filter((item): item is SavedCalculation => Boolean(item && typeof item.id === "string" && typeof item.name === "string" && item.payload && typeof item.payload === "object")).slice(0, MAX_SAVED_RESULTS)); setHistoryHydrated(true); }, 0);
    } catch {
      window.localStorage.removeItem(SAVED_RESULTS_KEY);
      window.setTimeout(() => { setHistoryNotice("저장된 결과 데이터가 손상되어 무시했습니다. 현재 계산 결과에는 영향을 주지 않습니다."); setHistoryHydrated(true); }, 0);
    }
  }, []);
  useEffect(() => {
    if (!historyHydrated) return;
    try { window.localStorage.setItem(SAVED_RESULTS_KEY, JSON.stringify(savedResults)); } catch { window.setTimeout(() => setHistoryNotice("결과 저장 공간에 접근할 수 없습니다."), 0); }
  }, [historyHydrated, savedResults]);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(EXTERNAL_VALIDATION_STORAGE_KEY);
      if (!raw) { window.setTimeout(() => setExternalValidationHydrated(true), 0); return; }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error("invalid validation data");
      window.setTimeout(() => { setExternalValidationRecords(parsed.filter((item): item is ExternalValidationRecord => Boolean(item && typeof item.id === "string" && typeof item.name === "string" && typeof item.calculationResultId === "string" && item.measured && item.tolerances)).slice(0, 20)); setExternalValidationHydrated(true); }, 0);
    } catch {
      window.localStorage.removeItem(EXTERNAL_VALIDATION_STORAGE_KEY);
      window.setTimeout(() => { setValidationNotice("외부 검증 데이터가 손상되어 무시했습니다. 계산 결과에는 영향을 주지 않습니다."); setExternalValidationHydrated(true); }, 0);
    }
  }, []);
  useEffect(() => {
    if (!externalValidationHydrated) return;
    try { window.localStorage.setItem(EXTERNAL_VALIDATION_STORAGE_KEY, JSON.stringify(externalValidationRecords.slice(0, 20))); } catch { window.setTimeout(() => setValidationNotice("외부 검증 데이터 저장 공간에 접근할 수 없습니다."), 0); }
  }, [externalValidationHydrated, externalValidationRecords]);
  useEffect(() => {
    try { window.localStorage.setItem("motorfit-input-v1", JSON.stringify({ config, targetThrustText, mode, automaticMode, calculatedSignature })); } catch { /* storage is best effort */ }
  }, [automaticMode, calculatedSignature, config, mode, targetThrustText]);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SENSITIVITY_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) window.setTimeout(() => setSensitivityScenarios(parsed.slice(0, 20)), 0);
    } catch { window.setTimeout(() => setSensitivityNotice("민감도 비교 기록을 복원하지 못했습니다. 현재 계산 결과에는 영향을 주지 않습니다."), 0); }
  }, []);
  useEffect(() => {
    try { window.localStorage.setItem(SENSITIVITY_STORAGE_KEY, JSON.stringify(sensitivityScenarios.slice(0, 20))); } catch { window.setTimeout(() => setSensitivityNotice("민감도 비교 저장 공간에 접근할 수 없습니다."), 0); }
  }, [sensitivityScenarios]);
  useEffect(() => {
    window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(SELF_CHECK_STORAGE_KEY);
        if (!raw) { setSelfCheckHydrated(true); return; }
        const parsed = JSON.parse(raw) as { schemaVersion?: number; reports?: SelfCheckReport[] };
        if (parsed.schemaVersion !== SELF_CHECK_SCHEMA_VERSION || !Array.isArray(parsed.reports)) throw new Error("invalid self-check storage");
        const reports = parsed.reports.filter((item) => item && item.schemaVersion === SELF_CHECK_SCHEMA_VERSION && Array.isArray(item.checks)).slice(0, SELF_CHECK_MAX_HISTORY);
        setSelfCheckHistory(reports);
        setSelfCheckReport(reports[0] ?? null);
      } catch {
        window.localStorage.removeItem(SELF_CHECK_STORAGE_KEY);
        setSelfCheckNotice("이전 자체 점검 데이터가 손상되어 무시했습니다. 다시 실행할 수 있습니다.");
      } finally { setSelfCheckHydrated(true); }
    }, 0);
  }, []);
  useEffect(() => {
    if (!selfCheckHydrated) return;
    try { window.localStorage.setItem(SELF_CHECK_STORAGE_KEY, JSON.stringify({ app: "MotorFit", schemaVersion: SELF_CHECK_SCHEMA_VERSION, reports: selfCheckHistory.slice(0, SELF_CHECK_MAX_HISTORY) })); } catch { window.setTimeout(() => setSelfCheckNotice("자체 점검 결과를 브라우저에 저장하지 못했습니다."), 0); }
  }, [selfCheckHistory, selfCheckHydrated]);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(RPA_LINK_STORAGE_KEY);
      if (!raw) { window.setTimeout(() => setRpaHydrated(true), 0); return; }
      const parsed = parseRpaBackup(JSON.parse(raw));
      window.setTimeout(() => setRpaRecords(parsed), 0);
    } catch {
      window.localStorage.removeItem(RPA_LINK_STORAGE_KEY);
      window.setTimeout(() => setRpaNotice("RPA 연계 기록이 손상되어 무시했습니다. 기존 계산 결과에는 영향을 주지 않습니다."), 0);
    } finally { window.setTimeout(() => setRpaHydrated(true), 0); }
  }, []);
  useEffect(() => {
    if (!rpaHydrated) return;
    try { window.localStorage.setItem(RPA_LINK_STORAGE_KEY, JSON.stringify({ app: "MotorFit", schemaVersion: RPA_LINK_SCHEMA_VERSION, records: rpaRecords.slice(0, 20) })); } catch { window.setTimeout(() => setRpaNotice("RPA 연계 기록을 저장하지 못했습니다."), 0); }
  }, [rpaHydrated, rpaRecords]);

  const runSelfCheck = () => {
    if (selfCheckRunning) return;
    setSelfCheckRunning(true);
    setSelfCheckNotice("자체 점검을 준비하는 중…");
    const worker = new Worker(new URL("../engine/self-check-worker.ts", import.meta.url), { type: "module" });
    selfCheckWorker.current = worker;
    worker.onmessage = (event: MessageEvent<{ type: string; completed?: number; total?: number; current?: string; report?: SelfCheckReport; message?: string }>) => {
      if (event.data.type === "progress") {
        const completed = event.data.completed ?? 0;
        const total = event.data.total ?? 1;
        setProgressPercent((completed / total) * 100);
        setProgressText(`자체 점검 · ${completed} / ${total} · ${event.data.current ?? "실행 중"}`);
        setSelfCheckNotice(`자체 점검 실행 중 · ${completed}/${total}`);
      } else if (event.data.type === "result" && event.data.report) {
        const report = event.data.report;
        setSelfCheckReport(report);
        setSelfCheckHistory((current) => [report, ...current.filter((item) => item.id !== report.id)].slice(0, SELF_CHECK_MAX_HISTORY));
        setSelfCheckRunning(false);
        setSelfCheckNotice(`자체 점검 완료 · PASS ${report.counts.pass} · FAIL ${report.counts.fail} · SKIPPED ${report.counts.skipped}`);
        worker.terminate();
        selfCheckWorker.current = null;
      } else if (event.data.type === "cancelled") {
        setSelfCheckRunning(false);
        setSelfCheckNotice("자체 점검이 취소되었습니다. 완료된 결과는 PASS로 저장하지 않았습니다.");
        worker.terminate();
        selfCheckWorker.current = null;
      } else if (event.data.type === "error") {
        setSelfCheckRunning(false);
        setSelfCheckNotice(`자체 점검 실패: ${event.data.message ?? "알 수 없는 오류"}`);
        worker.terminate();
        selfCheckWorker.current = null;
      }
    };
    worker.onerror = () => { setSelfCheckRunning(false); setSelfCheckNotice("자체 점검 Worker 실행에 실패했습니다."); worker.terminate(); selfCheckWorker.current = null; };
    worker.postMessage({ type: "run", previous: selfCheckReport });
  };
  const exportSelfCheck = (format: "json" | "csv") => {
    if (!selfCheckReport) { setSelfCheckNotice("먼저 자체 점검을 실행하세요."); return; }
    const text = format === "json" ? JSON.stringify({ app: "MotorFit", schemaVersion: SELF_CHECK_SCHEMA_VERSION, report: selfCheckReport }, null, 2) : ["case,status,actual,expected,differences,failedFields,summary", ...selfCheckReport.checks.map((item) => [item.name, item.status, JSON.stringify(item.actual), JSON.stringify(item.expected), item.checks.filter((check) => !check.pass).map((check) => `${check.field}: ${JSON.stringify(check.actual)} != ${JSON.stringify(check.expected)}`).join("; ") || "없음", item.failedFields.join("; "), item.summary ?? ""].map((value) => JSON.stringify(value)).join(",")), `summary,PASS ${selfCheckReport.counts.pass} FAIL ${selfCheckReport.counts.fail} SKIPPED ${selfCheckReport.counts.skipped}`].join("\n");
    const blob = new Blob([text], { type: format === "json" ? "application/json" : "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `motorfit-self-check.${format}`; anchor.click(); URL.revokeObjectURL(url);
  };
  const printSelfCheckReport = () => {
    if (!selfCheckReport) { setSelfCheckNotice("먼저 자체 점검을 실행하세요."); return; }
    printReviewReport({ metadata: { appVersion: APP_VERSION, engineVersion: CALCULATION_ENGINE_VERSION, baselineVersion: BASELINE_VERSION, gsrmReferenceVersion: GSRM_REFERENCE_VERSION, anCatalogVersion: AN_CATALOG_VERSION }, validation: { summary: "자체 점검 결과는 하드웨어 검증이 아님" } }, selfCheckReport.status, "MotorFit 앱 자체 점검 리포트", setReportNotice, selfCheckReport);
  };
  const importSelfCheck = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as { app?: string; schemaVersion?: number; report?: SelfCheckReport };
      if (parsed.app !== "MotorFit" || parsed.schemaVersion !== SELF_CHECK_SCHEMA_VERSION || !parsed.report || !Array.isArray(parsed.report.checks)) throw new Error("지원하지 않는 자체 점검 백업 형식입니다.");
      setSelfCheckReport(parsed.report);
      setSelfCheckHistory((current) => [parsed.report!, ...current.filter((item) => item.id !== parsed.report!.id)].slice(0, SELF_CHECK_MAX_HISTORY));
      setSelfCheckNotice("자체 점검 결과를 복원했습니다. 현재 버전과 기준이 다르면 변경 감지를 확인하세요.");
    } catch (error) { setSelfCheckNotice(error instanceof Error ? `자체 점검 백업을 거부했습니다: ${error.message}` : "자체 점검 백업을 거부했습니다."); } finally { if (selfCheckBackupInput.current) selfCheckBackupInput.current.value = ""; }
  };

  const updateNumber = (key: keyof CandidateSearchConfig, value: number) => setConfig((current) => ({ ...current, [key]: value }));
  const updateRange = (key: "outerDiameterMm" | "coreDiameterMm" | "segmentLengthMm", bound: "min" | "max", value: number) => setConfig((current) => ({ ...current, [key]: { ...current[key], [bound]: value } }));
  const resetToBaseline = () => {
    setMode("candidate");
    setAutomaticMode(true);
    setDetailsOpen(false);
    setTargetThrustText("");
    setConfig({ ...DEFAULT_CONFIG, outerDiameterMm: { ...DEFAULT_CONFIG.outerDiameterMm }, coreDiameterMm: { ...DEFAULT_CONFIG.coreDiameterMm }, segmentLengthMm: { ...DEFAULT_CONFIG.segmentLengthMm }, segmentCount: { ...DEFAULT_CONFIG.segmentCount } });
    setSearch(null);
    setSelected(null);
    setErrorMessage(null);
    setSortKey(null);
    setSortDirection(null);
    setGsrmWallThicknessMm(DEFAULT_GSRM_WALL_THICKNESS_MM);
    setProgressText("");
    setProgressPercent(0);
    setCompletedStage(0);
    setRunningStage(null);
    setCancelled(false);
    setComparison([]);
  };
  const runSearch = async (stage = 3) => {
    setRunningStage(stage);
    setCancelled(false);
    cancelRequested.current = false;
    setSearch(null);
    setSelected(null);
    const parsedTargetThrust = Number(targetThrustText);
    const targetThrustEnabled = targetThrustText.trim() !== "";
    const baseConfig: CandidateSearchConfig = { ...config, targetAverageThrustN: targetThrustEnabled ? parsedTargetThrust : config.targetAverageThrustN, targetThrustEnabled, mode, burnTimeFilterEnabled: automaticMode ? false : config.burnTimeFilterEnabled };
    setRunning(true);
    setLastCalculationStatus("running");
    setProgressText("탐색 범위 준비 중 · 계산 Worker 시작");
    setProgressPercent(0);
    setErrorMessage(null);
    setSortKey(null);
    setSortDirection(null);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    try {
      const result = await new Promise<CandidateSearchResult>((resolve, reject) => {
        const worker = new Worker(new URL("../engine/search-worker.ts", import.meta.url), { type: "module" });
        searchWorker.current = worker;
        let streamedCandidates: CandidateResult[] = [];
        let streamedSummary: Omit<CandidateSearchResult, "candidates" | "passedCandidates" | "nearestRejectedCandidate"> | null = null;
        let streamedPassedIndices: number[] = [];
        let streamedNearestRejectedIndex = -1;
        worker.onmessage = (event: MessageEvent<{ type: string; candidate?: CandidateResult; candidates?: CandidateResult[]; summary?: Omit<CandidateSearchResult, "candidates" | "passedCandidates" | "nearestRejectedCandidate">; passedIndices?: number[]; nearestRejectedIndex?: number; completed?: number; total?: number; totalCandidates?: number; plannedPrecision?: number; issues?: readonly string[]; message?: string }>) => {
          if (event.data.type === "prepared") {
            setProgressText(`0 / ${(event.data.plannedPrecision ?? 0).toLocaleString()}개 정밀 계산 준비 · 전체 ${(event.data.totalCandidates ?? 0).toLocaleString()}개 후보`);
            setProgressPercent(0);
          }
          if (event.data.type === "progress") {
            const completed = event.data.completed ?? 0;
            const total = event.data.total ?? 0;
            setProgressText(`${completed.toLocaleString()} / ${total.toLocaleString()}개 정밀 계산`);
            setProgressPercent(total === 0 ? 100 : (completed / total) * 100);
          } else if (event.data.type === "result-start" && event.data.summary) { streamedSummary = event.data.summary; streamedPassedIndices = event.data.passedIndices ?? []; streamedNearestRejectedIndex = event.data.nearestRejectedIndex ?? -1; streamedCandidates = []; }
          else if (event.data.type === "candidate" && event.data.candidate) streamedCandidates.push(event.data.candidate);
          else if (event.data.type === "candidate-batch" && event.data.candidates) streamedCandidates.push(...event.data.candidates);
          else if (event.data.type === "result-end" && streamedSummary) resolve({ ...streamedSummary, candidates: streamedCandidates, passedCandidates: streamedPassedIndices.map((index) => streamedCandidates[index]).filter(Boolean), nearestRejectedCandidate: streamedNearestRejectedIndex >= 0 ? streamedCandidates[streamedNearestRejectedIndex] : undefined });
          else if (event.data.type === "cancelled") reject(new CandidateSearchCancelledError());
          else if (event.data.type === "input-error") reject(new CandidateSearchInputError(event.data.issues ?? ["입력을 확인하세요."]));
          else if (event.data.type === "error") reject(new Error(event.data.message ?? "worker error"));
        };
        worker.onerror = () => reject(new Error("후보 계산 Worker 실행 중 오류가 발생했습니다."));
        worker.postMessage({ type: "run", config: baseConfig, mode, automaticMode, batchSize: 1000 });
      });
      if (cancelRequested.current) {
        setCancelled(true);
        return;
      }
      setSearch(result);
      setLastCalculationStatus("completed");
      setCompletedStage(stage);
      setCalculatedSignature(inputSignature);
      setSelected(result.candidates.find((candidate) => candidate.status !== "fail") ?? null);
      setSortKey(null);
      setSortDirection(null);
    } catch (error) {
      if (error instanceof CandidateSearchCancelledError) { setCancelled(true); setLastCalculationStatus("cancelled"); return; }
      const message = error instanceof CandidateSearchInputError ? error.issues.join(" ") : error instanceof Error && error.message !== "unknown" ? error.message : "후보 계산 중 오류가 발생했습니다. 입력 범위와 물성값을 확인한 뒤 다시 시도하세요.";
      setErrorMessage(message);
      setLastCalculationStatus("failed");
      setSearch(null);
      setSelected(null);
    } finally {
      searchWorker.current?.terminate();
      searchWorker.current = null;
      setRunning(false);
      setRunningStage(null);
      setProgressText("");
      setProgressPercent(0);
    }
  };
  const runSensitivityWorker = (scenarioConfig: CandidateSearchConfig, scenarioTargetThrustText: string): Promise<CandidateSearchResult> => new Promise((resolve, reject) => {
    const targetEnabled = scenarioTargetThrustText.trim() !== "";
    const workerConfig: CandidateSearchConfig = { ...scenarioConfig, targetAverageThrustN: targetEnabled ? Number(scenarioTargetThrustText) : scenarioConfig.targetAverageThrustN, targetThrustEnabled: targetEnabled, mode, burnTimeFilterEnabled: automaticMode ? false : scenarioConfig.burnTimeFilterEnabled };
    const worker = new Worker(new URL("../engine/search-worker.ts", import.meta.url), { type: "module" });
    searchWorker.current = worker;
    let streamedCandidates: CandidateResult[] = [];
    let streamedSummary: Omit<CandidateSearchResult, "candidates" | "passedCandidates" | "nearestRejectedCandidate"> | null = null;
    let streamedPassedIndices: number[] = [];
    let streamedNearestRejectedIndex = -1;
    worker.onmessage = (event: MessageEvent<{ type: string; candidate?: CandidateResult; candidates?: CandidateResult[]; summary?: Omit<CandidateSearchResult, "candidates" | "passedCandidates" | "nearestRejectedCandidate">; passedIndices?: number[]; nearestRejectedIndex?: number; completed?: number; total?: number; totalCandidates?: number; plannedPrecision?: number; issues?: readonly string[]; message?: string }>) => {
      if (event.data.type === "prepared") setProgressText(`민감도 시나리오 · 0 / ${(event.data.plannedPrecision ?? 0).toLocaleString()}개 정밀 계산`);
      if (event.data.type === "progress") { const completed = event.data.completed ?? 0; const total = event.data.total ?? 0; setProgressText(`민감도 시나리오 · ${completed.toLocaleString()} / ${total.toLocaleString()}개 정밀 계산`); setProgressPercent(total === 0 ? 100 : (completed / total) * 100); }
      else if (event.data.type === "result-start" && event.data.summary) { streamedSummary = event.data.summary; streamedPassedIndices = event.data.passedIndices ?? []; streamedNearestRejectedIndex = event.data.nearestRejectedIndex ?? -1; streamedCandidates = []; }
      else if (event.data.type === "candidate" && event.data.candidate) streamedCandidates.push(event.data.candidate);
      else if (event.data.type === "candidate-batch" && event.data.candidates) streamedCandidates.push(...event.data.candidates);
      else if (event.data.type === "result-end" && streamedSummary) resolve({ ...streamedSummary, candidates: streamedCandidates, passedCandidates: streamedPassedIndices.map((index) => streamedCandidates[index]).filter(Boolean), nearestRejectedCandidate: streamedNearestRejectedIndex >= 0 ? streamedCandidates[streamedNearestRejectedIndex] : undefined });
      else if (event.data.type === "cancelled") reject(new CandidateSearchCancelledError());
      else if (event.data.type === "input-error") reject(new CandidateSearchInputError(event.data.issues ?? ["입력을 확인하세요."]));
      else if (event.data.type === "error") reject(new Error(event.data.message ?? "민감도 시나리오 계산 오류"));
    };
    worker.onerror = () => reject(new Error("민감도 시나리오 Worker 실행 중 오류가 발생했습니다."));
    worker.postMessage({ type: "run", config: workerConfig, mode, automaticMode, batchSize: 1000 });
  });
  const sensitivityOverrides = (field: SensitivityField, value: number, base: CandidateSearchConfig): CandidateSearchConfig => {
    if (field === "targetFuelMassKg" || field === "maximumPressureMpa" || field === "targetAverageThrustN") return { ...base, [field]: value };
    if (field === "segmentCount") return { ...base, segmentCount: { min: Math.round(value), max: Math.round(value) } };
    const rangeKey = field as "outerDiameterMm" | "coreDiameterMm" | "segmentLengthMm";
    return { ...base, [rangeKey]: { ...base[rangeKey], min: value, max: value } };
  };
  const addSensitivityScenario = async () => {
    if (!search || sensitivityRunning) { setSensitivityNotice("기준 계산을 먼저 완료하고 시나리오를 추가하세요."); return; }
    const baseValue = sensitivityField === "targetFuelMassKg" ? config.targetFuelMassKg : sensitivityField === "maximumPressureMpa" ? config.maximumPressureMpa : sensitivityField === "targetAverageThrustN" ? (targetThrustText.trim() || "미입력") : sensitivityField === "outerDiameterMm" ? `${config.outerDiameterMm.min}~${config.outerDiameterMm.max}` : sensitivityField === "coreDiameterMm" ? `${config.coreDiameterMm.min}~${config.coreDiameterMm.max}` : sensitivityField === "segmentLengthMm" ? `${config.segmentLengthMm.min}~${config.segmentLengthMm.max}` : `${config.segmentCount.min}~${config.segmentCount.max}`;
    const values = [sensitivityLow.trim(), sensitivityHigh.trim()].filter(Boolean);
    if (!values.length || values.some((value) => !(sensitivityField === "targetAverageThrustN" && ["blank", "미입력"].includes(value.toLowerCase())) && !Number.isFinite(Number(value)))) { setSensitivityNotice("비교값을 하나 이상 입력하세요. 범위나 세그먼트 수는 숫자로 입력해야 합니다. 목표 추력은 blank 또는 미입력을 사용할 수 있습니다."); return; }
    const numericValues = values.filter((value) => !(sensitivityField === "targetAverageThrustN" && ["blank", "미입력"].includes(value.toLowerCase()))).map(Number);
    if (numericValues.some((value) => !Number.isFinite(value) || value <= 0)) { setSensitivityNotice("민감도 비교값은 0보다 큰 유한한 숫자여야 합니다."); return; }
    if (numericValues.length === 2 && numericValues[0] > numericValues[1]) { setSensitivityNotice("낮은 값은 높은 값보다 클 수 없습니다."); return; }
    const rangeField = ["outerDiameterMm", "coreDiameterMm", "segmentLengthMm"] as const;
    if (rangeField.includes(sensitivityField as typeof rangeField[number])) {
      if (mode === "candidate" && numericValues.some((value) => Math.abs(value / (config.manufacturingStepMm ?? 5) - Math.round(value / (config.manufacturingStepMm ?? 5))) > 1e-9)) { setSensitivityNotice("제작 후보 모드의 Do·do·Lo 비교값은 5 mm 배수여야 합니다."); return; }
    }
    if (sensitivityField === "segmentCount") {
      if (numericValues.some((value) => !Number.isInteger(value) || value < 1)) { setSensitivityNotice("세그먼트 수 비교값은 1 이상의 정수여야 합니다."); return; }
    }
    const nameBase = sensitivityName.trim() || `${sensitivityField} 민감도`;
    setSensitivityRunning(true); setSensitivityNotice(null); cancelRequested.current = false; setProgressPercent(0); setProgressText("민감도 시나리오 준비 중…");
    try {
      for (const valueText of values) {
        if (cancelRequested.current) throw new CandidateSearchCancelledError();
        const blankThrust = sensitivityField === "targetAverageThrustN" && ["blank", "미입력"].includes(valueText.toLowerCase());
        const value = blankThrust ? config.targetAverageThrustN : Number(valueText);
        const scenarioConfig = sensitivityOverrides(sensitivityField, value, config);
        const result = await runSensitivityWorker(scenarioConfig, sensitivityField === "targetAverageThrustN" && blankThrust ? "" : sensitivityField === "targetAverageThrustN" ? valueText : targetThrustText);
        searchWorker.current?.terminate(); searchWorker.current = null;
        const summary = summarizeSensitivityResult(result, scenarioConfig, sensitivityField === "targetAverageThrustN" ? valueText : targetThrustText, mode, automaticMode, gsrmWallThicknessMm);
        const completedScenario: SensitivityScenario = { id: createSavedCalculationId(), name: `${nameBase} · ${valueText}`, field: sensitivityField, baseValue: String(baseValue), comparisonValue: valueText, changeDescription: `${sensitivityField}: ${baseValue} → ${valueText}`, createdAt: createSavedCalculationTimestamp(), status: "completed", versions: CURRENT_SENSITIVITY_VERSIONS, result: summary };
        setSensitivityScenarios((current) => [completedScenario, ...current].slice(0, 20));
      }
      setSensitivityNotice(`${values.length}개 민감도 시나리오 계산이 완료되었습니다. 기준 결과는 변경하지 않았습니다.`);
    } catch (error) {
      const cancelledScenario = error instanceof CandidateSearchCancelledError;
      const failedScenario: SensitivityScenario = { id: createSavedCalculationId(), name: `${nameBase} · ${cancelledScenario ? "취소" : "실패"}`, field: sensitivityField, baseValue: String(baseValue), comparisonValue: values[0], changeDescription: `${sensitivityField}: ${baseValue} → ${values[0]}`, createdAt: createSavedCalculationTimestamp(), status: cancelledScenario ? "cancelled" : "failed", versions: CURRENT_SENSITIVITY_VERSIONS, error: error instanceof Error ? error.message : "민감도 계산 실패" };
      setSensitivityScenarios((current) => [failedScenario, ...current].slice(0, 20));
      setSensitivityNotice(cancelledScenario ? "민감도 계산을 취소했습니다. 기준 결과는 보존됩니다." : "민감도 시나리오 계산에 실패했습니다. 기준 결과는 보존됩니다.");
    } finally { searchWorker.current?.terminate(); searchWorker.current = null; setSensitivityRunning(false); setProgressText(""); setProgressPercent(0); cancelRequested.current = false; }
  };
  const exportSensitivityBackup = () => { const blob = new Blob([JSON.stringify({ app: "MotorFit", schemaVersion: SENSITIVITY_BACKUP_SCHEMA_VERSION, exportedAt: createSavedCalculationTimestamp(), scenarios: sensitivityScenarios }, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "motorfit-sensitivity-backup.json"; anchor.click(); URL.revokeObjectURL(url); setSensitivityNotice(`${sensitivityScenarios.length}개 민감도 시나리오를 백업했습니다.`); };
  const importSensitivityBackup = async (file: File) => { try { const parsed = JSON.parse(await file.text()) as { app?: string; schemaVersion?: number; scenarios?: SensitivityScenario[] }; if (parsed.app !== "MotorFit" || parsed.schemaVersion !== SENSITIVITY_BACKUP_SCHEMA_VERSION || !Array.isArray(parsed.scenarios) || parsed.scenarios.some((scenario) => !isSensitivityScenario(scenario))) throw new Error("지원하지 않는 민감도 백업입니다."); const ids = parsed.scenarios.map((scenario) => scenario.id); if (new Set(ids).size !== ids.length) throw new Error("백업 안에 중복된 민감도 시나리오 ID가 있습니다."); const current = sensitivityScenarios; const imported = parsed.scenarios.filter((scenario) => !current.some((item) => item.id === scenario.id)); setSensitivityScenarios([...imported, ...current].slice(0, 20)); const mismatched = imported.some((scenario) => sensitivityVersionMismatch(scenario.versions)); setSensitivityNotice(mismatched ? "민감도 시나리오를 복원했지만 앱·엔진·데이터 버전이 현재와 다릅니다." : "민감도 시나리오 백업을 복원했습니다."); } catch (error) { setSensitivityNotice(error instanceof Error ? error.message : "민감도 백업을 불러오지 못했습니다."); } finally { if (sensitivityBackupInput.current) sensitivityBackupInput.current.value = ""; } };
  const sortedCandidates = useMemo(() => search ? sortCandidates(search.candidates, sortKey, sortDirection) : [], [search, sortDirection, sortKey]);
  const visibleCandidates = useMemo(() => sortedCandidates.filter((candidate) => statusFilters.includes(candidate.status)), [sortedCandidates, statusFilters]);
  const closestFailedCandidate = useMemo(() => {
    return search?.nearestRejectedCandidate ?? null;
  }, [search]);
  const hasValidCandidate = Boolean(search?.candidates.some((candidate) => candidate.status !== "fail"));
  const referenceCandidate = !hasValidCandidate ? closestFailedCandidate : null;
  const candidateCounts = useMemo(() => search ? {
    pass: search.candidates.filter((candidate) => candidate.status === "pass").length,
    conditional: search.candidates.filter((candidate) => candidate.status === "conditional").length,
    fail: search.candidates.filter((candidate) => candidate.status === "fail" && candidate !== referenceCandidate).length,
  } : { pass: 0, conditional: 0, fail: 0 }, [referenceCandidate, search]);
  const hasPassCandidate = candidateCounts.pass > 0;
  const conditionalCandidate = search?.candidates.find((candidate) => candidate.status === "conditional") ?? null;
  const isReferenceCandidate = Boolean(selected && referenceCandidate === selected);
  const selectedDetailTitle = selected
    ? isReferenceCandidate ? "참고용 탈락 후보 상세" : selected.status === "pass" ? "추천 후보 상세" : selected.status === "conditional" ? "조건부 후보 상세" : "탈락 후보 상세"
    : "후보 상세";
  const openCandidateDetails = (candidate: CandidateResult) => setSelected(candidate);
  const toggleComparison = (candidate: CandidateResult) => setComparison((current) => current.some((item) => item === candidate) ? current.filter((item) => item !== candidate) : current.length >= 3 ? current : [...current, candidate]);
  const gsrmReferenceDiameterMm = selected ? calculateGsrmReferenceDiameter(selected.input.chamberDiameterMm, gsrmWallThicknessMm) : null;
  const rpaSummary = useMemo<RpaInputSummary | null>(() => selected ? buildRpaInputSummary(selected, { ...config, targetThrustEnabled: targetThrustText.trim() !== "", targetAverageThrustN: targetThrustText.trim() === "" ? config.targetAverageThrustN : Number(targetThrustText) }, { appVersion: APP_VERSION, engineVersion: CALCULATION_ENGINE_VERSION, baselineVersion: BASELINE_VERSION, gsrmReferenceVersion: GSRM_REFERENCE_VERSION, anCatalogVersion: AN_CATALOG_VERSION }) : null, [config, selected, targetThrustText]);
  const cadSummary = useMemo(() => selected ? buildCadDesignSummary(selected, gsrmReferenceDiameterMm) : null, [gsrmReferenceDiameterMm, selected]);
  const selectedRpaRecords = useMemo(() => rpaSummary ? rpaRecords.filter((record) => record.candidateKey === rpaSummary.candidateKey) : [], [rpaRecords, rpaSummary]);
  const predictedMetricsFromPayload = (payload: Record<string, unknown> | null | undefined): Partial<Record<ValidationMetric, number>> => predictedMetricsForReport(payload?.representativeCandidate);
  const resetValidationForm = () => { setEditingValidationId(null); setValidationName(""); setValidationSource(""); setValidationDataVersion(""); setValidationConditions(""); setValidationCalculationId("current"); setValidationMeasured({ ...EMPTY_VALIDATION_FORM }); setValidationTolerances({ ...EMPTY_VALIDATION_FORM }); };
  const editExternalValidation = (record: ExternalValidationRecord) => {
    setEditingValidationId(record.id);
    setValidationName(record.name);
    setValidationSource(record.sourceDescription === "출처 미기록" ? "" : record.sourceDescription);
    setValidationDataVersion(record.dataVersion === "식별자 미기록" ? "" : record.dataVersion);
    setValidationConditions(record.conditionsMemo);
    setValidationCalculationId(record.calculationResultId);
    setValidationMeasured(Object.fromEntries(VALIDATION_METRICS.map(({ key }) => [key, record.measured[key] == null ? "" : String(record.measured[key])])) as Record<ValidationMetric, string>);
    setValidationTolerances(Object.fromEntries(VALIDATION_METRICS.map(({ key }) => [key, record.tolerances[key] == null ? "" : String(record.tolerances[key])])) as Record<ValidationMetric, string>);
    setValidationNotice(`“${record.name}” 기록을 수정 중입니다.`);
  };
  const saveExternalValidation = () => {
    if (!search) { setValidationNotice("먼저 계산을 완료한 뒤 외부 검증 데이터를 기록하세요."); return; }
    const measured: Partial<Record<ValidationMetric, number>> = {};
    const tolerances: Partial<Record<ValidationMetric, number>> = {};
    for (const { key } of VALIDATION_METRICS) {
      const rawMeasured = validationMeasured[key].trim();
      const rawTolerance = validationTolerances[key].trim();
      if (rawMeasured) { const value = Number(rawMeasured); if (!Number.isFinite(value) || value < 0) { setValidationNotice(`${key} 측정값은 0 이상 숫자여야 합니다.`); return; } measured[key] = value; }
      if (rawTolerance) { const value = Number(rawTolerance); if (!Number.isFinite(value) || value < 0) { setValidationNotice(`${key} 허용 오차는 0 이상 숫자여야 합니다.`); return; } tolerances[key] = value; }
    }
    if (!Object.keys(measured).length) { setValidationNotice("최소 한 개의 측정값을 입력하세요."); return; }
    const existing = editingValidationId ? externalValidationRecords.find((item) => item.id === editingValidationId) : null;
    const record: ExternalValidationRecord = { id: existing?.id ?? createSavedCalculationId(), name: validationName.trim() || `외부 검증 ${new Date().toLocaleString("ko-KR")}`, recordedAt: existing?.recordedAt ?? createSavedCalculationTimestamp(), sourceDescription: validationSource.trim() || "출처 미기록", calculationResultId: validationCalculationId, measured, tolerances, conditionsMemo: validationConditions.trim(), dataVersion: validationDataVersion.trim() || "식별자 미기록", units: VALIDATION_UNITS, appVersion: existing?.appVersion ?? APP_VERSION, engineVersion: existing?.engineVersion ?? CALCULATION_ENGINE_VERSION, baselineVersion: existing?.baselineVersion ?? BASELINE_VERSION, gsrmReferenceVersion: existing?.gsrmReferenceVersion ?? GSRM_REFERENCE_VERSION, anCatalogVersion: existing?.anCatalogVersion ?? AN_CATALOG_VERSION };
    setExternalValidationRecords((current) => editingValidationId ? current.map((item) => item.id === editingValidationId ? record : item) : [record, ...current].slice(0, 20));
    setValidationNotice(`외부 검증 데이터 “${record.name}”을 ${editingValidationId ? "수정" : "저장"}했습니다. 계산 판정에는 영향을 주지 않습니다.`);
    resetValidationForm();
  };
  const exportExternalValidationBackup = () => {
    const backup: ExternalValidationBackupFile = { app: "MotorFit", schemaVersion: EXTERNAL_VALIDATION_SCHEMA_VERSION, exportedAt: createSavedCalculationTimestamp(), records: externalValidationRecords };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "motorfit-external-validation-backup.json"; anchor.click(); URL.revokeObjectURL(url); setValidationNotice(`외부 검증 데이터 ${externalValidationRecords.length}개를 백업했습니다.`);
  };
  const importExternalValidationBackup = async (file: File) => {
    try { const imported = parseExternalValidationBackup(JSON.parse(await file.text())); const currentIds = new Set(externalValidationRecords.map((record) => record.id)); const next = [...imported.filter((record) => !currentIds.has(record.id)), ...externalValidationRecords].slice(0, 20); setExternalValidationRecords(next); setValidationNotice(`외부 검증 데이터 ${imported.length}개를 확인하고 ${next.length}개를 보관했습니다.`); } catch (error) { setValidationNotice(error instanceof Error ? `외부 검증 백업을 불러오지 않았습니다: ${error.message}` : "외부 검증 백업을 불러오지 않았습니다."); } finally { if (validationBackupInput.current) validationBackupInput.current.value = ""; }
  };
  const deleteExternalValidation = (id: string) => { setExternalValidationRecords((current) => current.filter((record) => record.id !== id)); setValidationNotice("외부 검증 데이터를 삭제했습니다."); };
  const saveRpaResult = () => {
    if (!rpaSummary) { setRpaNotice("먼저 후보 상세를 연 뒤 RPA 결과를 기록하세요."); return; }
    if (!rpaSource.trim() || !rpaVersion.trim() || !rpaDatabase.trim() || !rpaResultValues.trim()) { setRpaNotice("결과 출처, RPA 버전, 데이터베이스, 결과값을 모두 입력하세요."); return; }
    const record: RpaResultRecord = { id: createSavedCalculationId(), candidateKey: rpaSummary.candidateKey, recordedAt: createSavedCalculationTimestamp(), source: rpaSource.trim(), version: rpaVersion.trim(), database: rpaDatabase.trim(), inputConditions: rpaInputConditions.trim(), resultValues: rpaResultValues.trim(), memo: rpaMemo.trim() };
    setRpaRecords((current) => [record, ...current.filter((item) => item.id !== record.id)].slice(0, 20));
    setRpaNotice("RPA 결과를 별도 기록으로 저장했습니다. SRM 판정과 추천 상태에는 영향을 주지 않습니다.");
    setRpaSource(""); setRpaVersion(""); setRpaDatabase(""); setRpaInputConditions(""); setRpaResultValues(""); setRpaMemo("");
  };
  const deleteRpaResult = (id: string) => { setRpaRecords((current) => current.filter((record) => record.id !== id)); setRpaNotice("RPA 결과 기록을 삭제했습니다."); };
  const exportRpaBackup = () => {
    const backup = { app: "MotorFit", schemaVersion: RPA_LINK_SCHEMA_VERSION, exportedAt: createSavedCalculationTimestamp(), records: rpaRecords };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "motorfit-rpa-results.json"; anchor.click(); URL.revokeObjectURL(url); setRpaNotice(`RPA 결과 ${rpaRecords.length}개를 JSON으로 내보냈습니다.`);
  };
  const importRpaBackup = async (file: File) => {
    try { const imported = parseRpaBackup(JSON.parse(await file.text())); const ids = new Set(rpaRecords.map((record) => record.id)); const next = [...imported.filter((record) => !ids.has(record.id)), ...rpaRecords].slice(0, 20); setRpaRecords(next); setRpaNotice(`RPA 결과 ${imported.length}개를 확인하고 ${next.length}개를 보관했습니다.`); } catch (error) { setRpaNotice(error instanceof Error ? `RPA 백업을 거부했습니다: ${error.message}` : "RPA 백업을 거부했습니다."); } finally { if (rpaBackupInput.current) rpaBackupInput.current.value = ""; }
  };
  const copyRpaSummary = async () => {
    if (!rpaSummary) { setRpaNotice("먼저 후보 상세를 여세요."); return; }
    const text = JSON.stringify({ inputSummary: rpaSummary, externalResults: selectedRpaRecords }, null, 2);
    try { await navigator.clipboard.writeText(text); setRpaNotice("RPA 입력용 요약을 클립보드에 복사했습니다."); } catch { setRpaNotice("클립보드 복사에 실패했습니다. JSON 내보내기를 사용하세요."); }
  };
  const downloadRpaSummary = (format: "csv" | "json") => {
    if (!rpaSummary) { setRpaNotice("먼저 후보 상세를 여세요."); return; }
    const payload = { inputSummary: rpaSummary, externalResults: selectedRpaRecords, note: "RPA 연계 정보는 상세설계 참고자료이며 기존 SRM 판정과 분리됩니다." };
    const csv = ["section,key,value", `inputSummary,geometry,${JSON.stringify(rpaSummary.geometry)}`, ...Object.entries(rpaSummary.values).map(([key, value]) => `inputSummary,${key},${JSON.stringify(value)}`), ...selectedRpaRecords.map((record) => `externalResult,${record.id},${JSON.stringify(record.resultValues)}`)].join("\n");
    const body = format === "json" ? JSON.stringify(payload, null, 2) : csv;
    const blob = new Blob([body], { type: format === "json" ? "application/json" : "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `motorfit-rpa-summary.${format}`; anchor.click(); URL.revokeObjectURL(url); setRpaNotice(`RPA 입력용 ${format.toUpperCase()} 요약을 내보냈습니다.`);
  };
  const buildExportPayload = () => {
    if (!search) return null;
    const rows = search.candidates.map((candidate) => ({ status: candidate.status, geometry: `${candidate.input.grainOuterDiameterMm}×${candidate.input.grainCoreDiameterMm}×${candidate.input.segmentLengthMm}/${candidate.input.segmentCount}`, massKg: candidate.grainMassKg, maximumPressureMpa: candidate.maximumPressureMpa, burnTimeSec: candidate.burnTimeSec, averageThrustN: candidate.averageThrustN, totalImpulseNs: candidate.totalImpulseNs, reasons: candidate.reasons.join(" ") }));
    const representative = selected ?? referenceCandidate;
    const metadata = { ...(search.metadata ?? { appVersion: "0.1.0", engineVersion: "candidate-search-1", calculatedAt: new Date().toISOString(), input: { ...config }, fuelMassToleranceKg: config.fuelMassToleranceKg, searchMode: mode, automaticExpansionStage: search.automaticExpansionStage, totalCombinations: search.totalCombinations, evaluatedCombinations: search.evaluatedCombinations, calculationFailures: search.calculationFailures, counts: { recommend: candidateCounts.pass, conditional: candidateCounts.conditional, referenceRejected: referenceCandidate ? 1 : 0, rejected: candidateCounts.fail }, baselineVersion: "SRM_2023.xls-baseline", gsrmReferenceVersion: "GSRM-engineering-targets-v1", anCatalogVersion: "AS568A-supplied-catalog", anCatalogItemCount: 241, status: "completed" as const }), units: STANDARD_UNITS };
    const validation = { calculationStatus: lastCalculationStatus === "completed" ? "COMPLETED" : lastCalculationStatus.toUpperCase(), baselineStatus: "PASS", liveFixtureStatus: "NOT_RUN", status: "NOT_RUN" as const, summary: "현재 결과에 대한 별도 fixture 재검산: 실행하지 않음", fixtures: VALIDATION_FIXTURES.map(notRunValidation) };
    return { metadata, modelValidationLevel: MODEL_VALIDATION_LEVEL, baselineReproductionStatus: BASELINE_REPRODUCTION_STATUS, deterministicCalculationStatus: DETERMINISTIC_CALCULATION_STATUS, hardwareValidationStatus: HARDWARE_VALIDATION_STATUS, productionApprovalStatus: PRODUCTION_APPROVAL_STATUS, assumptions: MODEL_ASSUMPTIONS, limitations: MODEL_LIMITATIONS, validationDataAvailable: VALIDATION_DATA_AVAILABLE, exportedAt: new Date().toISOString(), calculationFlow: ["질량 계산", "압력 조건 적용", "추력 조건 적용(입력 시)", "최종 후보 판정"], resultSemantics: { massCalculation: "형상·연료 밀도·세그먼트로 계산된 후보별 연료 질량", pressureCondition: "각 후보 최대 압력과 최대 허용 압력의 비교", targetThrustCondition: targetThrustText.trim() === "" ? "미입력·미계산" : "입력값과 평균 추력 비교" }, input: { ...config, fuelMassToleranceDisplay: formatMassTolerance(config.fuelMassToleranceKg), targetThrustText, targetThrustEnabled: targetThrustText.trim() !== "" }, search: { totalCombinations: search.totalCombinations, evaluatedCombinations: search.evaluatedCombinations, automaticExpansionStage: search.automaticExpansionStage ?? 0, searchEnvelope: search.searchEnvelope, warning: search.warning, diagnosis: search.diagnosis, counts: { recommend: candidateCounts.pass, conditional: candidateCounts.conditional, referenceRejected: referenceCandidate ? 1 : 0, rejected: candidateCounts.fail } }, candidates: rows, representativeCandidate: representative ? rows[search.candidates.indexOf(representative)] : null, selectedCandidates: comparison.map((candidate) => rows[search.candidates.indexOf(candidate)]), referenceCandidate: referenceCandidate ? rows[search.candidates.indexOf(referenceCandidate)] : null, referenceRule: "추천·조건부 후보가 없을 때만 목표 질량에 가장 가까운 탈락 후보 1개를 참고용으로 표시", externalValidation: externalValidationRecords.filter((record) => record.calculationResultId === "current"), rpa: rpaSummary ? { inputSummary: rpaSummary, externalResults: rpaRecords.filter((record) => record.candidateKey === rpaSummary.candidateKey) } : null, cadDesign: cadSummary, gsrm: selected ? { referenceDiameterMm: gsrmReferenceDiameterMm, note: "선택 후보의 GSRM B 변환값. AN 검사는 화면에서 실행한 결과를 기준으로 합니다." } : null, an: anExportState ? { catalogSize: anExportState.total, query: anExportState.query, page: anExportState.page, pageCount: anExportState.pageCount, recommend: anExportState.recommend, conditional: anExportState.conditional, fail: anExportState.fail } : { catalogSize: 241, query: "미실행", page: 0, pageCount: 0, recommend: 0, conditional: 0, fail: 0 }, validation };
  };
  const hasCurrentValidation = externalValidationRecords.some((record) => record.calculationResultId === "current");
  const validationTargetPayload = validationCalculationId === "current" ? (hasCurrentValidation ? buildExportPayload() : null) : savedResults.find((item) => item.id === validationCalculationId)?.payload ?? null;
  const validationTargetRecords = externalValidationRecords.filter((record) => record.calculationResultId === validationCalculationId);
  const activeValidationComparisons = validationTargetRecords.map((record) => ({ record, comparisons: compareValidationRecord(record, predictedMetricsFromPayload(validationTargetPayload)) }));
  const currentValidationVersions = { appVersion: APP_VERSION, engineVersion: CALCULATION_ENGINE_VERSION, baselineVersion: BASELINE_VERSION, gsrmReferenceVersion: GSRM_REFERENCE_VERSION, anCatalogVersion: AN_CATALOG_VERSION };
  const activeValidationWarnings = validationTargetRecords.map((record) => ({ record, warnings: getValidationQualityWarnings(record, currentValidationVersions, externalValidationRecords) }));
  const cumulativeValidationComparisons = VALIDATION_METRICS.map(({ key, label, unit }) => ({ key, label, unit, predicted: predictedMetricsFromPayload(validationTargetPayload)[key], values: activeValidationComparisons.map(({ record, comparisons }) => ({ record, comparison: comparisons.find((item) => item.metric === key)! })) }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const downloadExport = (format: "csv" | "json", savedPayload?: Record<string, any>) => {
    const payload = savedPayload ?? buildExportPayload();
    if (!payload) return;
    const rows = payload.candidates ?? [];
    const externalValidationComparisons = (payload.externalValidation ?? []).flatMap((record: ExternalValidationRecord) => compareValidationRecord(record, predictedMetricsForReport(payload.representativeCandidate)));
    const sensitivityExport = savedPayload?.sensitivityScenarios ?? sensitivityScenarios;
    const externalValidationQualityWarnings = (payload.externalValidation ?? []).map((record: ExternalValidationRecord) => ({ id: record.id, warnings: getValidationQualityWarnings(record, currentValidationVersions, payload.externalValidation as ExternalValidationRecord[]) }));
    const csvValue = (value: unknown) => JSON.stringify(value ?? "");
    const csvLines = [
      "# MotorFit export",
      `metadata,${csvValue(payload.metadata)}`,
      `modelValidationLevel,${csvValue(payload.modelValidationLevel)}`,
      `baselineReproductionStatus,${csvValue(payload.baselineReproductionStatus)}`,
      `deterministicCalculationStatus,${csvValue(payload.deterministicCalculationStatus)}`,
      `hardwareValidationStatus,${csvValue(payload.hardwareValidationStatus)}`,
      `productionApprovalStatus,${csvValue(payload.productionApprovalStatus)}`,
      `assumptions,${csvValue(payload.assumptions)}`,
      `limitations,${csvValue(payload.limitations)}`,
      `validationDataAvailable,${csvValue(payload.validationDataAvailable)}`,
      `input,${csvValue(payload.input)}`,
      `search,${csvValue(payload.search)}`,
      `validation,${csvValue(payload.validation)}`,
      `externalValidation,${csvValue(payload.externalValidation ?? [])}`,
      `rpa,${csvValue(payload.rpa ?? null)}`,
      `externalValidationComparisons,${csvValue(externalValidationComparisons)}`,
      `externalValidationQualityWarnings,${csvValue(externalValidationQualityWarnings)}`,
      `sensitivityScenarios,${csvValue(sensitivityExport)}`,
      `referenceCandidate,${csvValue(payload.referenceCandidate)}`,
      `gsrm,${csvValue(payload.gsrm)}`,
      `an,${csvValue(payload.an)}`,
      "candidates",
      "status,geometry,massKg,maximumPressureMpa,burnTimeSec,averageThrustN,totalImpulseNs,reasons",
      ...rows.map((row: { status: string; geometry: string; massKg: number; maximumPressureMpa: number; burnTimeSec: number; averageThrustN: number; totalImpulseNs: number; reasons: string }) => [row.status, row.geometry, row.massKg, row.maximumPressureMpa, row.burnTimeSec, row.averageThrustN, row.totalImpulseNs, csvValue(row.reasons)].join(",")),
    ];
    const text = format === "json" ? JSON.stringify({ ...payload, sensitivityScenarios: sensitivityExport, externalValidationComparisons, externalValidationQualityWarnings }, null, 2) : csvLines.join("\n");
    const blob = new Blob([text], { type: format === "json" ? "application/json" : "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `motorfit-results.${format}`; anchor.click(); URL.revokeObjectURL(url);
  };
  const saveCurrentResult = () => {
    const basePayload = buildExportPayload();
    if (!basePayload) return;
    const name = saveName.trim() || `계산 결과 ${new Date().toLocaleString("ko-KR")}`;
    const id = createSavedCalculationId();
    const payload = { ...basePayload, sensitivityScenarios, externalValidation: externalValidationRecords.filter((record) => record.calculationResultId === "current") };
    const saved: SavedCalculation = { id, name, savedAt: createSavedCalculationTimestamp(), payload };
    setSavedResults((current) => [saved, ...current].slice(0, MAX_SAVED_RESULTS));
    if (payload.externalValidation.length) setExternalValidationRecords((current) => current.map((record) => record.calculationResultId === "current" ? { ...record, calculationResultId: id } : record));
    setSaveName("");
    setHistoryNotice(`“${name}” 결과를 저장했습니다. 저장 결과는 이 브라우저에만 보관됩니다.`);
  };
  const renameSavedResult = (id: string) => {
    const item = savedResults.find((entry) => entry.id === id);
    if (!item) return;
    const next = window.prompt("저장 결과 이름", item.name)?.trim();
    if (next) setSavedResults((current) => current.map((entry) => entry.id === id ? { ...entry, name: next } : entry));
  };
  const deleteSavedResult = (id: string) => { setSavedResults((current) => current.filter((entry) => entry.id !== id)); setExternalValidationRecords((current) => current.filter((record) => record.calculationResultId !== id)); };
  const loadSavedResult = (item: SavedCalculation) => {
    if (Array.isArray(item.payload.sensitivityScenarios)) setSensitivityScenarios(item.payload.sensitivityScenarios.slice(0, 20));
    setHistoryNotice(`“${item.name}”을(를) 읽었습니다. 저장 당시 결과는 비교·재내보내기용으로 보존되며 현재 계산을 덮어쓰지 않습니다.`);
  };
  const exportHistoryBackup = () => {
    const backup: SavedResultsBackup = { app: "MotorFit", schemaVersion: SAVED_RESULTS_SCHEMA_VERSION, exportedAt: createSavedCalculationTimestamp(), results: savedResults };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "motorfit-calculation-history-backup.json"; anchor.click(); URL.revokeObjectURL(url);
    setHistoryNotice(`전체 이력 ${savedResults.length}개를 백업했습니다.`);
  };
  const inspectHistoryBackup = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      const imported = migrateBackup(parsed);
      const versionMismatch = imported.some((item) => item.payload.metadata?.engineVersion !== CALCULATION_ENGINE_VERSION || item.payload.metadata?.appVersion !== APP_VERSION || item.payload.metadata?.baselineVersion !== BASELINE_VERSION || item.payload.metadata?.gsrmReferenceVersion !== GSRM_REFERENCE_VERSION || item.payload.metadata?.anCatalogVersion !== AN_CATALOG_VERSION);
      setPendingImport({ results: imported, versionMismatch });
      setHistoryNotice(`백업 ${imported.length}개를 확인했습니다. ${versionMismatch ? "일부 결과의 버전이 현재와 다릅니다. " : ""}추가 또는 전체 교체를 선택하세요.`);
    } catch (error) {
      setPendingImport(null);
      setHistoryNotice(error instanceof Error ? `백업을 불러오지 않았습니다: ${error.message}` : "백업 파일을 불러오지 않았습니다.");
    } finally {
      if (backupFileInput.current) backupFileInput.current.value = "";
    }
  };
  const applyHistoryImport = (replace: boolean) => {
    if (!pendingImport) return;
    const existingIds = new Set(savedResults.map((item) => item.id));
    const imported = pendingImport.results.filter((item) => replace || !existingIds.has(item.id));
    const next = (replace ? pendingImport.results : [...imported, ...savedResults]).slice(0, MAX_SAVED_RESULTS);
    setSavedResults(next);
    setPendingImport(null);
    setHistoryNotice(`${replace ? "백업으로 교체" : "백업을 추가"}했습니다. ${next.length}개를 보관합니다.`);
  };
  const printCurrentReport = () => { const payload = buildExportPayload(); printReviewReport(payload ? { ...payload, sensitivityScenarios } : payload, lastCalculationStatus, "MotorFit 설계 검토 리포트", setReportNotice); };
  const toggleSort = (key: CandidateSortKey) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDirection("asc");
    } else if (sortDirection === "asc") {
      setSortDirection("desc");
    } else {
      setSortKey(null);
      setSortDirection(null);
    }
  };
  const selectedCharts = useMemo(() => {
    if (!selected) return null;
    const pressureRows = [...selected.pressure.combustion.rows, ...selected.pressure.blowdown.rows];
    const maximumPressureRow = pressureRows.reduce((max, row) => row.gaugePressureMpa > max.gaugePressureMpa ? row : max, pressureRows[0]);
    const maximumKnPoint = selected.dataAndKn.knCurve.reduce((max, row) => row.kn > max.kn ? row : max, selected.dataAndKn.knCurve[0]);
    return {
      thrust: selected.performance.rows.map((row) => ({ x: row.timeSec, y: row.thrustN })),
      pressure: pressureRows.map((row) => ({ x: row.timeSec, y: row.gaugePressureMpa })),
      kn: selected.dataAndKn.knCurve.map((row) => ({ x: row.regressionMm, y: row.kn })),
      knKpis: [
        { label: "초기 Kn", value: formatNumber(selected.dataAndKn.knCurve[0].kn, 3) },
        { label: "최대 Kn", value: formatNumber(selected.dataAndKn.maximumKn, 3) },
        { label: "최소 Kn", value: formatNumber(selected.dataAndKn.minimumKn, 3) },
        { label: "평균 Kn", value: formatNumber(selected.dataAndKn.averageKn, 3) },
        { label: "최대 Kn 회귀 거리", value: `${formatNumber(maximumKnPoint.regressionMm, 3)} mm` },
      ],
      pressureKpis: [
        { label: "최대 압력", value: `${formatNumber(selected.pressure.maximumGaugePressureMpa, 4)} MPa` },
        { label: "최대 압력 시점", value: `${formatNumber(maximumPressureRow.timeSec, 4)} s` },
        { label: "연소 종료 압력", value: `${formatNumber(selected.pressure.combustion.rows.at(-1)?.gaugePressureMpa ?? 0, 4)} MPa` },
        { label: "추력 종료 시점", value: `${formatNumber(selected.pressure.thrustEndTimeSec, 4)} s` },
      ],
      thrustKpis: [
        ...(selected.thrustEvaluation ? [
          { label: "목표 추력", value: `${formatNumber(selected.thrustEvaluation.targetThrustN, 2)} N` },
          { label: "평균제곱오차", value: `${formatNumber(selected.thrustEvaluation.meanSquaredErrorN2, 2)} N²` },
          { label: "최대 편차", value: `${formatNumber(selected.thrustEvaluation.maximumDeviationN, 2)} N` },
          { label: "추력 변동성", value: `${formatNumber(selected.thrustEvaluation.variabilityN, 2)} N` },
        ] : []),
        { label: "최대 추력", value: `${formatNumber(selected.performance.maximumThrustN, 2)} N` },
        { label: "평균 추력", value: `${formatNumber(selected.performance.averageThrustN, 2)} N` },
        { label: "총충격량", value: `${formatNumber(selected.performance.totalImpulseNs, 2)} N·s` },
        { label: "비추력", value: `${formatNumber(selected.performance.specificImpulseSec, 3)} s` },
        { label: "추력 종료 시간", value: `${formatNumber(selected.performance.thrustEndTimeSec, 4)} s` },
      ],
    };
  }, [selected]);
  const selectedRecommendation = useMemo(() => {
    if (!selected) return null;
    const step = config.manufacturingStepMm ?? 5;
    const dimensionsOnStep = [selected.input.grainOuterDiameterMm, selected.input.grainCoreDiameterMm, selected.input.segmentLengthMm].every((value) => Number.isInteger(value) && value % step === 0);
    return {
      massError: selected.grainMassKg - config.targetFuelMassKg,
      pressureMargin: config.maximumPressureMpa - selected.maximumPressureMpa,
      thrustError: targetThrustText.trim() === "" ? null : selected.averageThrustN - Number(targetThrustText),
      burnTimeError: selected.burnTimeSec - config.targetBurnTimeSec,
      dimensionsOnStep,
    };
  }, [config, selected, targetThrustText]);

  return (
    <main className="motorfit-app min-h-screen bg-[var(--background)] text-[var(--foreground)]">
<div className="mx-auto max-w-[1500px] px-5 py-6 sm:px-8 lg:px-12">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
<div>
<p className="text-xs font-bold tracking-[0.12em] text-cyan-800 uppercase">BYPP MotorFit</p>
<h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">SRM 후보 계산 및 설계 검토</h1>
<p className="mt-3 max-w-3xl text-sm leading-6 text-slate-700 sm:text-base">목표 연료 질량과 최대 허용 압력을 기준으로 형상 후보를 계산하고, 후보별 판정 근거를 비교합니다.</p>
</div>
<div className="flex flex-wrap items-center gap-2">
<span className="text-xs text-slate-500">교육·설계 검토용</span>
<button type="button" onClick={resetToBaseline} className="rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:border-cyan-700 hover:text-cyan-800">기준 설계로 초기화</button>
</div>
</header>
      <div className="mt-4 flex flex-col gap-3 border border-slate-300 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div><p className="text-sm font-bold text-slate-950">처음 사용한다면 기준 예시부터 확인하세요.</p><p className="mt-1 text-xs leading-5 text-slate-600">질량 계산 → 압력 조건 적용 → 추력 조건 적용(입력 시) → 최종 후보 판정 순서로 진행합니다.</p></div>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={resetToBaseline} className="inline-flex shrink-0 items-center justify-center rounded-md border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 hover:border-cyan-700 hover:text-cyan-800 focus:outline-none focus:ring-2 focus:ring-cyan-500">기준 예시 불러오기</button><a href="/guide" className="inline-flex shrink-0 items-center justify-center px-3 py-2.5 text-sm font-semibold text-cyan-800 underline-offset-4 hover:underline focus:outline-none focus:ring-2 focus:ring-cyan-500">사용 설명서</a></div>
      </div>
      <p className="mt-3 text-xs leading-5 text-slate-500">SRM_2023.xls 계산식 기반 · Data and Kn · Pressure · Blowdown · Performance · 기준 케이스 검산 완료</p>
      <div className="mt-6 grid gap-6 xl:grid-cols-[360px_1fr]">
        <aside className="order-2 h-fit rounded-xl border border-slate-300 bg-white p-5 sm:p-6 xl:order-1">
<div className="flex rounded-xl bg-slate-100 p-1">{(["candidate", "excel"] as const).map((option) => <button key={option} type="button" onClick={() => setMode(option)} className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold transition ${mode === option ? "bg-white text-cyan-700 shadow-sm" : "text-slate-500"}`}>{option === "candidate" ? "제작 후보 모드" : "Excel 재현 모드"}</button>)}</div>
<p className="mt-3 rounded-xl bg-cyan-50 px-3 py-2 text-xs leading-5 text-cyan-800">{mode === "candidate" ? "Do · do · Lo는 정수 mm, 기본 5 mm 간격으로 후보를 생성합니다." : "원본 Excel 재현을 위해 소수 mm 입력을 허용하며 제작 단위 제약을 적용하지 않습니다."}</p>
          <div className="mt-6 space-y-5">
<div className="rounded-xl border border-slate-300 bg-white p-4">
<p className="text-sm font-bold text-slate-950">기본 입력과 계산 순서</p>
<ol className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="계산 단계"><li className={`rounded-xl border px-2 py-2 text-center text-[11px] font-bold ${completedStage >= 1 ? "border-emerald-300 bg-emerald-50 text-emerald-800" : runningStage === 1 ? "border-cyan-400 bg-cyan-100 text-cyan-900" : "border-slate-200 bg-white text-slate-500"}`}><span className="block text-base">1</span>질량 계산</li><li className={`rounded-xl border px-2 py-2 text-center text-[11px] font-bold ${completedStage >= 2 ? "border-emerald-300 bg-emerald-50 text-emerald-800" : runningStage === 2 ? "border-cyan-400 bg-cyan-100 text-cyan-900" : "border-slate-200 bg-white text-slate-500"}`}><span className="block text-base">2</span>압력 조건 적용</li><li className={`rounded-xl border px-2 py-2 text-center text-[11px] font-bold ${completedStage >= 3 ? "border-emerald-300 bg-emerald-50 text-emerald-800" : runningStage === 3 ? "border-cyan-400 bg-cyan-100 text-cyan-900" : "border-slate-200 bg-white text-slate-500"}`}><span className="block text-base">3</span>추력 조건 적용{targetThrustText.trim() === "" ? " (미입력)" : ""}</li><li className={`rounded-xl border px-2 py-2 text-center text-[11px] font-bold ${completedStage >= 4 ? "border-emerald-300 bg-emerald-50 text-emerald-800" : runningStage === 4 ? "border-cyan-400 bg-cyan-100 text-cyan-900" : "border-slate-200 bg-white text-slate-500"}`}><span className="block text-base">4</span>최종 후보 판정</li></ol>
<div className="mt-3 space-y-4">
<div><p className="mb-2 text-xs font-bold text-slate-800">1단계 · 필수 입력</p><Field label="목표 연료 질량" value={config.targetFuelMassKg} onChange={(value) => updateNumber("targetFuelMassKg", value)} suffix="kg" help="계산할 추진제 질량의 상한입니다." /><button type="button" onClick={() => runSearch(1)} disabled={running} className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:border-cyan-700 disabled:opacity-60">질량 기준 계산</button></div>
<div><p className="mb-2 text-xs font-bold text-slate-800">2단계 · 필수 입력</p><Field label="최대 허용 압력" value={config.maximumPressureMpa} onChange={(value) => updateNumber("maximumPressureMpa", value)} suffix="MPa" help="계산된 후보 압력과 비교할 상한입니다." /><button type="button" onClick={() => runSearch(2)} disabled={running} className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:border-cyan-700 disabled:opacity-60">압력 조건 적용</button></div>
<div><p className="mb-2 text-xs font-bold text-slate-800">3단계 · 선택 입력</p><OptionalField label="목표 평균 추력" value={targetThrustText} onChange={setTargetThrustText} suffix="N" /><p className="mt-2 border-l-2 border-slate-300 px-2.5 py-1 text-[11px] leading-5 text-slate-600">{targetThrustText.trim() === "" ? "비워두면 목표 추력 기반 지표를 계산하지 않습니다." : "입력한 목표 추력과 후보의 계산 추력을 비교합니다."}</p><button type="button" onClick={() => runSearch(3)} disabled={running} className="mt-2 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:border-cyan-700 disabled:opacity-60">추력 조건 적용</button><p className="mt-4 mb-2 text-xs font-bold text-slate-800">4단계 · 최종 판정</p><button type="button" onClick={() => runSearch(4)} disabled={running} className="w-full rounded-md bg-cyan-800 px-3 py-2.5 text-xs font-bold text-white hover:bg-cyan-900 disabled:opacity-60">계산 시작 · 최종 추천 계산</button></div>
</div>
<p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">현재 적용 중인 질량 허용 오차: <strong className="font-mono text-slate-950">{formatMassTolerance(config.fuelMassToleranceKg)}</strong> · 상세 설정에서 변경할 수 있으며 변경 후에는 재계산이 필요합니다.</p>
<div className="mt-4">
<label className="block">
<span className="mb-1.5 block text-xs font-semibold text-slate-600">추진제</span>
<select className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" value={config.propellant} onChange={(event) => setConfig((current) => ({ ...current, propellant: event.target.value as CandidateSearchConfig["propellant"] }))}>{PROPELLANTS.map((propellant) => <option key={propellant}>{propellant}</option>)}</select>
</label>
</div>
</div>
<div className="rounded-2xl border border-slate-200 bg-white">
<button type="button" onClick={() => { setAutomaticMode(false); setDetailsOpen((open) => !open); }} className="w-full cursor-pointer px-4 py-3 text-left text-sm font-bold text-slate-800">{detailsOpen ? "상세 설정 닫기" : "상세 설정 열기"} <span className="ml-2 text-xs font-normal text-slate-500">챔버·형상 범위·허용 오차</span>
</button>
<div className={`${detailsOpen ? "" : "hidden"} space-y-5 border-t border-slate-100 px-4 pb-4`}>
<div>
<p className="mb-3 pt-4 text-sm font-bold text-slate-950">기본 형상</p>
<div className="grid grid-cols-2 gap-3">
<Field label="챔버 직경" value={config.chamberDiameterMm} onChange={(value) => updateNumber("chamberDiameterMm", value)} suffix="mm" />
<Field label="챔버 길이" value={config.chamberLengthMm} onChange={(value) => updateNumber("chamberLengthMm", value)} suffix="mm" />
</div>
<label className="mt-3 block">
<span className="mb-1.5 block text-xs font-semibold text-slate-600">추진제</span>
<select className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" value={config.propellant} onChange={(event) => setConfig((current) => ({ ...current, propellant: event.target.value as CandidateSearchConfig["propellant"] }))}>{PROPELLANTS.map((propellant) => <option key={propellant}>{propellant}</option>)}</select>
</label>
<div className="mt-3 grid grid-cols-2 gap-3">
<Field label="밀도비" value={config.densityRatio} onChange={(value) => updateNumber("densityRatio", value)} />
<Field label="노즐 침식" value={config.nozzleErosionMm} onChange={(value) => updateNumber("nozzleErosionMm", value)} suffix="mm" />
</div>
</div>
            <div className="border-t border-slate-100 pt-5">
<p className="mb-3 text-sm font-bold text-slate-950">형상 범위</p>
<div className="space-y-3">
<RangeField label="Do · 외경" range={config.outerDiameterMm} inputStep={mode === "excel" ? "any" : 5} onChange={(bound, value) => updateRange("outerDiameterMm", bound, value)} />
<RangeField label="do · 코어 직경" range={config.coreDiameterMm} inputStep={mode === "excel" ? "any" : 5} onChange={(bound, value) => updateRange("coreDiameterMm", bound, value)} />
<RangeField label="Lo · 세그먼트 길이" range={config.segmentLengthMm} inputStep={mode === "excel" ? "any" : 5} onChange={(bound, value) => updateRange("segmentLengthMm", bound, value)} />
<div className="grid grid-cols-2 gap-3">
<Field label="세그먼트 수 최소" value={config.segmentCount.min} step={1} onChange={(value) => setConfig((current) => ({ ...current, segmentCount: { ...current.segmentCount, min: Math.round(value) } }))} />
<Field label="세그먼트 수 최대" value={config.segmentCount.max} step={1} onChange={(value) => setConfig((current) => ({ ...current, segmentCount: { ...current.segmentCount, max: Math.round(value) } }))} />
</div>
</div>
</div>
            <div className="border-t border-slate-100 pt-5">
<p className="mb-3 text-sm font-bold text-slate-950">검색 조건 입력과 허용 오차</p>
<div className="grid grid-cols-2 gap-3">
<Field label="목표 연료 질량" value={config.targetFuelMassKg} onChange={(value) => updateNumber("targetFuelMassKg", value)} suffix="kg" />
<Field label="질량 허용 오차" value={config.fuelMassToleranceKg} onChange={(value) => updateNumber("fuelMassToleranceKg", value)} suffix="kg" />
<Field label="최대 허용 압력" value={config.maximumPressureMpa} onChange={(value) => updateNumber("maximumPressureMpa", value)} suffix="MPa" />
<Field label="목표 압력" value={config.targetPressureMpa} onChange={(value) => updateNumber("targetPressureMpa", value)} suffix="MPa" />
<OptionalField label="목표 평균 추력" value={targetThrustText} onChange={setTargetThrustText} suffix="N" />
<Field label="추력 허용 오차" value={config.averageThrustToleranceN} onChange={(value) => updateNumber("averageThrustToleranceN", value)} suffix="N" />
<Field label="목표 연소 시간 (선택 조건)" value={config.targetBurnTimeSec} onChange={(value) => updateNumber("targetBurnTimeSec", value)} suffix="s" />
<Field label="시간 허용 오차" value={config.burnTimeToleranceSec} onChange={(value) => updateNumber("burnTimeToleranceSec", value)} suffix="s" />
</div>
</div>
</div>
          </div>
</div>
<button type="button" onClick={() => runSearch(3)} disabled={running} className={`${automaticMode && mode !== "excel" ? "hidden" : "mt-6"} w-full rounded-xl bg-cyan-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-cyan-600/20 transition hover:bg-cyan-700 disabled:cursor-wait disabled:opacity-60`}>{running ? "계산 중…" : mode === "excel" ? "Excel 재현 계산" : "상세 후보 탐색 실행"}</button>
{running ? <div className="mt-3 rounded-2xl border-2 border-cyan-300 bg-cyan-50 px-3 py-3 text-xs text-cyan-950 shadow-sm"><div className="flex items-center justify-between gap-3"><span className="font-bold">실행 단계 {runningStage ?? "-"} / 4 · 계산 진행 중</span><span className="font-mono text-cyan-700">{Math.round(progressPercent)}%</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-cyan-100"><div className="h-full rounded-full bg-cyan-600 transition-[width]" style={{ width: `${progressPercent}%` }} /></div><div className="mt-2 flex items-center justify-between gap-2"><span>{progressText}</span><button type="button" onClick={requestCancel} className="rounded-lg bg-cyan-700 px-3 py-1.5 font-bold text-white shadow-sm hover:bg-cyan-800">계산 취소</button></div></div> : cancelled ? <div className="mt-3 rounded-2xl border-2 border-amber-300 bg-amber-50 px-3 py-3 text-xs text-amber-950"><p className="font-bold">계산이 취소되었습니다. <span className="font-mono">CANCELLED</span></p><p className="mt-1">마지막 완료 단계: {completedStage} / 4 · 입력을 확인한 뒤 다시 계산할 수 있습니다.</p></div> : lastCalculationStatus === "failed" ? <div className="mt-3 rounded-2xl border-2 border-rose-300 bg-rose-50 px-3 py-3 text-xs text-rose-950"><p className="font-bold">계산에 실패했습니다. <span className="font-mono">FAILED</span></p><p className="mt-1">입력과 탐색 범위를 확인한 뒤 다시 시도하세요.</p></div> : null}
<p className="mt-3 text-center text-[11px] text-slate-400">계산은 버튼을 누를 때 브라우저에서 실행됩니다.</p>
        {(search || lastCalculationStatus !== "idle") ? <><button type="button" onClick={printCurrentReport} className="mt-3 w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-cyan-500">인쇄 / PDF로 저장 · 설계 검토 리포트</button><p className="mt-2 text-center text-[11px] text-slate-500">인쇄 대화상자에서 대상 프린터를 “PDF로 저장”으로 선택하면 PDF 파일로 저장할 수 있습니다.</p>{reportNotice ? <p role="status" className="mt-2 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs text-cyan-900">{reportNotice}</p> : null}</> : null}
        <details className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-xs text-emerald-950"><summary className="cursor-pointer font-bold">앱 자체 점검</summary><div className="mt-2 space-y-2"><p>기준 fixture와 결정성·단위·저장 schema를 기존 계산 엔진으로 점검합니다. PASS는 앱 자체 회귀 기준 통과이며 하드웨어 시험 검증·안전성·제작 가능성·점화 승인을 의미하지 않습니다.</p><div className="flex flex-wrap gap-2"><button type="button" onClick={runSelfCheck} disabled={selfCheckRunning} className="rounded-lg bg-emerald-700 px-3 py-1.5 font-bold text-white disabled:opacity-50">{selfCheckRunning ? "자체 점검 실행 중…" : "자체 점검 실행"}</button>{selfCheckReport ? <><button type="button" onClick={() => exportSelfCheck("json")} className="rounded-lg border border-emerald-300 bg-white px-2.5 py-1.5 font-bold text-emerald-800">JSON</button><button type="button" onClick={() => exportSelfCheck("csv")} className="rounded-lg border border-emerald-300 bg-white px-2.5 py-1.5 font-bold text-emerald-800">CSV</button><button type="button" onClick={printSelfCheckReport} className="rounded-lg border border-emerald-300 bg-white px-2.5 py-1.5 font-bold text-emerald-800">인쇄/PDF</button></> : null}<input ref={selfCheckBackupInput} type="file" accept="application/json,.json" aria-label="자체 점검 백업 파일 선택" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importSelfCheck(file); }} /><button type="button" onClick={() => selfCheckBackupInput.current?.click()} className="rounded-lg border border-emerald-300 bg-white px-2.5 py-1.5 font-bold text-emerald-800">JSON 복원</button></div>{selfCheckRunning ? <div className="rounded-lg border border-emerald-300 bg-white px-2 py-1.5"><div className="flex items-center justify-between"><span className="font-bold">{Math.round(progressPercent)}%</span><button type="button" onClick={requestCancel} className="rounded-md bg-emerald-700 px-2 py-1 font-bold text-white">취소</button></div><p>{progressText}</p></div> : null}{selfCheckNotice ? <p role="status" className="rounded-lg border border-emerald-200 bg-white px-2 py-1.5">{selfCheckNotice}</p> : null}{selfCheckReport ? <><p className="font-bold">요약 · 전체 {selfCheckReport.counts.total} · PASS {selfCheckReport.counts.pass} · FAIL {selfCheckReport.counts.fail} · SKIPPED {selfCheckReport.counts.skipped}</p><p>실행 시각 {selfCheckReport.executedAt} · 엔진 {selfCheckReport.versions.engineVersion} · 앱 {selfCheckReport.versions.appVersion}</p>{selfCheckReport.changed ? <p className="rounded-lg border border-amber-300 bg-amber-50 px-2 py-1.5 font-bold text-amber-900">기준 또는 버전 변경 감지: {selfCheckReport.changes.join(", ")} · 자체 점검을 다시 실행하세요.</p> : null}<div className="max-h-72 overflow-auto rounded-lg border border-emerald-200 bg-white"><table className="min-w-[42rem] w-full text-left text-[11px]"><thead><tr className="border-b border-emerald-100"><th className="px-2 py-1.5">케이스</th><th className="px-2 py-1.5">상태</th><th className="px-2 py-1.5">실제 결과</th><th className="px-2 py-1.5">기대 결과</th><th className="px-2 py-1.5">실패 항목</th></tr></thead><tbody>{selfCheckReport.checks.map((item) => <tr key={item.name} className="border-b border-emerald-50"><td className="px-2 py-1.5">{item.name}</td><td className={`px-2 py-1.5 font-bold ${item.status === "PASS" ? "text-emerald-700" : item.status === "FAIL" ? "text-rose-700" : "text-amber-700"}`}>{item.status}</td><td className="max-w-[14rem] px-2 py-1.5 font-mono break-words">{JSON.stringify(item.actual)}</td><td className="max-w-[14rem] px-2 py-1.5 font-mono break-words">{JSON.stringify(item.expected)}</td><td className="px-2 py-1.5">{item.failedFields.join(", ") || "없음"}</td></tr>)}</tbody></table></div><p className="text-[11px]">{selfCheckReport.note}</p></> : <p>아직 실행하지 않음 · 저장된 자체 점검 결과가 있으면 복원되어 표시됩니다.</p>}</div></details>
        </aside>
        <section className="order-1 min-w-0 xl:order-2">{errorMessage ? <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-800">
<p className="font-bold">입력을 확인하세요</p>
<p>{errorMessage}</p>
</div> : null}{!search ? <div className="grid min-h-[620px] place-items-center rounded-3xl border border-dashed border-slate-300 bg-white/60 p-8 text-center">
<div>
<div className="mx-auto grid size-16 place-items-center rounded-2xl bg-cyan-100 text-3xl">⌁</div>
<h2 className="mt-5 text-xl font-bold text-slate-950">후보 계산을 시작하세요</h2>
<p className="mt-2 max-w-md text-sm leading-6 text-slate-500">기본 데모 입력은 KNSB coarse 기준 케이스입니다. 탐색을 실행하면 실제 Data and Kn → Pressure → Blowdown → Performance 결과가 표시됩니다.</p>
</div>
</div> : <div className="space-y-6">
<div className="rounded-3xl border border-cyan-200 bg-gradient-to-br from-cyan-50 to-white p-4 shadow-sm sm:p-5"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-cyan-700">현재 계산 요약</p><h2 className="mt-1 text-lg font-bold text-slate-950">목표와 탐색 상태를 한눈에 확인하세요</h2></div><span className="rounded-full bg-slate-900 px-3 py-1 text-xs font-bold text-white">UI 단계 {completedStage}/4</span></div><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4"><div className="rounded-2xl bg-white px-3 py-3 shadow-sm"><p className="text-[11px] font-semibold text-slate-500">목표 질량</p><p className="mt-1 text-base font-bold text-slate-950">{formatNumber(config.targetFuelMassKg, 4)} <span className="text-xs font-normal text-slate-500">kg</span></p></div><div className="rounded-2xl bg-white px-3 py-3 shadow-sm"><p className="text-[11px] font-semibold text-slate-500">최대 허용 압력</p><p className="mt-1 text-base font-bold text-slate-950">{formatNumber(config.maximumPressureMpa, 3)} <span className="text-xs font-normal text-slate-500">MPa</span></p></div><div className="rounded-2xl bg-white px-3 py-3 shadow-sm"><p className="text-[11px] font-semibold text-slate-500">목표 평균 추력</p><p className="mt-1 text-base font-bold text-slate-950">{targetThrustText.trim() === "" ? "미입력" : `${formatNumber(Number(targetThrustText), 2)} N`}</p></div><div className="rounded-2xl bg-white px-3 py-3 shadow-sm"><p className="text-[11px] font-semibold text-slate-500">자동 확장 단계</p><p className="mt-1 text-base font-bold text-violet-700">{search ? `${search.automaticExpansionStage ?? 0}단계` : "대기"}</p></div></div><p className="mt-3 text-[11px] text-slate-600">질량 계산은 형상·연료 밀도·세그먼트로 산출하고, 압력은 산출된 후보의 최대 압력을 허용값과 비교합니다. UI 단계는 질량 → 압력 → 추력(입력 시) → 최종 판정이며, 자동 확장 단계는 탐색 범위 확장 횟수입니다. 결과의 질량 값은 계산된 후보별 연료 질량이고, 압력 판정은 각 후보의 최대 압력과 허용 압력의 비교 결과입니다.</p></div>
<p className="-mt-4 rounded-xl border border-cyan-100 bg-white px-3 py-2 text-xs text-slate-700">결과에 적용된 질량 허용 오차: <strong className="font-mono text-slate-950">{formatMassTolerance(config.fuelMassToleranceKg)}</strong></p>
{search.metadata ? <details className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700"><summary className="cursor-pointer font-bold text-slate-900">계산 재현 정보</summary><div className="mt-2 grid gap-1 sm:grid-cols-2"><span>엔진 버전: <b>{search.metadata.engineVersion}</b></span><span>앱 버전: <b>{search.metadata.appVersion}</b></span><span>계산 시각: <b>{search.metadata.calculatedAt}</b></span><span>이번 계산: <b>{search.metadata.status === "completed" ? "완료" : search.metadata.status}</b></span><span>기준 예시: <b>{search.metadata.baselineVersion}</b></span><span>GSRM 기준: <b>{search.metadata.gsrmReferenceVersion}</b></span><span>AN 카탈로그: <b>{search.metadata.anCatalogItemCount}개 · {search.metadata.anCatalogVersion}</b></span><span>탐색 모드: <b>{search.metadata.searchMode}</b></span></div></details> : null}
{search ? <details className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-xs text-violet-950"><summary className="cursor-pointer font-bold">설계 검토 리포트</summary><div className="mt-2 space-y-1 leading-5"><p><b>이번 계산:</b> {lastCalculationStatus === "completed" ? "완료" : lastCalculationStatus === "cancelled" ? "취소" : lastCalculationStatus === "failed" ? "실패" : "확인 필요"}</p><p><b>배포 전 기준 검산:</b> 통과</p><p><b>현재 결과에 대한 별도 fixture 재검산:</b> 실행하지 않음</p><p>이 화면과 내보내기에는 입력 조건, 탐색 범위, 후보 판정, GSRM·AN 요약과 검산 대상 fixture 목록이 함께 기록됩니다.</p><p>자동 탐색은 전역 최적해를 보장하지 않으며, 결과는 실제 제작·점화 승인용이 아닌 교육·설계 검토용입니다.</p><p>검산 fixture: {VALIDATION_FIXTURES.length}개 · 현재 결과를 PASS로 간주하지 않음</p></div></details> : null}
{targetThrustText.trim() === "" ? <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">추력 목표가 비어 있어 MSE·최대 편차·추력 변동성·추력 점수는 계산하지 않습니다.</p> : null}
{activeValidationComparisons.length ? <div className="mb-3 rounded-2xl border border-amber-200 bg-amber-50/50 px-4 py-3 text-xs text-amber-950"><p className="font-bold">누적 비교 요약 · 연결 기록 {activeValidationComparisons.length}개</p><p className="mt-1">{activeValidationComparisons.length === 1 ? "현재 표본은 1개입니다." : `현재 표본은 ${activeValidationComparisons.length}개이며, 기록 수가 모델의 일반적 신뢰성·안전성·제작 가능성을 자동으로 판정하지 않습니다.`}</p><div className="mt-2 overflow-x-auto"><table className="min-w-[680px] w-full text-left text-[11px]"><thead><tr className="border-b border-amber-200"><th className="px-2 py-1.5">항목</th><th className="px-2 py-1.5">예측값</th>{activeValidationComparisons.map(({ record }) => <th key={record.id} className="px-2 py-1.5">{record.name}</th>)}</tr></thead><tbody>{cumulativeValidationComparisons.map((row) => <tr key={row.key} className="border-b border-amber-100"><td className="px-2 py-1.5 font-semibold">{row.label} ({row.unit})</td><td className="px-2 py-1.5">{row.predicted == null ? "비교 불가" : formatNumber(row.predicted, 4)}</td>{row.values.map(({ record, comparison: item }) => <td key={record.id} className="px-2 py-1.5">{item.measured == null ? "비교 불가" : `${formatNumber(item.measured, 4)} · ${item.status === "within" ? "범위 내" : item.status === "outside" ? "범위 밖" : item.status === "tolerance-unset" ? "허용 오차 미입력" : "비교 불가"}`}<br /><span className="text-slate-600">차이 {item.absoluteDifference == null ? "비교 불가" : formatNumber(item.absoluteDifference, 4)}</span></td>)}</tr>)}</tbody></table></div>{activeValidationWarnings.map(({ record, warnings }) => warnings.length ? <p key={record.id} className="mt-2 rounded-lg border border-amber-300 bg-white px-2 py-1.5">{record.name} 품질 경고: {warnings.map((warning) => VALIDATION_WARNING_LABELS[warning]).join(" · ")}</p> : null)}<p className="mt-2">누적 비교는 모델과 측정 결과의 차이를 기록하는 기능이며, 측정 데이터의 품질과 출처는 사용자가 확인해야 합니다.</p></div> : null}
{restoredFromStorage && !search ? <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs text-sky-900" role="status">저장된 입력값을 복원했습니다. 마지막 계산 결과는 현재 화면에 없으므로 다시 계산해 주세요.</div> : null}
{validationTargetRecords.length ? <div className="mb-3 rounded-xl border border-amber-200 bg-white px-3 py-2 text-xs"><label className="font-semibold text-slate-700">검증 데이터 수정 대상<select aria-label="검증 데이터 수정 대상" className="ml-2 rounded-md border border-slate-200 px-2 py-1" value={editingValidationId ?? ""} onChange={(event) => { const record = validationTargetRecords.find((item) => item.id === event.target.value); if (record) editExternalValidation(record); }}><option value="">선택</option>{validationTargetRecords.map((record) => <option key={record.id} value={record.id}>{record.name}</option>)}</select></label>{editingValidationId ? <><span className="ml-2 text-amber-800">수정 중 · 저장 버튼으로 반영합니다.</span><button type="button" onClick={resetValidationForm} className="ml-2 rounded-md border border-slate-300 px-2 py-1 text-slate-700">수정 취소</button></> : null}</div> : null}
{search && calculatedSignature !== inputSignature ? <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 px-4 py-3 text-xs text-amber-950" role="alert"><strong>재계산 필요</strong> · 입력값이 마지막 계산 결과와 달라졌습니다.</div> : null}
<details className="mb-3 rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-xs text-slate-700"><summary className="cursor-pointer font-bold text-slate-900">모델 가정과 한계</summary><div className="mt-2 space-y-2 leading-5"><p><b>검증 수준:</b> 기준 모델 재현 {BASELINE_REPRODUCTION_STATUS} · 계산 재현성 {DETERMINISTIC_CALCULATION_STATUS} · 하드웨어 시험 검증 {HARDWARE_VALIDATION_STATUS} · 제작 승인 {PRODUCTION_APPROVAL_STATUS}</p><p><b>엔진·데이터:</b> {CALCULATION_ENGINE_VERSION} · {BASELINE_VERSION} · {GSRM_REFERENCE_VERSION} · {AN_CATALOG_VERSION}</p><ul className="list-disc pl-5">{MODEL_ASSUMPTIONS.map((item) => <li key={item}>{item}</li>)}</ul><ul className="list-disc pl-5">{MODEL_LIMITATIONS.map((item) => <li key={item}>{item}</li>)}</ul><p className="font-semibold text-amber-800">실제 제작·점화 승인용이 아니며, 실제 시험 데이터가 등록되지 않았습니다.</p></div></details>
<div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
<div>
<p className="text-sm font-bold text-slate-950">탐색 결과</p>
<p className="mt-1 text-xs text-slate-500">전체 {search.totalCombinations.toLocaleString()}개 · 정밀 계산 전 형상 제외 {(search.prevalidationRejectedCount ?? search.rejectedByValidation).toLocaleString()}개 · 질량 상한 제외 {(search.massFilteredCount ?? 0).toLocaleString()}개 · 질량 계산 {(search.prefilteredCandidateCount ?? search.totalCombinations).toLocaleString()}개 · 정밀 계산 {search.evaluatedCombinations.toLocaleString()}개 · 정밀 검증 탈락 {(search.precisionValidationRejectedCount ?? 0).toLocaleString()}개 · 추천 {search.candidates.filter((candidate) => candidate.status === "pass").length}개 · 조건부 {search.candidates.filter((candidate) => candidate.status === "conditional").length}개 · 탈락 {search.candidates.filter((candidate) => candidate.status === "fail").length}개 · 계산 실패 {search.calculationFailures.toLocaleString()}개</p>
<p className="mt-1 text-[11px] text-slate-500">단계 {completedStage}/4 완료 · 자동 확장 {search.automaticExpansionStage ?? 0}단계 · 현재 범위 {search.searchEnvelope ? `챔버 ${search.searchEnvelope.chamberDiameterMm}×${search.searchEnvelope.chamberLengthMm} mm, Do ${search.searchEnvelope.outerDiameterMm.min}~${search.searchEnvelope.outerDiameterMm.max}, do ${search.searchEnvelope.coreDiameterMm.min}~${search.searchEnvelope.coreDiameterMm.max}, Lo ${search.searchEnvelope.segmentLengthMm.min}~${search.searchEnvelope.segmentLengthMm.max}, 세그먼트 ${search.searchEnvelope.segmentCount.min}~${search.searchEnvelope.segmentCount.max}` : "상세 설정 범위"}</p>
</div>
<div className="flex flex-wrap gap-2 text-xs">
<span className="rounded-full bg-emerald-100 px-2.5 py-1 font-bold text-emerald-700">추천 {candidateCounts.pass}</span>
<span className="rounded-full bg-cyan-100 px-2.5 py-1 font-bold text-cyan-700">조건부 {candidateCounts.conditional}</span>
<span className="rounded-full bg-violet-100 px-2.5 py-1 font-bold text-violet-700">참고용 탈락 {referenceCandidate ? 1 : 0}</span>
<span className="rounded-full bg-amber-100 px-2.5 py-1 font-bold text-amber-700">탈락 {candidateCounts.fail}</span>
</div>
</div>
{(selected ?? closestFailedCandidate) ? <div data-testid="representative-candidate" className="rounded-2xl border-2 border-cyan-200 bg-white p-4 shadow-sm"><div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-cyan-700">대표 후보 요약</p><p className="mt-1 text-lg font-bold text-slate-950">{(selected ?? closestFailedCandidate)!.input.grainOuterDiameterMm} × {(selected ?? closestFailedCandidate)!.input.grainCoreDiameterMm} × {(selected ?? closestFailedCandidate)!.input.segmentLengthMm} / {(selected ?? closestFailedCandidate)!.input.segmentCount}</p></div><StatusPill status={(selected ?? closestFailedCandidate)!.status} reference={!hasValidCandidate} /></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4"><span className="rounded-xl bg-slate-50 px-3 py-2"><strong className="block text-slate-500">질량</strong><b className="font-mono text-slate-950">{formatNumber((selected ?? closestFailedCandidate)!.grainMassKg, 4)} kg</b></span><span className="rounded-xl bg-slate-50 px-3 py-2"><strong className="block text-slate-500">최대 압력</strong><b className="font-mono text-slate-950">{formatNumber((selected ?? closestFailedCandidate)!.maximumPressureMpa, 4)} MPa</b></span><span className="rounded-xl bg-slate-50 px-3 py-2"><strong className="block text-slate-500">연소 시간</strong><b className="font-mono text-slate-950">{formatNumber((selected ?? closestFailedCandidate)!.burnTimeSec, 4)} s</b></span><span className="rounded-xl bg-slate-50 px-3 py-2"><strong className="block text-slate-500">평균 추력</strong><b className="font-mono text-slate-950">{formatNumber((selected ?? closestFailedCandidate)!.averageThrustN, 2)} N</b></span></div><p className="mt-3 text-xs leading-5 text-slate-600">판정 이유: {(selected ?? closestFailedCandidate)!.reasons.join(" ") || "모든 기본 조건을 충족했습니다."}</p><p className="mt-1 text-xs font-semibold text-cyan-800">다음 확인: {candidateNextCheck((selected ?? closestFailedCandidate)!)}</p>{!hasValidCandidate ? <p className="mt-2 rounded-lg bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-900">추천 후보가 없어 목표 질량에 가장 가까운 탈락 후보를 참고용으로 표시합니다.</p> : null}</div> : null}
<div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-700" aria-label="후보 상태 정의"><p className="font-bold text-slate-900">후보 상태 정의</p><div className="mt-2 grid gap-2 sm:grid-cols-2"><span><b className="text-emerald-700">추천</b> · 질량·압력 등 기본 조건을 만족</span><span><b className="text-cyan-700">조건부</b> · 일부 조건 확인이 필요한 후보</span><span><b className="text-violet-700">참고용 탈락</b> · 추천·조건부가 모두 없을 때만 가장 가까운 탈락 후보 1개를 참고로 표시</span><span><b className="text-amber-700">탈락</b> · 하나 이상의 조건을 초과</span></div></div>
{search.candidates.length > 0 && !hasPassCandidate && candidateCounts.conditional > 0 ? <div className="rounded-2xl border-2 border-cyan-300 bg-cyan-50 px-4 py-4 text-sm leading-6 text-cyan-950"><p className="font-bold text-base">추천 후보 없음 · 조건부 후보를 확인하세요</p><p className="mt-1">조건부 후보는 추천으로 승격되지 않으며, 미충족 조건과 다음 확인 항목을 상세 보기에서 확인해야 합니다.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => conditionalCandidate && openCandidateDetails(conditionalCandidate)} className="rounded-lg bg-cyan-700 px-3 py-2 text-xs font-bold text-white">조건부 후보 상세 보기</button><button type="button" onClick={() => closestFailedCandidate && openCandidateDetails(closestFailedCandidate)} disabled={!closestFailedCandidate} className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-900 disabled:opacity-50">가장 가까운 후보 보기</button><button type="button" onClick={() => { setAutomaticMode(false); setDetailsOpen(true); }} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-800">허용 오차 확인·상세 설정</button><button type="button" onClick={() => runSearch(3)} disabled={running} className="rounded-lg border border-cyan-400 bg-white px-3 py-2 text-xs font-bold text-cyan-900 disabled:opacity-50">현재 입력으로 재계산</button></div></div> : null}
{search.candidates.length > 0 && !search.candidates.some((candidate) => candidate.status !== "fail") ? <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-950"><p className="font-bold text-base">유효한 추천 후보 없음</p><p className="mt-1">추천·조건부 후보가 없어 참고용 탈락 후보만 표시합니다.</p><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => { setAutomaticMode(false); setDetailsOpen(true); }} className="rounded-lg border border-amber-400 bg-white px-3 py-2 text-xs font-bold text-amber-900">허용 오차 조정</button><button type="button" onClick={() => closestFailedCandidate && openCandidateDetails(closestFailedCandidate)} disabled={!closestFailedCandidate} className="rounded-lg border border-violet-300 bg-violet-50 px-3 py-2 text-xs font-bold text-violet-900 disabled:opacity-50">가장 가까운 후보 보기</button><button type="button" onClick={() => { setAutomaticMode(false); setDetailsOpen(true); }} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-800">상세 설정 열기</button><button type="button" onClick={() => runSearch(3)} disabled={running} className="rounded-lg bg-amber-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-50">다시 계산</button></div></div> : null}{search.warning ? <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">⚠ {search.warning}</div> : null}{search.candidates.length === 0 ? <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-900">
<p className="font-bold">{search.diagnosis ?? "조건을 만족한 후보가 없습니다."}</p>
<p className="mt-1">자동 탐색 범위, 질량 오차, 압력 제한과 목표 추력 조건을 확인하고 상세 설정에서 허용 오차를 조정해보세요.</p>
</div> : null}<div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs leading-5 text-slate-600">
{search.candidates.length > 0 && !search.candidates.some((candidate) => candidate.status !== "fail") && closestFailedCandidate ? <div className="mb-3 rounded-2xl border border-violet-200 bg-violet-50 px-3 py-3 text-violet-950"><div className="flex items-center gap-2"><StatusPill status="fail" reference /><span className="font-bold">참고용 탈락 후보</span></div><p className="mt-1 text-xs">추천 후보가 아니며, 목표 질량에 가장 가까운 탈락 후보입니다.</p><p className="mt-2 font-semibold">Do {closestFailedCandidate.input.grainOuterDiameterMm} × do {closestFailedCandidate.input.grainCoreDiameterMm} × Lo {closestFailedCandidate.input.segmentLengthMm} / {closestFailedCandidate.input.segmentCount} · {formatNumber(closestFailedCandidate.grainMassKg, 4)} kg · {closestFailedCandidate.reasons.join(" ")}</p><button type="button" aria-label="참고용 탈락 후보 상세 보기" onClick={() => openCandidateDetails(closestFailedCandidate)} className="mt-3 rounded-lg bg-violet-700 px-3 py-2 text-xs font-bold text-white hover:bg-violet-800 focus:outline-none focus:ring-2 focus:ring-violet-500">상세 보기</button></div> : null}
<details className="mb-3 rounded-2xl border border-fuchsia-200 bg-fuchsia-50/60 px-4 py-3"><summary className="cursor-pointer font-bold text-fuchsia-950">민감도 비교 · what-if 시나리오</summary><div className="mt-3 space-y-3 text-xs text-fuchsia-950"><p>기준 결과를 보존한 채 사용자가 지정한 값만 바꾸어 기존 계산 엔진으로 독립 계산합니다. 민감도 결과는 what-if 비교이며 전역 최적해·안전·제작 가능 판정을 의미하지 않습니다.</p><div className="grid gap-2 sm:grid-cols-4"><label>변경 대상<select aria-label="민감도 변경 대상" value={sensitivityField} onChange={(event) => setSensitivityField(event.target.value as SensitivityField)} className="mt-1 w-full rounded-lg border border-fuchsia-200 bg-white px-2 py-1.5"><option value="targetFuelMassKg">목표 질량 (kg)</option><option value="maximumPressureMpa">최대 허용 압력 (MPa)</option><option value="targetAverageThrustN">목표 평균 추력 (N, blank=미입력)</option><option value="outerDiameterMm">Do 범위 (mm)</option><option value="coreDiameterMm">do 범위 (mm)</option><option value="segmentLengthMm">Lo 범위 (mm)</option><option value="segmentCount">세그먼트 수</option></select></label><label>시나리오 이름<input aria-label="민감도 시나리오 이름" value={sensitivityName} onChange={(event) => setSensitivityName(event.target.value)} placeholder="선택" className="mt-1 w-full rounded-lg border border-fuchsia-200 bg-white px-2 py-1.5" /></label><label>낮은 값<input aria-label="민감도 낮은 값" value={sensitivityLow} onChange={(event) => setSensitivityLow(event.target.value)} placeholder="예: 1.8" className="mt-1 w-full rounded-lg border border-fuchsia-200 bg-white px-2 py-1.5" /></label><label>높은 값<input aria-label="민감도 높은 값" value={sensitivityHigh} onChange={(event) => setSensitivityHigh(event.target.value)} placeholder="예: 2.2" className="mt-1 w-full rounded-lg border border-fuchsia-200 bg-white px-2 py-1.5" /></label></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => void addSensitivityScenario()} disabled={sensitivityRunning || !search} className="rounded-lg bg-fuchsia-700 px-3 py-1.5 font-bold text-white disabled:opacity-50">시나리오 계산</button><button type="button" onClick={exportSensitivityBackup} className="rounded-lg border border-fuchsia-300 bg-white px-3 py-1.5 font-bold text-fuchsia-900">민감도 백업</button><input ref={sensitivityBackupInput} type="file" accept="application/json,.json" aria-label="민감도 백업 파일 선택" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importSensitivityBackup(file); }} /><button type="button" onClick={() => sensitivityBackupInput.current?.click()} className="rounded-lg border border-fuchsia-300 bg-white px-3 py-1.5 font-bold text-fuchsia-900">민감도 복원</button></div>{sensitivityRunning ? <div className="rounded-lg border border-fuchsia-300 bg-white px-3 py-2"><div className="flex items-center justify-between"><span className="font-bold">민감도 계산 중 · {Math.round(progressPercent)}%</span><button type="button" onClick={requestCancel} className="rounded-md bg-fuchsia-700 px-2 py-1 font-bold text-white">민감도 계산 취소</button></div><p className="mt-1">{progressText}</p></div> : null}{sensitivityNotice ? <p role="status" className="rounded-lg border border-fuchsia-200 bg-white px-2 py-1.5">{sensitivityNotice}</p> : null}{sensitivityScenarios.length ? <div className="overflow-x-auto rounded-xl border border-fuchsia-200 bg-white"><table className="min-w-[850px] w-full text-left text-[11px]"><thead><tr className="border-b border-fuchsia-100"><th className="px-2 py-2">시나리오·입력 변화</th><th className="px-2 py-2">상태</th><th className="px-2 py-2">후보/정밀/확장</th><th className="px-2 py-2">추천·조건부·참고·탈락</th><th className="px-2 py-2">대표 후보·질량</th><th className="px-2 py-2">압력·시간·추력</th><th className="px-2 py-2">GSRM B·AN</th><th className="px-2 py-2">관리</th></tr></thead><tbody>{sensitivityScenarios.map((scenario) => <tr key={scenario.id} className="border-b border-fuchsia-50 align-top"><td className="px-2 py-2 font-bold">{scenario.name}<br /><span className="font-normal">{scenario.changeDescription}</span></td><td className="px-2 py-2 font-bold">{scenario.status === "completed" ? "완료" : scenario.status === "cancelled" ? "취소" : "실패"}{scenario.error ? <><br /><span className="font-normal text-rose-700">{scenario.error}</span></> : null}</td><td className="px-2 py-2">{scenario.result ? `${scenario.result.totalCombinations.toLocaleString()} / ${scenario.result.evaluatedCombinations.toLocaleString()} / ${scenario.result.automaticExpansionStage}단계` : "-"}</td><td className="px-2 py-2">{scenario.result ? `${scenario.result.counts.recommend} · ${scenario.result.counts.conditional} · ${scenario.result.counts.referenceRejected} · ${scenario.result.counts.rejected}` : "-"}</td><td className="px-2 py-2">{scenario.result?.representativeCandidate ? `${scenario.result.representativeCandidate.geometry} · ${formatNumber(Number(scenario.result.representativeCandidate.massKg), 4)} kg` : "없음"}</td><td className="px-2 py-2">{scenario.result?.representativeCandidate ? `${formatNumber(Number(scenario.result.representativeCandidate.maximumPressureMpa), 4)} MPa · ${formatNumber(Number(scenario.result.representativeCandidate.burnTimeSec), 4)} s · ${formatNumber(Number(scenario.result.representativeCandidate.averageThrustN), 2)} N` : "-"}</td><td className="px-2 py-2">{scenario.result ? `${scenario.result.gsrmB == null ? "-" : `${formatNumber(scenario.result.gsrmB, 2)} mm`} · ${scenario.result.an.total}개 (${scenario.result.an.recommend}/${scenario.result.an.conditional}/${scenario.result.an.fail})` : "-"}</td><td className="px-2 py-2"><button type="button" onClick={() => setSensitivityScenarios((current) => current.filter((item) => item.id !== scenario.id))} className="rounded-md border border-rose-200 px-2 py-1 text-rose-700">삭제</button></td></tr>)}</tbody></table></div> : <p className="rounded-lg border border-fuchsia-200 bg-white px-2 py-2">아직 비교 시나리오가 없습니다. 기준 결과를 계산한 뒤 낮은 값·높은 값을 직접 입력하세요.</p>}</div></details>
<p className="font-bold text-slate-900">점수 기준 안내</p>
<p className="mt-1">{SCORE_GUIDANCE}</p>
<p className="mt-1 text-slate-500">질량 오차와 압력 제한을 기본으로 평가하고, 목표 추력 입력 시 추력 곡선 오차를 추가합니다.</p>
</div>
<div className="rounded-2xl border border-cyan-100 bg-cyan-50/50 px-4 py-3"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><p className="font-bold text-slate-900">후보 필터·비교·내보내기</p><p className="mt-1 text-[11px] text-slate-600">상태 필터를 선택하고 후보 행의 비교 버튼으로 최대 3개까지 비교하세요.</p></div><div className="flex flex-wrap gap-2" role="group" aria-label="후보 상태 필터">{([['pass','추천'],['conditional','조건부'],['fail','탈락']] as const).map(([value,label]) => <label key={value} className="flex items-center gap-1 rounded-lg bg-white px-2 py-1.5 text-xs"><input type="checkbox" checked={statusFilters.includes(value)} onChange={() => setStatusFilters((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])} />{label}</label>)}</div><div className="flex gap-2"><button type="button" onClick={() => downloadExport("csv")} className="rounded-lg border border-cyan-300 bg-white px-3 py-1.5 text-xs font-bold text-cyan-800 focus:outline-none focus:ring-2 focus:ring-cyan-500">CSV 내보내기</button><button type="button" onClick={() => downloadExport("json")} className="rounded-lg bg-cyan-700 px-3 py-1.5 text-xs font-bold text-white focus:outline-none focus:ring-2 focus:ring-cyan-500">JSON 내보내기</button></div></div><p className="mt-2 text-[11px] text-slate-600">현재 표시 후보 {visibleCandidates.length.toLocaleString()}개 · 비교 {comparison.length}/3</p></div>
<details className="rounded-2xl border border-violet-200 bg-violet-50/50 px-4 py-3"><summary className="cursor-pointer font-bold text-slate-900">계산 결과 이력</summary><div className="mt-3"><p className="text-[11px] text-slate-600">서버로 전송하지 않고 이 브라우저에 최대 {MAX_SAVED_RESULTS}개까지 저장합니다. 백업 파일에도 계산 결과와 버전 정보가 포함됩니다.</p><div className="mt-3 flex flex-wrap items-center gap-2"><input aria-label="저장 결과 이름" value={saveName} onChange={(event) => setSaveName(event.target.value)} placeholder="저장 이름(선택)" className="w-40 rounded-lg border border-violet-200 bg-white px-2 py-1.5 text-xs" /><button type="button" onClick={saveCurrentResult} className="rounded-lg bg-violet-700 px-3 py-1.5 text-xs font-bold text-white">현재 결과 저장</button><button type="button" onClick={exportHistoryBackup} className="rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-xs font-bold text-violet-800">전체 이력 JSON 백업</button><input ref={backupFileInput} type="file" accept="application/json,.json" className="sr-only" aria-label="계산 결과 백업 파일 선택" onChange={(event) => { const file = event.target.files?.[0]; if (file) void inspectHistoryBackup(file); }} /><button type="button" onClick={() => backupFileInput.current?.click()} className="rounded-lg border border-violet-300 bg-white px-3 py-1.5 text-xs font-bold text-violet-800">백업 JSON 불러오기</button></div>{historyNotice ? <p className="mt-2 rounded-lg bg-white px-2 py-1.5 text-[11px] text-violet-900" role="status">{historyNotice}</p> : null}{pendingImport ? <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900"><p>{pendingImport.versionMismatch ? "버전이 다른 결과가 포함되어 있습니다. 계산 결과를 덮어쓰지 않으며, 저장 이력으로만 복원합니다." : "백업 파일을 확인했습니다. 기존 이력을 어떻게 처리할지 선택하세요."}</p><div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => applyHistoryImport(false)} className="rounded-md bg-amber-700 px-2 py-1 font-bold text-white">기존 이력에 추가</button><button type="button" onClick={() => { if (window.confirm("현재 저장 이력을 백업 내용으로 교체할까요?")) applyHistoryImport(true); }} className="rounded-md border border-amber-400 bg-white px-2 py-1 font-bold text-amber-900">전체 교체</button><button type="button" onClick={() => setPendingImport(null)} className="rounded-md border border-slate-300 bg-white px-2 py-1">취소</button></div></div> : null}{savedResults.length ? <div className="mt-3 space-y-2">{savedResults.map((item) => { const versionMismatch = item.payload.metadata?.engineVersion !== CALCULATION_ENGINE_VERSION || item.payload.metadata?.appVersion !== APP_VERSION || item.payload.metadata?.baselineVersion !== BASELINE_VERSION || item.payload.metadata?.gsrmReferenceVersion !== GSRM_REFERENCE_VERSION || item.payload.metadata?.anCatalogVersion !== AN_CATALOG_VERSION; return <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-violet-100 bg-white px-3 py-2 text-xs"><div><p className="font-bold text-slate-900">{item.name}</p><p className="text-[11px] text-slate-500">{new Date(item.savedAt).toLocaleString("ko-KR")} · 후보 {item.payload.search?.totalCombinations?.toLocaleString?.() ?? "-"}개 {versionMismatch ? "· 버전 불일치" : ""}</p></div><div className="flex flex-wrap gap-1.5"><button type="button" onClick={() => loadSavedResult(item)} className="rounded-md border border-violet-200 px-2 py-1 font-semibold text-violet-800">불러오기</button><button type="button" onClick={() => downloadExport("json", item.payload)} className="rounded-md border border-slate-200 px-2 py-1">JSON</button><button type="button" onClick={() => downloadExport("csv", item.payload)} className="rounded-md border border-slate-200 px-2 py-1">CSV</button><button type="button" onClick={() => renameSavedResult(item.id)} className="rounded-md border border-slate-200 px-2 py-1">이름 변경</button><button type="button" onClick={() => deleteSavedResult(item.id)} className="rounded-md border border-rose-200 px-2 py-1 text-rose-700">삭제</button></div></div>})}</div> : <p className="mt-3 text-[11px] text-slate-500">저장된 계산 결과가 없습니다.</p>}<div className="mt-3 flex flex-wrap items-center gap-2"><span className="text-[11px] font-semibold text-slate-600">저장 결과 비교</span><select aria-label="비교 결과 1" value={comparisonResultIds[0]} onChange={(event) => setComparisonResultIds((current) => [event.target.value, current[1]])} className="rounded-lg border border-violet-200 bg-white px-2 py-1.5 text-xs"><option value="">첫 결과 선택</option>{savedResults.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select aria-label="비교 결과 2" value={comparisonResultIds[1]} onChange={(event) => setComparisonResultIds(([first]) => [first, event.target.value])} className="rounded-lg border border-violet-200 bg-white px-2 py-1.5 text-xs"><option value="">둘째 결과 선택</option>{savedResults.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div>{comparisonResultIds[0] && comparisonResultIds[1] ? <SavedComparison first={savedResults.find((item) => item.id === comparisonResultIds[0])!} second={savedResults.find((item) => item.id === comparisonResultIds[1])!} /> : null}</div></details>
{comparison.length > 0 ? <div className="rounded-2xl border border-cyan-200 bg-white p-3"><p className="text-xs font-bold text-slate-900">선택 후보 비교 ({comparison.length}/3)</p><div className="mt-2 grid gap-2 sm:grid-cols-3">{comparison.map((candidate) => <div key={`${candidate.input.grainOuterDiameterMm}-${candidate.input.grainCoreDiameterMm}-${candidate.input.segmentLengthMm}-${candidate.input.segmentCount}`} className="rounded-xl border border-slate-200 p-3 text-[11px]"><div className="flex items-center justify-between gap-2"><strong>{candidate.input.grainOuterDiameterMm}×{candidate.input.grainCoreDiameterMm}×{candidate.input.segmentLengthMm}/{candidate.input.segmentCount}</strong><StatusPill status={candidate.status} /></div><p className="mt-2">질량 {formatNumber(candidate.grainMassKg,4)} kg</p><p>압력 {formatNumber(candidate.maximumPressureMpa,4)} MPa</p><p>연소 {formatNumber(candidate.burnTimeSec,4)} s</p><p>추력 {formatNumber(candidate.averageThrustN,2)} N</p><p className="mt-1 text-slate-500">{candidate.reasons.join(" ") || "조건 충족"}</p></div>)}</div></div> : null}
<details className="mt-3 rounded-2xl border border-amber-200 bg-amber-50/60 px-4 py-3"><summary className="cursor-pointer font-bold text-amber-950">외부 검증 데이터 비교</summary><div className="mt-3 space-y-3 text-xs"><p className="leading-5 text-amber-900">측정값과 계산값의 차이는 모델·입력·측정 조건의 차이를 포함할 수 있습니다. 단일 측정은 일반적 신뢰성을 증명하지 않으며, 비교 결과는 제작·점화 승인이나 안전 판정이 아닙니다. 데이터 품질과 출처는 사용자가 확인하세요.</p><div className="grid gap-2 sm:grid-cols-2"><label>검증 데이터 이름<input aria-label="검증 데이터 이름" value={validationName} onChange={(event) => setValidationName(event.target.value)} className="mt-1 w-full rounded-lg border border-amber-200 bg-white px-2 py-1.5" /></label><label>연결할 계산 결과<select aria-label="검증 데이터 계산 결과" value={validationCalculationId} onChange={(event) => setValidationCalculationId(event.target.value)} className="mt-1 w-full rounded-lg border border-amber-200 bg-white px-2 py-1.5"><option value="current">현재 계산 결과</option>{savedResults.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>데이터 출처 설명<input aria-label="검증 데이터 출처" value={validationSource} onChange={(event) => setValidationSource(event.target.value)} placeholder="예: 시험 기록 설명" className="mt-1 w-full rounded-lg border border-amber-200 bg-white px-2 py-1.5" /></label><label>데이터 버전/파일 식별자<input aria-label="검증 데이터 버전" value={validationDataVersion} onChange={(event) => setValidationDataVersion(event.target.value)} className="mt-1 w-full rounded-lg border border-amber-200 bg-white px-2 py-1.5" /></label></div><label className="block">측정 조건 메모<textarea aria-label="검증 데이터 조건 메모" value={validationConditions} onChange={(event) => setValidationConditions(event.target.value)} className="mt-1 min-h-16 w-full rounded-lg border border-amber-200 bg-white px-2 py-1.5" /></label><div className="overflow-x-auto rounded-xl border border-amber-200 bg-white"><table className="min-w-[620px] w-full text-left text-[11px]"><thead><tr className="border-b border-amber-100"><th className="px-2 py-2">항목</th><th className="px-2 py-2">측정값</th><th className="px-2 py-2">단위</th><th className="px-2 py-2">허용 오차(선택)</th></tr></thead><tbody>{VALIDATION_METRICS.map(({ key, label, unit }) => <tr key={key} className="border-b border-amber-50"><td className="px-2 py-2 font-semibold">{label}</td><td className="px-2 py-2"><input aria-label={`측정값 ${label}`} type="number" min="0" step="any" value={validationMeasured[key]} onChange={(event) => setValidationMeasured((current) => ({ ...current, [key]: event.target.value }))} className="w-28 rounded-md border border-slate-200 px-2 py-1" /></td><td className="px-2 py-2">{unit}</td><td className="px-2 py-2"><input aria-label={`허용 오차 ${label}`} type="number" min="0" step="any" value={validationTolerances[key]} onChange={(event) => setValidationTolerances((current) => ({ ...current, [key]: event.target.value }))} className="w-28 rounded-md border border-slate-200 px-2 py-1" /></td></tr>)}</tbody></table></div><div className="flex flex-wrap gap-2"><button type="button" onClick={saveExternalValidation} disabled={!search} className="rounded-lg bg-amber-700 px-3 py-1.5 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">검증 데이터 저장</button><button type="button" onClick={exportExternalValidationBackup} className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-bold text-amber-900">검증 데이터 JSON 백업</button><input ref={validationBackupInput} type="file" accept="application/json,.json" aria-label="검증 데이터 백업 파일 선택" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importExternalValidationBackup(file); }} /><button type="button" onClick={() => validationBackupInput.current?.click()} className="rounded-lg border border-amber-300 bg-white px-3 py-1.5 font-bold text-amber-900">검증 데이터 복원</button></div>{validationNotice ? <p role="status" className="rounded-lg border border-amber-200 bg-white px-2 py-1.5 text-amber-900">{validationNotice}</p> : null}{activeValidationComparisons.length ? <div className="space-y-3">{activeValidationComparisons.map(({ record, comparisons }) => <div key={record.id} className="rounded-xl border border-amber-200 bg-white p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-bold text-slate-900">{record.name}</p><button type="button" onClick={() => deleteExternalValidation(record.id)} className="rounded-md border border-rose-200 px-2 py-1 text-rose-700">삭제</button></div><p className="mt-1 text-[11px] text-slate-600">출처: {record.sourceDescription} · 기록: {new Date(record.recordedAt).toLocaleString("ko-KR")} · 버전: {record.dataVersion}</p><div className="mt-2 overflow-x-auto"><table className="min-w-[620px] w-full text-left text-[11px]"><thead><tr className="border-b border-slate-100"><th className="px-2 py-1.5">항목</th><th className="px-2 py-1.5">예측값</th><th className="px-2 py-1.5">측정값</th><th className="px-2 py-1.5">절대 차이</th><th className="px-2 py-1.5">상대 차이</th><th className="px-2 py-1.5">판정</th></tr></thead><tbody>{comparisons.map((item) => { const metric = VALIDATION_METRICS.find((entry) => entry.key === item.metric)!; const statusText = item.status === "within" ? "범위 내" : item.status === "outside" ? "범위 밖" : item.status === "tolerance-unset" ? "허용 오차 미입력" : "비교 불가"; return <tr key={item.metric} className="border-b border-slate-50"><td className="px-2 py-1.5 font-semibold">{metric.label}</td><td className="px-2 py-1.5">{item.predicted == null ? "비교 불가" : `${formatNumber(item.predicted, 4)} ${metric.unit}`}</td><td className="px-2 py-1.5">{item.measured == null ? "비교 불가" : `${formatNumber(item.measured, 4)} ${metric.unit}`}</td><td className="px-2 py-1.5">{item.absoluteDifference == null ? "비교 불가" : `${formatNumber(item.absoluteDifference, 4)} ${metric.unit}`}</td><td className="px-2 py-1.5">{item.relativeDifferencePercent == null ? "비교 불가" : `${formatNumber(item.relativeDifferencePercent, 2)}%`}</td><td className="px-2 py-1.5 font-bold">{statusText}</td></tr>; })}</tbody></table></div>{record.conditionsMemo ? <p className="mt-2 text-[11px] text-slate-600">조건 메모: {record.conditionsMemo}</p> : null}<p className="mt-2 text-[11px] text-amber-800">측정값은 계산 판정·추천·조건부 상태를 변경하지 않습니다.</p></div>)}</div> : <p className="text-[11px] text-slate-600">선택한 계산 결과에 연결된 외부 검증 데이터가 없습니다. 허용 오차를 입력하지 않으면 범위 판정을 하지 않습니다.</p>}</div></details>
{savedResults.length ? <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs"><span className="font-semibold text-slate-700">저장 결과 리포트</span><select aria-label="리포트 저장 결과 선택" value={reportResultId} onChange={(event) => setReportResultId(event.target.value)} className="rounded-lg border border-violet-200 px-2 py-1.5"><option value="">결과 선택</option>{savedResults.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button type="button" disabled={!reportResultId} onClick={() => { const item = savedResults.find((entry) => entry.id === reportResultId); if (item) printReviewReport(item.payload, item.payload.validation?.calculationStatus ?? "COMPLETED", `MotorFit 저장 결과 · ${item.name}`, setReportNotice); else setReportNotice("리포트 데이터 없음"); }} className="rounded-lg bg-violet-700 px-3 py-1.5 font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">인쇄 / PDF로 저장</button>{reportNotice ? <p role="status" className="basis-full rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs text-cyan-900">{reportNotice}</p> : null}</div> : null}
<div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
<div className="hidden overflow-x-auto sm:block">
<table className="w-full min-w-[900px] text-left text-xs">
<thead className="bg-slate-50 text-[11px] font-bold text-slate-500">
<tr>
<SortHeader label="상태" sortKey="status" activeKey={sortKey} direction={sortDirection} onSort={toggleSort} />
<th className="px-4 py-3">Do × do × Lo / 세그먼트</th>
<SortHeader label="질량" sortKey="mass" activeKey={sortKey} direction={sortDirection} onSort={toggleSort} />
<SortHeader label="최대압력" sortKey="pressure" activeKey={sortKey} direction={sortDirection} onSort={toggleSort} />
<SortHeader label="연소시간" sortKey="burnTime" activeKey={sortKey} direction={sortDirection} onSort={toggleSort} />
<SortHeader label="평균추력" sortKey="averageThrust" activeKey={sortKey} direction={sortDirection} onSort={toggleSort} />
<SortHeader label="점수" sortKey="score" activeKey={sortKey} direction={sortDirection} onSort={toggleSort} />
<th className="px-4 py-3">판정 이유</th>
<th className="px-4 py-3">상세</th>
<th className="px-4 py-3">비교</th>
</tr>
</thead>
<tbody className="divide-y divide-slate-100">{visibleCandidates.slice(0, 12).map((candidate) => <tr key={`${candidate.input.grainOuterDiameterMm}-${candidate.input.grainCoreDiameterMm}-${candidate.input.segmentLengthMm}-${candidate.input.segmentCount}`} onClick={() => { if (candidate.status !== "fail") setSelected(candidate); }} className={`transition ${candidate.status !== "fail" ? "cursor-pointer hover:bg-cyan-50" : "cursor-default opacity-75"} ${selected === candidate ? "bg-cyan-50" : ""}`}>
<td className="px-4 py-3">
<StatusPill status={candidate.status} reference={candidate === referenceCandidate} />
</td>
<td className="px-4 py-3 font-semibold text-slate-800">{candidate.input.grainOuterDiameterMm} × {candidate.input.grainCoreDiameterMm} × {candidate.input.segmentLengthMm} / {candidate.input.segmentCount}</td>
<td className="px-4 py-3 font-mono font-semibold text-slate-900">{formatNumber(candidate.grainMassKg, 4)} <span className="font-sans text-xs text-slate-700">kg</span></td>
<td className="px-4 py-3 font-mono font-semibold text-slate-900">{formatNumber(candidate.maximumPressureMpa, 4)} <span className="font-sans text-xs text-slate-700">MPa</span></td>
<td className="px-4 py-3 font-mono font-semibold text-slate-900">{formatNumber(candidate.burnTimeSec, 4)} <span className="font-sans text-xs text-slate-700">s</span></td>
<td className="px-4 py-3 font-mono font-semibold text-slate-900">{formatNumber(candidate.averageThrustN, 2)} <span className="font-sans text-xs text-slate-700">N</span></td>
<td className="px-4 py-3 font-mono font-black text-cyan-800">{formatNumber(candidate.score.totalScore, 1)}</td>
<td className="max-w-[260px] px-4 py-3 text-[11px] leading-4 text-slate-600">{candidate.reasons.join(" ") || "조건 충족"}<br /><span className="text-cyan-700">다음: {candidateNextCheck(candidate)}</span></td>
<td className="px-4 py-3"><button type="button" aria-label={`${candidate.input.grainOuterDiameterMm} ${candidate.input.grainCoreDiameterMm} ${candidate.input.segmentLengthMm} 상세 보기`} onClick={(event) => { event.stopPropagation(); openCandidateDetails(candidate); }} className="rounded-lg bg-cyan-700 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-cyan-800 focus:outline-none focus:ring-2 focus:ring-cyan-500">상세 보기</button></td>
<td className="px-4 py-3"><button type="button" aria-label="비교 후보 선택" onClick={(event) => { event.stopPropagation(); toggleComparison(candidate); }} className="rounded-lg border border-cyan-300 px-2 py-1 text-[11px] font-bold text-cyan-800 focus:outline-none focus:ring-2 focus:ring-cyan-500">{comparison.some((item) => item === candidate) ? "해제" : "비교"}</button></td>
</tr>)}</tbody>
</table>
</div>
<div className="divide-y divide-slate-100 sm:hidden">{visibleCandidates.slice(0, 8).map((candidate) => <div key={`${candidate.input.grainOuterDiameterMm}-${candidate.input.grainCoreDiameterMm}-${candidate.input.segmentLengthMm}-${candidate.input.segmentCount}`} className={`w-full p-4 ${candidate.status === "fail" ? "opacity-75" : ""}`}><button type="button" disabled={candidate.status === "fail"} onClick={() => setSelected(candidate)} className="block w-full text-left focus:outline-none focus:ring-2 focus:ring-cyan-500"><div className="flex items-center justify-between gap-3"><StatusPill status={candidate.status} reference={candidate === search.nearestRejectedCandidate} /><span className="font-bold text-slate-800">{candidate.input.grainOuterDiameterMm} × {candidate.input.grainCoreDiameterMm} × {candidate.input.segmentLengthMm} / {candidate.input.segmentCount}</span></div><div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-slate-500"><span>질량<br /><strong className="text-slate-800">{formatNumber(candidate.grainMassKg, 4)} kg</strong></span><span>최대압력<br /><strong className="text-slate-800">{formatNumber(candidate.maximumPressureMpa, 3)} MPa</strong></span><span>평균추력<br /><strong className="text-slate-800">{formatNumber(candidate.averageThrustN, 1)} N</strong></span></div></button><div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => openCandidateDetails(candidate)} className="rounded-lg bg-cyan-700 px-2 py-1 text-[11px] font-bold text-white focus:outline-none focus:ring-2 focus:ring-cyan-500">상세 보기</button><button type="button" onClick={() => toggleComparison(candidate)} className="rounded-lg border border-cyan-300 px-2 py-1 text-[11px] font-bold text-cyan-800 focus:outline-none focus:ring-2 focus:ring-cyan-500">{comparison.some((item) => item === candidate) ? "비교 해제" : "비교에 추가"}</button></div></div>)}</div>
</div>{selected ? <div className="space-y-6">
<div className="flex items-center justify-between">
<div>
<p className="text-xs font-bold tracking-[0.18em] text-cyan-700 uppercase">{selectedDetailTitle}</p>
<h2 className="mt-1 text-2xl font-bold text-slate-950">Do {selected.input.grainOuterDiameterMm} · do {selected.input.grainCoreDiameterMm} · Lo {selected.input.segmentLengthMm} mm</h2>
<p className="mt-1 text-sm text-slate-500">{selected.input.segmentCount} segments · {selected.motorClass}-class · 종합 점수 {formatNumber(selected.score.totalScore, 1)}</p>
</div>
<StatusPill status={selected.status} />
</div>
{isReferenceCandidate ? <div className="rounded-2xl border-2 border-violet-300 bg-violet-50 px-4 py-3 text-sm font-semibold leading-6 text-violet-950" role="note">참고용 탈락 후보입니다. 추천·조건부 후보가 아니며, 목표 질량에 가장 가까운 탈락 후보를 비교하기 위한 참고값입니다.</div> : null}
<details className="rounded-2xl border border-violet-100 bg-violet-50/60 px-4 py-3"><summary className="cursor-pointer text-sm font-bold text-violet-950">GSRM·AN 오링 검토 <span className="ml-2 text-xs font-normal text-slate-500">선택 후보의 밀봉 규격 검사</span></summary><div className="mt-3">
<div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
<div>
<p className="text-xs font-bold uppercase tracking-[0.12em] text-violet-700">GSRM 오링 기준 직경 변환</p>
<p className="mt-1 text-xs text-violet-900">SRM 챔버 내경 {formatNumber(selected.input.chamberDiameterMm, 2)} mm + 벽 두께 {formatNumber(gsrmWallThicknessMm, 2)} mm/side × 2 = <strong>{formatNumber(gsrmReferenceDiameterMm ?? 0, 2)} mm</strong>
</p>
</div>
<label className="block w-full sm:w-40">
<span className="mb-1 block text-[11px] font-semibold text-violet-800">벽 두께 (한쪽)</span>
<span className="relative block">
<input type="number" min="0" step="0.1" value={gsrmWallThicknessMm} onChange={(event) => { const value = Number(event.target.value); setGsrmWallThicknessMm(Number.isFinite(value) && value >= 0 ? value : 0); }} className="w-full rounded-xl border border-violet-200 bg-white px-3 py-2 pr-12 text-sm text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100" />
<span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">mm/side</span>
</span>
</label>
</div>
<AnCatalogPanel referenceDiameterMm={gsrmReferenceDiameterMm ?? 0} onStateChange={setAnExportState} />
</div></details>
<details className="rounded-2xl border border-sky-200 bg-sky-50/60 px-4 py-3"><summary className="cursor-pointer text-sm font-bold text-sky-950">Fusion 설계 검토 <span className="ml-2 text-xs font-normal text-slate-500">후속 형상 검토용 요약</span></summary><div className="mt-3 space-y-3 text-xs text-sky-950"><p>선택 후보의 MotorFit 계산 결과를 Fusion 설계 전 검토에 참고할 수 있도록 묶어 표시합니다. Fusion 파일이나 제작 도면, 제작 승인값을 생성하지 않습니다.</p>{cadSummary ? <><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{[["챔버 내경", cadSummary.chamber.diameterMm == null ? "미입력" : `${formatNumber(cadSummary.chamber.diameterMm, 3)} mm`], ["챔버 길이", cadSummary.chamber.lengthMm == null ? "미입력" : `${formatNumber(cadSummary.chamber.lengthMm, 3)} mm`], ["노즐 목 면적", cadSummary.nozzle.throatAreaMm2 == null ? "미입력" : `${formatNumber(cadSummary.nozzle.throatAreaMm2, 3)} mm²`], ["노즐 출구 면적", cadSummary.nozzle.exitAreaMm2 == null ? "미입력" : `${formatNumber(cadSummary.nozzle.exitAreaMm2, 3)} mm²`], ["노즐 출구 직경", cadSummary.nozzle.exitDiameterMm == null ? "미입력" : `${formatNumber(cadSummary.nozzle.exitDiameterMm, 3)} mm`], ["노즐 면적비", cadSummary.nozzle.areaRatio == null ? "미입력" : formatNumber(cadSummary.nozzle.areaRatio, 4)], ["벌크헤드 챔버 수", "미입력"], ["GSRM B", cadSummary.gsrm.referenceDiameterMm == null ? "미입력" : `${formatNumber(cadSummary.gsrm.referenceDiameterMm, 3)} mm`]].map(([label, value]) => <div key={label} className="rounded-xl border border-sky-100 bg-white px-3 py-2"><span className="block text-[11px] font-semibold text-sky-700">{label}</span><strong className="mt-1 block font-mono text-slate-950">{value}</strong></div>)}</div><p className="rounded-xl border border-sky-200 bg-white px-3 py-2">출처: SRM 계산 결과 · 버전: 앱 {APP_VERSION} / 엔진 {CALCULATION_ENGINE_VERSION} / SRM {BASELINE_VERSION} / GSRM {GSRM_REFERENCE_VERSION} / AN {AN_CATALOG_VERSION}</p><div className="rounded-xl border border-sky-200 bg-white px-3 py-2"><p className="font-bold">Fusion 별도 검토 체크리스트</p><ul className="mt-1 grid gap-1 sm:grid-cols-2">{cadSummary.checklist.map((item) => <li key={item}>□ {item}</li>)}</ul></div><div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 leading-5">RPA 외부 결과는 별도 참고값으로만 관리되며 SRM 계산값과 섞이지 않습니다. 형상 치수·재료·공차·열·구조·체결·밀봉·스냅링 규격은 별도 검토가 필요하고, 이 요약은 실제 제작·점화 승인값이 아닙니다.</div></> : <p>선택된 후보가 없어 Fusion 요약을 만들 수 없습니다.</p>}</div></details>
<details className="rounded-2xl border border-orange-200 bg-orange-50/60 px-4 py-3"><summary className="cursor-pointer text-sm font-bold text-orange-950">RPA 노즐 상세해석 연계 <span className="ml-2 text-xs font-normal text-slate-500">외부 해석 참고값</span></summary><div className="mt-3 space-y-3 text-xs text-orange-950"><p>선택한 SRM 후보에서 확인 가능한 값을 RPA Bell형 노즐 상세설계의 참고 입력으로 전달합니다. 계산식·후보 판정·추천 상태는 변경하지 않습니다.</p>{rpaSummary ? <><div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{[["챔버 압력 / MEOP", `${formatNumber(rpaSummary.values.chamberPressureMpa, 4)} / ${formatNumber(rpaSummary.values.meopMpa, 4)} MPa`], ["목표 추력", rpaSummary.values.targetThrustN == null ? "미입력" : `${formatNumber(rpaSummary.values.targetThrustN, 2)} N`], ["질량 유량 관련값", rpaSummary.values.massFlowKgPerSec == null ? "미입력" : `${formatNumber(rpaSummary.values.massFlowKgPerSec, 6)} kg/s (최대 노즐 유량)`], ["노즐 목 면적", rpaSummary.values.throatAreaMm2 == null ? "미입력" : `${formatNumber(rpaSummary.values.throatAreaMm2, 3)} mm²`], ["노즐 출구 면적 / 면적비", `${formatNumber(rpaSummary.values.nozzleExitAreaMm2, 3)} mm² / ${formatNumber(rpaSummary.values.areaRatio, 4)}`], ["노즐 출구 직경", `${formatNumber(rpaSummary.values.nozzleExitDiameterMm, 3)} mm`], ["챔버 수", "미입력"], ["외부 압력", rpaSummary.values.ambientPressureMpa == null ? "미입력" : `${formatNumber(rpaSummary.values.ambientPressureMpa, 4)} MPa`]].map(([label, value]) => <div key={label} className="rounded-xl border border-orange-100 bg-white px-3 py-2"><span className="block text-[11px] font-semibold text-orange-700">{label}</span><strong className="mt-1 block font-mono text-slate-950">{value}</strong></div>)}</div><p className="rounded-xl border border-orange-200 bg-white px-3 py-2">출처·버전: 앱 {rpaSummary.source.appVersion} · 엔진 {rpaSummary.source.engineVersion} · SRM {rpaSummary.source.baselineVersion} · GSRM {rpaSummary.source.gsrmReferenceVersion} · AN {rpaSummary.source.anCatalogVersion}</p><div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2"><p className="font-bold">RPA에서 별도 입력할 값</p><p className="mt-1 leading-5">{rpaSummary.separateInputs.join(" · ")}</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => void copyRpaSummary()} className="rounded-lg bg-orange-700 px-3 py-1.5 font-bold text-white">RPA 입력용 요약 복사</button><button type="button" onClick={() => downloadRpaSummary("csv")} className="rounded-lg border border-orange-300 bg-white px-3 py-1.5 font-bold text-orange-900">RPA CSV</button><button type="button" onClick={() => downloadRpaSummary("json")} className="rounded-lg border border-orange-300 bg-white px-3 py-1.5 font-bold text-orange-900">RPA JSON</button><button type="button" onClick={exportRpaBackup} className="rounded-lg border border-orange-300 bg-white px-3 py-1.5 font-bold text-orange-900">RPA 결과 백업</button><input ref={rpaBackupInput} type="file" accept="application/json,.json" aria-label="RPA 결과 백업 파일 선택" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importRpaBackup(file); }} /><button type="button" onClick={() => rpaBackupInput.current?.click()} className="rounded-lg border border-orange-300 bg-white px-3 py-1.5 font-bold text-orange-900">RPA 결과 복원</button></div><div className="rounded-xl border border-orange-200 bg-white p-3"><p className="font-bold">외부 RPA Bell형 노즐 결과 기록</p><div className="mt-2 grid gap-2 sm:grid-cols-2"><label>결과 출처<input aria-label="RPA 결과 출처" value={rpaSource} onChange={(event) => setRpaSource(event.target.value)} className="mt-1 w-full rounded-lg border border-orange-200 px-2 py-1.5" placeholder="예: RPA 해석 파일" /></label><label>RPA 버전<input aria-label="RPA 버전" value={rpaVersion} onChange={(event) => setRpaVersion(event.target.value)} className="mt-1 w-full rounded-lg border border-orange-200 px-2 py-1.5" placeholder="필수" /></label><label>데이터베이스<input aria-label="RPA 데이터베이스" value={rpaDatabase} onChange={(event) => setRpaDatabase(event.target.value)} className="mt-1 w-full rounded-lg border border-orange-200 px-2 py-1.5" placeholder="필수" /></label><label>입력 조건<textarea aria-label="RPA 입력 조건" value={rpaInputConditions} onChange={(event) => setRpaInputConditions(event.target.value)} className="mt-1 w-full rounded-lg border border-orange-200 px-2 py-1.5" rows={2} /></label><label>결과값<textarea aria-label="RPA 결과값" value={rpaResultValues} onChange={(event) => setRpaResultValues(event.target.value)} className="mt-1 w-full rounded-lg border border-orange-200 px-2 py-1.5" rows={2} placeholder="RPA 결과를 원문 단위와 함께 기록" /></label><label>메모<textarea aria-label="RPA 결과 메모" value={rpaMemo} onChange={(event) => setRpaMemo(event.target.value)} className="mt-1 w-full rounded-lg border border-orange-200 px-2 py-1.5" rows={2} /></label></div><button type="button" onClick={saveRpaResult} className="mt-2 rounded-lg bg-orange-700 px-3 py-1.5 font-bold text-white">RPA 결과 별도 저장</button>{rpaNotice ? <p role="status" className="mt-2 rounded-lg border border-orange-200 bg-orange-50 px-2 py-1.5">{rpaNotice}</p> : null}</div>{selectedRpaRecords.length ? <div className="rounded-xl border border-orange-200 bg-white p-3"><p className="font-bold">연결된 RPA 결과 {selectedRpaRecords.length}개</p>{selectedRpaRecords.map((record) => <div key={record.id} className="mt-2 flex flex-wrap items-start justify-between gap-2 border-b border-orange-100 pb-2"><div><p className="font-semibold">{record.source} · {record.version} · {record.database}</p><p className="text-[11px]">{record.recordedAt} · 결과 {record.resultValues}</p><p className="text-[11px] text-slate-600">입력 조건 {record.inputConditions || "미기록"} · {record.memo || "메모 없음"}</p></div><button type="button" onClick={() => deleteRpaResult(record.id)} className="rounded-md border border-rose-200 px-2 py-1 text-rose-700">삭제</button></div>)}</div> : <p className="rounded-xl border border-orange-200 bg-white px-3 py-2">연결된 외부 RPA 결과가 없습니다.</p>}<div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 leading-5">RPA 연계 정보는 상세설계 참고자료입니다. RPA 버전·데이터베이스·입력 조건에 따라 결과가 달라질 수 있으며, Bell형 노즐 결과는 별도 해석 결과로 관리합니다. 실제 제작·점화 승인값이 아니고 Fusion·재료·열·구조·제작 공차 검토가 별도로 필요합니다. 등록된 RPA 결과는 기존 SRM 계산 결과와 후보 판정을 자동으로 덮어쓰지 않습니다.</div></> : <p>선택된 후보가 없어 RPA 연계 입력을 만들 수 없습니다.</p>}</div></details>
<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
<MetricCard label="연료 질량" value={formatNumber(selected.grainMassKg, 4)} unit="kg" tone="cyan" />
<MetricCard label="최대 압력" value={formatNumber(selected.maximumPressureMpa, 4)} unit="MPa gauge" tone="amber" />
<MetricCard label="계산 결과 · 평균 추력" value={formatNumber(selected.averageThrustN, 2)} unit="N" />
<MetricCard label="총충격량" value={formatNumber(selected.totalImpulseNs, 2)} unit="N·s" />
<MetricCard label="계산 결과 · 연소 시간" value={formatNumber(selected.burnTimeSec, 4)} unit="s" />
<MetricCard label="추력 종료" value={formatNumber(selected.thrustEndTimeSec, 4)} unit="s" />
<MetricCard label="최대 추력" value={formatNumber(selected.maximumThrustN, 2)} unit="N" />
<MetricCard label="비추력" value={formatNumber(selected.specificImpulseSec, 3)} unit="s" />
<MetricCard label="노즐 출구 직경" value={formatNumber(selected.performance.nozzleExitDiameterMm, 3)} unit="mm" />
<MetricCard label="노즐 출구 면적" value={formatNumber(selected.performance.nozzleExitAreaMm2, 2)} unit="mm²" />
</div>{selectedRecommendation ? <div className="rounded-2xl border border-cyan-100 bg-cyan-50/60 px-4 py-4">
<p className="text-sm font-bold text-cyan-950">추천 이유</p>
<ul className="mt-2 text-xs">
<RecommendationRow label="목표 질량 오차" value={`${selectedRecommendation.massError >= 0 ? "+" : ""}${formatNumber(selectedRecommendation.massError, 5)} kg`} tone={Math.abs(selectedRecommendation.massError) <= config.fuelMassToleranceKg ? "emerald" : "amber"} />
<RecommendationRow label="최대 압력 여유" value={`${formatNumber(selectedRecommendation.pressureMargin, 4)} MPa`} tone={selectedRecommendation.pressureMargin >= 0 ? "emerald" : "amber"} />
{selectedRecommendation.thrustError === null ? <RecommendationRow label="평균 추력 오차" value="목표 추력 미입력" /> : <RecommendationRow label="평균 추력 오차" value={`${selectedRecommendation.thrustError >= 0 ? "+" : ""}${formatNumber(selectedRecommendation.thrustError, 2)} N`} tone={Math.abs(selectedRecommendation.thrustError) <= config.averageThrustToleranceN ? "emerald" : "amber"} />}
<RecommendationRow label="연소 시간 오차" value={`${selectedRecommendation.burnTimeError >= 0 ? "+" : ""}${formatNumber(selectedRecommendation.burnTimeError, 4)} s`} tone={Math.abs(selectedRecommendation.burnTimeError) <= config.burnTimeToleranceSec ? "emerald" : "amber"} />
<RecommendationRow label="제작 치수 간격" value={selectedRecommendation.dimensionsOnStep ? `${config.manufacturingStepMm ?? 5} mm 배수` : "간격 조건 확인 필요"} tone={selectedRecommendation.dimensionsOnStep ? "emerald" : "amber"} />
<RecommendationRow label="판정 사유" value={selected.status === "pass" ? "모든 목표 허용 범위 통과" : selected.reasons.join(" ")} tone={selected.status === "pass" ? "emerald" : "amber"} />
</ul>
</div> : null}<CandidateConditionSummary candidate={selected} config={config} targetThrustEnabled={targetThrustText.trim() !== ""} automaticMode={automaticMode} />{selected.reasons.length ? <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
<p className="font-bold">탈락·경고 사유</p>
<ul className="mt-1 list-disc pl-5">{selected.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
</div> : selected.status === "pass" ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">모든 목표 허용 범위를 만족한 후보입니다.</div> : null}{selectedCharts ? <details className="rounded-2xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-sm font-bold text-slate-950">압력·추력·Kn 그래프</summary><div className="mt-3 grid gap-4 2xl:grid-cols-2">
<div>
<h3 className="mb-2 text-sm font-bold text-slate-950">추력 · 시간</h3>
<GraphKpis items={selectedCharts.thrustKpis} />
<LineChart points={selectedCharts.thrust} color="#22d3ee" xLabel="시간 (s)" yLabel="추력 (N)" targetY={selected.thrustEvaluation?.targetThrustN} />
</div>
<div>
<h3 className="mb-2 text-sm font-bold text-slate-950">압력 · 시간</h3>
<GraphKpis items={selectedCharts.pressureKpis} />
<LineChart points={selectedCharts.pressure} color="#f59e0b" xLabel="시간 (s)" yLabel="게이지 압력 (MPa)" />
</div>
<div>
<h3 className="mb-2 text-sm font-bold text-slate-950">Kn 곡선</h3>
<GraphKpis items={selectedCharts.knKpis} />
<LineChart points={selectedCharts.kn} color="#a78bfa" xLabel="회귀 거리 (mm)" yLabel="Kn" />
</div>
</div></details> : null}</div> : null}</div>}</section>
      </div>
      <footer className="mt-8 border-t border-slate-200 pt-5 text-xs leading-5 text-slate-500">본 도구는 교육 및 설계 검토용 시뮬레이터이며 실제 제작·점화 절차를 제공하지 않습니다. 모든 화면 수치는 현재 TypeScript 계산 엔진의 결과입니다.</footer>
    </div>
</main>
  );
}
