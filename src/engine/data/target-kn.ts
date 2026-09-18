import type { PropellantId } from "../types";

export const PASCALS_PER_PSI = 6895;

export const TARGET_PRESSURE_OPTIONS_MPA = [
  9, 8.5, 8, 7.5, 7, 6.5, 6, 5.5, 5, 4.5, 4, 3.5, 3, 2.5, 2, 1.5, 1,
  ...Array.from({ length: 24 }, (_, index) =>
    ((1300 - index * 50) * PASCALS_PER_PSI) / 1_000_000,
  ),
] as const;

type Polynomial = readonly [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

const TARGET_KN_POLYNOMIALS: Readonly<
  Record<Exclude<PropellantId, "KNDX">, Polynomial>
> = {
  "KNSB fine": [34.5, -10.975, 69.667, -19.664, 2.1478, -0.081463, 0],
  "KNSB coarse": [38, 92.391, -2.0438, 0, 0, 0, 0],
  KNSU: [32.9539, 44.1079, -1.10248, 0, 0, 0, 0],
  "KNER coarse": [
    50.410353,
    211.194019,
    -47.797596,
    8.779018,
    -0.830282,
    0.030519,
    0,
  ],
  "KNMN coarse": [38, 92.391, -2.0438, 0, 0, 0, 0],
  KNPSB: [54.53, 33.652, -3.4185, 0.1545, 0, 0, 0],
  KNFR: [39.748, 51.618, -0.9264, 0, 0, 0, 0],
};

const KNDX_LOW: Polynomial = [43.5, 0.24168, 50.48413, -9.91148, 0, 0, 0];
const KNDX_MIDDLE: Polynomial = [163.8, 22.22414, -0.224, 0, 0, 0, 0];
const KNDX_HIGH: Polynomial = [
  5095,
  -2460.426,
  453.4805,
  -35.53239,
  1.01745,
  0,
  0,
];

function evaluatePolynomial(coefficients: Polynomial, pressureMpa: number) {
  return coefficients.reduce(
    (sum, coefficient, power) => sum + coefficient * pressureMpa ** power,
    0,
  );
}

export function calculateTargetKn(
  propellant: PropellantId,
  pressureMpa: number,
): number {
  if (propellant === "KNDX") {
    const coefficients =
      pressureMpa < 3
        ? KNDX_LOW
        : pressureMpa < 6
          ? KNDX_MIDDLE
          : KNDX_HIGH;
    return evaluatePolynomial(coefficients, pressureMpa);
  }

  return evaluatePolynomial(TARGET_KN_POLYNOMIALS[propellant], pressureMpa);
}
