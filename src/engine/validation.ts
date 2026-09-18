import { TARGET_PRESSURE_OPTIONS_MPA } from "./data/target-kn";
import {
  PROPELLANT_IDS,
  type DataAndKnInput,
  type ManufacturingConstraints,
  type ValidationIssue,
} from "./types";

export const DEFAULT_MANUFACTURING_CONSTRAINTS: ManufacturingConstraints = {
  dimensionalStepMm: 5,
};

export class InputValidationError extends Error {
  constructor(public readonly issues: ValidationIssue[]) {
    super(issues.map((issue) => issue.message).join("; "));
    this.name = "InputValidationError";
  }
}

const isFinitePositive = (value: number) =>
  Number.isFinite(value) && value > 0;

const isTargetPressureOption = (value: number) =>
  TARGET_PRESSURE_OPTIONS_MPA.some(
    (option) => Math.abs(option - value) <= Number.EPSILON * 16,
  );

export function validateExcelReproductionInput(
  input: DataAndKnInput,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const positiveDimensions: Array<[keyof DataAndKnInput, number, string]> = [
    ["chamberDiameterMm", input.chamberDiameterMm, "Chamber diameter"],
    ["chamberLengthMm", input.chamberLengthMm, "Chamber length"],
    ["grainOuterDiameterMm", input.grainOuterDiameterMm, "Grain outer diameter"],
    ["grainCoreDiameterMm", input.grainCoreDiameterMm, "Grain core diameter"],
    ["segmentLengthMm", input.segmentLengthMm, "Segment length"],
  ];

  for (const [path, value, label] of positiveDimensions) {
    if (!isFinitePositive(value)) {
      issues.push({
        code: "positive-dimension",
        path,
        message: `${label} must be a positive finite number.`,
      });
    }
  }

  if (!Number.isInteger(input.segmentCount) || input.segmentCount <= 0) {
    issues.push({
      code: "positive-integer-segment-count",
      path: "segmentCount",
      message: "Segment count must be a positive integer.",
    });
  }

  if (input.grainOuterDiameterMm <= input.grainCoreDiameterMm) {
    issues.push({
      code: "positive-web",
      path: "grainOuterDiameterMm",
      message: "Grain outer diameter must be greater than core diameter.",
    });
  }

  if (input.grainOuterDiameterMm > input.chamberDiameterMm) {
    issues.push({
      code: "grain-fits-chamber-diameter",
      path: "grainOuterDiameterMm",
      message: "Grain outer diameter must not exceed chamber diameter.",
    });
  }

  if (input.segmentLengthMm * input.segmentCount > input.chamberLengthMm) {
    issues.push({
      code: "grain-fits-chamber-length",
      path: "segmentLengthMm",
      message: "Total grain length must not exceed chamber length.",
    });
  }

  if (input.coreSurface === "Inhibited" && input.outerSurface === "Inhibited") {
    issues.push({
      code: "radial-burning-surface",
      path: "coreSurface",
      message: "At least one radial grain surface must be exposed.",
    });
  }

  const activeRadialSurfaces =
    Number(input.coreSurface === "Exposed") +
    Number(input.outerSurface === "Exposed");
  if (activeRadialSurfaces > 0 && input.endsSurface === "Exposed") {
    const webMm =
      (input.grainOuterDiameterMm - input.grainCoreDiameterMm) / 2;
    const burnoutRegressionMm = webMm / activeRadialSurfaces;
    if (input.segmentLengthMm - 2 * burnoutRegressionMm <= 0) {
      issues.push({
        code: "positive-burnout-length",
        path: "segmentLengthMm",
        message: "Segment length must remain positive through web burnout.",
      });
    }
  }

  if (
    !Number.isFinite(input.densityRatio) ||
    input.densityRatio <= 0 ||
    input.densityRatio > 1
  ) {
    issues.push({
      code: "density-ratio",
      path: "densityRatio",
      message: "Density ratio must be greater than 0 and no greater than 1.",
    });
  }

  if (!Number.isFinite(input.nozzleErosionMm) || input.nozzleErosionMm < 0) {
    issues.push({
      code: "nonnegative-nozzle-erosion",
      path: "nozzleErosionMm",
      message: "Nozzle erosion must be a nonnegative finite number.",
    });
  }

  if (!PROPELLANT_IDS.includes(input.propellant)) {
    issues.push({
      code: "known-propellant",
      path: "propellant",
      message: "Propellant must match an SRM_2023 propellant entry.",
    });
  }

  if (!isTargetPressureOption(input.targetPressureMpa)) {
    issues.push({
      code: "target-pressure-option",
      path: "targetPressureMpa",
      message: "Target pressure must match an SRM_2023 pressure-list value.",
    });
  }

  return issues;
}

const isOnStep = (value: number, step: number) => {
  const quotient = value / step;
  return Math.abs(quotient - Math.round(quotient)) < 1e-12;
};

export function validateManufacturingCandidate(
  input: DataAndKnInput,
  constraints: ManufacturingConstraints = DEFAULT_MANUFACTURING_CONSTRAINTS,
): ValidationIssue[] {
  const issues = validateExcelReproductionInput(input);
  const dimensions: Array<[keyof DataAndKnInput, number, string]> = [
    ["grainOuterDiameterMm", input.grainOuterDiameterMm, "Grain outer diameter"],
    ["grainCoreDiameterMm", input.grainCoreDiameterMm, "Grain core diameter"],
    ["segmentLengthMm", input.segmentLengthMm, "Segment length"],
  ];

  if (
    !Number.isInteger(constraints.dimensionalStepMm) ||
    constraints.dimensionalStepMm <= 0
  ) {
    issues.push({
      code: "positive-integer-manufacturing-step",
      path: "manufacturingStepMm",
      message: "Manufacturing step must be a positive integer number of millimetres.",
    });
    return issues;
  }

  for (const [path, value, label] of dimensions) {
    if (!Number.isInteger(value)) {
      issues.push({
        code: "integer-manufacturing-dimension",
        path,
        message: `${label} must be an integer number of millimetres for candidate search.`,
      });
    } else if (!isOnStep(value, constraints.dimensionalStepMm)) {
      issues.push({
        code: "manufacturing-step",
        path,
        message: `${label} must use the ${constraints.dimensionalStepMm} mm manufacturing step.`,
      });
    }
  }

  return issues;
}

export function assertValidExcelReproductionInput(input: DataAndKnInput): void {
  const issues = validateExcelReproductionInput(input);
  if (issues.length > 0) {
    throw new InputValidationError(issues);
  }
}
