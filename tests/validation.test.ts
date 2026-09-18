import { describe, expect, it } from "vitest";
import {
  validateExcelReproductionInput,
  validateManufacturingCandidate,
} from "../src/engine";
import { SRM_2023_BASELINE_INPUT as input } from "./fixtures/srm-2023-baseline";

describe("input modes", () => {
  it("keeps manufacturing rules out of Excel reproduction", () => {
    const fractional = {
      ...input,
      grainOuterDiameterMm: 44.5,
      grainCoreDiameterMm: 14.5,
    };

    expect(validateExcelReproductionInput(fractional)).toEqual([]);
    expect(validateManufacturingCandidate(fractional)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "integer-manufacturing-dimension" }),
      ]),
    );
  });

  it("accepts the baseline on the default 5 mm manufacturing grid", () => {
    expect(validateManufacturingCandidate(input)).toEqual([]);
  });

  it("rejects invalid web, segment count, and chamber fit", () => {
    const issues = validateExcelReproductionInput({
      ...input,
      grainOuterDiameterMm: 15,
      grainCoreDiameterMm: 15,
      segmentLengthMm: 100,
      segmentCount: 0,
    });

    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "positive-web",
        "positive-integer-segment-count",
      ]),
    );
  });

  it("requires an exposed radial surface for the Kn regression table", () => {
    const issues = validateExcelReproductionInput({
      ...input,
      coreSurface: "Inhibited",
      outerSurface: "Inhibited",
    });

    expect(issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "radial-burning-surface" }),
      ]),
    );
  });
});
