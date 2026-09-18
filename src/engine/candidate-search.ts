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
            if (
              Math.abs(pressure.burnTimeSec - config.targetBurnTimeSec) >
              config.burnTimeToleranceSec
            ) {
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
