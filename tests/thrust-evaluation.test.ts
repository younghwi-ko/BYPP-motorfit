import { describe, expect, it } from "vitest";

import { evaluateThrustCurve } from "../src/engine";
import type { PerformanceResult } from "../src/engine";

describe("thrust curve evaluation", () => {
  it("computes MSE, maximum deviation, and variability against a target line", () => {
    const performance = {
      thrustEndTimeSec: 2,
      rows: [
        { timeSec: 0, thrustN: 90 },
        { timeSec: 1, thrustN: 100 },
        { timeSec: 2, thrustN: 110 },
      ],
    } as unknown as PerformanceResult;
    const result = evaluateThrustCurve(performance, 100);
    expect(result.meanSquaredErrorN2).toBeCloseTo(200 / 3, 12);
    expect(result.maximumDeviationN).toBe(10);
    expect(result.variabilityN).toBeCloseTo(Math.sqrt(200 / 3), 12);
  });
});
