import { expect, test } from '@playwright/test';

const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:5001/api/v1';

test('Commerce Agent saves an unsent supplier claim draft from the tool registry', async ({ page, request }, testInfo) => {
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
  const email = `commerce-claim-draft-${stamp}@example.test`;
  const password = `Qa-${stamp}-Owner!`;
  const signup = await request.post(`${API}/auth/signup`, {
    data: {
      businessName: `QA Commerce Claim Draft ${stamp}`,
      name: 'QA Commerce Claim Owner',
      email,
      password,
      country: 'US',
      currency: 'USD',
    },
  });
  expect(signup.ok(), await signup.text()).toBeTruthy();
  const { accessToken } = await signup.json() as { accessToken: string };
  const headers = { Authorization: `Bearer ${accessToken}` };

  const modules = await request.get(`${API}/business-modules`, { headers });
  expect(modules.ok(), await modules.text()).toBeTruthy();
  const { modules: available } = await modules.json() as { modules: { key: string }[] };
  const enabled = await request.patch(`${API}/business-modules/selection`, {
    headers,
    data: { enabled: available.map((module) => module.key) },
  });
  expect(enabled.ok(), await enabled.text()).toBeTruthy();

  const aiSettings = await request.patch(`${API}/ai/settings`, {
    headers,
    data: { featureToggles: { commerceAgent: false } },
  });
  expect(aiSettings.ok(), await aiSettings.text()).toBeTruthy();

  const autonomy = await request.put(`${API}/settings/hub/changes`, {
    headers,
    data: { changes: [{ category: 'automations', rowKey: 'commerce-autonomy', value: 2 }] },
  });
  expect(autonomy.ok(), await autonomy.text()).toBeTruthy();

  const supplier = await request.post(`${API}/suppliers`, {
    headers,
    data: { name: `QA Claim Draft Supplier ${stamp}` },
  });
  expect(supplier.ok(), await supplier.text()).toBeTruthy();
  const { id: supplierId } = await supplier.json() as { id: string };

  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByLabel('Email or phone number').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/dashboard/);
  await page.goto('/autonomous-commerce/agent-tools');

  const toolRow = page.getByRole('row').filter({ hasText: 'create_supplier_claim_draft' });
  await expect(toolRow).toContainText('Allowed');
  await expect(toolRow.getByRole('button', { name: 'Create supplier claim draft' })).toBeVisible();
  await toolRow.getByRole('button', { name: 'Create supplier claim draft' }).click();
  await toolRow.getByLabel('supplierId').fill(supplierId);
  await toolRow.getByLabel('reasonCode').fill('damage');
  await toolRow.getByLabel('reason', { exact: true }).fill('QA-only operator-recorded damage; not a real supplier dispute.');
  await toolRow.getByLabel('itemDescription').fill('QA-only damaged item');
  await toolRow.getByLabel('quantityAffected').fill('1');
  await toolRow.getByLabel('productLossAmount').fill('12.50');
  await toolRow.getByLabel('freightLossAmount').fill('0');
  await toolRow.getByLabel('otherLossAmount').fill('0');

  const runPromise = page.waitForResponse((response) =>
    response.url().endsWith('/commerce/agent-tools/create_supplier_claim_draft/run') &&
    response.request().method() === 'POST',
  );
  await toolRow.getByRole('button', { name: 'Save draft' }).click();
  const runResponse = await runPromise;
  expect(runResponse.ok(), await runResponse.text()).toBeTruthy();
  const run = await runResponse.json() as {
    run: { outcome: string; resultSummary: string };
    result: { id: string; status: string; currency: string };
  };
  expect(run.run.outcome).toBe('succeeded');
  expect(run.run.resultSummary).toContain('no supplier was contacted');
  expect(run.result).toMatchObject({ status: 'draft', currency: 'USD' });
  await expect(toolRow.getByText(/does not submit or contact the supplier/)).toBeVisible();
  await expect(toolRow.locator('pre')).toContainText('"status": "draft"');
  await page.screenshot({ path: testInfo.outputPath('commerce-agent-claim-draft.png'), fullPage: true });

  const canonical = await request.get(`${API}/commerce/supplier-claims/${run.result.id}`, { headers });
  expect(canonical.ok(), await canonical.text()).toBeTruthy();
  expect(await canonical.json()).toMatchObject({ id: run.result.id, status: 'draft', currency: 'USD' });
  expect(pageErrors).toEqual([]);
  expect(apiErrors).toEqual([]);
});
