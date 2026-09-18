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
  CandidateSearchResult,
  DataAndKnInput,
} from "./types";

const DEFAULT_MAX_CANDIDATES = 2_000;

export class CandidateSearchInputError extends Error {
  readonly issues: readonly string[];
  constructor(issues: readonly string[]) {
    super(`Invalid candidate search input: ${issues.join("; ")}`);
    this.name = "CandidateSearchInputError";
    this.issues = issues;
  }
}

function validateRange(name: string, range: CandidateNumberRange, issues: string[]) {
  const step = range.step ?? 5;
  if (!Number.isFinite(range.min) || !Number.isFinite(range.max) || range.min > range.max) {
    issues.push(`${name} 범위의 최소·최대값을 확인하세요.`);
  }
  if (!Number.isFinite(step) || step <= 0) issues.push(`${name} 간격은 0보다 큰 숫자여야 합니다.`);
}

export function validateCandidateSearchConfig(config: CandidateSearchConfig): readonly string[] {
  const issues: string[] = [];
  const positive = [
    ["챔버 직경", config.chamberDiameterMm], ["챔버 길이", config.chamberLengthMm],
    ["목표 연료 질량", config.targetFuelMassKg], ["질량 허용 오차", config.fuelMassToleranceKg],
    ["최대 허용 압력", config.maximumPressureMpa],
    ["추력 허용 오차", config.averageThrustToleranceN], ["목표 연소 시간", config.targetBurnTimeSec],
    ["시간 허용 오차", config.burnTimeToleranceSec], ["목표 압력", config.targetPressureMpa],
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
  if (!Number.isFinite(config.densityRatio) || config.densityRatio <= 0) issues.push("밀도비는 0보다 큰 유한값이어야 합니다.");
  if (!Number.isFinite(config.nozzleErosionMm) || config.nozzleErosionMm < 0) issues.push("노즐 침식량은 0 이상인 유한값이어야 합니다.");
  return issues;
}

function rangeValues(range: CandidateNumberRange, fallbackStep: number): number[] {
  const step = range.step ?? fallbackStep;
  if (
    !Number.isFinite(range.min) ||
    !Number.isFinite(range.max) ||
    !Number.isFinite(step) ||
    step <= 0 ||
    range.max < range.min
  ) {
    return [];
  }
  const values: number[] = [];
  for (let value = range.min; value <= range.max + step * 1e-9; value += step) {
    values.push(Number(value.toFixed(12)));
  }
  return values;
}

function integerValues(min: number, max: number): number[] {
  if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) return [];
  return Array.from({ length: max - min + 1 }, (_, index) => min + index);
}

export function estimateCandidateCount(config: CandidateSearchConfig): number {
  return (
    rangeValues(config.outerDiameterMm, 5).length *
    rangeValues(config.coreDiameterMm, 5).length *
    rangeValues(config.segmentLengthMm, 5).length *
    integerValues(config.segmentCount.min, config.segmentCount.max).length
  );
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
  const coreMax = Math.max(20, outerMax - 10);
  const lengthMax = Math.max(85, Math.min(chamberLengthMm, Math.ceil(85 * linearScale / 5) * 5));
  const precisionBudget = expansionStage === 0 ? 600 : expansionStage === 1 ? 1000 : 1600;
  return {
    ...config,
    chamberDiameterMm,
    chamberLengthMm,
    outerDiameterMm: { min: outerMin, max: outerMax, step: 5 },
    coreDiameterMm: { min: 5, max: coreMax, step: 5 },
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

function approximateGrainMassKg(config: CandidateSearchConfig, outerDiameterMm: number, coreDiameterMm: number, segmentLengthMm: number, segmentCount: number): number {
  const density = config.densityRatio * selectPropellantConstants(config.propellant).idealDensityGPerCm3;
  const volumeMm3 = Math.PI * (outerDiameterMm ** 2 - coreDiameterMm ** 2) * segmentLengthMm * segmentCount / 4;
  return density * volumeMm3 / 1_000_000;
}

function finiteMetrics(candidate: CandidateResult): boolean {
  return [
    candidate.grainMassKg,
    candidate.maximumPressureMpa,
    candidate.burnTimeSec,
    candidate.thrustEndTimeSec,
    candidate.maximumThrustN,
    candidate.averageThrustN,
    candidate.totalImpulseNs,
    candidate.specificImpulseSec,
  ].every(Number.isFinite);
}

export function searchCandidates(config: CandidateSearchConfig): CandidateSearchResult {
  const inputIssues = validateCandidateSearchConfig(config);
  if (inputIssues.length > 0) throw new CandidateSearchInputError(inputIssues);
  const outerValues = rangeValues(config.outerDiameterMm, 5);
  const coreValues = rangeValues(config.coreDiameterMm, 5);
  const lengthValues = rangeValues(config.segmentLengthMm, 5);
  const segmentValues = integerValues(
    config.segmentCount.min,
    config.segmentCount.max,
  );
  const totalCombinations =
    outerValues.length *
    coreValues.length *
    lengthValues.length *
    segmentValues.length;
  const maxCandidateCount = config.maxCandidateCount ?? DEFAULT_MAX_CANDIDATES;
  const truncated = totalCombinations > maxCandidateCount;
  const candidates: CandidateResult[] = [];
  let evaluatedCombinations = 0;
  let rejectedByValidation = 0;
  let calculationFailures = 0;

  const geometries: CandidateGeometry[] = [];
  for (const outerDiameterMm of outerValues) {
    for (const coreDiameterMm of coreValues) {
      for (const segmentLengthMm of lengthValues) {
        for (const segmentCount of segmentValues) {
          if (config.searchOrder === "target-mass" && (outerDiameterMm <= coreDiameterMm || outerDiameterMm > config.chamberDiameterMm || segmentLengthMm * segmentCount > config.chamberLengthMm)) {
            rejectedByValidation += 1;
            continue;
          }
          geometries.push({
            outerDiameterMm,
            coreDiameterMm,
            segmentLengthMm,
            segmentCount,
            approximateMassKg: approximateGrainMassKg(config, outerDiameterMm, coreDiameterMm, segmentLengthMm, segmentCount),
          });
        }
      }
    }
  }
  if (config.searchOrder === "target-mass") {
    geometries.sort((left, right) => Math.abs(left.approximateMassKg - config.targetFuelMassKg) - Math.abs(right.approximateMassKg - config.targetFuelMassKg));
  }
  const precisionGeometries = geometries.slice(0, maxCandidateCount);
  const targetMassNearbyIncluded = geometries.length === 0 || precisionGeometries.includes(geometries[0]);

  for (const { outerDiameterMm, coreDiameterMm, segmentLengthMm, segmentCount } of precisionGeometries) {
          evaluatedCombinations += 1;
          const input: DataAndKnInput = {
            chamberDiameterMm: config.chamberDiameterMm,
            chamberLengthMm: config.chamberLengthMm,
            propellant: config.propellant,
            grainOuterDiameterMm: outerDiameterMm,
            grainCoreDiameterMm: coreDiameterMm,
            segmentLengthMm,
            segmentCount,
            outerSurface: config.outerSurface,
            coreSurface: config.coreSurface,
            endsSurface: config.endsSurface,
            densityRatio: config.densityRatio,
            targetPressureMpa: config.targetPressureMpa,
            nozzleErosionMm: config.nozzleErosionMm,
          };
          const validationIssues =
            config.mode === "excel"
              ? validateExcelReproductionInput(input)
              : validateManufacturingCandidate(input, {
                  dimensionalStepMm:
                    config.manufacturingStepMm ??
                    DEFAULT_MANUFACTURING_CONSTRAINTS.dimensionalStepMm,
                });
          if (validationIssues.length > 0) {
            rejectedByValidation += 1;
            continue;
          }

          try {
            const dataAndKn = calculateDataAndKn(input);
            const pressure = calculatePressure(dataAndKn);
            const performance = calculatePerformance(dataAndKn, pressure);
            const thrustEvaluation = config.targetThrustEnabled === false ? undefined : evaluateThrustCurve(performance, config.targetAverageThrustN);
            const score = scoreCandidate(config, {
              grainMassKg: dataAndKn.grainMassKg,
              maximumPressureMpa: pressure.maximumGaugePressureMpa,
              burnTimeSec: pressure.burnTimeSec,
              performance,
              thrustEvaluation,
            });
            const reasons: string[] = [];
            if (
              Math.abs(dataAndKn.grainMassKg - config.targetFuelMassKg) >
              config.fuelMassToleranceKg
            ) {
              reasons.push("연료 질량 허용 범위를 벗어났습니다.");
            }
            if (pressure.maximumGaugePressureMpa > config.maximumPressureMpa) {
              reasons.push("최대 압력 제한을 초과했습니다.");
            }
            if (config.targetThrustEnabled !== false &&
              Math.abs(
                performance.averageThrustN - config.targetAverageThrustN,
              ) > config.averageThrustToleranceN
            ) {
              reasons.push("평균 추력 허용 범위를 벗어났습니다.");
            }
            if (config.burnTimeFilterEnabled !== false &&
              Math.abs(pressure.burnTimeSec - config.targetBurnTimeSec) > config.burnTimeToleranceSec) {
              reasons.push("연소 시간 허용 범위를 벗어났습니다.");
            }

            const candidate: CandidateResult = {
              input,
              grainMassKg: dataAndKn.grainMassKg,
              maximumPressureMpa: pressure.maximumGaugePressureMpa,
              burnTimeSec: pressure.burnTimeSec,
              thrustEndTimeSec: performance.thrustEndTimeSec,
              maximumThrustN: performance.maximumThrustN,
              averageThrustN: performance.averageThrustN,
              totalImpulseNs: performance.totalImpulseNs,
              specificImpulseSec: performance.specificImpulseSec,
              motorClass: performance.motorClass,
              score,
              status: reasons.length === 0 ? (config.targetThrustEnabled === false ? "conditional" : "pass") : "fail",
              reasons,
              dataAndKn,
              pressure,
              performance,
              thrustEvaluation,
            };
            if (finiteMetrics(candidate)) candidates.push(candidate);
            else calculationFailures += 1;
          } catch {
            calculationFailures += 1;
          }
  }

  candidates.sort((left, right) => {
    if (left.status !== right.status) {
      const order = { pass: 0, conditional: 1, fail: 2 } as const;
      return order[left.status] - order[right.status];
    }
    return right.score.totalScore - left.score.totalScore;
  });
  const passedCandidates = candidates.filter((candidate) => candidate.status !== "fail");
  const closestMassCandidate = candidates.reduce<CandidateResult | undefined>((closest, candidate) => !closest || Math.abs(candidate.grainMassKg - config.targetFuelMassKg) < Math.abs(closest.grainMassKg - config.targetFuelMassKg) ? candidate : closest, undefined);
  const closestThrustCandidate = candidates.reduce<CandidateResult | undefined>((closest, candidate) => !closest || Math.abs(candidate.averageThrustN - config.targetAverageThrustN) < Math.abs(closest.averageThrustN - config.targetAverageThrustN) ? candidate : closest, undefined);
  const pressurePassing = candidates.filter((candidate) => candidate.maximumPressureMpa <= config.maximumPressureMpa);
  const hasMassMatch = pressurePassing.some((candidate) => Math.abs(candidate.grainMassKg - config.targetFuelMassKg) <= config.fuelMassToleranceKg);
  const hasThrustMatch = pressurePassing.some((candidate) => Math.abs(candidate.averageThrustN - config.targetAverageThrustN) <= config.averageThrustToleranceN);
  const automaticDiagnosis = candidates.length === 0
    ? "탐색 범위에 계산 가능한 후보 없음"
    : pressurePassing.length === 0
      ? "후보는 있지만 최대 압력 초과"
      : !hasMassMatch
        ? "검색 범위에 목표 질량 후보 없음"
        : !hasThrustMatch
          ? "후보는 있지만 평균 추력 불일치"
          : passedCandidates.length === 0
            ? "입력한 질량과 추력 조합을 동시에 만족하는 후보 없음"
            : "목표 조건 동시 충족 후보 있음";
  const automaticSummary = config.searchOrder === "target-mass"
    ? `자동 탐색 확장 ${config.automaticExpansionStage ?? 0}단계. 전체 후보 ${totalCombinations.toLocaleString()}개, 사전 제외 ${rejectedByValidation.toLocaleString()}개, 질량 계산 ${geometries.length.toLocaleString()}개, 정밀 계산 ${evaluatedCombinations.toLocaleString()}개, 목표 질량 근처 후보 ${targetMassNearbyIncluded ? "포함" : "누락"}. 가장 가까운 질량 ${closestMassCandidate?.grainMassKg.toFixed(4) ?? "없음"} kg, 가장 가까운 추력 ${config.targetThrustEnabled === false ? "미입력" : `${closestThrustCandidate?.averageThrustN.toFixed(2) ?? "없음"} N`}. 진단: ${automaticDiagnosis}.`
    : undefined;
  return {
    candidates,
    passedCandidates,
    totalCombinations,
    evaluatedCombinations,
    rejectedByValidation,
    calculationFailures,
    prefilteredCandidateCount: geometries.length,
    targetMassNearbyIncluded,
    truncated,
    warning: truncated
      ? config.searchOrder === "target-mass"
        ? `후보 조합 중 일부만 정밀 계산했으며, 목표 질량 근처 후보를 우선 평가했습니다. ${automaticSummary}`
        : `후보 조합 ${totalCombinations.toLocaleString()}개 중 ${maxCandidateCount.toLocaleString()}개까지만 계산했습니다.`
      : automaticSummary,
  };
}
