import { describe, expect, it } from "vitest";
import { calculateDataAndKn, calculateTargetKn } from "../src/engine";
import {
  SRM_2023_BASELINE_EXPECTED as expected,
  SRM_2023_BASELINE_INPUT as input,
} from "./fixtures/srm-2023-baseline";

describe("Data and Kn Excel parity", () => {
  it("matches the SRM_2023 baseline geometry and mass", () => {
    const result = calculateDataAndKn(input);

    expect(result.chamberVolumeMm3).toBeCloseTo(expected.chamberVolumeMm3, 9);
    expect(result.grainLengthMm).toBe(expected.grainLengthMm);
    expect(result.grainVolumeMm3).toBeCloseTo(expected.grainVolumeMm3, 9);
    expect(result.volumetricLoadingFraction).toBeCloseTo(
      expected.volumetricLoadingFraction,
      12,
    );
    expect(result.propellantConstants.idealDensityGPerCm3).toBe(
      expected.idealDensityGPerCm3,
    );
    expect(result.actualDensityGPerCm3).toBeCloseTo(
      expected.actualDensityGPerCm3,
      14,
    );
    expect(result.grainMassKg).toBeCloseTo(expected.grainMassKg, 13);
    expect(result.initialBurnArea.endsMm2).toBeCloseTo(
      expected.initialEndsAreaMm2,
      9,
    );
    expect(result.initialBurnArea.coreMm2).toBeCloseTo(
      expected.initialCoreAreaMm2,
      9,
    );
    expect(result.initialBurnArea.outerMm2).toBe(expected.initialOuterAreaMm2);
    expect(result.initialBurnArea.totalMm2).toBeCloseTo(
      expected.initialTotalAreaMm2,
      9,
    );
  });

  it("matches the 51-row Kn curve and throat sizing", () => {
    const result = calculateDataAndKn(input);

    expect(result.knCurve).toHaveLength(51);
    expect(result.regressionIncrementMm).toBeCloseTo(
      expected.regressionIncrementMm,
      14,
    );
    expect(result.targetKn).toBeCloseTo(expected.targetKn, 10);
    expect(result.maximumBurnAreaMm2).toBeCloseTo(
      expected.maximumBurnAreaMm2,
      8,
    );
    expect(result.throatAreaMm2).toBeCloseTo(expected.throatAreaMm2, 11);
    expect(result.initialThroatDiameterMm).toBeCloseTo(
      expected.initialThroatDiameterMm,
      12,
    );
    expect(result.finalThroatDiameterMm).toBeCloseTo(
      expected.finalThroatDiameterMm,
      12,
    );
    expect(result.minimumKn).toBeCloseTo(expected.minimumKn, 10);
    expect(result.maximumKn).toBeCloseTo(expected.maximumKn, 10);
    expect(result.averageKn).toBeCloseTo(expected.averageKn, 10);
    expect(Math.abs(result.finalWebResidualMm)).toBeLessThan(1e-12);
  });

  it("matches representative copied rows", () => {
    const result = calculateDataAndKn(input);
    const point1 = result.knCurve[1];
    const finalPoint = result.knCurve.at(-1)!;

    for (const [key, value] of Object.entries(expected.curvePoint1)) {
      expect(point1[key as keyof typeof point1]).toBeCloseTo(value, 9);
    }
    for (const [key, value] of Object.entries(expected.finalCurvePoint)) {
      expect(finalPoint[key as keyof typeof finalPoint]).toBeCloseTo(value, 9);
    }
  });

  it("uses the workbook polynomial for every propellant at 4 MPa", () => {
    const expectedAtFourMpa = {
      KNDX: 249.11256,
      "KNSB fine": 313.194688,
      "KNSB coarse": 374.8632,
      KNSU: 191.74582,
      "KNER coarse": 510.981309,
      "KNMN coarse": 374.8632,
      KNPSB: 144.33,
      KNFR: 231.3976,
    } as const;

    for (const [propellant, targetKn] of Object.entries(expectedAtFourMpa)) {
      expect(
        calculateTargetKn(
          propellant as keyof typeof expectedAtFourMpa,
          input.targetPressureMpa,
        ),
      ).toBeCloseTo(targetKn, 9);
    }
  });
});
