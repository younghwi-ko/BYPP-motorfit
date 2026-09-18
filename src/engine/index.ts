export { calculateDataAndKn, KN_INTERVAL_COUNT } from "./data-and-kn";
export {
  calculateCombustionPressure,
  PRESSURE_FIRST_EXCEL_ROW,
  PRESSURE_INTERVAL_COUNT,
  PRESSURE_LAST_COMBUSTION_EXCEL_ROW,
} from "./pressure";
export { selectBurnRateCoefficients, BURN_RATE_PRESSURE_BANDS } from "./data/burnrate";
export { solveBisection } from "./solvers/bisection";
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
  BurnRateCoefficients,
  BurnRatePressureBand,
  DataAndKnInput,
  DataAndKnResult,
  KnCurvePoint,
  ManufacturingConstraints,
  PropellantConstants,
  PropellantId,
  PressureCombustionResult,
  PressureCombustionRow,
  PressureSimulationOptions,
  SurfaceCondition,
  ValidationIssue,
} from "./types";
