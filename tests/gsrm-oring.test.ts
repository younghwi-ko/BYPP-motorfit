import { describe, expect, it } from "vitest";
import { calculateDataAndKn } from "../src/engine/data-and-kn";
import { calculateGsrmReferenceDiameter } from "../src/engine/gsrm-oring";
import type { DataAndKnInput } from "../src/engine";

const input: DataAndKnInput = {
  chamberDiameterMm: 45, chamberLengthMm: 165, propellant: "KNSB coarse",
  grainOuterDiameterMm: 45, grainCoreDiameterMm: 15, segmentLengthMm: 80, segmentCount: 2,
  outerSurface: "Inhibited", coreSurface: "Exposed", endsSurface: "Exposed", densityRatio: 0.95,
  targetPressureMpa: 4, nozzleErosionMm: 0,
};

describe("GSRM O-ring reference diameter conversion", () => {
  it.each([[45, 2, 49], [50, 2, 54], [45, 1.5, 48]])("converts SRM inner diameter %s mm and wall %s mm to B=%s mm", (inner, wall, expected) => {
    expect(calculateGsrmReferenceDiameter(inner, wall)).toBe(expected);
  });

  it("does not alter SRM engine inputs or results", () => {
    const before = calculateDataAndKn(input);
    const b = calculateGsrmReferenceDiameter(input.chamberDiameterMm, 2);
    const after = calculateDataAndKn(input);
    expect(b).toBe(49);
    expect(after.input).toEqual(before.input);
    expect(after.grainMassKg).toBe(before.grainMassKg);
    expect(after.maximumBurnAreaMm2).toBe(before.maximumBurnAreaMm2);
  });

  it("rejects invalid dimensions", () => {
    expect(() => calculateGsrmReferenceDiameter(0, 2)).toThrow();
    expect(() => calculateGsrmReferenceDiameter(45, -1)).toThrow();
  });
});
