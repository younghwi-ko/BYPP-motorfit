import { describe, expect, it } from "vitest";

import {
  EXTERNAL_VALIDATION_SCHEMA_VERSION,
  compareValidationMetric,
  compareValidationRecord,
  parseExternalValidationBackup,
} from "../src/engine/external-validation";

describe("external validation comparison", () => {
  it("compares measured and predicted values only when both exist", () => {
    expect(compareValidationMetric("averageThrustN", 100, 102, 3)).toMatchObject({ absoluteDifference: 2, relativeDifferencePercent: 2, status: "within" });
    expect(compareValidationMetric("averageThrustN", 100, 105, 3).status).toBe("outside");
    expect(compareValidationMetric("averageThrustN", 100, 102, undefined).status).toBe("tolerance-unset");
    expect(compareValidationMetric("averageThrustN", 100, undefined, 3).status).toBe("unavailable");
  });

  it("returns all standard metrics and supports incomplete measurements", () => {
    const record = { measured: { averageThrustN: 100 }, tolerances: { averageThrustN: 5 } } as Parameters<typeof compareValidationRecord>[0];
    expect(compareValidationRecord(record, { averageThrustN: 102 })).toHaveLength(4);
    expect(compareValidationRecord(record, { averageThrustN: 102 })[0].status).toBe("within");
    expect(compareValidationRecord(record, { averageThrustN: 102 })[1].status).toBe("unavailable");
  });

  it("rejects invalid or unsupported backups", () => {
    expect(() => parseExternalValidationBackup({ app: "Other", schemaVersion: EXTERNAL_VALIDATION_SCHEMA_VERSION, records: [] })).toThrow();
    expect(() => parseExternalValidationBackup({ app: "MotorFit", schemaVersion: 99, records: [] })).toThrow();
  });
});
