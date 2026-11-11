import { expect, test } from '@playwright/test';

const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:5001/api/v1';

test('owner can review filtered and redacted specialist run history', async ({ page, request }, testInfo) => {
  test.setTimeout(90_000);
  await expect.poll(async () => {
    try {
      return (await request.get(`${API.replace(/\/api\/v1$/, '')}/health`)).status();
    } catch {
      return 0;
    }
  }, { timeout: 30_000 }).toBe(200);

  const stamp = Date.now();
  const email = `qa-agent-run-history-${stamp}@example.test`;
  const password = `Qa-${stamp}-Owner!`;
  const signup = await request.post(`${API}/auth/signup`, {
    data: {
      businessName: `QA Agent Run History ${stamp}`,
      name: 'QA Run History Owner',
      email,
      password,
      country: 'US',
      currency: 'USD',
    },
  });
  expect(signup.ok(), await signup.text()).toBeTruthy();
  const { accessToken } = await signup.json() as { accessToken: string };
  const headers = { Authorization: `Bearer ${accessToken}` };

  const inventoryConfigResponse = await request.get(
    `${API}/agents/inventory_intelligence/config`,
    { headers },
  );
  expect(inventoryConfigResponse.ok(), await inventoryConfigResponse.text()).toBeTruthy();
  const inventoryConfig = await inventoryConfigResponse.json() as {
    configVersion: number;
    settings: Record<string, unknown>;
  };
  expect(inventoryConfig.settings['agents.inventoryEnabled']).toBe(true);
  expect(inventoryConfig.settings).not.toHaveProperty('ai.monthlyCostCapUsd');

  const refusedGlobalSetting = await request.patch(
    `${API}/agents/inventory_intelligence/config`,
    {
      headers,
      data: {
        expectedVersion: inventoryConfig.configVersion,
        settings: { 'ai.monthlyCostCapUsd': 1 },
      },
    },
  );
  expect(refusedGlobalSetting.status()).toBe(400);
  const disableInventory = await request.patch(
    `${API}/agents/inventory_intelligence/config`,
    {
      headers,
      data: {
        expectedVersion: inventoryConfig.configVersion,
        settings: { 'agents.inventoryEnabled': false },
      },
    },
  );
  expect(disableInventory.ok(), await disableInventory.text()).toBeTruthy();
  const disabledConfig = await disableInventory.json() as {
    configVersion: number;
    settings: Record<string, unknown>;
  };
  expect(disabledConfig.settings['agents.inventoryEnabled']).toBe(false);
  const staleConfig = await request.patch(
    `${API}/agents/inventory_intelligence/config`,
    {
      headers,
      data: {
        expectedVersion: inventoryConfig.configVersion,
        settings: { 'agents.inventoryEnabled': true },
      },
    },
  );
  expect(staleConfig.status()).toBe(409);
  const restoreInventory = await request.patch(
    `${API}/agents/inventory_intelligence/config`,
    {
      headers,
      data: {
        expectedVersion: disabledConfig.configVersion,
        settings: { 'agents.inventoryEnabled': true },
      },
    },
  );
  expect(restoreInventory.ok(), await restoreInventory.text()).toBeTruthy();

  const browserErrors: string[] = [];
  page.on('pageerror', (error) => browserErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.url().includes('/api/') && response.status() >= 500) {
      browserErrors.push(`${response.status()} ${response.url()}`);
    }
  });

  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByLabel('Email or phone number').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/dashboard/);

  await page.goto('/assistant/settings', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Recent specialist runs' })).toBeVisible();
  const operationalAlerts = page.getByRole('region', { name: 'Specialist operational alerts' });
  await expect(operationalAlerts).toContainText('Current operational alerts · 0');
  await expect(page.getByRole('status').filter({ hasText: 'No alert condition is present in the saved data for this view.' })).toBeVisible();
  const securityDenials = page.getByRole('region', { name: 'Recent specialist security denials' });
  await expect(securityDenials).toContainText('No matching denied-access or blocked-tool events were recorded in this window.');
  await securityDenials.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('specialist-agent-security-denials.png') });
  const budgetLimitEvents = page.getByRole('region', { name: 'Recent specialist budget-limit events' });
  await expect(budgetLimitEvents).toContainText('No specialist budget limit was reached in this window.');
  await operationalAlerts.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('specialist-agent-operational-alerts.png') });
  await expect(page.getByText('No timed registered calls measured').first()).toBeVisible();
  await expect(page.getByText('Failed: no measured call').first()).toBeVisible();
  await expect(page.getByText('No saved specialist runs match these filters.')).toBeVisible();

  const createdRun = await request.post(`${API}/inventory/agent-runs`, {
    headers: { ...headers, 'Idempotency-Key': `qa-run-history-${stamp}` },
  });
  expect(createdRun.ok(), await createdRun.text()).toBeTruthy();
  const createdRunBody = await createdRun.json() as { id: string };

  const list = await request.get(
    `${API}/agent-runs?agentKey=inventory_intelligence&status=completed&limit=25`,
    { headers },
  );
  expect(list.ok(), await list.text()).toBeTruthy();
  const history = await list.json() as {
    items: {
      agentKey: string;
      agentVersion: string;
      status: string;
      outputRedacted: boolean;
      detailLocation: string;
      relatedCounts: { toolCalls: number };
      output?: unknown;
      inputRefs?: unknown;
    }[];
  };
  expect(history.items[0]).toMatchObject({
    agentKey: 'inventory_intelligence',
    status: 'completed',
    outputRedacted: true,
    detailLocation: 'canonical_module',
  });
  expect(history.items[0].agentVersion).toBeTruthy();
  expect(history.items[0]).not.toHaveProperty('output');
  expect(history.items[0]).not.toHaveProperty('inputRefs');

  const evidenceResponse = await request.get(
    `${API}/agent-runs/${createdRunBody.id}/evidence`,
    { headers },
  );
  expect(evidenceResponse.ok(), await evidenceResponse.text()).toBeTruthy();
  const evidence = await evidenceResponse.json() as {
    observedValuesRedacted: boolean;
    items: { id: string; resourceId: string; resourceType: string; observedValues?: unknown }[];
  };
  expect(evidence.observedValuesRedacted).toBe(true);
  expect(evidence.items.every((item) => !Object.hasOwn(item, 'observedValues'))).toBe(true);

  await page.getByRole('button', { name: 'Refresh runs' }).click();
  await page.getByLabel('Filter specialist runs by agent').selectOption('inventory_intelligence');
  await page.getByLabel('Filter specialist runs by status').selectOption('completed');
  await expect(page.getByRole('cell').filter({ hasText: 'Module 13' })).toContainText('Inventory Intelligence');
  await expect(page.getByText(`Code ${history.items[0].agentVersion}`, { exact: true })).toBeVisible();
  await expect(page.getByText('No saved specialist runs match these filters.')).toHaveCount(0);
  await page.getByRole('button', { name: `View ${history.items[0].relatedCounts.toolCalls} calls` }).click();
  await expect(page.getByText('Registered tool calls · input values and output contents are not stored here')).toBeVisible();
  if (history.items[0].relatedCounts.toolCalls > 0) {
    await expect(page.getByText(/Input fields:/).first()).toBeVisible();
  } else {
    await expect(page.getByText('No registered tool calls were saved for this run.')).toBeVisible();
  }
  await page.getByRole('button', { name: 'View sources' }).click();
  await expect(page.getByText('Saved source references · values and model output are redacted')).toBeVisible();
  if (evidence.items.length) {
    await expect(page.getByText(`Record ${evidence.items[0].resourceId}`)).toBeVisible();
  } else {
    await expect(page.getByText('No source evidence was saved for this run.')).toBeVisible();
  }
  const inventoryRunRow = page.getByRole('row').filter({ hasText: 'Module 13' });
  await inventoryRunRow.getByRole('button', { name: 'View events' }).click();
  await expect(page.getByText('agent.run.created', { exact: true })).toBeVisible();
  await expect(page.getByText('agent.run.completed', { exact: true })).toBeVisible();
  const eventsResponse = await request.get(`${API}/agent-runs/${createdRunBody.id}/events`, { headers });
  expect(eventsResponse.ok(), await eventsResponse.text()).toBeTruthy();
  const runEvents = await eventsResponse.json() as { items: { eventName: string }[] };
  const toolEventNames = runEvents.items.map((event) => event.eventName).filter((eventName) => eventName.startsWith('agent.tool.'));
  if (history.items[0].relatedCounts.toolCalls > 0) {
    expect(toolEventNames).toContain('agent.tool.started');
    expect(toolEventNames.some((eventName) => eventName !== 'agent.tool.started')).toBe(true);
    for (const eventName of toolEventNames) {
      const status = eventName.slice('agent.tool.'.length);
      const label = `Tool ${status}`;
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
  }
  await page.locator(`#specialist-run-events-${createdRunBody.id}`).scrollIntoViewIfNeeded();
  await expect(page.getByRole('note')).toContainText(
    'New run-created, terminal outcome, and registered-tool start/result events are saved with their source records',
  );
  await page.screenshot({ path: testInfo.outputPath('specialist-agent-tool-lifecycle.png'), fullPage: true });

  await page.goto('/settings/ai', { waitUntil: 'networkidle' });
  await expect(page.getByText('AI & Governance', { exact: true }).first()).toBeVisible();
  await page.getByText('Specialist run evidence retention', { exact: true }).click();
  const retentionSetting = page.getByRole('dialog', { name: 'Setting details' });
  await expect(retentionSetting).toContainText('Only finished runs with no recommendation or material action are eligible');
  await retentionSetting.getByLabel('Specialist run evidence retention').fill('30');
  await retentionSetting.getByRole('button', { name: 'Preview and apply' }).click();
  await page.getByRole('alertdialog', { name: 'Apply change to Specialist run evidence retention?' })
    .getByRole('button', { name: 'Apply change' })
    .click();
  await expect(page.getByRole('status')).toContainText('Specialist run evidence retention saved');
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByText('30 days', { exact: true })).toBeVisible();
  await page.getByText('Specialist run evidence retention', { exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('specialist-agent-retention-setting.png') });
  await page.getByText('Warn when a specialist run stays queued longer than', { exact: true }).click();
  const queuedRunWarningSetting = page.getByRole('dialog', { name: 'Setting details' });
  await expect(queuedRunWarningSetting).toContainText('persisted queued run');
  await queuedRunWarningSetting.getByLabel('Warn when a specialist run stays queued longer than').fill('5');
  await queuedRunWarningSetting.getByRole('button', { name: 'Save change' }).click();
  await expect(page.getByRole('status')).toContainText('Warn when a specialist run stays queued longer than saved');
  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByText('5 minutes', { exact: true })).toBeVisible();
  expect(browserErrors).toEqual([]);
  await page.goto('/assistant/settings', { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'Recent specialist runs' }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('specialist-agent-run-history.png'), fullPage: true });
});
