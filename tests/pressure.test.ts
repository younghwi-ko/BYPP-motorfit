import { describe, expect, it } from "vitest";

import {
  calculateCombustionPressure,
  calculateDataAndKn,
  PRESSURE_FIRST_EXCEL_ROW,
  PRESSURE_LAST_COMBUSTION_EXCEL_ROW,
} from "../src/engine";
import {
  SRM_2023_BASELINE_EXPECTED,
  SRM_2023_BASELINE_INPUT,
} from "./fixtures/srm-2023-baseline";

function expectNear(actual: number, expected: number, precision = 11) {
  expect(actual).toBeCloseTo(expected, precision);
}

describe("Pressure!B28:AD862 combustion recurrence", () => {
  const result = calculateCombustionPressure(
    calculateDataAndKn(SRM_2023_BASELINE_INPUT),
  );
  const expected = SRM_2023_BASELINE_EXPECTED.pressure;

  it("solves the Pressure!D862 Goal Seek residual", () => {
    expect(result.rows).toHaveLength(835);
    expect(result.rows[0].excelRow).toBe(PRESSURE_FIRST_EXCEL_ROW);
    expect(result.rows.at(-1)?.excelRow).toBe(PRESSURE_LAST_COMBUSTION_EXCEL_ROW);
    expect(Math.abs(result.xIncrementResidualMm)).toBeLessThan(1e-12);
    expectNear(result.xIncrementMm, 0.0179856115107916, 14);
  });

  it("matches the workbook peak pressure and combustion duration", () => {
    expectNear(result.maximumGaugePressureMpa, expected.maximumGaugePressureMpa);
    expectNear(result.burnTimeSec, expected.burnTimeSec);
  });

  it("matches the extracted golden snapshots for rows 28, 29, and 862", () => {
    const row28 = result.rows[0];
    const row29 = result.rows[1];
    const row862 = result.rows.at(-1)!;

    expectNear(row28.webMm, expected.row28.webMm);
    expectNear(row28.throatAreaMm2, expected.row28.throatAreaMm2);
    expectNear(row28.freestreamAreaMm2, expected.row28.freestreamAreaMm2);
    expectNear(row28.portToThroatAreaRatio, expected.row28.portToThroatAreaRatio);
    expectNear(row28.burnRateMmPerSec, expected.row28.burnRateMmPerSec);
    expectNear(row28.grainMassKg, expected.row28.grainMassKg);

    expectNear(row29.webMm, expected.row29.webMm);
    expectNear(row29.timeSec, expected.row29.timeSec);
    expectNear(row29.generatedMassFlowKgPerSec, expected.row29.generatedMassFlowKgPerSec);
    expectNear(row29.storedGasMassKg, expected.row29.storedGasMassKg);
    expectNear(row29.absolutePressureFromStateMpa, expected.row29.absolutePressureFromStateMpa);
    expectNear(row29.gaugePressureMpa, expected.row29.gaugePressureMpa);

    expectNear(row862.webMm, expected.row862.webMm);
    expectNear(row862.timeSec, expected.row862.timeSec);
    expectNear(row862.burnRateMmPerSec, expected.row862.burnRateMmPerSec);
    expectNear(row862.generatedMassFlowKgPerSec, expected.row862.generatedMassFlowKgPerSec);
    expectNear(row862.nozzleMassFlowKgPerSec, expected.row862.nozzleMassFlowKgPerSec);
    expectNear(row862.gaugePressureMpa, expected.row862.gaugePressureMpa);
  });
});
