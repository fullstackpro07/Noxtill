import { expect, test } from '@playwright/test';

const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:5001/api/v1';

test('approved Inventory Agent request creates a linked shared RFQ from Procurement Sourcing', async ({ page, request }, testInfo) => {
  await expect.poll(async () => {
    try {
      return (await request.get(`${API.replace(/\/api\/v1$/, '')}/health`)).status();
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
  const email = `inventory-agent-rfq-${stamp}@example.test`;
  const password = `Qa-${stamp}-Owner!`;
  const signup = await request.post(`${API}/auth/signup`, {
    data: {
      businessName: `QA Inventory RFQ ${stamp}`,
      name: 'QA Inventory RFQ Owner',
      email,
      password,
      country: 'US',
      currency: 'USD',
    },
  });
  expect(signup.ok(), await signup.text()).toBeTruthy();
  const { accessToken } = await signup.json() as { accessToken: string };
  const headers = { Authorization: `Bearer ${accessToken}` };
  const browserApiBase = process.env.E2E_BROWSER_API_URL;

  const modulesResponse = await request.get(`${API}/business-modules`, { headers });
  expect(modulesResponse.ok(), await modulesResponse.text()).toBeTruthy();
  const { modules } = await modulesResponse.json() as { modules: { key: string }[] };
  const selection = await request.patch(`${API}/business-modules/selection`, {
    headers,
    data: { enabled: modules.map((module) => module.key) },
  });
  expect(selection.ok(), await selection.text()).toBeTruthy();
  const aiSettings = await request.patch(`${API}/ai/settings`, {
    headers,
    data: { featureToggles: { inventoryAgent: false } },
  });
  expect(aiSettings.ok(), await aiSettings.text()).toBeTruthy();

  const productResponse = await request.post(`${API}/products`, {
    headers,
    data: {
      kind: 'product',
      name: `QA RFQ Stock Item ${stamp}`,
      sku: `QA-RFQ-${stamp}`,
      costPrice: 9,
      sellingPrice: 20,
      stockQty: 65,
      lowStockThreshold: 10,
    },
  });
  expect(productResponse.ok(), await productResponse.text()).toBeTruthy();
  const product = await productResponse.json() as { id: string };
  const sale = await request.post(`${API}/sales`, {
    headers,
    data: {
      customerName: 'QA-only Inventory RFQ sale',
      items: [{ productId: product.id, qty: 60 }],
      payment: { method: 'cash', amount: 1200 },
    },
  });
  expect(sale.ok(), await sale.text()).toBeTruthy();

  const runResponse = await request.post(`${API}/inventory/agent-runs`, { headers });
  expect(runResponse.ok(), await runResponse.text()).toBeTruthy();
  const run = await runResponse.json() as {
    id: string;
    recommendations: { id: string; details: { signalType?: string; productId?: string } }[];
  };
  const recommendation = run.recommendations.find(
    (item) => item.details.signalType === 'reorder' && item.details.productId === product.id,
  );
  expect(recommendation).toBeDefined();
  if (!recommendation) throw new Error('Expected a real reorder finding for the QA product');

  const requestResponse = await request.post(
    `${API}/inventory/agent-recommendations/${recommendation.id}/purchase-request`,
    { headers },
  );
  expect(requestResponse.ok(), await requestResponse.text()).toBeTruthy();
  const purchaseRequest = await requestResponse.json() as { id: string; status: string };
  expect(purchaseRequest.status).toBe('draft');
  const submitted = await request.post(
    `${API}/procurement/requests/${purchaseRequest.id}/submit`,
    { headers },
  );
  expect(submitted.ok(), await submitted.text()).toBeTruthy();
  const approved = await request.post(
    `${API}/actions/${encodeURIComponent(`procurement_request:${purchaseRequest.id}`)}/approve`,
    { headers },
  );
  expect(approved.ok(), await approved.text()).toBeTruthy();

  if (browserApiBase) {
    const browserApi = new URL(browserApiBase);
    await page.route('**/api/v1/**', (route) => {
      const url = new URL(route.request().url());
      // Keep the long-lived SSE request on the normal frontend proxy. `route.fetch()` waits for
      // the stream to close, which otherwise leaves an in-flight handler during browser teardown.
      if (url.pathname.endsWith('/activity/stream')) return route.continue();
      url.protocol = browserApi.protocol;
      url.host = browserApi.host;
      return route.fetch({ url: url.toString() }).then((response) => route.fulfill({ response }));
    });
  }

  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByLabel('Email or phone number').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/dashboard/);
  const outcomesBeforeSource = await request.get(`${API}/inventory/agent-outcomes`, { headers });
  expect(outcomesBeforeSource.ok(), await outcomesBeforeSource.text()).toBeTruthy();
  const pendingOutcomes = await outcomesBeforeSource.json() as {
    recommendationId: string;
    specialistAction: { id: string; state: string; expectedVersion?: number | null } | null;
  }[];
  const pendingAction = pendingOutcomes.find((item) => item.recommendationId === recommendation.id)?.specialistAction;
  expect(pendingAction).toMatchObject({ state: 'approved' });
  if (!pendingAction) throw new Error('Expected the approved Inventory specialist action');

  await page.goto('/assistant/settings', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Material action audit trail' })).toBeVisible();
  const actionRow = page.locator('tr').filter({ hasText: pendingAction.id });
  await expect(actionRow).toBeVisible();
  const sourceResponsePromise = page.waitForResponse((response) =>
    response.url().endsWith(`/agent-actions/${pendingAction.id}/source-rfq`) &&
    response.request().method() === 'POST',
  );
  await actionRow.getByRole('button', { name: 'Create shared RFQ' }).click();
  await page.getByRole('button', { name: 'Create draft RFQ', exact: true }).click();
  const sourceResponse = await sourceResponsePromise;
  expect(sourceResponse.ok(), await sourceResponse.text()).toBeTruthy();
  const sourceResult = await sourceResponse.json() as {
    actionId: string;
    state: string;
    canonicalOperationId: string;
    rfqStatus: string;
    supplierContacted: boolean;
    purchaseOrderCreated: boolean;
  };
  expect(sourceResult).toMatchObject({
    actionId: pendingAction.id,
    state: 'verified',
    rfqStatus: 'draft',
    supplierContacted: false,
    purchaseOrderCreated: false,
  });
  const canonicalRequest = await request.get(
    `${API}/procurement/requests/${purchaseRequest.id}`,
    { headers },
  );
  expect(canonicalRequest.ok(), await canonicalRequest.text()).toBeTruthy();
  expect(await canonicalRequest.json()).toMatchObject({
    id: purchaseRequest.id,
    status: 'sourcing',
    sourceRfqs: [expect.objectContaining({ id: sourceResult.canonicalOperationId, status: 'draft' })],
  });

  const outcomesResponse = await request.get(`${API}/inventory/agent-outcomes`, { headers });
  expect(outcomesResponse.ok(), await outcomesResponse.text()).toBeTruthy();
  const outcomes = await outcomesResponse.json() as {
    recommendationId: string;
    recommendationStatus: string;
    procurementRequest: { id: string; status: string } | null;
    specialistAction: {
      id: string;
      state: string;
      requiredApproval: boolean;
      executionAttemptCount: number;
      correlationId: string;
    } | null;
    purchaseOrder: { id: string } | null;
    product: { id: string; currentStock: number } | null;
    recordedSalesComparison: { status: string; baseline: unknown; followUp: unknown };
  }[];
  expect(outcomes.find((item) => item.recommendationId === recommendation.id)).toMatchObject({
    recommendationStatus: 'handed_off',
    procurementRequest: { id: purchaseRequest.id, status: 'sourcing' },
    specialistAction: {
      id: pendingAction.id,
      state: 'verified',
      requiredApproval: true,
      executionAttemptCount: 1,
      correlationId: run.id,
    },
    purchaseOrder: null,
    product: { id: product.id },
    recordedSalesComparison: { status: 'not_received', baseline: null, followUp: null },
  });
  await expect(actionRow).toContainText('verified');
  await expect(actionRow).toContainText(sourceResult.canonicalOperationId);
  await page.screenshot({ path: testInfo.outputPath('inventory-agent-shared-rfq-action.png') });

  await page.goto('/procurement/sourcing');
  const requestRow = page.locator('tr').filter({ hasText: `PR-${purchaseRequest.id.slice(0, 8).toUpperCase()}` });
  await expect(requestRow).toBeVisible();
  await expect(requestRow).toContainText('sourcing');
  await expect(requestRow.getByRole('link', { name: 'Open RFQ' })).toBeVisible();
  await page.goto('/inventory/reorder-suggestions');
  await expect(page.getByRole('heading', { name: 'Recorded recommendation follow-through' })).toBeVisible();
  const outcomeRow = page
    .locator('[aria-labelledby="inventory-agent-outcomes-heading"] tr')
    .filter({ hasText: `QA RFQ Stock Item ${stamp}` });
  await expect(outcomeRow).toContainText('sourcing');
  await expect(outcomeRow).toContainText('Agent action: verified');
  await expect(outcomeRow).toContainText('No linked purchase order');
  await expect(outcomeRow).toContainText('Available after a linked purchase order is fully received');

  await outcomeRow.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('inventory-agent-action-follow-through.png') });
  expect(pageErrors).toEqual([]);
  expect(apiErrors).toEqual([]);
});
