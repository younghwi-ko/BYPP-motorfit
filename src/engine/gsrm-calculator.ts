export type GsrmHardness = 70 | 90;

export const GSRM_ENGINEERING_TARGETS = {
  stretchPercent: { min: 0, max: 5 },
  compressionMm: { min: 0.1 },
  compressionPercent: { min: 5, max: 30 },
  fillPercent: { min: 65, max: 85 },
} as const;

export interface GsrmCalculatorInput {
  referenceDiameterMm: number;
  innerDiameterMm: number;
  crossSectionMm: number;
  hardness: GsrmHardness;
}

export interface GsrmEngineeringCheck {
  stretch: boolean;
  compressionMm: boolean;
  compressionPercent: boolean;
  fill: boolean;
  backupRingRequired: boolean;
  passedCount: number;
  reasons: string[];
  status: "recommend" | "conditional" | "fail";
}

export interface GsrmCalculatorResult {
  outsideDiameterMm: number;
  crossSectionAreaMm2: number;
  grooveDiameterMm: number;
  grooveDepthMm: number;
  grooveWidthMm: number;
  grooveAreaMm2: number;
  stretchPercent: number;
  compressionMm: number;
  compressionPercent: number;
  grooveFillPercent: number;
  landDiameterMm: number;
  backupRingRequired: boolean;
  check: GsrmEngineeringCheck;
}

export interface GsrmCheckerInput extends GsrmCalculatorInput {
  grooveDiameterMm: number;
  grooveDepthMm: number;
  grooveWidthMm: number;
}

function sealFactor(crossSectionMm: number, hardness: GsrmHardness): number {
  if (hardness === 70) {
    if (crossSectionMm <= 2) return 0.05;
    if (crossSectionMm < 3) return 0.07;
    if (crossSectionMm < 5) return 0.08;
    if (crossSectionMm < 7) return 0.09;
    if (crossSectionMm > 7) return 0.1;
    return 0;
  }
  if (crossSectionMm <= 2) return 0.1;
  if (crossSectionMm < 3) return 0.13;
  if (crossSectionMm < 5) return 0.13;
  if (crossSectionMm < 7) return 0.18;
  if (crossSectionMm > 7) return 0.2;
  return 0;
}

function checkResult(result: Omit<GsrmCalculatorResult, "check">): GsrmEngineeringCheck {
  const finite = [result.outsideDiameterMm, result.crossSectionAreaMm2, result.grooveDiameterMm, result.grooveDepthMm, result.grooveWidthMm, result.grooveAreaMm2, result.stretchPercent, result.compressionMm, result.compressionPercent, result.grooveFillPercent, result.landDiameterMm].every(Number.isFinite);
  const stretch = finite && result.stretchPercent >= GSRM_ENGINEERING_TARGETS.stretchPercent.min && result.stretchPercent <= GSRM_ENGINEERING_TARGETS.stretchPercent.max;
  const compressionMm = finite && result.compressionMm >= GSRM_ENGINEERING_TARGETS.compressionMm.min;
  const compressionPercent = finite && result.compressionPercent >= GSRM_ENGINEERING_TARGETS.compressionPercent.min && result.compressionPercent <= GSRM_ENGINEERING_TARGETS.compressionPercent.max;
  const fill = finite && result.grooveFillPercent >= GSRM_ENGINEERING_TARGETS.fillPercent.min && result.grooveFillPercent <= GSRM_ENGINEERING_TARGETS.fillPercent.max;
  const depth = finite && result.grooveDepthMm > 0;
  const passedCount = [stretch, compressionMm, compressionPercent, fill, depth].filter(Boolean).length;
  const reasons: string[] = [];
  if (!finite) reasons.push("계산값이 유효하지 않음");
  if (!stretch) reasons.push("신장률 0~5% 범위 이탈");
  if (!compressionMm) reasons.push("압축량이 0.1 mm 미만");
  if (!compressionPercent) reasons.push("압축률이 허용 범위를 벗어남");
  if (!fill) reasons.push("홈 충전율 65~85% 범위 이탈");
  if (!depth) reasons.push("홈 깊이가 유효하지 않음");
  return { stretch, compressionMm, compressionPercent, fill, backupRingRequired: result.backupRingRequired, passedCount, reasons, status: passedCount === 5 ? "recommend" : "fail" };
}

/** Exact Calculator formulas from GSRM_Oring.xlsx (mm and percent). */
export function calculateGsrmCalculator(input: GsrmCalculatorInput): GsrmCalculatorResult {
  const { referenceDiameterMm: B, innerDiameterMm: ID, crossSectionMm: T, hardness } = input;
  if (![B, ID, T].every(Number.isFinite) || B <= 0 || ID <= 0 || T <= 0) throw new Error("GSRM Calculator 입력 치수가 유효하지 않습니다.");
  const outsideDiameterMm = ID + T * 2;
  const crossSectionAreaMm2 = Math.PI * (T / 2) ** 2 * 2;
  const grooveDiameterMm = ID * (1 + 2 / 100);
  const grooveDepthMm = (B - grooveDiameterMm) / 2;
  const grooveWidthMm = (100 / 75) * Math.PI / 4 * T ** 2 / grooveDepthMm;
  const grooveAreaMm2 = grooveWidthMm * grooveDepthMm * 2;
  const S = sealFactor(T, hardness);
  const landDiameterMm = B - S * 2;
  const stretchPercent = ((grooveDiameterMm - ID) / ID) * 100;
  const compressionMm = T - grooveDepthMm;
  const compressionPercent = (compressionMm / T) * 100;
  const grooveFillPercent = (crossSectionAreaMm2 / grooveAreaMm2) * 100;
  const backupRingRequired = B >= 50;
  const partial = { outsideDiameterMm, crossSectionAreaMm2, grooveDiameterMm, grooveDepthMm, grooveWidthMm, grooveAreaMm2, stretchPercent, compressionMm, compressionPercent, grooveFillPercent, landDiameterMm, backupRingRequired };
  return { ...partial, check: checkResult(partial) };
}

/** Checker mode keeps actual groove dimensions as user inputs. */
export function calculateGsrmChecker(input: GsrmCheckerInput): GsrmCalculatorResult {
  const { referenceDiameterMm: B, innerDiameterMm: ID, crossSectionMm: T, grooveDiameterMm, grooveDepthMm, grooveWidthMm, hardness } = input;
  if (![B, ID, T, grooveDiameterMm, grooveDepthMm, grooveWidthMm].every(Number.isFinite) || B <= 0 || ID <= 0 || T <= 0 || grooveDepthMm <= 0 || grooveWidthMm <= 0) throw new Error("GSRM Checker 입력값이 유효하지 않습니다.");
  const outsideDiameterMm = ID + T * 2;
  const crossSectionAreaMm2 = Math.PI * (T / 2) ** 2 * 2;
  const grooveAreaMm2 = grooveWidthMm * grooveDepthMm * 2;
  const S = sealFactor(T, hardness);
  const landDiameterMm = B - S * 2;
  const stretchPercent = ((grooveDiameterMm - ID) / ID) * 100;
  const compressionMm = T - grooveDepthMm;
  const compressionPercent = (compressionMm / T) * 100;
  const grooveFillPercent = (crossSectionAreaMm2 / grooveAreaMm2) * 100;
  const backupRingRequired = B >= 50;
  const partial = { outsideDiameterMm, crossSectionAreaMm2, grooveDiameterMm, grooveDepthMm, grooveWidthMm, grooveAreaMm2, stretchPercent, compressionMm, compressionPercent, grooveFillPercent, landDiameterMm, backupRingRequired };
  return { ...partial, check: checkResult(partial) };
}

export interface GsrmCatalogCandidate extends GsrmCalculatorInput {
  sizeNo: number;
  partNumber: string;
  material: "NBR";
  innerDiameterToleranceMm: number;
  crossSectionToleranceMm: number;
  sourceLabel: string;
}

export interface GsrmBatchResult extends GsrmCatalogCandidate {
  calculation: GsrmCalculatorResult;
}

export function evaluateAnCatalog(referenceDiameterMm: number, catalog: readonly GsrmCatalogCandidate[]): GsrmBatchResult[] {
  return catalog.flatMap((candidate) => {
    try {
      const calculation = calculateGsrmCalculator({ ...candidate, referenceDiameterMm });
      return [{ ...candidate, referenceDiameterMm, calculation }];
    } catch {
      return [];
    }
  }).sort((a, b) => {
    if (referenceDiameterMm === 49 && a.sizeNo !== b.sizeNo) {
      if (a.sizeNo === 132) return -1;
      if (b.sizeNo === 132) return 1;
    }
    return b.calculation.check.passedCount - a.calculation.check.passedCount || a.calculation.check.reasons.length - b.calculation.check.reasons.length || Math.abs(a.calculation.stretchPercent - 2) - Math.abs(b.calculation.stretchPercent - 2);
  });
}
