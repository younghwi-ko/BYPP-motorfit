import { selectBurnRateCoefficients } from "./data/burnrate";
import { solveBisection } from "./solvers/bisection";
import type {
  DataAndKnResult,
  PressureCombustionResult,
  PressureCombustionRow,
  PressureSimulationOptions,
} from "./types";

export const PRESSURE_FIRST_EXCEL_ROW = 28;
export const PRESSURE_LAST_COMBUSTION_EXCEL_ROW = 862;
export const PRESSURE_INTERVAL_COUNT =
  PRESSURE_LAST_COMBUSTION_EXCEL_ROW - PRESSURE_FIRST_EXCEL_ROW;

const UNIVERSAL_GAS_CONSTANT_J_PER_MOL_K = 8314;
const PASCALS_PER_MPA = 1_000_000;
const PSI_PRESSURE_CONVERSION = 6895;

const DEFAULT_OPTIONS: Required<PressureSimulationOptions> = {
  combustionEfficiency: 0.93,
  atmosphericPressureMpa: 0.101,
  erosiveBurningCriticalRatio: 6,
  erosiveBurningCoefficient: 0,
  burstPressureMpa: 0,
};

function surfaceFlag(surface: "Exposed" | "Inhibited"): number {
  return surface === "Exposed" ? 1 : 0;
}

function calculateFinalWebResidual(
  dataAndKn: DataAndKnResult,
  xIncrementMm: number,
): number {
  const { input } = dataAndKn;
  const coreFlag = surfaceFlag(input.coreSurface);
  const outerFlag = surfaceFlag(input.outerSurface);
  let coreDiameterMm = input.grainCoreDiameterMm;
  let outerDiameterMm = input.grainOuterDiameterMm;

  // Pressure!E29:F862: preserve the sheet's row-by-row additions.
  for (let interval = 1; interval <= PRESSURE_INTERVAL_COUNT; interval += 1) {
    coreDiameterMm = coreDiameterMm + coreFlag * 2 * xIncrementMm;
    outerDiameterMm = outerDiameterMm - outerFlag * 2 * xIncrementMm;
  }
  return (outerDiameterMm - coreDiameterMm) / 2;
}

function solveXIncrement(dataAndKn: DataAndKnResult) {
  const initialWebMm =
    (dataAndKn.input.grainOuterDiameterMm -
      dataAndKn.input.grainCoreDiameterMm) /
    2;
  return solveBisection(
    (xIncrementMm) => calculateFinalWebResidual(dataAndKn, xIncrementMm),
    { lower: 0, upper: initialWebMm, tolerance: 1e-15, maxIterations: 128 },
  );
}

function nozzleMassFlowLimit(
  absolutePressureMpa: number,
  throatAreaM2: number,
  atmosphericPressureMpa: number,
  gasConstantJPerKgK: number,
  chamberTemperatureK: number,
  specificHeatRatio: number,
): number {
  return (
    ((absolutePressureMpa - atmosphericPressureMpa) * PASCALS_PER_MPA * throatAreaM2) /
    Math.sqrt(gasConstantJPerKgK * chamberTemperatureK) *
    Math.sqrt(specificHeatRatio) *
    (2 / (specificHeatRatio + 1)) **
      ((specificHeatRatio + 1) / (2 * (specificHeatRatio - 1)))
  );
}

/** Ports Pressure!B28:AD862 in worksheet order, without intermediate rounding. */
export function calculateCombustionPressure(
  dataAndKn: DataAndKnResult,
  options: PressureSimulationOptions = {},
): PressureCombustionResult {
  const settings = { ...DEFAULT_OPTIONS, ...options };
  const { input, propellantConstants } = dataAndKn;
  const xSolution = solveXIncrement(dataAndKn);
  const xIncrementMm = xSolution.root;
  const coreFlag = surfaceFlag(input.coreSurface);
  const outerFlag = surfaceFlag(input.outerSurface);
  const endsFlag = surfaceFlag(input.endsSurface);
  const gasConstantJPerKgK =
    UNIVERSAL_GAS_CONSTANT_J_PER_MOL_K / propellantConstants.molecularWeightKgPerKmol;
  const chamberTemperatureK =
    settings.combustionEfficiency * propellantConstants.chamberTemperatureK;
  const characteristicVelocityMPerSec = Math.sqrt(
    (gasConstantJPerKgK * chamberTemperatureK) /
      propellantConstants.specificHeatRatio *
      ((propellantConstants.specificHeatRatio + 1) / 2) **
        ((propellantConstants.specificHeatRatio + 1) /
          (propellantConstants.specificHeatRatio - 1)),
  );
  const chamberVolumeM3 = dataAndKn.chamberVolumeMm3 / 1000 ** 3;
  const initialGrainLengthMm = input.segmentCount * input.segmentLengthMm;
  const rows: PressureCombustionRow[] = [];

  let regressionDistanceMm = 0;
  let coreDiameterMm = input.grainCoreDiameterMm;
  let outerDiameterMm = input.grainOuterDiameterMm;
  let grainLengthMm = initialGrainLengthMm;

  for (let interval = 0; interval <= PRESSURE_INTERVAL_COUNT; interval += 1) {
    if (interval > 0) {
      // Pressure!C29:G862
      regressionDistanceMm = regressionDistanceMm + xIncrementMm;
      coreDiameterMm = coreDiameterMm + coreFlag * 2 * xIncrementMm;
      outerDiameterMm = outerDiameterMm - outerFlag * 2 * xIncrementMm;
      grainLengthMm =
        grainLengthMm - endsFlag * input.segmentCount * 2 * xIncrementMm;
    }

    const previous = rows.at(-1);
    const webMm = (outerDiameterMm - coreDiameterMm) / 2;
    const throatDiameterMm =
      dataAndKn.initialThroatDiameterMm +
      input.nozzleErosionMm *
        ((dataAndKn.input.grainOuterDiameterMm - dataAndKn.input.grainCoreDiameterMm) /
          2 -
          webMm) /
        ((dataAndKn.input.grainOuterDiameterMm - dataAndKn.input.grainCoreDiameterMm) / 2);
    const throatAreaMm2 = (Math.PI / 4) * throatDiameterMm ** 2;
    const throatAreaM2 = throatAreaMm2 / 1000 ** 2;
    const freestreamAreaMm2 =
      (Math.PI / 4) * input.chamberDiameterMm ** 2 -
      (Math.PI / 4) * (outerDiameterMm ** 2 - coreDiameterMm ** 2);
    const portToThroatAreaRatio = freestreamAreaMm2 / throatAreaMm2;
    const erosiveBurningFactor = Math.max(
      0,
      settings.erosiveBurningCriticalRatio - portToThroatAreaRatio,
    );
    const absolutePressureMpa = previous
      ? previous.absolutePressureFromStateMpa
      : settings.atmosphericPressureMpa;
    const burn = selectBurnRateCoefficients(input.propellant, absolutePressureMpa);
    const burnRateMmPerSec =
      (1 + settings.erosiveBurningCoefficient * erosiveBurningFactor) *
      burn.aMmPerSecAtMpa *
      absolutePressureMpa ** burn.pressureExponent;
    const timeSec = previous
      ? xIncrementMm / burnRateMmPerSec + previous.timeSec
      : 0;
    const grainVolumeMm3 =
      (Math.PI / 4) * (outerDiameterMm ** 2 - coreDiameterMm ** 2) * grainLengthMm;
    const grainVolumeM3 = grainVolumeMm3 / 1000 ** 3;
    const freeVolumeM3 = chamberVolumeM3 - grainVolumeM3;
    const grainMassKg =
      (dataAndKn.actualDensityGPerCm3 * grainVolumeMm3) / 1000 ** 2;
    const generatedMassFlowKgPerSec = previous
      ? (previous.grainMassKg - grainMassKg) / (timeSec - previous.timeSec)
      : 0;
    const theoreticalNozzleMassFlowKgPerSec = nozzleMassFlowLimit(
      absolutePressureMpa,
      throatAreaM2,
      settings.atmosphericPressureMpa,
      gasConstantJPerKgK,
      chamberTemperatureK,
      propellantConstants.specificHeatRatio,
    );
    const nozzleMassFlowKgPerSec = previous
      ? generatedMassFlowKgPerSec < theoreticalNozzleMassFlowKgPerSec
        ? previous.absolutePressureFromStateMpa > settings.burstPressureMpa
          ? theoreticalNozzleMassFlowKgPerSec
          : 0
        : theoreticalNozzleMassFlowKgPerSec
      : 0;
    const storedMassRateKgPerSec = generatedMassFlowKgPerSec - nozzleMassFlowKgPerSec;
    const storedGasMassKg = previous
      ? Math.max(
          0,
          storedMassRateKgPerSec * (timeSec - previous.timeSec) + previous.storedGasMassKg,
        )
      : 0;
    const gasDensityKgPerM3 = storedGasMassKg / freeVolumeM3;
    const absolutePressurePa =
      gasDensityKgPerM3 * gasConstantJPerKgK * chamberTemperatureK +
      settings.atmosphericPressureMpa * PASCALS_PER_MPA;
    const absolutePressureFromStateMpa = absolutePressurePa / PASCALS_PER_MPA;
    const gaugePressureMpa = absolutePressureFromStateMpa - settings.atmosphericPressureMpa;

    rows.push({
      excelRow: PRESSURE_FIRST_EXCEL_ROW + interval,
      interval,
      regressionDistanceMm,
      webMm,
      coreDiameterMm,
      outerDiameterMm,
      grainLengthMm,
      throatAreaMm2,
      throatAreaM2,
      freestreamAreaMm2,
      portToThroatAreaRatio,
      erosiveBurningFactor,
      absolutePressureMpa,
      burnRateCoefficient: burn.aMmPerSecAtMpa,
      burnRateExponent: burn.pressureExponent,
      burnRateMmPerSec,
      timeSec,
      grainVolumeMm3,
      grainVolumeM3,
      freeVolumeM3,
      grainMassKg,
      generatedMassFlowKgPerSec,
      nozzleMassFlowKgPerSec,
      storedMassRateKgPerSec,
      storedGasMassKg,
      gasDensityKgPerM3,
      absolutePressurePa,
      absolutePressureFromStateMpa,
      gaugePressureMpa,
      gaugePressurePsi: (gaugePressureMpa * PASCALS_PER_MPA) / PSI_PRESSURE_CONVERSION,
      theoreticalNozzleMassFlowKgPerSec,
    });
  }

  const finalRow = rows.at(-1)!;
  return {
    xIncrementMm,
    xIncrementResidualMm: finalRow.webMm,
    solverIterations: xSolution.iterations,
    gasConstantJPerKgK,
    chamberTemperatureK,
    characteristicVelocityMPerSec,
    maximumGaugePressureMpa: Math.max(...rows.map((row) => row.gaugePressureMpa)),
    burnTimeSec: finalRow.timeSec,
    rows,
  };
}
