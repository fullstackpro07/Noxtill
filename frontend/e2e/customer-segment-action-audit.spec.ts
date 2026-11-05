import { expect, test } from '@playwright/test';

const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:5001/api/v1';

test('Customer Agent segment revisions show their approval and verification audit', async ({ page, request }, testInfo) => {
  await expect.poll(async () => {
    try {
      return (await request.get(`${API.replace(/\/api\/v1$/, '')}/health`)).status();
    } catch {
      return 0;
    }
  }, { timeout: 30_000 }).toBe(200);

  const errors: string[] = [];
  const apiFailures: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.url().includes('/api/') && response.status() >= 500) {
      apiFailures.push(`${response.status()} ${response.url()}`);
    }
  });

  const stamp = Date.now();
  const email = `qa-customer-segment-audit-${stamp}@example.test`;
  const password = `Qa-${stamp}-Owner!`;
  const signup = await request.post(`${API}/auth/signup`, {
    data: {
      businessName: `QA Customer Segment Audit ${stamp}`,
      name: 'QA Customer Segment Owner',
      email,
      password,
      country: 'US',
      currency: 'USD',
    },
  });
  expect(signup.ok(), await signup.text()).toBeTruthy();
  const { accessToken } = await signup.json() as { accessToken: string };
  const headers = { Authorization: `Bearer ${accessToken}` };
  const modulesResponse = await request.get(`${API}/business-modules`, { headers });
  expect(modulesResponse.ok(), await modulesResponse.text()).toBeTruthy();
  const { modules } = await modulesResponse.json() as { modules: { key: string }[] };
  const enabled = await request.patch(`${API}/business-modules/selection`, {
    headers,
    data: { enabled: modules.map((module) => module.key) },
  });
  expect(enabled.ok(), await enabled.text()).toBeTruthy();
  const aiOff = await request.patch(`${API}/ai/settings`, {
    headers,
    data: { featureToggles: { customerAgent: false } },
  });
  expect(aiOff.ok(), await aiOff.text()).toBeTruthy();

  const runResponse = await request.post(`${API}/analytics/customers/agent-runs`, { headers });
  expect(runResponse.ok(), await runResponse.text()).toBeTruthy();
  const run = await runResponse.json() as { recommendations: { id: string }[] };
  expect(run.recommendations.length).toBeGreaterThan(0);
  const recommendationId = run.recommendations[0]!.id;
  const prepareResponse = await request.post(
    `${API}/customers/agent-recommendations/${recommendationId}/segment-draft`,
    { headers },
  );
  expect(prepareResponse.ok(), await prepareResponse.text()).toBeTruthy();
  const draft = await prepareResponse.json() as { id: string };

  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByLabel('Email or phone number').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/dashboard/);
  await page.goto(`/customers/segments#segment-draft-${draft.id}`);
  const editor = page.locator(`#segment-draft-${draft.id}`);
  await expect(editor.getByText('Repeat visitors · version 1', { exact: true })).toBeVisible();

  await editor.getByLabel('Draft segment name').fill('QA audited repeat visitors');
  await editor.getByLabel('Rule 1 value', { exact: true }).fill('0');
  await editor.getByLabel('Revision or rejection reason').fill('QA verify the versioned action audit');
  await editor.getByRole('button', { name: 'Save draft revision' }).click();
  await expect(editor.getByText('QA audited repeat visitors · version 2', { exact: true })).toBeVisible();
  const audit = editor.getByText('Agent approval and execution audit', { exact: true });
  await audit.click();
  await expect(editor.getByText('Action v1 · cancelled · attempts 0', { exact: true })).toBeVisible();
  await expect(editor.getByText('Action v2 · proposed · attempts 0', { exact: true })).toBeVisible();

  await editor.getByRole('button', { name: 'Submit exact version for approval' }).click();
  await expect(editor.getByText('Pending exact approval · version 2', { exact: true })).toBeVisible();
  await editor.getByRole('link', { name: 'Open Action Center', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Review segment', exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Review segment', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/customers/segments#segment-draft-${draft.id}$`));
  await editor.getByRole('button', { name: 'Approve exact version and save Segment' }).click();
  await expect(editor.getByText('Canonical Segment verification: verified', { exact: true })).toBeVisible();
  await editor.getByText('Agent approval and execution audit', { exact: true }).click();
  await expect(editor.getByText('Action v2 · verified · attempts 1', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('customer-segment-action-audit.png'), fullPage: true });

  await page.goto('/assistant/settings');
  const operations = page.getByRole('region', { name: 'Specialist agent operations' });
  await expect(operations.getByRole('heading', { name: 'Material action types' })).toBeVisible();
  await expect(operations.getByText('Audited cross-tenant run probes · business-wide', { exact: true })).toBeVisible();
  const actionTypeFilter = operations.getByRole('combobox', { name: 'Filter specialist operations by action type' });
  await expect(actionTypeFilter.locator('option', { hasText: 'customer segment draft v2' })).toHaveCount(1);
  await actionTypeFilter.selectOption('customer_segment_draft_v2');
  const actionRow = operations.getByRole('row').filter({ hasText: 'customer segment draft v2' });
  await expect(actionRow).toBeVisible();
  await expect(actionRow).toContainText('verified 1');
  await operations.getByRole('heading', { name: 'Material action types' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('specialist-action-type-operations.png') });

  expect(errors).toEqual([]);
  expect(apiFailures).toEqual([]);
});
