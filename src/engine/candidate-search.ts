import { calculateDataAndKn } from "./data-and-kn";
import { calculatePressure } from "./blowdown";
import { calculatePerformance } from "./performance";
import { scoreCandidate } from "./candidate-score";
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
    ["최대 허용 압력", config.maximumPressureMpa], ["목표 평균 추력", config.targetAverageThrustN],
    ["추력 허용 오차", config.averageThrustToleranceN], ["목표 연소 시간", config.targetBurnTimeSec],
    ["시간 허용 오차", config.burnTimeToleranceSec], ["목표 압력", config.targetPressureMpa],
  ] as const;
  for (const [name, value] of positive) if (!Number.isFinite(value) || value <= 0) issues.push(`${name}은 0보다 큰 유한값이어야 합니다.`);
  validateRange("Do", config.outerDiameterMm, issues);
  validateRange("do", config.coreDiameterMm, issues);
  validateRange("Lo", config.segmentLengthMm, issues);
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
  const chamberMax = Math.max(50, Math.floor((config.chamberDiameterMm - 5) / 5) * 5);
  const maxLength = Math.max(85, Math.floor((config.chamberLengthMm - 5) / 5) * 5);
  const targetScale = Math.max(1, Math.sqrt(Math.max(config.targetFuelMassKg, 0.01) / 0.3956));
  const outerMin = 30;
  const outerMax = Math.min(chamberMax, Math.max(50, Math.ceil(50 * targetScale / 5) * 5));
  const coreMax = Math.max(20, Math.min(outerMax - 5, Math.ceil(20 * targetScale / 5) * 5));
  const lengthMax = Math.min(maxLength, Math.max(85, Math.ceil(85 * targetScale / 5) * 5));
  return {
    ...config,
    outerDiameterMm: { min: outerMin, max: outerMax, step: 5 },
    coreDiameterMm: { min: 5, max: coreMax, step: 5 },
    segmentLengthMm: { min: 25, max: lengthMax, step: 5 },
    segmentCount: { min: 1, max: Math.min(8, Math.max(2, Math.ceil(targetScale * 3))) },
    maxCandidateCount: Math.min(config.maxCandidateCount ?? DEFAULT_MAX_CANDIDATES, 2500),
    manufacturingStepMm: 5,
    burnTimeFilterEnabled: false,
  };
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

  outerLoop: for (const outerDiameterMm of outerValues) {
    for (const coreDiameterMm of coreValues) {
      for (const segmentLengthMm of lengthValues) {
        for (const segmentCount of segmentValues) {
          if (evaluatedCombinations >= maxCandidateCount) break outerLoop;
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
            const score = scoreCandidate(config, {
              grainMassKg: dataAndKn.grainMassKg,
              maximumPressureMpa: pressure.maximumGaugePressureMpa,
              burnTimeSec: pressure.burnTimeSec,
              performance,
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
            if (
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
              status: reasons.length === 0 ? "pass" : "fail",
              reasons,
              dataAndKn,
              pressure,
              performance,
            };
            if (finiteMetrics(candidate)) candidates.push(candidate);
            else calculationFailures += 1;
          } catch {
            calculationFailures += 1;
          }
        }
      }
    }
  }

  candidates.sort((left, right) => {
    if (left.status !== right.status) return left.status === "pass" ? -1 : 1;
    return right.score.totalScore - left.score.totalScore;
  });
  const passedCandidates = candidates.filter((candidate) => candidate.status === "pass");
  return {
    candidates,
    passedCandidates,
    totalCombinations,
    evaluatedCombinations,
    rejectedByValidation,
    calculationFailures,
    truncated,
    warning: truncated
      ? `후보 조합 ${totalCombinations.toLocaleString()}개 중 ${maxCandidateCount.toLocaleString()}개까지만 계산했습니다.`
      : undefined,
  };
}
