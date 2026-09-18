/**
 * GSRM O-ring sizing uses the outside reference diameter B, while the SRM
 * calculation engine uses the chamber inner diameter. Keep this conversion at
 * the GSRM boundary so SRM grain, pressure and performance calculations remain
 * unchanged.
 */
export const DEFAULT_GSRM_WALL_THICKNESS_MM = 2;

export function calculateGsrmReferenceDiameter(
  srmChamberInnerDiameterMm: number,
  wallThicknessMm = DEFAULT_GSRM_WALL_THICKNESS_MM,
): number {
  if (!Number.isFinite(srmChamberInnerDiameterMm) || srmChamberInnerDiameterMm <= 0) {
    throw new Error("SRM chamber inner diameter must be positive and finite.");
  }
  if (!Number.isFinite(wallThicknessMm) || wallThicknessMm < 0) {
    throw new Error("Wall thickness must be nonnegative and finite.");
  }
  return srmChamberInnerDiameterMm + wallThicknessMm * 2;
}
