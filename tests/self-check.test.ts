import { describe, expect, it } from "vitest";

import { runSelfCheck, changeList, SelfCheckCancelledError, SELF_CHECK_SCHEMA_VERSION, SELF_CHECK_STORAGE_KEY } from "../src/engine";

describe("앱 자체 점검", () => {
  it("전체 fixture와 단위·schema 점검을 실행해 PASS 결과를 만든다", async () => {
    const progress: string[] = [];
    const report = await runSelfCheck({ onProgress: (item) => progress.push(item.current) });
    expect(report.status).toBe("COMPLETED");
    expect(report.counts.fail).toBe(0);
    expect(report.counts.pass).toBe(report.counts.total);
    expect(report.deterministicStatus).toBe("PASS");
    expect(report.unitsStatus).toBe("PASS");
    expect(report.schemaStatus).toBe("PASS");
    expect(report.checks.some((item) => item.name === "GSRM 기준 B=49 mm" && item.status === "PASS")).toBe(true);
    expect(report.checks.some((item) => item.name === "AN catalog 241개" && item.status === "PASS")).toBe(true);
    expect(progress.length).toBe(report.counts.total);
    expect(SELF_CHECK_SCHEMA_VERSION).toBe(1);
    expect(SELF_CHECK_STORAGE_KEY).toContain("self-check");
    const changed = changeList({ ...report, fingerprint: report.fingerprint, versions: { ...report.versions, engineVersion: "old-engine" } }, report.fingerprint, report.checks);
    expect(changed.join(" ")).toContain("엔진");
  }, 180_000);

  it("점검 중 취소는 PASS 결과로 저장되지 않는다", async () => {
    await expect(runSelfCheck({ shouldCancel: () => true })).rejects.toBeInstanceOf(SelfCheckCancelledError);
  });
});
