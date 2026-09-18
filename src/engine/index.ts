export { calculateDataAndKn, KN_INTERVAL_COUNT } from "./data-and-kn";
export {
  DEFAULT_MANUFACTURING_CONSTRAINTS,
  InputValidationError,
  validateExcelReproductionInput,
  validateManufacturingCandidate,
} from "./validation";
export { calculateTargetKn, TARGET_PRESSURE_OPTIONS_MPA } from "./data/target-kn";
export { PROPELLANT_CONSTANTS, selectPropellantConstants } from "./data/propellants";
export type {
  BurnAreaBreakdown,
  DataAndKnInput,
  DataAndKnResult,
  KnCurvePoint,
  ManufacturingConstraints,
  PropellantConstants,
  PropellantId,
  SurfaceCondition,
  ValidationIssue,
} from "./types";
