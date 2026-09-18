import { describe, expect, it } from "vitest";

import { selectBurnRateCoefficients, solveBisection } from "../src/engine";

describe("Burnrate Saint-Robert coefficient selection", () => {
  it("uses the Excel approximate VLOOKUP lower-edge rule for KNDX", () => {
    expect(selectBurnRateCoefficients("KNDX", 0.1)).toMatchObject({
      aMmPerSecAtMpa: 8.87544496778536,
      pressureExponent: 0.6193,
    });
    expect(selectBurnRateCoefficients("KNDX", 0.779135)).toMatchObject({
      aMmPerSecAtMpa: 7.55278442387944,
      pressureExponent: -0.0087,
    });
    expect(selectBurnRateCoefficients("KNDX", 12)).toMatchObject({
      aMmPerSecAtMpa: 4.77524086347659,
      pressureExponent: 0.4417,
    });
    expect(() => selectBurnRateCoefficients("KNDX", 0.099)).toThrow(RangeError);
  });

  it("uses the Excel approximate VLOOKUP lower-edge rule for KNSB fine", () => {
    expect(selectBurnRateCoefficients("KNSB fine", 0.806715)).toMatchObject({
      aMmPerSecAtMpa: 8.76328007101773,
      pressureExponent: -0.3142,
    });
    expect(selectBurnRateCoefficients("KNSB fine", 10)).toMatchObject({
      aMmPerSecAtMpa: 9.65320361987685,
      pressureExponent: 0.0638,
    });
  });

  it("uses the workbook's direct named coefficients for remaining propellants", () => {
    expect(selectBurnRateCoefficients("KNSB coarse", 4)).toMatchObject({
      aMmPerSecAtMpa: 5.13,
      pressureExponent: 0.22,
    });
    expect(selectBurnRateCoefficients("KNER coarse", 4)).toMatchObject({
      aMmPerSecAtMpa: 2.9,
      pressureExponent: 0.4,
    });
    expect(selectBurnRateCoefficients("KNMN coarse", 4)).toMatchObject({
      aMmPerSecAtMpa: 5.13,
      pressureExponent: 0.22,
    });
    expect(selectBurnRateCoefficients("KNPSB", 4)).toMatchObject({
      aMmPerSecAtMpa: 6.5,
      pressureExponent: 0.628,
    });
    expect(selectBurnRateCoefficients("KNFR", 4)).toMatchObject({
      aMmPerSecAtMpa: 7.4,
      pressureExponent: 0.25,
    });
    expect(selectBurnRateCoefficients("KNSU", 4)).toMatchObject({
      aMmPerSecAtMpa: 8.26,
      pressureExponent: 0.319,
    });
  });
});

describe("bisection solver", () => {
  it("keeps a bracketed residual independent of the combustion recurrence", () => {
    const solution = solveBisection((x) => x * x - 9, { lower: 0, upper: 4 });
    expect(solution.root).toBeCloseTo(3, 14);
    expect(Math.abs(solution.residual)).toBeLessThan(1e-14);
  });
});
