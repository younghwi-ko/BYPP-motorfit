import type {
  DataAndKnResult,
  MotorOutputResult,
  PerformanceResult,
} from "./types";

const OUTPUT_SOURCE_ROWS = [
  28, 70, 71, 112, 154, 196, 238, 280, 322, 364, 406, 448, 490, 532,
  574, 616, 658, 700, 742, 784, 826, 868, 910,
] as const;

/** Ports the pure result data used by Output!D9:D17 and C24:E46. */
export function createMotorOutput(
  dataAndKn: DataAndKnResult,
  performance: PerformanceResult,
): MotorOutputResult {
  const rowsByExcelRow = new Map(
    performance.rows.map((row) => [row.excelRow, row]),
  );
  const abbreviatedThrustCurve = OUTPUT_SOURCE_ROWS.map(
    (sourceExcelRow, index) => {
      const row = rowsByExcelRow.get(sourceExcelRow);
      if (!row) throw new Error(`Missing Performance row ${sourceExcelRow}.`);
      return {
        dataPoint: index + 1,
        sourceExcelRow,
        timeSec: row.timeSec,
        thrustN: row.thrustN,
        thrustLbf: row.thrustLbf,
      };
    },
  );

  return {
    grainMassKg: dataAndKn.grainMassKg,
    totalImpulseNs: performance.totalImpulseNs,
    averageThrustN: performance.averageThrustN,
    maximumThrustN: performance.maximumThrustN,
    thrustTimeSec: performance.thrustEndTimeSec,
    specificImpulseSec: performance.specificImpulseSec,
    motorClass: performance.motorClass,
    abbreviatedThrustCurve,
  };
}
