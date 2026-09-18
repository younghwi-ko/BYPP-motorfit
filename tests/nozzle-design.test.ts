import { describe, expect, it } from "vitest";
import { calculateNozzleDesign } from "../src/engine";

describe("Nozzle Design conical profile", () => {
  it("reproduces the sheet geometry equations without rounding", () => {
    const result = calculateNozzleDesign({
      chamberDiameterMm: 45,
      throatDiameterMm: 10,
      actualExitDiameterMm: 18,
      optimalExpansionRatio: 3.24,
      convergenceHalfAngleDeg: 45,
      divergenceHalfAngleDeg: 15,
    });
    expect(result.convergenceLengthMm).toBeCloseTo(17.5, 12);
    expect(result.divergenceLengthMm).toBeCloseTo(14.92820323027551, 12);
    expect(result.totalLengthMm).toBeCloseTo(32.42820323027551, 12);
    expect(result.optimalExitDiameterMm).toBeCloseTo(18, 12);
    expect(result.profile).toHaveLength(3);
    expect(result.profile[0]).toEqual({ xMm: 0, radiusMm: 22.5 });
    expect(result.profile[1].xMm).toBeCloseTo(17.5, 12);
    expect(result.profile[1].radiusMm).toBeCloseTo(5, 12);
    expect(result.profile[2].xMm).toBeCloseTo(32.42820323027551, 12);
    expect(result.profile[2].radiusMm).toBeCloseTo(9, 12);
  });

  it("rejects invalid dimensions and angles", () => {
    expect(() => calculateNozzleDesign({ chamberDiameterMm: 10, throatDiameterMm: 10, actualExitDiameterMm: 12, optimalExpansionRatio: 2, convergenceHalfAngleDeg: 30, divergenceHalfAngleDeg: 15 })).toThrow();
  });
});
