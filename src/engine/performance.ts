import { classifyMotor } from "./data/motor-class";
import { solveBisection } from "./solvers/bisection";
import type {
  DataAndKnResult,
  PerformanceOptions,
  PerformanceResult,
  PerformanceRow,
  PressureResult,
} from "./types";

const PASCALS_PER_MPA = 1_000_000;
const NEWTONS_PER_LBF = 4.4482;
const STANDARD_GRAVITY_M_PER_SEC2 = 9.806;
const EXCEL_GOAL_SEEK_MAXIMUM_CHANGE = 0.001;
const EXCEL_GOAL_SEEK_MAX_ITERATIONS = 100;
const WORKBOOK_EXIT_MACH_SEED = 2.8115374657521723;

const DEFAULT_OPTIONS: Required<PerformanceOptions> = {
  nozzleEfficiency: 0.85,
  initialExpansionRatio: 6.2,
  exitMachSeed: WORKBOOK_EXIT_MACH_SEED,
  maximumChange: EXCEL_GOAL_SEEK_MAXIMUM_CHANGE,
  maxIterations: EXCEL_GOAL_SEEK_MAX_ITERATIONS,
};

function solveExitMach(
  expansionRatio: number,
  specificHeatRatio: number,
  settings: Required<PerformanceOptions>,
) {
  const residual = (mach: number) =>
    expansionRatio -
    (1 / mach) *
      ((1 + ((specificHeatRatio - 1) / 2) * mach ** 2) /
        (1 + (specificHeatRatio - 1) / 2)) **
        ((specificHeatRatio + 1) / (2 * (specificHeatRatio - 1)));

  return solveBisection(residual, {
    lower: 1,
    upper: 20,
    initialGuess: settings.exitMachSeed,
    functionTolerance: settings.maximumChange,
    tolerance: Number.EPSILON,
    maxIterations: settings.maxIterations,
  });
}

function calculateOptimumExpansionRatio(
  chamberPressurePa: number,
  atmosphericPressurePa: number,
  specificHeatRatio: number,
): number {
  return (
    1 /
    (((specificHeatRatio + 1) / 2) ** (1 / (specificHeatRatio - 1)) *
      (atmosphericPressurePa / chamberPressurePa) ** (1 / specificHeatRatio) *
      Math.sqrt(
        ((specificHeatRatio + 1) / (specificHeatRatio - 1)) *
          (1 -
            (atmosphericPressurePa / chamberPressurePa) **
              ((specificHeatRatio - 1) / specificHeatRatio)),
      ))
  );
}

function calculateThrustCoefficient(
  chamberPressurePa: number,
  exitPressurePa: number,
  atmosphericPressurePa: number,
  exitToThroatAreaRatio: number,
  specificHeatRatio: number,
  nozzleEfficiency: number,
): number {
  return (
    nozzleEfficiency *
      Math.sqrt(
        ((2 * specificHeatRatio ** 2) / (specificHeatRatio - 1)) *
          (2 / (specificHeatRatio + 1)) **
            ((specificHeatRatio + 1) / (specificHeatRatio - 1)) *
          (1 -
            (exitPressurePa / chamberPressurePa) **
              ((specificHeatRatio - 1) / specificHeatRatio)),
      ) +
    ((exitPressurePa - atmosphericPressurePa) / chamberPressurePa) *
      exitToThroatAreaRatio
  );
}

/** Ports Performance!C28:N910 and summary cells C12:C19/K21:K23. */
export function calculatePerformance(
  dataAndKn: DataAndKnResult,
  pressure: PressureResult,
  options: PerformanceOptions = {},
): PerformanceResult {
  const settings = { ...DEFAULT_OPTIONS, ...options };
  const specificHeatRatio = dataAndKn.propellantConstants.specificHeatRatio;
  const atmosphericPressurePa =
    pressure.combustion.atmosphericPressureMpa * PASCALS_PER_MPA;
  const nozzleExitAreaMm2 =
    settings.initialExpansionRatio * dataAndKn.throatAreaMm2;
  const finalThroatAreaMm2 = pressure.combustion.rows.at(-1)!.throatAreaMm2;
  const finalExpansionRatio = nozzleExitAreaMm2 / finalThroatAreaMm2;
  const initialMachSolution = solveExitMach(
    settings.initialExpansionRatio,
    specificHeatRatio,
    settings,
  );
  const finalMachSolution = solveExitMach(
    finalExpansionRatio,
    specificHeatRatio,
    settings,
  );
  const rows: PerformanceRow[] = [];
  let exitMach = initialMachSolution.root;

  const appendCalculatedRow = (
    excelRow: number,
    chamberPressurePa: number,
    throatAreaM2: number,
    throatAreaMm2: number,
    timeSec: number,
    currentExitMach: number,
    expansionRatio: number | null,
  ) => {
    const previous = rows.at(-1);
    const isInitial = excelRow === 28;
    const exitPressureUnclamped =
      chamberPressurePa /
      (1 + ((specificHeatRatio - 1) / 2) * currentExitMach ** 2) **
        (specificHeatRatio / (specificHeatRatio - 1));
    const exitPressurePa = Math.max(
      atmosphericPressurePa,
      exitPressureUnclamped,
    );
    const optimumExpansionRatio = isInitial
      ? 1
      : calculateOptimumExpansionRatio(
          chamberPressurePa,
          atmosphericPressurePa,
          specificHeatRatio,
        );
    const thrustCoefficient = isInitial
      ? settings.nozzleEfficiency
      : calculateThrustCoefficient(
          chamberPressurePa,
          exitPressurePa,
          atmosphericPressurePa,
          nozzleExitAreaMm2 / throatAreaMm2,
          specificHeatRatio,
          settings.nozzleEfficiency,
        );
    const thrustN = isInitial
      ? 0
      : thrustCoefficient * throatAreaM2 * chamberPressurePa;
    const impulseIncrementNs = previous
      ? ((thrustN + previous.thrustN) / 2) * (timeSec - previous.timeSec)
      : 0;

    rows.push({
      excelRow,
      chamberPressurePa,
      throatAreaM2,
      throatAreaMm2,
      expansionRatio,
      exitPressurePa,
      optimumExpansionRatio,
      thrustCoefficient,
      thrustN,
      thrustLbf: thrustN / NEWTONS_PER_LBF,
      timeSec,
      impulseIncrementNs,
      exitMach: currentExitMach,
    });
  };

  for (const combustionRow of pressure.combustion.rows) {
    if (combustionRow.excelRow > 28) {
      exitMach =
        exitMach -
        (initialMachSolution.root - finalMachSolution.root) /
          (pressure.combustion.rows.length - 1);
    }
    appendCalculatedRow(
      combustionRow.excelRow,
      combustionRow.absolutePressureFromStateMpa * PASCALS_PER_MPA,
      combustionRow.throatAreaM2,
      combustionRow.throatAreaMm2,
      combustionRow.timeSec,
      exitMach,
      nozzleExitAreaMm2 / combustionRow.throatAreaMm2,
    );
  }

  for (const blowdownRow of pressure.blowdown.rows) {
    const isCurveEnd = blowdownRow.excelRow === 910;
    if (isCurveEnd) {
      const previous = rows.at(-1)!;
      rows.push({
        excelRow: blowdownRow.excelRow,
        chamberPressurePa: 0,
        throatAreaM2: finalThroatAreaMm2 / 1000 ** 2,
        throatAreaMm2: finalThroatAreaMm2,
        expansionRatio: null,
        exitPressurePa: atmosphericPressurePa,
        optimumExpansionRatio: 1,
        thrustCoefficient: previous.thrustCoefficient,
        thrustN: 0,
        thrustLbf: 0,
        timeSec: blowdownRow.timeSec,
        impulseIncrementNs:
          ((0 + previous.thrustN) / 2) *
          (blowdownRow.timeSec - previous.timeSec),
        exitMach: finalMachSolution.root,
      });
    } else {
      appendCalculatedRow(
        blowdownRow.excelRow,
        blowdownRow.absolutePressureMpa * PASCALS_PER_MPA,
        finalThroatAreaMm2 / 1000 ** 2,
        finalThroatAreaMm2,
        blowdownRow.timeSec,
        finalMachSolution.root,
        null,
      );
    }
  }

  const rowsThroughThrustEnd = rows.filter((row) => row.excelRow <= 909);
  const totalImpulseNs = rows.reduce(
    (sum, row) => sum + row.impulseIncrementNs,
    0,
  );
  const averageBurnRateMmPerSec =
    pressure.combustion.rows.reduce(
      (sum, row) => sum + row.burnRateMmPerSec,
      0,
    ) / pressure.combustion.rows.length;

  return {
    initialExitMach: initialMachSolution.root,
    initialExitMachResidual: initialMachSolution.residual,
    finalExitMach: finalMachSolution.root,
    finalExitMachResidual: finalMachSolution.residual,
    nozzleExitAreaMm2,
    nozzleExitDiameterMm: Math.sqrt((4 * nozzleExitAreaMm2) / Math.PI),
    maximumOptimumExpansionRatio: Math.max(
      ...rowsThroughThrustEnd.map((row) => row.optimumExpansionRatio),
    ),
    averageOptimumExpansionRatio:
      rowsThroughThrustEnd.reduce(
        (sum, row) => sum + row.optimumExpansionRatio,
        0,
      ) / rowsThroughThrustEnd.length,
    webFraction:
      (2 * averageBurnRateMmPerSec * pressure.burnTimeSec) /
      dataAndKn.input.grainOuterDiameterMm,
    maximumThrustCoefficient: Math.max(
      ...rows.map((row) => row.thrustCoefficient),
    ),
    maximumThrustN: Math.max(...rows.map((row) => row.thrustN)),
    totalImpulseNs,
    averageThrustN: totalImpulseNs / pressure.thrustEndTimeSec,
    specificImpulseSec:
      totalImpulseNs / STANDARD_GRAVITY_M_PER_SEC2 / dataAndKn.grainMassKg,
    motorClass: classifyMotor(totalImpulseNs),
    thrustEndTimeSec: pressure.thrustEndTimeSec,
    rows,
  };
}
