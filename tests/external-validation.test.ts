import { describe, expect, it } from "vitest";

import {
  EXTERNAL_VALIDATION_SCHEMA_VERSION,
  compareValidationMetric,
  isWithinValidationTolerance,
  compareValidationRecord,
  getValidationQualityWarnings,
  parseExternalValidationBackup,
} from "../src/engine/external-validation";

const recordFixture = {
  id: "v-1", name: "기록 A", recordedAt: "2026-01-01T00:00:00.000Z", sourceDescription: "시험소", calculationResultId: "calc-1",
  measured: { averageThrustN: 100, maximumPressureMpa: 4 }, tolerances: { averageThrustN: 5, maximumPressureMpa: 0.1 }, conditionsMemo: "상온", dataVersion: "run-1",
  units: { averageThrustN: "N", maximumPressureMpa: "MPa", burnTimeSec: "s", totalImpulseNs: "N·s" }, appVersion: "app", engineVersion: "engine", baselineVersion: "srm", gsrmReferenceVersion: "gsrm", anCatalogVersion: "an",
};

describe("external validation comparison", () => {
  it("compares measured and predicted values only when both exist", () => {
    expect(compareValidationMetric("averageThrustN", 100, 102, 3)).toMatchObject({ absoluteDifference: 2, relativeDifferencePercent: 2, status: "within" });
    expect(compareValidationMetric("averageThrustN", 100, 105, 3).status).toBe("outside");
    expect(compareValidationMetric("averageThrustN", 100, 102, undefined).status).toBe("tolerance-unset");
    expect(compareValidationMetric("averageThrustN", 100, undefined, 3).status).toBe("unavailable");
  });

  it("returns all standard metrics and supports incomplete measurements", () => {
    const record = { ...recordFixture, measured: { averageThrustN: 100 }, tolerances: { averageThrustN: 5 } } as Parameters<typeof compareValidationRecord>[0];
    expect(compareValidationRecord(record, { averageThrustN: 102 })).toHaveLength(4);
    expect(compareValidationRecord(record, { averageThrustN: 102 })[0].status).toBe("within");
    expect(compareValidationRecord(record, { averageThrustN: 102 })[1].status).toBe("unavailable");
  });

  it("rejects invalid or unsupported backups", () => {
    expect(() => parseExternalValidationBackup({ app: "Other", schemaVersion: EXTERNAL_VALIDATION_SCHEMA_VERSION, records: [] })).toThrow();
    expect(() => parseExternalValidationBackup({ app: "MotorFit", schemaVersion: 99, records: [] })).toThrow();
  });

  it("detects cumulative-record quality warnings without inferring physical safety", () => {
    const second = { ...recordFixture, id: "v-2", measured: {}, tolerances: {}, sourceDescription: "출처 미기록", dataVersion: "식별자 미기록", conditionsMemo: "" };
    const warnings = getValidationQualityWarnings(second, { appVersion: "app", engineVersion: "engine", baselineVersion: "srm", gsrmReferenceVersion: "gsrm", anCatalogVersion: "an" }, [recordFixture, second]);
    expect(warnings).toContain("measurement-missing");
    expect(warnings).toContain("conditions-missing");
    expect(warnings).toContain("source-missing");
    expect(warnings).toContain("data-version-missing");
    expect(warnings).not.toContain("version-mismatch");
  });

  it("flags duplicate name and timestamp and version mismatch", () => {
    const duplicate = { ...recordFixture, id: "v-2" };
    const warnings = getValidationQualityWarnings(duplicate, { appVersion: "new", engineVersion: "engine", baselineVersion: "srm", gsrmReferenceVersion: "gsrm", anCatalogVersion: "an" }, [recordFixture, duplicate]);
    expect(warnings).toEqual(expect.arrayContaining(["duplicate-possible", "version-mismatch"]));
  });

  it("keeps raw-number tolerance boundaries deterministic", () => {
    expect(isWithinValidationTolerance(0.01, 0.01)).toBe(true);
    expect(isWithinValidationTolerance(0.009999999999, 0.01)).toBe(true);
    expect(isWithinValidationTolerance(0.010000000001, 0.01)).toBe(false);
    expect(compareValidationMetric("averageThrustN", 100, 100.01, 0.01).status).toBe("within");
    expect(compareValidationMetric("averageThrustN", 100, 100.010000001, 0.01).status).toBe("outside");
  });

  it("does not compare missing or invalid units and rejects non-finite backup values", () => {
    const invalidUnit = { ...recordFixture, units: { ...recordFixture.units, averageThrustN: "kN" } };
    expect(compareValidationRecord(invalidUnit, { averageThrustN: 100 })[0].status).toBe("unavailable");
    expect(() => parseExternalValidationBackup({ app: "MotorFit", schemaVersion: EXTERNAL_VALIDATION_SCHEMA_VERSION, records: [{ ...recordFixture, measured: { averageThrustN: Number.NaN } }] })).toThrow();
  });
});
