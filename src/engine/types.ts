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

export interface ValidationIssue {
  code: string;
  path: keyof DataAndKnInput | "manufacturingStepMm";
  message: string;
}

export interface ManufacturingConstraints {
  dimensionalStepMm: number;
}
