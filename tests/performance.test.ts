import { describe, expect, it } from "vitest";

import {
  calculateDataAndKn,
  calculatePerformance,
  calculatePressure,
  classifyMotor,
  createMotorOutput,
} from "../src/engine";
import {
  SRM_2023_BASELINE_EXPECTED,
  SRM_2023_BASELINE_INPUT,
} from "./fixtures/srm-2023-baseline";

const data = calculateDataAndKn(SRM_2023_BASELINE_INPUT);
const pressure = calculatePressure(data);
const performance = calculatePerformance(data, pressure);
const output = createMotorOutput(data, performance);
const expected = SRM_2023_BASELINE_EXPECTED.performance;

function expectNear(actual: number, reference: number, precision = 10) {
  expect(actual).toBeCloseTo(reference, precision);
}

function performanceRow(excelRow: number) {
  return performance.rows.find((row) => row.excelRow === excelRow)!;
}

describe("Performance!C28:N910", () => {
  it("solves the initial and final supersonic exit Mach residuals", () => {
    expectNear(performance.initialExitMach, expected.initialExitMach, 14);
    expectNear(performance.finalExitMach, expected.initialExitMach, 14);
    expectNear(
      performance.initialExitMachResidual,
      expected.exitMachResidual,
      10,
    );
    expect(Math.abs(performance.finalExitMachResidual)).toBeLessThan(0.001);
  });

  it("matches the workbook performance summary", () => {
    expectNear(performance.maximumThrustN, expected.maximumThrustN);
    expectNear(performance.totalImpulseNs, expected.totalImpulseNs);
    expectNear(performance.averageThrustN, expected.averageThrustN);
    expectNear(performance.specificImpulseSec, expected.specificImpulseSec);
    expect(performance.motorClass).toBe(expected.motorClass);
  });

  it("matches representative combustion and blowdown performance rows", () => {
    const row29 = performanceRow(29);
    expectNear(row29.exitPressurePa, expected.row29.exitPressurePa);
    expectNear(
      row29.optimumExpansionRatio,
      expected.row29.optimumExpansionRatio,
    );
    expectNear(row29.thrustCoefficient, expected.row29.thrustCoefficient);
    expectNear(row29.thrustN, expected.row29.thrustN);
    expectNear(row29.impulseIncrementNs, expected.row29.impulseIncrementNs);

    const row496 = performanceRow(496);
    expectNear(row496.timeSec, expected.row496.timeSec);
    expectNear(row496.exitPressurePa, expected.row496.exitPressurePa, 7);
    expectNear(
      row496.optimumExpansionRatio,
      expected.row496.optimumExpansionRatio,
    );
    expectNear(row496.thrustCoefficient, expected.row496.thrustCoefficient);
    expectNear(row496.thrustN, expected.row496.thrustN);

    const row909 = performanceRow(909);
    expectNear(row909.thrustCoefficient, expected.row909.thrustCoefficient);
    expectNear(row909.thrustN, expected.row909.thrustN);
    expectNear(
      row909.impulseIncrementNs,
      expected.row909.impulseIncrementNs,
    );

    const row910 = performanceRow(910);
    expectNear(row910.thrustN, expected.row910.thrustN);
    expectNear(
      row910.impulseIncrementNs,
      expected.row910.impulseIncrementNs,
    );
  });

  it("uses Class!B6:C27 approximate VLOOKUP boundaries", () => {
    expect(classifyMotor(319.999)).toBe("H");
    expect(classifyMotor(320)).toBe("I");
    expect(classifyMotor(639.999)).toBe("I");
    expect(classifyMotor(640)).toBe("J");
    expect(() => classifyMotor(1.25)).toThrow(RangeError);
  });

  it("builds Output summary values and its 23 fixed thrust-curve points", () => {
    expectNear(output.totalImpulseNs, expected.totalImpulseNs);
    expectNear(output.averageThrustN, expected.averageThrustN);
    expectNear(output.maximumThrustN, expected.maximumThrustN);
    expect(output.motorClass).toBe("I");
    expect(output.abbreviatedThrustCurve).toHaveLength(23);
    expect(output.abbreviatedThrustCurve[0]).toMatchObject({
      dataPoint: 1,
      sourceExcelRow: 28,
      timeSec: 0,
      thrustN: 0,
    });
    expect(output.abbreviatedThrustCurve.at(-1)).toMatchObject({
      dataPoint: 23,
      sourceExcelRow: 910,
      thrustN: 0,
    });
  });
});
