import type {
  BurnRateCoefficients,
  BurnRatePressureBand,
  PropellantId,
} from "../types";

/**
 * Values transcribed from SRM_2023.xls, Burnrate.  The two multi-band tables
 * are read by VLOOKUP without its fourth argument, so Excel uses approximate
 * match: the last lower edge not greater than the pressure is selected.
 */
const KNDX_BANDS: readonly BurnRatePressureBand[] = [
  { lowerPressureMpa: 0.1, aMmPerSecAtMpa: 8.87544496778536, pressureExponent: 0.6193 },
  { lowerPressureMpa: 0.779135, aMmPerSecAtMpa: 7.55278442387944, pressureExponent: -0.0087 },
  { lowerPressureMpa: 2.571835, aMmPerSecAtMpa: 3.84087990499602, pressureExponent: 0.6882 },
  { lowerPressureMpa: 5.9297, aMmPerSecAtMpa: 17.2041864098062, pressureExponent: -0.1481 },
  { lowerPressureMpa: 8.501535, aMmPerSecAtMpa: 4.77524086347659, pressureExponent: 0.4417 },
];

const KNSB_FINE_BANDS: readonly BurnRatePressureBand[] = [
  { lowerPressureMpa: 0.101, aMmPerSecAtMpa: 10.7076837980331, pressureExponent: 0.6247 },
  { lowerPressureMpa: 0.806715, aMmPerSecAtMpa: 8.76328007101773, pressureExponent: -0.3142 },
  { lowerPressureMpa: 1.50311, aMmPerSecAtMpa: 7.85216579497841, pressureExponent: -0.013 },
  { lowerPressureMpa: 3.79225, aMmPerSecAtMpa: 3.90676830413905, pressureExponent: 0.5354 },
  { lowerPressureMpa: 7.0329, aMmPerSecAtMpa: 9.65320361987685, pressureExponent: 0.0638 },
];

const FIXED_COEFFICIENTS: Readonly<
  Record<Exclude<PropellantId, "KNDX" | "KNSB fine">, BurnRateCoefficients>
> = {
  "KNSB coarse": { aMmPerSecAtMpa: 5.13, pressureExponent: 0.22 },
  KNSU: { aMmPerSecAtMpa: 8.26, pressureExponent: 0.319 },
  "KNER coarse": { aMmPerSecAtMpa: 2.9, pressureExponent: 0.4 },
  "KNMN coarse": { aMmPerSecAtMpa: 5.13, pressureExponent: 0.22 },
  KNPSB: { aMmPerSecAtMpa: 6.5, pressureExponent: 0.628 },
  KNFR: { aMmPerSecAtMpa: 7.4, pressureExponent: 0.25 },
};

export const BURN_RATE_PRESSURE_BANDS = {
  KNDX: KNDX_BANDS,
  "KNSB fine": KNSB_FINE_BANDS,
} as const;

function selectApproximateVlookupBand(
  bands: readonly BurnRatePressureBand[],
  pressureMpa: number,
): BurnRateCoefficients {
  if (!Number.isFinite(pressureMpa) || pressureMpa < bands[0].lowerPressureMpa) {
    throw new RangeError(
      `Pressure ${pressureMpa} MPa is below the first Excel VLOOKUP lower edge (${bands[0].lowerPressureMpa} MPa).`,
    );
  }

  let selected = bands[0];
  for (const band of bands) {
    if (band.lowerPressureMpa > pressureMpa) break;
    selected = band;
  }
  return selected;
}

export function selectBurnRateCoefficients(
  propellant: PropellantId,
  pressureMpa: number,
): BurnRateCoefficients {
  if (propellant === "KNDX") {
    return selectApproximateVlookupBand(KNDX_BANDS, pressureMpa);
  }
  if (propellant === "KNSB fine") {
    return selectApproximateVlookupBand(KNSB_FINE_BANDS, pressureMpa);
  }
  return FIXED_COEFFICIENTS[propellant];
}
