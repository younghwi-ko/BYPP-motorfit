interface MotorClassBand {
  lowerImpulseNs: number;
  motorClass: string;
}

/** Class!B6:C27, read by approximate VLOOKUP in Performance!C19. */
export const MOTOR_CLASS_BANDS: readonly MotorClassBand[] = [
  { lowerImpulseNs: 1.26, motorClass: "A" },
  { lowerImpulseNs: 2.5, motorClass: "B" },
  { lowerImpulseNs: 5, motorClass: "C" },
  { lowerImpulseNs: 10, motorClass: "D" },
  { lowerImpulseNs: 20, motorClass: "E" },
  { lowerImpulseNs: 40, motorClass: "F" },
  { lowerImpulseNs: 80, motorClass: "G" },
  { lowerImpulseNs: 160, motorClass: "H" },
  { lowerImpulseNs: 320, motorClass: "I" },
  { lowerImpulseNs: 640, motorClass: "J" },
  { lowerImpulseNs: 1280, motorClass: "K" },
  { lowerImpulseNs: 2560, motorClass: "L" },
  { lowerImpulseNs: 5120, motorClass: "M" },
  { lowerImpulseNs: 10240, motorClass: "N" },
  { lowerImpulseNs: 20480, motorClass: "O" },
  { lowerImpulseNs: 40960, motorClass: "P" },
  { lowerImpulseNs: 81920, motorClass: "Q" },
  { lowerImpulseNs: 163840, motorClass: "R" },
  { lowerImpulseNs: 327680, motorClass: "S" },
  { lowerImpulseNs: 655360, motorClass: "T" },
  { lowerImpulseNs: 1310720, motorClass: "U" },
  { lowerImpulseNs: 2621440, motorClass: "V" },
];

export function classifyMotor(totalImpulseNs: number): string {
  if (
    !Number.isFinite(totalImpulseNs) ||
    totalImpulseNs < MOTOR_CLASS_BANDS[0].lowerImpulseNs
  ) {
    throw new RangeError(
      `Total impulse ${totalImpulseNs} N·s is below Class!B6, matching Excel VLOOKUP #N/A.`,
    );
  }

  let selected = MOTOR_CLASS_BANDS[0];
  for (const band of MOTOR_CLASS_BANDS) {
    if (band.lowerImpulseNs > totalImpulseNs) break;
    selected = band;
  }
  return selected.motorClass;
}
