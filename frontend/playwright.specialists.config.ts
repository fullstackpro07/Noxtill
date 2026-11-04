import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: /(?:specialist-agents|specialist-agent-run-history|specialist-orchestration-trace|specialist-orchestration-all-agents|customer-failed-delivery-follow-up|customer-duplicates-review|seo-agent-content-brief|seo-google-analytics-settings|inventory-agent-rfq|inventory-agent-transfer-handoff|finance-agent|finance-budget-agent-event|commerce-agent(?:-claim-draft|-sourcing)?)\.spec\.ts/,
  timeout: 300_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: 'list',
  outputDir: 'e2e-results/specialist-agents',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
});
