import { describe, expect, it } from "vitest";
import { AN_SERIES_CATALOG, DEFAULT_AN_CANDIDATE, calculateGsrmCalculator, evaluateAnCatalog } from "../src/engine";

describe("GSRM Calculator and AS568 catalog", () => {
  it("reproduces the supplied AN-129 nominal dimensions", () => {
    expect(DEFAULT_AN_CANDIDATE.partNumber).toBe("AN-129-NBR");
    expect(DEFAULT_AN_CANDIDATE.innerDiameterMm).toBe(39.34);
    expect(DEFAULT_AN_CANDIDATE.crossSectionMm).toBe(2.62);
  });

  it("matches the GSRM Calculator formulas for B=49 and AN-129", () => {
    const result = calculateGsrmCalculator({ referenceDiameterMm: 49, innerDiameterMm: 39.34, crossSectionMm: 2.62, hardness: 70 });
    expect(result.outsideDiameterMm).toBeCloseTo(44.58, 10);
    expect(result.grooveDiameterMm).toBeCloseTo(40.1268, 10);
    expect(result.grooveDepthMm).toBeCloseTo(4.4366, 10);
    expect(result.stretchPercent).toBeCloseTo(2, 10);
    expect(result.backupRingRequired).toBe(false);
  });

  it("runs every visible catalog row and ranks by passed checks", () => {
    const rows = evaluateAnCatalog(49, AN_SERIES_CATALOG);
    expect(rows.length).toBeGreaterThan(100);
    expect(rows.some((row) => row.partNumber === "AN-129-NBR")).toBe(true);
    expect(rows[0].calculation.check.passedCount).toBeGreaterThanOrEqual(rows.at(-1)!.calculation.check.passedCount);
  });

  it("marks negative compression and invalid depth as GSRM failures", () => {
    const result = calculateGsrmCalculator({ referenceDiameterMm: 30, innerDiameterMm: 20, crossSectionMm: 2, hardness: 70 });
    expect(result.compressionMm).toBeLessThan(0);
    expect(result.check.status).toBe("fail");
    expect(result.check.reasons).toContain("압축량이 0.1 mm 미만");
  });

  it("keeps the backup-ring boundary at B=50 mm", () => {
    expect(calculateGsrmCalculator({ referenceDiameterMm: 50, innerDiameterMm: 40, crossSectionMm: 2, hardness: 70 }).backupRingRequired).toBe(true);
    expect(calculateGsrmCalculator({ referenceDiameterMm: 49.999, innerDiameterMm: 40, crossSectionMm: 2, hardness: 70 }).backupRingRequired).toBe(false);
  });
});
