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
  atmosphericPressureMpa: number;
  maximumGaugePressureMpa: number;
  burnTimeSec: number;
  rows: readonly PressureCombustionRow[];
}

export interface BlowdownOptions {
  timeIncrementSeedSec?: number;
  maximumChange?: number;
  maxIterations?: number;
  percentOfMaximumPressure?: number;
}

export interface PressureBlowdownRow {
  excelRow: number;
  timeSec: number;
  absolutePressureMpa: number;
  gaugePressureMpa: number;
  gaugePressurePsi: number;
}

export interface PressureBlowdownResult {
  timeIncrementSec: number;
  goalSeekResidualMpa: number;
  solverIterations: number;
  finalPressureTargetMpa: number;
  thrustEndTimeSec: number;
  curveEndTimeSec: number;
  rows: readonly PressureBlowdownRow[];
}

export interface PressureResult {
  combustion: PressureCombustionResult;
  blowdown: PressureBlowdownResult;
  maximumGaugePressureMpa: number;
  burnTimeSec: number;
  thrustEndTimeSec: number;
}

export interface PerformanceOptions {
  nozzleEfficiency?: number;
  initialExpansionRatio?: number;
  exitMachSeed?: number;
  maximumChange?: number;
  maxIterations?: number;
}

export interface PerformanceRow {
  excelRow: number;
  chamberPressurePa: number;
  throatAreaM2: number;
  throatAreaMm2: number;
  expansionRatio: number | null;
  exitPressurePa: number;
  optimumExpansionRatio: number;
  thrustCoefficient: number;
  thrustN: number;
  thrustLbf: number;
  timeSec: number;
  impulseIncrementNs: number;
  exitMach: number;
}

export interface PerformanceResult {
  initialExitMach: number;
  initialExitMachResidual: number;
  finalExitMach: number;
  finalExitMachResidual: number;
  nozzleExitAreaMm2: number;
  nozzleExitDiameterMm: number;
  maximumOptimumExpansionRatio: number;
  averageOptimumExpansionRatio: number;
  webFraction: number;
  maximumThrustCoefficient: number;
  maximumThrustN: number;
  totalImpulseNs: number;
  averageThrustN: number;
  specificImpulseSec: number;
  motorClass: string;
  thrustEndTimeSec: number;
  rows: readonly PerformanceRow[];
}

export interface OutputThrustPoint {
  dataPoint: number;
  sourceExcelRow: number;
  timeSec: number;
  thrustN: number;
  thrustLbf: number;
}

export interface MotorOutputResult {
  grainMassKg: number;
  totalImpulseNs: number;
  averageThrustN: number;
  maximumThrustN: number;
  thrustTimeSec: number;
  specificImpulseSec: number;
  motorClass: string;
  abbreviatedThrustCurve: readonly OutputThrustPoint[];
}

export interface ValidationIssue {
  code: string;
  path: keyof DataAndKnInput | "manufacturingStepMm";
  message: string;
}

export interface ManufacturingConstraints {
  dimensionalStepMm: number;
}

export interface CandidateNumberRange {
  min: number;
  max: number;
  step?: number;
}

export interface CandidateIntegerRange {
  min: number;
  max: number;
}

export interface CandidateSearchConfig {
  mode?: "candidate" | "excel";
  chamberDiameterMm: number;
  chamberLengthMm: number;
  propellant: PropellantId;
  targetFuelMassKg: number;
  fuelMassToleranceKg: number;
  maximumPressureMpa: number;
  targetAverageThrustN: number;
  averageThrustToleranceN: number;
  targetBurnTimeSec: number;
  burnTimeToleranceSec: number;
  targetPressureMpa: number;
  outerDiameterMm: CandidateNumberRange;
  coreDiameterMm: CandidateNumberRange;
  segmentLengthMm: CandidateNumberRange;
  segmentCount: CandidateIntegerRange;
  outerSurface: SurfaceCondition;
  coreSurface: SurfaceCondition;
  endsSurface: SurfaceCondition;
  densityRatio: number;
  nozzleErosionMm: number;
  manufacturingStepMm?: number;
  maxCandidateCount?: number;
  burnTimeFilterEnabled?: boolean;
  searchOrder?: "range" | "target-mass";
  targetThrustEnabled?: boolean;
  automaticExpansionStage?: number;
}

export interface CandidateScoreBreakdown {
  massErrorNormalized: number;
  pressureMarginNormalized: number;
  averageThrustErrorNormalized: number;
  burnTimeErrorNormalized: number;
  totalScore: number;
}

export interface CandidateResult {
  input: DataAndKnInput;
  grainMassKg: number;
  maximumPressureMpa: number;
  burnTimeSec: number;
  thrustEndTimeSec: number;
  maximumThrustN: number;
  averageThrustN: number;
  totalImpulseNs: number;
  specificImpulseSec: number;
  motorClass: string;
  score: CandidateScoreBreakdown;
  status: "pass" | "conditional" | "fail";
  reasons: readonly string[];
  dataAndKn: DataAndKnResult;
  pressure: PressureResult;
  performance: PerformanceResult;
  thrustEvaluation?: ThrustCurveEvaluation;
}

export interface ThrustCurveEvaluation {
  targetThrustN: number;
  meanSquaredErrorN2: number;
  rootMeanSquaredErrorN: number;
  maximumDeviationN: number;
  variabilityN: number;
}

export interface CandidateSearchResult {
  candidates: readonly CandidateResult[];
  passedCandidates: readonly CandidateResult[];
  totalCombinations: number;
  evaluatedCombinations: number;
  rejectedByValidation: number;
  calculationFailures: number;
  prefilteredCandidateCount?: number;
  targetMassNearbyIncluded?: boolean;
  truncated: boolean;
  warning?: string;
}

export interface NozzleDesignInput {
  chamberDiameterMm: number;
  throatDiameterMm: number;
  actualExitDiameterMm: number;
  optimalExpansionRatio: number;
  convergenceHalfAngleDeg: number;
  divergenceHalfAngleDeg: number;
}

export interface NozzleProfilePoint {
  xMm: number;
  radiusMm: number;
}

export interface NozzleDesignResult {
  convergenceLengthMm: number;
  divergenceLengthMm: number;
  totalLengthMm: number;
  actualExitDiameterMm: number;
  optimalExitDiameterMm: number;
  profile: readonly NozzleProfilePoint[];
}
