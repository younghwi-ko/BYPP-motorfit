import type { CandidateResult, CandidateSearchConfig } from "./types";

export const RPA_LINK_SCHEMA_VERSION = 1;
export const RPA_LINK_STORAGE_KEY = "motorfit-rpa-links-v1";

export type RpaInputSummary = {
  candidateKey: string;
  geometry: string;
  values: {
    chamberPressureMpa: number;
    meopMpa: number;
    targetThrustN: number | null;
    massFlowKgPerSec: number | null;
    throatAreaMm2: number | null;
    nozzleExitAreaMm2: number;
    nozzleExitDiameterMm: number;
    areaRatio: number;
    chamberCount: number | null;
    ambientPressureMpa: number | null;
  };
  units: { pressure: "MPa"; thrust: "N"; massFlow: "kg/s"; area: "mm²"; length: "mm"; chamberCount: "개" };
  source: { appVersion: string; engineVersion: string; baselineVersion: string; gsrmReferenceVersion: string; anCatalogVersion: string };
  separateInputs: string[];
  limitations: string[];
};

export type RpaResultRecord = {
  id: string;
  candidateKey: string;
  recordedAt: string;
  source: string;
  version: string;
  database: string;
  inputConditions: string;
  resultValues: string;
  memo: string;
};

export function rpaCandidateKey(candidate: CandidateResult): string {
  const input = candidate.input;
  return `${input.grainOuterDiameterMm}×${input.grainCoreDiameterMm}×${input.segmentLengthMm}/${input.segmentCount}`;
}

export function buildRpaInputSummary(candidate: CandidateResult, config: CandidateSearchConfig, versions: RpaInputSummary["source"]): RpaInputSummary {
  const firstPressureRow = candidate.pressure.combustion.rows[0];
  const massFlowRows = candidate.pressure.combustion.rows.map((row) => row.nozzleMassFlowKgPerSec).filter(Number.isFinite);
  return {
    candidateKey: rpaCandidateKey(candidate),
    geometry: `${candidate.input.grainOuterDiameterMm}×${candidate.input.grainCoreDiameterMm}×${candidate.input.segmentLengthMm}/${candidate.input.segmentCount}`,
    values: {
      chamberPressureMpa: candidate.maximumPressureMpa,
      meopMpa: candidate.maximumPressureMpa,
      targetThrustN: config.targetThrustEnabled ? config.targetAverageThrustN : null,
      massFlowKgPerSec: massFlowRows.length ? Math.max(...massFlowRows) : null,
      throatAreaMm2: firstPressureRow?.throatAreaMm2 ?? candidate.performance.rows[0]?.throatAreaMm2 ?? null,
      nozzleExitAreaMm2: candidate.performance.nozzleExitAreaMm2,
      nozzleExitDiameterMm: candidate.performance.nozzleExitDiameterMm,
      areaRatio: candidate.performance.averageOptimumExpansionRatio,
      chamberCount: null,
      ambientPressureMpa: candidate.pressure.combustion.atmosphericPressureMpa,
    },
    units: { pressure: "MPa", thrust: "N", massFlow: "kg/s", area: "mm²", length: "mm", chamberCount: "개" },
    source: versions,
    separateInputs: ["추진제 열화학 조성·물성", "혼합비 또는 고체 추진제 전용 조성", "평형/동결 해석 설정", "노즐 효율", "RPA 버전과 데이터베이스", "Bell형 노즐 모델 설정"],
    limitations: ["RPA 연계 정보는 상세설계 참고자료", "RPA 버전·데이터베이스·입력 조건에 따라 결과가 달라질 수 있음", "Bell형 노즐 결과는 별도 해석 결과로 관리", "실제 제작·점화 승인값이 아님", "CAD·재료·열·구조·제작 공차 검토가 별도로 필요함"],
  };
}

export function parseRpaBackup(value: unknown): RpaResultRecord[] {
  if (!value || typeof value !== "object") throw new Error("RPA 백업 형식이 아닙니다.");
  const data = value as { app?: string; schemaVersion?: number; records?: unknown };
  if (data.app !== "MotorFit" || data.schemaVersion !== RPA_LINK_SCHEMA_VERSION || !Array.isArray(data.records)) throw new Error("지원하지 않는 RPA 백업 schema입니다.");
  const records = data.records.filter((item): item is RpaResultRecord => {
    if (!item || typeof item !== "object") return false;
    const record = item as Partial<RpaResultRecord>;
    return [record.id, record.candidateKey, record.recordedAt, record.source, record.version, record.database, record.inputConditions, record.resultValues, record.memo].every((field) => typeof field === "string");
  });
  if (records.length !== data.records.length) throw new Error("손상되었거나 필수 필드가 없는 RPA 기록입니다.");
  return records.slice(0, 20);
}
