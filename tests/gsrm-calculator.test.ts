import { describe, expect, it } from "vitest";
import { AN_SERIES_CATALOG, DEFAULT_AN_CANDIDATE, calculateGsrmCalculator, evaluateAnCatalog } from "../src/engine";

describe("GSRM Calculator and AS568 catalog", () => {
  it("includes the complete visible 309-338 catalog tail", () => {
    expect(AN_SERIES_CATALOG).toHaveLength(241);
    expect(AN_SERIES_CATALOG.find((item) => item.sizeNo === 337)).toMatchObject({
      partNumber: "AN-337-NBR", innerDiameterMm: 72.39, crossSectionMm: 5.33,
      innerDiameterToleranceMm: 0.61, crossSectionToleranceMm: 0.13, material: "NBR", hardness: 70, sourceLabel: "AS 568A O-Ring 규격표 (첨부 이미지)",
    });
    expect(AN_SERIES_CATALOG.find((item) => item.sizeNo === 338)).toMatchObject({
      partNumber: "AN-338-NBR", innerDiameterMm: 78.74, crossSectionMm: 5.33,
      innerDiameterToleranceMm: 0.61, crossSectionToleranceMm: 0.13, material: "NBR", hardness: 70, sourceLabel: "AS 568A O-Ring 규격표 (첨부 이미지)",
    });
  });

  it("uses AN-132 as the GSRM baseline while preserving AN-129 mapping", () => {
    expect(DEFAULT_AN_CANDIDATE.partNumber).toBe("AN-132-NBR");
    expect(DEFAULT_AN_CANDIDATE.innerDiameterMm).toBe(44.12);
    expect(DEFAULT_AN_CANDIDATE.crossSectionMm).toBe(2.62);
    const an129 = AN_SERIES_CATALOG.find((item) => item.sizeNo === 129)!;
    expect(an129.innerDiameterMm).toBe(39.34);
    expect(an129.crossSectionMm).toBe(2.62);
  });

  it("matches the GSRM workbook baseline for AN-132 at B=49 mm", () => {
    const result = calculateGsrmCalculator({ referenceDiameterMm: 49, innerDiameterMm: 44.12, crossSectionMm: 2.62, hardness: 70 });
    expect(result.compressionPercent).toBeCloseTo(23.709923664122172, 12);
    expect(result.grooveFillPercent).toBeCloseTo(75, 12);
    expect(result.check.status).toBe("recommend");
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
    expect(rows.length).toBe(241);
    expect(rows.some((row) => row.partNumber === "AN-129-NBR")).toBe(true);
    expect(rows.some((row) => row.partNumber === "AN-337-NBR")).toBe(true);
    expect(rows.some((row) => row.partNumber === "AN-338-NBR")).toBe(true);
    expect(rows.filter((row) => row.calculation.check.status === "recommend").length + rows.filter((row) => row.calculation.check.status === "conditional").length + rows.filter((row) => row.calculation.check.status === "fail").length).toBe(241);
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
