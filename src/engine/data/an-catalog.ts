import type { GsrmCatalogCandidate } from "../gsrm-calculator";

const SOURCE = "AS 568A O-Ring 규격표 (첨부 이미지)";

// Nominal d1 values transcribed from the supplied AS568A table. Only rows
// visible in that image are included; gaps in the AS568 series remain absent.
const groups: Array<[number, number, number, string]> = [
  [1, 1.78, 0.08, "0.74,1.07,1.42,1.78,2.57,2.90,3.68,4.47,5.28,6.07,7.65,9.25,10.82,12.42,14.00,15.60,17.17,18.77,20.35,21.95,23.52,25.12,26.70,28.30,29.87,31.47,33.05,34.65,37.82,41.00,44.17,47.35,50.52,53.70,56.87,60.05,63.22,66.40,69.57,72.75,75.92,82.27,88.62,94.97,101.32,107.67,114.02,120.37,126.72,133.07"],
  [102, 2.62, 0.08, "1.24,2.05,2.86,3.63,4.42,5.23,6.02,7.59,9.19,10.77,12.37,13.94,15.54,17.12,18.72,20.30,21.89,23.47,25.07,26.64,28.24,29.82,31.42,32.99,34.59,36.17,37.77,39.34,40.94,42.52,44.12,45.69,47.29,48.90,50.47,52.07,53.64,55.25,56.82,58.42,59.99,61.60,63.17,64.77,66.34,67.95,69.52,71.12,72.69,75.87,82.22,88.57,94.92,101.27,107.62,113.97,120.32,126.67,133.02,139.37,145.72,152.07,158.42,164.77,171.12,177.47,183.82,190.17,196.52,202.87,209.22,215.57,221.92,228.27,234.62,240.97,247.32"],
  [201, 3.53, 0.10, "4.34,5.94,7.52,9.12,10.69,12.29,13.87,15.47,17.04,18.64,20.22,21.82,23.39,24.99,26.57,28.17,29.74,31.34,32.92,34.52,36.09,37.69,40.87,44.04,47.22,50.39,53.57,56.74,59.92,63.09,66.27,69.44,72.62,75.79,78.97,82.14,85.32,88.49,91.67,94.84,98.02,101.19,104.37,107.54,110.72,113.89,117.07,120.24,123.42,126.59,129.77,132.94,136.12,139.29,142.47,145.64,148.82,151.99,158.34,164.69,171.04,177.39,183.74,190.09,196.44,202.79,209.14,215.49,221.84,228.19,234.54,240.89,247.24,253.59,266.29,278.99,291.69,304.39,329.79,355.19,380.59,405.26,430.66,456.06"],
  [309, 5.33, 0.13, "10.46,12.07,13.64,15.24,16.81,18.42,19.99,21.59,23.16,24.77,26.34,27.94,29.51,31.12,32.69,34.29,35.87,37.47,40.64,43.82,46.99,50.17,53.34,56.52,59.69,62.87,66.04,69.22"],
];

function idTolerance(size: number): number {
  if (size <= 3) return 0.10;
  if (size <= 13) return 0.13;
  if (size <= 20) return 0.23;
  if (size <= 27) return 0.28;
  if (size <= 34) return 0.38;
  if (size <= 40) return 0.51;
  if (size <= 50) return 0.61;
  if (size <= 114) return 0.23;
  if (size <= 132) return 0.38;
  if (size <= 140) return 0.43;
  if (size <= 146) return 0.51;
  if (size <= 150) return 0.56;
  if (size <= 155) return 0.71;
  if (size <= 163) return 0.89;
  if (size <= 167) return 1.02;
  if (size <= 171) return 1.14;
  return 1.40;
}

export const AN_REVIEW_ROWS: readonly number[] = [];

export const AN_SERIES_CATALOG: readonly GsrmCatalogCandidate[] = groups.flatMap(([start, crossSectionMm, crossSectionToleranceMm, values]) => values.split(",").map((value, offset) => {
  const sizeNo = start + offset;
  const innerDiameterMm = Number(value);
  return {
    sizeNo,
    partNumber: `AN-${String(sizeNo).padStart(3, "0")}-NBR`,
    referenceDiameterMm: 49,
    innerDiameterMm,
    crossSectionMm,
    innerDiameterToleranceMm: idTolerance(sizeNo),
    crossSectionToleranceMm,
    material: "NBR" as const,
    hardness: 70 as const,
    sourceLabel: SOURCE,
  };
}));

export const DEFAULT_AN_CANDIDATE = AN_SERIES_CATALOG.find((item) => item.sizeNo === 129)!;
