import type { NozzleDesignInput, NozzleDesignResult } from "./types";

/**
 * The Nozzle Design sheet is a two-line conical construction: a straight
 * convergent section from chamber radius to throat radius, followed by a
 * straight divergent section to the selected exit radius.  Angles are sheet
 * inputs in degrees; all lengths and diameters remain millimetres.
 */
export function calculateNozzleDesign(input: NozzleDesignInput): NozzleDesignResult {
  const values = [
    input.chamberDiameterMm, input.throatDiameterMm, input.actualExitDiameterMm,
    input.optimalExpansionRatio, input.convergenceHalfAngleDeg,
    input.divergenceHalfAngleDeg,
  ];
  if (values.some((value) => !Number.isFinite(value))) throw new Error("Nozzle inputs must be finite.");
  if (input.chamberDiameterMm <= input.throatDiameterMm || input.throatDiameterMm <= 0 || input.actualExitDiameterMm <= input.throatDiameterMm) throw new Error("Nozzle diameters must satisfy chamber > throat and exit > throat.");
  if (input.optimalExpansionRatio <= 0 || input.convergenceHalfAngleDeg <= 0 || input.divergenceHalfAngleDeg <= 0 || input.convergenceHalfAngleDeg >= 90 || input.divergenceHalfAngleDeg >= 90) throw new Error("Nozzle angles and expansion ratio are outside the valid range.");
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const chamberRadius = input.chamberDiameterMm / 2;
  const throatRadius = input.throatDiameterMm / 2;
  const actualExitRadius = input.actualExitDiameterMm / 2;
  const optimalExitDiameterMm = input.throatDiameterMm * Math.sqrt(input.optimalExpansionRatio);
  const convergenceLengthMm = (chamberRadius - throatRadius) / Math.tan(toRadians(input.convergenceHalfAngleDeg));
  const divergenceLengthMm = (actualExitRadius - throatRadius) / Math.tan(toRadians(input.divergenceHalfAngleDeg));
  const totalLengthMm = convergenceLengthMm + divergenceLengthMm;
  return {
    convergenceLengthMm,
    divergenceLengthMm,
    totalLengthMm,
    actualExitDiameterMm: input.actualExitDiameterMm,
    optimalExitDiameterMm,
    profile: [
      { xMm: 0, radiusMm: chamberRadius },
      { xMm: convergenceLengthMm, radiusMm: throatRadius },
      { xMm: totalLengthMm, radiusMm: actualExitRadius },
    ],
  };
}
