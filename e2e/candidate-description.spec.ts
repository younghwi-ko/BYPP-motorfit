import { expect, test } from "@playwright/test";

const reason = "목표 추력이 미입력되어 추력 조건을 평가하지 않았습니다.";

for (const mobile of [false, true]) {
  test(`기준 예시 조건부 설명 일치 · ${mobile ? "390px 모바일" : "데스크톱"}`, async ({ page }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    // Each Playwright context has separate storage; no user history is cleared.
    await page.goto("/");
    await page.getByRole("button", { name: "기준 예시 불러오기", exact: true }).click();
    await page.getByRole("button", { name: "계산 시작", exact: true }).click();
    await expect(page.getByText(/단계 4\/4 완료/)).toBeVisible({ timeout: 60_000 });
    const summary = page.getByTestId("representative-candidate");
    await expect(summary).toContainText("45 × 15 × 80 / 2");
    await expect(summary).toContainText("0.3956 kg");
    await expect(summary).toContainText("3.9836 MPa");
    await expect(summary).toContainText("2.1767 s");
    await expect(summary).toContainText("209.84 N");
    await expect(summary).toContainText(reason);
    await expect(summary.getByRole("status", { name: "조건부 후보" })).toBeVisible();
    await expect(page.getByText("조건부 1", { exact: true })).toBeVisible();
    await expect(page.getByText("탈락 569", { exact: true })).toBeVisible();
    if (mobile) {
      const card = page.locator(".sm\\:hidden").filter({ hasText: "45 × 15 × 80 / 2" }).first();
      await expect(card).toContainText(reason);
      await card.getByRole("button", { name: "상세 보기", exact: true }).first().click();
    } else {
      const row = page.locator("tbody tr").filter({ hasText: "45 × 15 × 80 / 2" }).first();
      await expect(row).toContainText(reason);
      await expect(row).not.toContainText("조건 충족");
      await row.getByRole("button", { name: /상세 보기/ }).click();
    }
    await expect(page.getByText("조건부 후보 상세", { exact: true })).toBeVisible();
    await expect(page.locator("li").filter({ hasText: "판정 사유" })).toContainText(reason);
    await expect(page.getByText(`조건부 판정: ${reason} 추천 후보와 동일한 확정 판정이 아닙니다.`)).toBeVisible();
    const conditions = page.getByText("조건별 판정", { exact: true }).locator("../..");
    await expect(conditions).toContainText("목표 추력 조건미입력");
    await expect(conditions).toContainText("연소시간 조건미적용");
    await expect(page.getByText("모든 기본 조건을 충족했습니다.", { exact: false })).toHaveCount(0);
    await expect(page.getByText("평균제곱오차", { exact: true })).toHaveCount(0);
  });
}
