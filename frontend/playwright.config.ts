import { defineConfig, devices } from "@playwright/test";

/**
 * Browser end-to-end and accessibility checks for Module 21 (AI Contact Center).
 * Expects the frontend and backend dev servers to be running already:
 *   E2E_BASE_URL (default http://localhost:3000) and E2E_API_URL (default http://127.0.0.1:5001/api/v1).
 * Each run signs up a fresh, clearly named QA business; no existing business data is used.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "e2e-results/results.json" }]],
  outputDir: "e2e-results/artifacts",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "module21",
      use: { ...devices["Desktop Chrome"], storageState: "e2e-results/.auth/qa-owner.json" },
      dependencies: ["setup"],
    },
  ],
});
