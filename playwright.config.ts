import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: { baseURL: process.env.BASE_URL ?? "http://127.0.0.1:3000", trace: "retain-on-failure", screenshot: "only-on-failure", video: "off" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: process.env.BASE_URL ? undefined : { command: "pnpm start", url: "http://127.0.0.1:3000", reuseExistingServer: true, timeout: 120_000 },
});
