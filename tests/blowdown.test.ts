import { describe, expect, it } from "vitest";

import {
  calculateDataAndKn,
  calculatePressure,
} from "../src/engine";
import {
  SRM_2023_BASELINE_EXPECTED,
  SRM_2023_BASELINE_INPUT,
} from "./fixtures/srm-2023-baseline";

const data = calculateDataAndKn(SRM_2023_BASELINE_INPUT);
const pressure = calculatePressure(data);
const expected = SRM_2023_BASELINE_EXPECTED;

function expectNear(actual: number, reference: number, precision = 10) {
  expect(actual).toBeCloseTo(reference, precision);
}

describe("Pressure!Q863:AD910 blowdown", () => {
  it("uses the workbook Goal Seek settings and AA909 residual", () => {
    expectNear(
      pressure.blowdown.timeIncrementSec,
      expected.blowdown.timeIncrementSec,
      14,
    );
    expect(Math.abs(pressure.blowdown.goalSeekResidualMpa)).toBeLessThan(0.001);
    expectNear(
      pressure.blowdown.goalSeekResidualMpa,
      expected.blowdown.goalSeekResidualMpa,
      10,
    );
    expect(pressure.blowdown.solverIterations).toBe(0);
  });

  it("matches the workbook thrust and curve end times", () => {
    expectNear(
      pressure.blowdown.thrustEndTimeSec,
      expected.blowdown.thrustEndTimeSec,
      12,
    );
    expectNear(
      pressure.blowdown.curveEndTimeSec,
      expected.blowdown.curveEndTimeSec,
      12,
    );
    expectNear(
      pressure.maximumGaugePressureMpa,
      expected.pressure.maximumGaugePressureMpa,
    );
    expectNear(pressure.burnTimeSec, expected.pressure.burnTimeSec, 12);
  });

  it("matches representative rows 863, 908, 909, and 910", () => {
    for (const [excelRow, snapshot] of [
      [863, expected.blowdown.row863],
      [908, expected.blowdown.row908],
      [909, expected.blowdown.row909],
      [910, expected.blowdown.row910],
    ] as const) {
      const row = pressure.blowdown.rows.find(
        (candidate) => candidate.excelRow === excelRow,
      )!;
      expectNear(row.timeSec, snapshot.timeSec, 12);
      expectNear(row.absolutePressureMpa, snapshot.absolutePressureMpa);
      expectNear(row.gaugePressureMpa, snapshot.gaugePressureMpa);
    }
  });
});
