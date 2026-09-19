import { calculateDataAndKn } from "./data-and-kn";
import { calculatePressure } from "./blowdown";
import { calculatePerformance } from "./performance";
import { scoreCandidate } from "./candidate-score";
import { selectPropellantConstants } from "./data/propellants";
import { evaluateThrustCurve } from "./thrust-evaluation";
import {
  DEFAULT_MANUFACTURING_CONSTRAINTS,
  validateExcelReproductionInput,
  validateManufacturingCandidate,
} from "./validation";
import type {
  CandidateNumberRange,
  CandidateResult,
  CandidateSearchConfig,
  CandidateSearchProgress,
  CandidateSearchResult,
  DataAndKnInput,
} from "./types";
import { AN_CATALOG_ITEM_COUNT, AN_CATALOG_VERSION, APP_VERSION, BASELINE_VERSION, CALCULATION_ENGINE_VERSION, GSRM_REFERENCE_VERSION } from "./metadata";

const DEFAULT_MAX_CANDIDATES = 2_000;

/**
 * Allows the tiny 0.395603... kg vs 0.3956 kg baseline difference caused by
 * displayed/input precision, while still hard-rejecting meaningful overshoot.
 */
export const MASS_UPPER_EPSILON_KG = 5e-6;

export function isWithinMassUpperBound(massKg: number, targetMassKg: number): boolean {
  return massKg <= targetMassKg + MASS_UPPER_EPSILON_KG;
}

export class CandidateSearchInputError extends Error {
  readonly issues: readonly string[];
  constructor(issues: readonly string[]) {
    super(`Invalid candidate search input: ${issues.join("; ")}`);
    this.name = "CandidateSearchInputError";
    this.issues = issues;
  }
}

export class CandidateSearchCancelledError extends Error {
  constructor() {
    super("Candidate search was cancelled.");
    this.name = "CandidateSearchCancelledError";
  }
}

function validateRange(name: string, range: CandidateNumberRange, issues: string[]) {
  const step = range.step ?? 5;
  if (!Number.isFinite(range.min) || !Number.isFinite(range.max) || range.min > range.max) issues.push(`${name} 범위의 최소·최대값을 확인하세요.`);
  if (!Number.isFinite(step) || step <= 0) issues.push(`${name} 간격은 0보다 큰 숫자여야 합니다.`);
}

export function validateCandidateSearchConfig(config: CandidateSearchConfig): readonly string[] {
  const issues: string[] = [];
  const positive = [
    ["챔버 직경", config.chamberDiameterMm], ["챔버 길이", config.chamberLengthMm],
    ["목표 연료 질량", config.targetFuelMassKg], ["질량 허용 오차", config.fuelMassToleranceKg],
    ["최대 허용 압력", config.maximumPressureMpa], ["추력 허용 오차", config.averageThrustToleranceN],
    ["목표 연소 시간", config.targetBurnTimeSec], ["시간 허용 오차", config.burnTimeToleranceSec],
    ["목표 압력", config.targetPressureMpa],
  ] as const;
  if (config.targetThrustEnabled !== false && (!Number.isFinite(config.targetAverageThrustN) || config.targetAverageThrustN <= 0)) issues.push("목표 평균 추력은 0보다 큰 유한값이어야 합니다.");
  for (const [name, value] of positive) if (!Number.isFinite(value) || value <= 0) issues.push(`${name}은 0보다 큰 유한값이어야 합니다.`);
  validateRange("Do", config.outerDiameterMm, issues);
  validateRange("do", config.coreDiameterMm, issues);
  validateRange("Lo", config.segmentLengthMm, issues);
  if (config.mode !== "excel") {
    const step = config.manufacturingStepMm ?? 5;
    for (const [name, range] of [["Do", config.outerDiameterMm], ["do", config.coreDiameterMm], ["Lo", config.segmentLengthMm]] as const) {
      if (Number.isFinite(range.min) && Number.isFinite(range.max) && (range.min % step !== 0 || range.max % step !== 0)) issues.push(`${name} 범위는 ${step} mm 배수여야 합니다.`);
    }
  }
  if (!Number.isInteger(config.segmentCount.min) || !Number.isInteger(config.segmentCount.max) || config.segmentCount.min < 1 || config.segmentCount.max < config.segmentCount.min) issues.push("세그먼트 수 범위는 양의 정수이며 최소값이 최대값보다 클 수 없습니다.");
  if (config.manufacturingStepMm !== undefined && (!Number.isInteger(config.manufacturingStepMm) || config.manufacturingStepMm <= 0)) issues.push("제작 간격은 양의 정수 mm여야 합니다.");
  if (config.mode !== "excel" && Number.isFinite(config.outerDiameterMm.max) && Number.isFinite(config.coreDiameterMm.min) && config.outerDiameterMm.max <= config.coreDiameterMm.min) {
    issues.push("Do와 do 범위에 유효한 조합이 없습니다. Do는 do보다 커야 합니다.");
  }
  if (!Number.isFinite(config.densityRatio) || config.densityRatio <= 0) issues.push("밀도비는 0보다 큰 유한값이어야 합니다.");
  if (!Number.isFinite(config.nozzleErosionMm) || config.nozzleErosionMm < 0) issues.push("노즐 침식량은 0 이상인 유한값이어야 합니다.");
  return issues;
}

function rangeValues(range: CandidateNumberRange, fallbackStep: number): number[] {
  const step = range.step ?? fallbackStep;
  if (!Number.isFinite(range.min) || !Number.isFinite(range.max) || !Number.isFinite(step) || step <= 0 || range.max < range.min) return [];
  const values: number[] = [];
  for (let value = range.min; value <= range.max + step * 1e-9; value += step) values.push(Number(value.toFixed(12)));
  return values;
}

function integerValues(min: number, max: number): number[] {
  if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) return [];
  return Array.from({ length: max - min + 1 }, (_, index) => min + index);
}

export function estimateCandidateCount(config: CandidateSearchConfig): number {
  return rangeValues(config.outerDiameterMm, 5).length * rangeValues(config.coreDiameterMm, 5).length * rangeValues(config.segmentLengthMm, 5).length * integerValues(config.segmentCount.min, config.segmentCount.max).length;
}

/** Build a bounded 5 mm manufacturing search envelope from target mass. */
export function createAutomaticCandidateSearchConfig(config: CandidateSearchConfig): CandidateSearchConfig {
  const massRatio = Math.max(1, Math.max(config.targetFuelMassKg, 0.01) / 0.3956);
  const expansionStage = massRatio <= 1.5 ? 0 : massRatio <= 3.5 ? 1 : 2;
  const linearScale = Math.cbrt(massRatio);
  const chamberDiameterMm = expansionStage === 0 ? config.chamberDiameterMm : Math.ceil(45 * linearScale / 5) * 5;
  const chamberLengthMm = expansionStage === 0 ? config.chamberLengthMm : Math.ceil(165 * linearScale / 5) * 5;
  const chamberMax = Math.max(5, Math.floor(chamberDiameterMm / 5) * 5);
  const outerMin = Math.max(30, chamberMax - 40);
  const outerMax = chamberMax;
  const configuredCoreMin = Math.ceil(config.coreDiameterMm.min / 5) * 5;
  const coreMin = Math.max(5, configuredCoreMin);
  const coreMax = Math.max(coreMin, outerMax - 10);
  const lengthMax = Math.max(85, Math.min(chamberLengthMm, Math.ceil(85 * linearScale / 5) * 5));
  const precisionBudget = expansionStage === 0 ? 600 : expansionStage === 1 ? 1_000 : 1_600;
  return {
    ...config,
    chamberDiameterMm,
    chamberLengthMm,
    outerDiameterMm: { min: outerMin, max: outerMax, step: 5 },
    // Automatic expansion must not silently relax the user's configured minimum core diameter.
    coreDiameterMm: { min: coreMin, max: coreMax, step: 5 },
    segmentLengthMm: { min: 25, max: lengthMax, step: 5 },
    segmentCount: { min: 1, max: Math.min(8, Math.max(3, Math.ceil(linearScale * 3))) },
    maxCandidateCount: precisionBudget,
    manufacturingStepMm: 5,
    burnTimeFilterEnabled: false,
    searchOrder: "target-mass",
    automaticExpansionStage: expansionStage,
  };
}

interface CandidateGeometry {
  outerDiameterMm: number;
  coreDiameterMm: number;
  segmentLengthMm: number;
  segmentCount: number;
  approximateMassKg: number;
}

interface PreparedSearch {
  totalCombinations: number;
  prevalidationRejectedCount: number;
  geometries: CandidateGeometry[];
  precisionGeometries: CandidateGeometry[];
  massFilteredCount: number;
  truncated: boolean;
  targetMassNearbyIncluded: boolean;
  maximumApproximateMassKg: number;
}

interface SearchCounters {
  evaluatedCombinations: number;
  precisionValidationRejectedCount: number;
  calculationFailures: number;
}

function approximateGrainMassKg(config: CandidateSearchConfig, outerDiameterMm: number, coreDiameterMm: number, segmentLengthMm: number, segmentCount: number): number {
  const density = config.densityRatio * selectPropellantConstants(config.propellant).idealDensityGPerCm3;
  const volumeMm3 = Math.PI * (outerDiameterMm ** 2 - coreDiameterMm ** 2) * segmentLengthMm * segmentCount / 4;
  return density * volumeMm3 / 1_000_000;
}

function prepareSearch(config: CandidateSearchConfig): PreparedSearch {
  const inputIssues = validateCandidateSearchConfig(config);
  if (inputIssues.length > 0) throw new CandidateSearchInputError(inputIssues);
  const outerValues = rangeValues(config.outerDiameterMm, 5);
  const coreValues = rangeValues(config.coreDiameterMm, 5);
  const lengthValues = rangeValues(config.segmentLengthMm, 5);
  const segmentValues = integerValues(config.segmentCount.min, config.segmentCount.max);
  const totalCombinations = outerValues.length * coreValues.length * lengthValues.length * segmentValues.length;
  let prevalidationRejectedCount = 0;
  let massFilteredCount = 0;
  let maximumApproximateMassKg = 0;
  const geometries: CandidateGeometry[] = [];
  for (const outerDiameterMm of outerValues) for (const coreDiameterMm of coreValues) for (const segmentLengthMm of lengthValues) for (const segmentCount of segmentValues) {
    if (config.searchOrder === "target-mass" && (outerDiameterMm <= coreDiameterMm || outerDiameterMm > config.chamberDiameterMm || segmentLengthMm * segmentCount > config.chamberLengthMm)) {
      prevalidationRejectedCount += 1;
      continue;
    }
    const approximateMassKg = approximateGrainMassKg(config, outerDiameterMm, coreDiameterMm, segmentLengthMm, segmentCount);
    if (outerDiameterMm > coreDiameterMm && outerDiameterMm <= config.chamberDiameterMm && segmentLengthMm * segmentCount <= config.chamberLengthMm) maximumApproximateMassKg = Math.max(maximumApproximateMassKg, approximateMassKg);
    if (!isWithinMassUpperBound(approximateMassKg, config.targetFuelMassKg)) {
      massFilteredCount += 1;
      continue;
    }
    geometries.push({ outerDiameterMm, coreDiameterMm, segmentLengthMm, segmentCount, approximateMassKg });
  }
  if (config.searchOrder === "target-mass") geometries.sort((left, right) => Math.abs(left.approximateMassKg - config.targetFuelMassKg) - Math.abs(right.approximateMassKg - config.targetFuelMassKg));
  const maxCandidateCount = config.maxCandidateCount ?? DEFAULT_MAX_CANDIDATES;
  const precisionGeometries = geometries.slice(0, maxCandidateCount);
  return {
    totalCombinations,
    prevalidationRejectedCount,
    geometries,
    precisionGeometries,
    massFilteredCount,
    truncated: geometries.length > maxCandidateCount,
    targetMassNearbyIncluded: geometries.length === 0 || precisionGeometries.includes(geometries[0]),
    maximumApproximateMassKg,
  };
}

function finiteMetrics(candidate: CandidateResult): boolean {
  return [candidate.grainMassKg, candidate.maximumPressureMpa, candidate.burnTimeSec, candidate.thrustEndTimeSec, candidate.maximumThrustN, candidate.averageThrustN, candidate.totalImpulseNs, candidate.specificImpulseSec].every(Number.isFinite);
}

function evaluateGeometry(config: CandidateSearchConfig, geometry: CandidateGeometry): { candidate?: CandidateResult; rejected?: true; failed?: true } {
  const input: DataAndKnInput = {
    chamberDiameterMm: config.chamberDiameterMm, chamberLengthMm: config.chamberLengthMm, propellant: config.propellant,
    grainOuterDiameterMm: geometry.outerDiameterMm, grainCoreDiameterMm: geometry.coreDiameterMm,
    segmentLengthMm: geometry.segmentLengthMm, segmentCount: geometry.segmentCount,
    outerSurface: config.outerSurface, coreSurface: config.coreSurface, endsSurface: config.endsSurface,
    densityRatio: config.densityRatio, targetPressureMpa: config.targetPressureMpa, nozzleErosionMm: config.nozzleErosionMm,
  };
  const validationIssues = config.mode === "excel" ? validateExcelReproductionInput(input) : validateManufacturingCandidate(input, { dimensionalStepMm: config.manufacturingStepMm ?? DEFAULT_MANUFACTURING_CONSTRAINTS.dimensionalStepMm });
  if (validationIssues.length > 0) return { rejected: true };
  try {
    const dataAndKn = calculateDataAndKn(input);
    const pressure = calculatePressure(dataAndKn);
    const performance = calculatePerformance(dataAndKn, pressure);
    const thrustEvaluation = config.targetThrustEnabled === false ? undefined : evaluateThrustCurve(performance, config.targetAverageThrustN);
    const score = scoreCandidate(config, { grainMassKg: dataAndKn.grainMassKg, maximumPressureMpa: pressure.maximumGaugePressureMpa, burnTimeSec: pressure.burnTimeSec, performance, thrustEvaluation });
    const reasons: string[] = [];
    if (!isWithinMassUpperBound(dataAndKn.grainMassKg, config.targetFuelMassKg)) reasons.push("목표 연료 질량을 초과했습니다.");
    if (Math.abs(dataAndKn.grainMassKg - config.targetFuelMassKg) > config.fuelMassToleranceKg) reasons.push("연료 질량 허용 범위를 벗어났습니다.");
    if (pressure.maximumGaugePressureMpa > config.maximumPressureMpa) reasons.push("최대 압력 제한을 초과했습니다.");
    if (config.targetThrustEnabled !== false && Math.abs(performance.averageThrustN - config.targetAverageThrustN) > config.averageThrustToleranceN) reasons.push("평균 추력 허용 범위를 벗어났습니다.");
    if (config.burnTimeFilterEnabled !== false && Math.abs(pressure.burnTimeSec - config.targetBurnTimeSec) > config.burnTimeToleranceSec) reasons.push("연소 시간 허용 범위를 벗어났습니다.");
    const candidate: CandidateResult = {
      input, grainMassKg: dataAndKn.grainMassKg, maximumPressureMpa: pressure.maximumGaugePressureMpa,
      burnTimeSec: pressure.burnTimeSec, thrustEndTimeSec: performance.thrustEndTimeSec,
      maximumThrustN: performance.maximumThrustN, averageThrustN: performance.averageThrustN,
      totalImpulseNs: performance.totalImpulseNs, specificImpulseSec: performance.specificImpulseSec,
      motorClass: performance.motorClass, score,
      status: reasons.length === 0 ? (config.targetThrustEnabled === false ? "conditional" : "pass") : "fail",
      reasons, dataAndKn, pressure, performance, thrustEvaluation,
    };
    return finiteMetrics(candidate) ? { candidate } : { failed: true };
  } catch {
    return { failed: true };
  }
}

function compareCandidatePriority(left: CandidateResult, right: CandidateResult, config: CandidateSearchConfig): number {
  const leftMassOver = isWithinMassUpperBound(left.grainMassKg, config.targetFuelMassKg) ? 0 : 1;
  const rightMassOver = isWithinMassUpperBound(right.grainMassKg, config.targetFuelMassKg) ? 0 : 1;
  if (leftMassOver !== rightMassOver) return leftMassOver - rightMassOver;
  const leftPressureOver = left.maximumPressureMpa <= config.maximumPressureMpa ? 0 : 1;
  const rightPressureOver = right.maximumPressureMpa <= config.maximumPressureMpa ? 0 : 1;
  if (leftPressureOver !== rightPressureOver) return leftPressureOver - rightPressureOver;
  if (left.status !== right.status) {
    const order = { pass: 0, conditional: 1, fail: 2 } as const;
    return order[left.status] - order[right.status];
  }
  const massDistance = Math.abs(left.grainMassKg - config.targetFuelMassKg) - Math.abs(right.grainMassKg - config.targetFuelMassKg);
  if (massDistance !== 0) return massDistance;
  const scoreDistance = right.score.totalScore - left.score.totalScore;
  if (scoreDistance !== 0) return scoreDistance;
  return `${left.input.grainOuterDiameterMm}-${left.input.grainCoreDiameterMm}-${left.input.segmentLengthMm}-${left.input.segmentCount}`.localeCompare(`${right.input.grainOuterDiameterMm}-${right.input.grainCoreDiameterMm}-${right.input.segmentLengthMm}-${right.input.segmentCount}`);
}

function finishSearch(config: CandidateSearchConfig, prepared: PreparedSearch, candidates: CandidateResult[], counters: SearchCounters): CandidateSearchResult {
  candidates.sort((left, right) => compareCandidatePriority(left, right, config));
  const passedCandidates = candidates.filter((candidate) => candidate.status !== "fail");
  const nearestRejectedCandidate = candidates.filter((candidate) => candidate.status === "fail").reduce<CandidateResult | undefined>((closest, candidate) => {
    if (!closest) return candidate;
    const candidateDistance = Math.abs(candidate.grainMassKg - config.targetFuelMassKg);
    const closestDistance = Math.abs(closest.grainMassKg - config.targetFuelMassKg);
    if (candidateDistance !== closestDistance) return candidateDistance < closestDistance ? candidate : closest;
    return compareCandidatePriority(candidate, closest, config) < 0 ? candidate : closest;
  }, undefined);
  const closestMassCandidate = (passedCandidates.length === 0 ? nearestRejectedCandidate : candidates.reduce<CandidateResult | undefined>((closest, candidate) => !closest || Math.abs(candidate.grainMassKg - config.targetFuelMassKg) < Math.abs(closest.grainMassKg - config.targetFuelMassKg) ? candidate : closest, undefined));
  const closestThrustCandidate = candidates.reduce<CandidateResult | undefined>((closest, candidate) => !closest || Math.abs(candidate.averageThrustN - config.targetAverageThrustN) < Math.abs(closest.averageThrustN - config.targetAverageThrustN) ? candidate : closest, undefined);
  const pressurePassing = candidates.filter((candidate) => candidate.maximumPressureMpa <= config.maximumPressureMpa);
  const hasMassMatch = pressurePassing.some((candidate) => Math.abs(candidate.grainMassKg - config.targetFuelMassKg) <= config.fuelMassToleranceKg);
  const hasThrustMatch = config.targetThrustEnabled === false || pressurePassing.some((candidate) => Math.abs(candidate.averageThrustN - config.targetAverageThrustN) <= config.averageThrustToleranceN);
  const hasPressureFailure = candidates.some((candidate) => candidate.reasons.some((reason) => reason.includes("최대 압력")));
  const hasBurnFailure = candidates.some((candidate) => candidate.reasons.some((reason) => reason.includes("연소 시간")));
  const hasThrustFailure = candidates.some((candidate) => candidate.reasons.some((reason) => reason.includes("평균 추력")));
  const hasMassToleranceFailure = candidates.some((candidate) => candidate.reasons.some((reason) => reason.includes("연료 질량 허용")));
  const automaticDiagnosis = prepared.maximumApproximateMassKg > 0 && config.targetFuelMassKg > prepared.maximumApproximateMassKg + MASS_UPPER_EPSILON_KG
    ? "목표 질량이 현재 탐색 범위의 최대 가능 질량보다 큽니다."
    : prepared.geometries.length === 0
      ? prepared.prevalidationRejectedCount === prepared.totalCombinations ? "유효한 형상 조합 없음" : "목표 질량 상한으로 모두 제외"
      : candidates.length === 0
        ? counters.calculationFailures > 0 ? "정밀 계산 실패" : "정밀 계산 결과 없음"
        : passedCandidates.length > 0 ? "목표 조건 동시 충족 후보 있음"
        : pressurePassing.length === 0 || hasPressureFailure && !pressurePassing.length ? "압력 조건으로 모두 제외"
        : hasBurnFailure || hasThrustFailure || hasMassToleranceFailure ? "질량/시간/추력 허용 오차 불일치"
        : !hasMassMatch ? "검색 범위에 목표 질량 후보 없음"
        : !hasThrustMatch ? "후보는 있지만 평균 추력 불일치"
        : "입력한 질량과 추력 조합을 동시에 만족하는 후보 없음";
  const rangeSummary = `범위 챔버 ${config.chamberDiameterMm}×${config.chamberLengthMm} mm, Do ${config.outerDiameterMm.min}~${config.outerDiameterMm.max}, do ${config.coreDiameterMm.min}~${config.coreDiameterMm.max}, Lo ${config.segmentLengthMm.min}~${config.segmentLengthMm.max}, 세그먼트 ${config.segmentCount.min}~${config.segmentCount.max}`;
  const automaticSummary = config.searchOrder === "target-mass"
    ? `${rangeSummary}. 자동 탐색 확장 ${config.automaticExpansionStage ?? 0}단계. 전체 후보 ${prepared.totalCombinations.toLocaleString()}개, 정밀 계산 전 형상 제외 ${prepared.prevalidationRejectedCount.toLocaleString()}개, 질량 상한 제외 ${prepared.massFilteredCount.toLocaleString()}개, 질량 계산 ${prepared.geometries.length.toLocaleString()}개, 정밀 계산 ${counters.evaluatedCombinations.toLocaleString()}개, 정밀 검증 탈락 ${counters.precisionValidationRejectedCount.toLocaleString()}개, 목표 질량 근처 후보 ${prepared.targetMassNearbyIncluded ? "포함" : "누락"}. 가장 가까운 질량 ${closestMassCandidate?.grainMassKg.toFixed(4) ?? "없음"} kg, 가장 가까운 추력 ${config.targetThrustEnabled === false ? "미입력" : `${closestThrustCandidate?.averageThrustN.toFixed(2) ?? "없음"} N`}. 중단 사유: ${automaticDiagnosis}.`
    : undefined;
  const partialWarning = "전체 조합 중 목표 질량 근처 일부 후보만 정밀 계산한 근사 추천이며, 전체 탐색 공간의 전역 최적해를 보장하지 않습니다.";
  const referenceRejected = passedCandidates.length === 0 && nearestRejectedCandidate ? 1 : 0;
  const rejected = candidates.filter((candidate) => candidate.status === "fail").length - referenceRejected;
  return {
    candidates, passedCandidates, nearestRejectedCandidate, totalCombinations: prepared.totalCombinations,
    evaluatedCombinations: counters.evaluatedCombinations,
    rejectedByValidation: prepared.prevalidationRejectedCount + counters.precisionValidationRejectedCount,
    prevalidationRejectedCount: prepared.prevalidationRejectedCount,
    precisionValidationRejectedCount: counters.precisionValidationRejectedCount,
    massFilteredCount: prepared.massFilteredCount,
    calculationFailures: counters.calculationFailures,
    prefilteredCandidateCount: prepared.geometries.length,
    targetMassNearbyIncluded: prepared.targetMassNearbyIncluded,
    truncated: prepared.truncated,
    warning: config.searchOrder === "target-mass" ? `${partialWarning} ${automaticSummary}` : (prepared.truncated ? `후보 조합 ${prepared.totalCombinations.toLocaleString()}개 중 ${counters.evaluatedCombinations.toLocaleString()}개만 계산했으며 전역 최적해를 보장하지 않습니다.` : automaticSummary),
    diagnosis: automaticDiagnosis,
    automaticExpansionStage: config.automaticExpansionStage,
    searchEnvelope: { chamberDiameterMm: config.chamberDiameterMm, chamberLengthMm: config.chamberLengthMm, outerDiameterMm: config.outerDiameterMm, coreDiameterMm: config.coreDiameterMm, segmentLengthMm: config.segmentLengthMm, segmentCount: config.segmentCount },
    metadata: { appVersion: APP_VERSION, engineVersion: CALCULATION_ENGINE_VERSION, calculatedAt: new Date().toISOString(), input: { ...config }, fuelMassToleranceKg: config.fuelMassToleranceKg, searchMode: config.mode ?? "candidate", automaticExpansionStage: config.automaticExpansionStage, totalCombinations: prepared.totalCombinations, evaluatedCombinations: counters.evaluatedCombinations, calculationFailures: counters.calculationFailures, counts: { recommend: candidates.filter((candidate) => candidate.status === "pass").length, conditional: candidates.filter((candidate) => candidate.status === "conditional").length, referenceRejected, rejected }, baselineVersion: BASELINE_VERSION, gsrmReferenceVersion: GSRM_REFERENCE_VERSION, anCatalogVersion: AN_CATALOG_VERSION, anCatalogItemCount: AN_CATALOG_ITEM_COUNT, status: "completed" },
  };
}

function accumulate(result: ReturnType<typeof evaluateGeometry>, candidates: CandidateResult[], counters: SearchCounters) {
  counters.evaluatedCombinations += 1;
  if (result.candidate) candidates.push(result.candidate);
  else if (result.rejected) counters.precisionValidationRejectedCount += 1;
  else counters.calculationFailures += 1;
}

export function searchCandidates(config: CandidateSearchConfig): CandidateSearchResult {
  const prepared = prepareSearch(config);
  const candidates: CandidateResult[] = [];
  const counters: SearchCounters = { evaluatedCombinations: 0, precisionValidationRejectedCount: 0, calculationFailures: 0 };
  for (const geometry of prepared.precisionGeometries) accumulate(evaluateGeometry(config, geometry), candidates, counters);
  return finishSearch(config, prepared, candidates, counters);
}

export async function searchCandidatesAsync(config: CandidateSearchConfig, options: { batchSize?: number; onProgress?: (progress: CandidateSearchProgress) => void; shouldCancel?: () => boolean } = {}): Promise<CandidateSearchResult> {
  const prepared = prepareSearch(config);
  const candidates: CandidateResult[] = [];
  const counters: SearchCounters = { evaluatedCombinations: 0, precisionValidationRejectedCount: 0, calculationFailures: 0 };
  const batchSize = Math.max(1, Math.floor(options.batchSize ?? 10));
  options.onProgress?.({ completed: 0, total: prepared.precisionGeometries.length });
  for (const geometry of prepared.precisionGeometries) {
    if (options.shouldCancel?.()) throw new CandidateSearchCancelledError();
    accumulate(evaluateGeometry(config, geometry), candidates, counters);
    if (counters.evaluatedCombinations % batchSize === 0 || counters.evaluatedCombinations === prepared.precisionGeometries.length) {
      options.onProgress?.({ completed: counters.evaluatedCombinations, total: prepared.precisionGeometries.length });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }
  return finishSearch(config, prepared, candidates, counters);
}
