import { solveBisection } from "./solvers/bisection";
import type {
  BlowdownOptions,
  DataAndKnResult,
  PressureBlowdownResult,
  PressureCombustionResult,
  PressureResult,
  PressureSimulationOptions,
} from "./types";
import { calculateCombustionPressure } from "./pressure";

export const BLOWDOWN_FIRST_EXCEL_ROW = 863;
export const BLOWDOWN_THRUST_END_EXCEL_ROW = 909;
export const BLOWDOWN_CURVE_END_EXCEL_ROW = 910;

const PASCALS_PER_MPA = 1_000_000;
const PASCALS_PER_PSI = 6895;
const EXCEL_GOAL_SEEK_MAXIMUM_CHANGE = 0.001;
const EXCEL_GOAL_SEEK_MAX_ITERATIONS = 100;
const WORKBOOK_TIME_INCREMENT_SEED_SEC = 0.0010730117625033801;
const WORKBOOK_PERCENT_OF_MAXIMUM_PRESSURE = 0.02;
const PRESSURE_RESIDUAL_OFFSET_MPA = 0.101;

const DEFAULT_OPTIONS: Required<BlowdownOptions> = {
  timeIncrementSeedSec: WORKBOOK_TIME_INCREMENT_SEED_SEC,
  maximumChange: EXCEL_GOAL_SEEK_MAXIMUM_CHANGE,
  maxIterations: EXCEL_GOAL_SEEK_MAX_ITERATIONS,
  percentOfMaximumPressure: WORKBOOK_PERCENT_OF_MAXIMUM_PRESSURE,
};

function blowdownAbsolutePressureMpa(
  combustion: PressureCombustionResult,
  dataAndKn: DataAndKnResult,
  timeSec: number,
): number {
  const burnout = combustion.rows.at(-1)!;
  return (
    burnout.absolutePressureFromStateMpa *
    Math.exp(
      (-combustion.gasConstantJPerKgK *
        combustion.chamberTemperatureK *
        burnout.throatAreaM2 *
        (timeSec - combustion.burnTimeSec) *
        1_000_000_000) /
        dataAndKn.chamberVolumeMm3 /
        combustion.characteristicVelocityMPerSec,
    )
  );
}

function timeAtExcelRow(
  burnTimeSec: number,
  timeIncrementSec: number,
  excelRow: number,
): number {
  let timeSec = burnTimeSec;
  for (let row = BLOWDOWN_FIRST_EXCEL_ROW; row <= excelRow; row += 1) {
    timeSec = timeSec + timeIncrementSec;
  }
  return timeSec;
}

export function calculateBlowdown(
  dataAndKn: DataAndKnResult,
  combustion: PressureCombustionResult,
  options: BlowdownOptions = {},
): PressureBlowdownResult {
  const settings = { ...DEFAULT_OPTIONS, ...options };
  const finalPressureTargetMpa =
    (settings.percentOfMaximumPressure / 100) *
      combustion.maximumGaugePressureMpa +
    combustion.atmosphericPressureMpa;

  const residual = (timeIncrementSec: number) => {
    const finalTimeSec = timeAtExcelRow(
      combustion.burnTimeSec,
      timeIncrementSec,
      BLOWDOWN_THRUST_END_EXCEL_ROW,
    );
    const finalAbsolutePressureMpa = blowdownAbsolutePressureMpa(
      combustion,
      dataAndKn,
      finalTimeSec,
    );
    // Pressure!AA909 = AA908 - pfinal + 0.101
    return (
      finalPressureTargetMpa -
      finalAbsolutePressureMpa +
      PRESSURE_RESIDUAL_OFFSET_MPA
    );
  };

  const solution = solveBisection(residual, {
    lower: 0,
    upper: 1,
    initialGuess: settings.timeIncrementSeedSec,
    functionTolerance: settings.maximumChange,
    tolerance: Number.EPSILON,
    maxIterations: settings.maxIterations,
  });

  const rows = [];
  let timeSec = combustion.burnTimeSec;
  for (
    let excelRow = BLOWDOWN_FIRST_EXCEL_ROW;
    excelRow <= BLOWDOWN_CURVE_END_EXCEL_ROW;
    excelRow += 1
  ) {
    timeSec = timeSec + solution.root;
    const isCurveEnd = excelRow === BLOWDOWN_CURVE_END_EXCEL_ROW;
    const absolutePressureMpa = isCurveEnd
      ? 0
      : blowdownAbsolutePressureMpa(combustion, dataAndKn, timeSec);
    const gaugePressureMpa = isCurveEnd
      ? 0
      : absolutePressureMpa - combustion.atmosphericPressureMpa;
    rows.push({
      excelRow,
      timeSec,
      absolutePressureMpa,
      gaugePressureMpa,
      gaugePressurePsi: (gaugePressureMpa * PASCALS_PER_MPA) / PASCALS_PER_PSI,
    });
  }

  return {
    timeIncrementSec: solution.root,
    goalSeekResidualMpa: solution.residual,
    solverIterations: solution.iterations,
    finalPressureTargetMpa,
    thrustEndTimeSec:
      rows[BLOWDOWN_THRUST_END_EXCEL_ROW - BLOWDOWN_FIRST_EXCEL_ROW].timeSec,
    curveEndTimeSec: rows.at(-1)!.timeSec,
    rows,
  };
}

export function calculatePressure(
  dataAndKn: DataAndKnResult,
  pressureOptions: PressureSimulationOptions = {},
  blowdownOptions: BlowdownOptions = {},
): PressureResult {
  const combustion = calculateCombustionPressure(dataAndKn, pressureOptions);
  const blowdown = calculateBlowdown(dataAndKn, combustion, blowdownOptions);
  return {
    combustion,
    blowdown,
    maximumGaugePressureMpa: combustion.maximumGaugePressureMpa,
    burnTimeSec: combustion.burnTimeSec,
    thrustEndTimeSec: blowdown.thrustEndTimeSec,
  };
}
