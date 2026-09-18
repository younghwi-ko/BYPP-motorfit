export const PROPELLANT_IDS = [
  "KNDX",
  "KNSB fine",
  "KNSB coarse",
  "KNSU",
  "KNER coarse",
  "KNMN coarse",
  "KNPSB",
  "KNFR",
] as const;

export type PropellantId = (typeof PROPELLANT_IDS)[number];
export type SurfaceCondition = "Exposed" | "Inhibited";

export interface DataAndKnInput {
  chamberDiameterMm: number;
  chamberLengthMm: number;
  propellant: PropellantId;
  grainOuterDiameterMm: number;
  grainCoreDiameterMm: number;
  segmentLengthMm: number;
  segmentCount: number;
  outerSurface: SurfaceCondition;
  coreSurface: SurfaceCondition;
  endsSurface: SurfaceCondition;
  densityRatio: number;
  targetPressureMpa: number;
  nozzleErosionMm: number;
}

export interface PropellantConstants {
  idealDensityGPerCm3: number;
  specificHeatRatio: number;
  molecularWeightKgPerKmol: number;
  chamberTemperatureK: number;
}

export interface BurnAreaBreakdown {
  endsMm2: number;
  coreMm2: number;
  outerMm2: number;
  totalMm2: number;
}

export interface KnCurvePoint extends BurnAreaBreakdown {
  interval: number;
  regressionMm: number;
  coreDiameterMm: number;
  outerDiameterMm: number;
  grainLengthMm: number;
  webMm: number;
  throatAreaMm2: number;
  kn: number;
}

export interface DataAndKnResult {
  /** Source inputs retained so later calculation stages need no UI-specific state. */
  input: DataAndKnInput;
  propellantConstants: PropellantConstants;
  chamberVolumeMm3: number;
  grainLengthMm: number;
  grainVolumeMm3: number;
  volumetricLoadingFraction: number;
  actualDensityGPerCm3: number;
  grainMassKg: number;
  initialBurnArea: BurnAreaBreakdown;
  targetKn: number;
  regressionIncrementMm: number;
  finalWebResidualMm: number;
  maximumBurnAreaMm2: number;
  throatAreaMm2: number;
  initialThroatDiameterMm: number;
  finalThroatDiameterMm: number;
  minimumKn: number;
  maximumKn: number;
  averageKn: number;
  knCurve: KnCurvePoint[];
}

export interface BurnRateCoefficients {
  /** Saint-Robert coefficient, with pressure in MPa and burn rate in mm/s. */
  aMmPerSecAtMpa: number;
  /** Saint-Robert pressure exponent. */
  pressureExponent: number;
}

export interface BurnRatePressureBand extends BurnRateCoefficients {
  /** Inclusive lower edge used by Excel's approximate VLOOKUP. */
  lowerPressureMpa: number;
}

export interface PressureSimulationOptions {
  combustionEfficiency?: number;
  atmosphericPressureMpa?: number;
  erosiveBurningCriticalRatio?: number;
  erosiveBurningCoefficient?: number;
  burstPressureMpa?: number;
}

export interface PressureCombustionRow {
  excelRow: number;
  interval: number;
  regressionDistanceMm: number;
  webMm: number;
  coreDiameterMm: number;
  outerDiameterMm: number;
  grainLengthMm: number;
  throatAreaMm2: number;
  throatAreaM2: number;
  freestreamAreaMm2: number;
  portToThroatAreaRatio: number;
  erosiveBurningFactor: number;
  absolutePressureMpa: number;
  burnRateCoefficient: number;
  burnRateExponent: number;
  burnRateMmPerSec: number;
  timeSec: number;
  grainVolumeMm3: number;
  grainVolumeM3: number;
  freeVolumeM3: number;
  grainMassKg: number;
  generatedMassFlowKgPerSec: number;
  nozzleMassFlowKgPerSec: number;
  storedMassRateKgPerSec: number;
  storedGasMassKg: number;
  gasDensityKgPerM3: number;
  absolutePressurePa: number;
  absolutePressureFromStateMpa: number;
  gaugePressureMpa: number;
  gaugePressurePsi: number;
  theoreticalNozzleMassFlowKgPerSec: number;
}

export interface PressureCombustionResult {
  xIncrementMm: number;
  xIncrementResidualMm: number;
  solverIterations: number;
  gasConstantJPerKgK: number;
  chamberTemperatureK: number;
  characteristicVelocityMPerSec: number;
  maximumGaugePressureMpa: number;
  burnTimeSec: number;
  rows: readonly PressureCombustionRow[];
}

export interface ValidationIssue {
  code: string;
  path: keyof DataAndKnInput | "manufacturingStepMm";
  message: string;
}

export interface ManufacturingConstraints {
  dimensionalStepMm: number;
}
