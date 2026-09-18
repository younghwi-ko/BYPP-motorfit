import { calculateTargetKn } from "./data/target-kn";
import { selectPropellantConstants } from "./data/propellants";
import type {
  BurnAreaBreakdown,
  DataAndKnInput,
  DataAndKnResult,
  KnCurvePoint,
} from "./types";
import { assertValidExcelReproductionInput } from "./validation";

export const KN_INTERVAL_COUNT = 50;

interface GeometryPoint extends BurnAreaBreakdown {
  interval: number;
  regressionMm: number;
  coreDiameterMm: number;
  outerDiameterMm: number;
  grainLengthMm: number;
  webMm: number;
}

const surfaceFlag = (condition: "Exposed" | "Inhibited") =>
  condition === "Exposed" ? 1 : 0;

function calculateGeometryPoints(
  input: DataAndKnInput,
  regressionIncrementMm: number,
): GeometryPoint[] {
  const coreFlag = surfaceFlag(input.coreSurface);
  const outerFlag = surfaceFlag(input.outerSurface);
  const endsFlag = surfaceFlag(input.endsSurface);
  const initialGrainLengthMm = input.segmentCount * input.segmentLengthMm;
  const points: GeometryPoint[] = [];
  let regressionMm = 0;

  for (let interval = 0; interval <= KN_INTERVAL_COUNT; interval += 1) {
    if (interval > 0) {
      // Data and Kn!C46:C95: each row adds xinc to the previous row.
      regressionMm += regressionIncrementMm;
    }

    const coreDiameterMm =
      input.grainCoreDiameterMm + coreFlag * 2 * regressionMm;
    const outerDiameterMm =
      input.grainOuterDiameterMm - outerFlag * 2 * regressionMm;
    const grainLengthMm =
      initialGrainLengthMm -
      endsFlag * 2 * input.segmentCount * regressionMm;
    const webMm = (outerDiameterMm - coreDiameterMm) / 2;
    const endsMm2 =
      (endsFlag * 2 * input.segmentCount * Math.PI *
        (outerDiameterMm ** 2 - coreDiameterMm ** 2)) /
      4;
    const coreMm2 =
      coreFlag * Math.PI * coreDiameterMm * grainLengthMm;
    const outerMm2 =
      outerFlag * Math.PI * outerDiameterMm * grainLengthMm;

    points.push({
      interval,
      regressionMm,
      coreDiameterMm,
      outerDiameterMm,
      grainLengthMm,
      webMm,
      endsMm2,
      coreMm2,
      outerMm2,
      totalMm2: endsMm2 + coreMm2 + outerMm2,
    });
  }

  return points;
}

export function calculateDataAndKn(input: DataAndKnInput): DataAndKnResult {
  assertValidExcelReproductionInput(input);

  const propellantConstants = selectPropellantConstants(input.propellant);
  const coreFlag = surfaceFlag(input.coreSurface);
  const outerFlag = surfaceFlag(input.outerSurface);
  const initialWebMm =
    (input.grainOuterDiameterMm - input.grainCoreDiameterMm) / 2;

  // Macro1 solves C96 = two - xfinal * (ci + osi) to zero.
  const regressionIncrementMm =
    initialWebMm / (KN_INTERVAL_COUNT * (coreFlag + outerFlag));
  const geometryPoints = calculateGeometryPoints(
    input,
    regressionIncrementMm,
  );

  const chamberVolumeMm3 =
    (Math.PI * input.chamberDiameterMm ** 2 * input.chamberLengthMm) / 4;
  const grainLengthMm = input.segmentCount * input.segmentLengthMm;
  const grainVolumeMm3 =
    (Math.PI *
      (input.grainOuterDiameterMm ** 2 - input.grainCoreDiameterMm ** 2) *
      grainLengthMm) /
    4;
  const volumetricLoadingFraction = grainVolumeMm3 / chamberVolumeMm3;
  const actualDensityGPerCm3 =
    input.densityRatio * propellantConstants.idealDensityGPerCm3;
  const grainMassKg = (actualDensityGPerCm3 * grainVolumeMm3) / 1_000_000;
  const targetKn = calculateTargetKn(
    input.propellant,
    input.targetPressureMpa,
  );
  const maximumBurnAreaMm2 = Math.max(
    ...geometryPoints.map((point) => point.totalMm2),
  );
  const throatAreaMm2 = maximumBurnAreaMm2 / targetKn;
  const initialThroatDiameterMm = Math.sqrt((4 * throatAreaMm2) / Math.PI);
  const finalThroatDiameterMm =
    initialThroatDiameterMm + input.nozzleErosionMm;

  const knCurve: KnCurvePoint[] = geometryPoints.map((point) => {
    const throatDiameterMm =
      initialThroatDiameterMm +
      input.nozzleErosionMm *
        ((initialWebMm - point.webMm) / initialWebMm);
    const pointThroatAreaMm2 = (Math.PI * throatDiameterMm ** 2) / 4;

    return {
      ...point,
      throatAreaMm2: pointThroatAreaMm2,
      kn: point.totalMm2 / pointThroatAreaMm2,
    };
  });

  const knValues = knCurve.map((point) => point.kn);
  const finalPoint = knCurve.at(-1)!;

  return {
    input,
    propellantConstants,
    chamberVolumeMm3,
    grainLengthMm,
    grainVolumeMm3,
    volumetricLoadingFraction,
    actualDensityGPerCm3,
    grainMassKg,
    initialBurnArea: {
      endsMm2: knCurve[0].endsMm2,
      coreMm2: knCurve[0].coreMm2,
      outerMm2: knCurve[0].outerMm2,
      totalMm2: knCurve[0].totalMm2,
    },
    targetKn,
    regressionIncrementMm,
    finalWebResidualMm:
      initialWebMm - finalPoint.regressionMm * (coreFlag + outerFlag),
    maximumBurnAreaMm2,
    throatAreaMm2,
    initialThroatDiameterMm,
    finalThroatDiameterMm,
    minimumKn: Math.min(...knValues),
    maximumKn: Math.max(...knValues),
    averageKn:
      knValues.reduce((sum, value) => sum + value, 0) / knValues.length,
    knCurve,
  };
}
