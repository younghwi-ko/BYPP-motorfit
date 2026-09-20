import { describe, expect, it } from "vitest";
import { parseRpaBackup, RPA_LINK_SCHEMA_VERSION } from "../src/engine/rpa-link";

const record = {
  id: "rpa-1",
  candidateKey: "45×15×80/2",
  recordedAt: "2026-01-01T00:00:00.000Z",
  source: "RPA file",
  version: "RPA-1",
  database: "CEA-test",
  inputConditions: "Bell contour",
  resultValues: "Ae/At=6",
  memo: "separate result",
};

describe("RPA 연계 백업 schema", () => {
  it("accepts valid records and preserves their source fields", () => {
    expect(parseRpaBackup({ app: "MotorFit", schemaVersion: RPA_LINK_SCHEMA_VERSION, records: [record] })).toEqual([record]);
  });

  it("rejects foreign, malformed, or incomplete backups", () => {
    expect(() => parseRpaBackup({ app: "Other", schemaVersion: RPA_LINK_SCHEMA_VERSION, records: [record] })).toThrow();
    expect(() => parseRpaBackup({ app: "MotorFit", schemaVersion: 99, records: [record] })).toThrow();
    expect(() => parseRpaBackup({ app: "MotorFit", schemaVersion: RPA_LINK_SCHEMA_VERSION, records: [{ ...record, database: 4 }] })).toThrow();
  });
});
