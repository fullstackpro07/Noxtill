import { expect, test } from '@playwright/test';

const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:5001/api/v1';

test('cross-agent review exposes one parent trace across its child runs', async ({ page, request }, testInfo) => {
  const healthUrl = API.replace(/\/api\/v1$/, '');
  await expect.poll(async () => {
    try {
      return (await request.get(`${healthUrl}/health`)).status();
    } catch {
      return 0;
    }
  }, { timeout: 30_000 }).toBe(200);

  const pageErrors: string[] = [];
  const apiErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.url().includes('/api/') && response.status() >= 500) {
      apiErrors.push(`${response.status()} ${response.url()}`);
    }
  });

  const stamp = Date.now();
  const email = `specialist-orchestration-${stamp}@example.test`;
  const password = `Qa-${stamp}-Owner!`;
  const signup = await request.post(`${API}/auth/signup`, {
    data: {
      businessName: `QA Specialist Orchestration ${stamp}`,
      name: 'QA Specialist Orchestration Owner',
      email,
      password,
      country: 'US',
      currency: 'USD',
    },
  });
  expect(signup.ok(), await signup.text()).toBeTruthy();
  const { accessToken } = await signup.json() as { accessToken: string };
  const headers = { Authorization: `Bearer ${accessToken}` };

  const availableResponse = await request.get(`${API}/business-modules`, { headers });
  expect(availableResponse.ok(), await availableResponse.text()).toBeTruthy();
  const { modules } = await availableResponse.json() as { modules: { key: string }[] };
  const selection = await request.patch(`${API}/business-modules/selection`, {
    headers,
    data: { enabled: modules.map((module) => module.key) },
  });
  expect(selection.ok(), await selection.text()).toBeTruthy();

  const enableOneAgent = await request.put(`${API}/settings/hub/changes`, {
    headers,
    data: {
      changes: [
        { category: 'ai', rowKey: 'specialist-agent-inventory-enabled', value: true },
        { category: 'ai', rowKey: 'specialist-agent-finance-enabled', value: false },
        { category: 'ai', rowKey: 'specialist-agent-customer-enabled', value: false },
        { category: 'ai', rowKey: 'specialist-agent-seo-enabled', value: false },
        { category: 'ai', rowKey: 'specialist-agent-commerce-enabled', value: false },
      ],
    },
  });
  expect(enableOneAgent.ok(), await enableOneAgent.text()).toBeTruthy();

  const aiSettings = await request.patch(`${API}/ai/settings`, {
    headers,
    data: { featureToggles: { inventoryAgent: false } },
  });
  expect(aiSettings.ok(), await aiSettings.text()).toBeTruthy();

  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByLabel('Email or phone number').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/dashboard/);
  await page.goto('/assistant/settings');

  const orchestrationSection = page.getByRole('region', { name: 'Cross-agent review' });
  await expect(orchestrationSection).toBeVisible();
  const startPromise = page.waitForResponse((response) =>
    response.url().endsWith('/ai/specialist-orchestrations') &&
    response.request().method() === 'POST',
  );
  await orchestrationSection.getByRole('button', { name: 'Run enabled agents' }).click();
  const startResponse = await startPromise;
  expect(startResponse.ok(), await startResponse.text()).toBeTruthy();
  const started = await startResponse.json() as { id: string };

  let completedRun: {
    id: string;
    status: string;
    result: {
      correlationId: string;
      aiProviderCalls: number;
      children: { agentKey: string; status: string; runId: string | null }[];
    } | null;
  } | undefined;
  await expect.poll(async () => {
    const response = await request.get(`${API}/ai/specialist-orchestrations`, { headers });
    if (!response.ok()) return null;
    const result = await response.json() as {
      runs: NonNullable<typeof completedRun>[];
    };
    completedRun = result.runs.find((run) => run.id === started.id);
    return completedRun?.status ?? null;
  }, { timeout: 30_000 }).toBe('completed');

  expect(completedRun?.result).toMatchObject({
    correlationId: started.id,
    aiProviderCalls: 0,
    children: [
      { agentKey: 'inventory_intelligence', status: 'completed' },
      { agentKey: 'financial_intelligence', status: 'skipped' },
      { agentKey: 'customer_intelligence', status: 'skipped' },
      { agentKey: 'seo_autopilot', status: 'skipped' },
      { agentKey: 'autonomous_commerce', status: 'skipped' },
    ],
  });
  expect(completedRun?.result?.children[0].runId).toBeTruthy();

  await page.reload();
  await expect(orchestrationSection.getByText(`trace ${started.id.slice(0, 8)}`)).toBeVisible();
  await expect(orchestrationSection.getByText(/Inventory Intelligence.*completed/)).toBeVisible();
  await orchestrationSection.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('specialist-orchestration-trace.png'), fullPage: true });

  expect(pageErrors).toEqual([]);
  expect(apiErrors).toEqual([]);
});
