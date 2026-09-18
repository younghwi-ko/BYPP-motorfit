import type { PropellantConstants, PropellantId } from "../types";

// SRM_2023.xls, Propellant data!F9:L12.
export const PROPELLANT_CONSTANTS: Readonly<
  Record<PropellantId, PropellantConstants>
> = {
  KNDX: {
    idealDensityGPerCm3: 1.879,
    specificHeatRatio: 1.1308,
    molecularWeightKgPerKmol: 42.42,
    chamberTemperatureK: 1710,
  },
  "KNSB fine": {
    idealDensityGPerCm3: 1.841,
    specificHeatRatio: 1.137,
    molecularWeightKgPerKmol: 39.9,
    chamberTemperatureK: 1600,
  },
  "KNSB coarse": {
    idealDensityGPerCm3: 1.841,
    specificHeatRatio: 1.137,
    molecularWeightKgPerKmol: 39.9,
    chamberTemperatureK: 1600,
  },
  KNSU: {
    idealDensityGPerCm3: 1.889,
    specificHeatRatio: 1.133,
    molecularWeightKgPerKmol: 42.02,
    chamberTemperatureK: 1720,
  },
  "KNER coarse": {
    idealDensityGPerCm3: 1.82,
    specificHeatRatio: 1.14,
    molecularWeightKgPerKmol: 38.58,
    chamberTemperatureK: 1608,
  },
  "KNMN coarse": {
    idealDensityGPerCm3: 1.854,
    specificHeatRatio: 1.1363,
    molecularWeightKgPerKmol: 39.826,
    chamberTemperatureK: 1616,
  },
  KNPSB: {
    idealDensityGPerCm3: 1.923,
    specificHeatRatio: 1.163,
    molecularWeightKgPerKmol: 36.39,
    chamberTemperatureK: 1858,
  },
  // The workbook links KNFR thermochemistry to the KNDX cells.
  KNFR: {
    idealDensityGPerCm3: 1.942,
    specificHeatRatio: 1.1308,
    molecularWeightKgPerKmol: 42.42,
    chamberTemperatureK: 1710,
  },
};

export function selectPropellantConstants(
  propellant: PropellantId,
): PropellantConstants {
  return PROPELLANT_CONSTANTS[propellant];
}
