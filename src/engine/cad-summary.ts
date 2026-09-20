import type { CandidateResult } from "./types";

export const CAD_CHECKLIST = ["형상 치수", "재료", "공차", "열·구조 검토", "체결·밀봉 검토", "스냅링 규격 확인"] as const;

export type CadDesignSummary = {
  geometry: string;
  chamber: { diameterMm: number | null; lengthMm: number | null; segments: number | null; source: string };
  nozzle: { throatAreaMm2: number | null; exitAreaMm2: number | null; exitDiameterMm: number | null; areaRatio: number | null; source: string };
  bulkhead: { chamberCount: number | null; source: string };
  gsrm: { referenceDiameterMm: number | null; source: string };
  checklist: readonly string[];
  limitations: readonly string[];
};

export function buildCadDesignSummary(candidate: CandidateResult, gsrmReferenceDiameterMm: number | null): CadDesignSummary {
  const input = candidate.input;
  const pressureRow = candidate.pressure.combustion.rows[0];
  return {
    geometry: `${input.grainOuterDiameterMm}×${input.grainCoreDiameterMm}×${input.segmentLengthMm}/${input.segmentCount}`,
    chamber: { diameterMm: input.chamberDiameterMm, lengthMm: input.chamberLengthMm, segments: input.segmentCount, source: "MotorFit SRM 계산 결과" },
    nozzle: {
      throatAreaMm2: pressureRow?.throatAreaMm2 ?? candidate.performance.rows[0]?.throatAreaMm2 ?? null,
      exitAreaMm2: candidate.performance.nozzleExitAreaMm2 ?? null,
      exitDiameterMm: candidate.performance.nozzleExitDiameterMm ?? null,
      areaRatio: candidate.performance.averageOptimumExpansionRatio ?? null,
      source: "MotorFit SRM 계산 결과",
    },
    bulkhead: { chamberCount: null, source: "MotorFit에서 확인할 수 없는 값 · 미입력" },
    gsrm: { referenceDiameterMm: gsrmReferenceDiameterMm, source: gsrmReferenceDiameterMm == null ? "GSRM 변환값 미계산" : "MotorFit GSRM 변환 결과" },
    checklist: CAD_CHECKLIST,
    limitations: ["Fusion 파일이나 제작 도면을 자동 생성하지 않습니다.", "제작 승인값이 아니며 Fusion에서 형상·재료·공차·열·구조·체결·밀봉을 별도 검토해야 합니다."],
  };
}
