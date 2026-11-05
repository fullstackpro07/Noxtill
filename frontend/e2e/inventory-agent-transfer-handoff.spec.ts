import { expect, test } from '@playwright/test';

const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:5001/api/v1';

test('Inventory Agent prepares a human-reviewed branch-transfer request without moving stock', async ({ page, request }, testInfo) => {
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
  const email = `inventory-transfer-${stamp}@example.test`;
  const password = `Qa-${stamp}-Owner!`;
  const sku = `QA-TRANSFER-${stamp}`;
  const signup = await request.post(`${API}/auth/signup`, {
    data: {
      businessName: `QA Inventory Transfer ${stamp}`,
      name: 'QA Inventory Transfer Owner',
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
    data: { featureToggles: { inventoryAgent: false } },
  });
  expect(aiSettings.ok(), await aiSettings.text()).toBeTruthy();

  const sourceProductResponse = await request.post(`${API}/products`, {
    headers,
    data: {
      kind: 'product',
      name: `QA transfer source ${stamp}`,
      sku,
      costPrice: 1,
      sellingPrice: 2,
      stockQty: 500,
      lowStockThreshold: 5,
    },
  });
  expect(sourceProductResponse.ok(), await sourceProductResponse.text()).toBeTruthy();
  const sourceProduct = await sourceProductResponse.json() as { id: string; stockQty: number };

  const branchResponse = await request.post(`${API}/branches`, {
    headers,
    data: {
      name: `QA Transfer Destination ${stamp}`,
      ownerName: 'QA Transfer Destination Owner',
      ownerEmail: `inventory-transfer-branch-${stamp}@example.test`,
      country: 'US',
      currency: 'USD',
    },
  });
  expect(branchResponse.ok(), await branchResponse.text()).toBeTruthy();
  const branch = await branchResponse.json() as {
    business: { id: string };
    tempPassword: string;
  };

  const branchLogin = await request.post(`${API}/auth/login`, {
    data: {
      emailOrPhone: `inventory-transfer-branch-${stamp}@example.test`,
      password: branch.tempPassword,
    },
  });
  expect(branchLogin.ok(), await branchLogin.text()).toBeTruthy();
  const branchTokens = await branchLogin.json() as { accessToken: string };
  const branchHeaders = { Authorization: `Bearer ${branchTokens.accessToken}` };
  const destinationProductResponse = await request.post(`${API}/products`, {
    headers: branchHeaders,
    data: {
      kind: 'product',
      name: `QA transfer destination ${stamp}`,
      sku,
      costPrice: 1,
      sellingPrice: 2,
      stockQty: 1,
      lowStockThreshold: 10,
    },
  });
  expect(destinationProductResponse.ok(), await destinationProductResponse.text()).toBeTruthy();
  const destinationProduct = await destinationProductResponse.json() as { id: string; stockQty: number };

  const saleResponse = await request.post(`${API}/sales`, {
    headers,
    data: {
      customerName: 'QA-only Inventory Transfer Sale',
      items: [{ productId: sourceProduct.id, qty: 30 }],
      payment: { method: 'cash', amount: 60 },
    },
  });
  expect(saleResponse.ok(), await saleResponse.text()).toBeTruthy();
  const sourceAfterSale = await request.get(`${API}/products/${sourceProduct.id}`, { headers });
  expect(sourceAfterSale.ok(), await sourceAfterSale.text()).toBeTruthy();
  const sourceProductAfterSale = await sourceAfterSale.json() as { stockQty: number };

  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByLabel('Email or phone number').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/dashboard/);
  await page.goto('/inventory/reorder-suggestions');

  await page.getByRole('button', { name: 'Analyze current inventory' }).click();
  const finding = page.locator('article').filter({ hasText: 'Review branch transfer:' });
  await expect(finding).toBeVisible();
  await expect(finding).toContainText('A person must approve and ship it');
  await expect(finding.getByRole('button', { name: 'Prepare transfer request' })).toBeVisible();
  await finding.getByRole('button', { name: 'Prepare transfer request' }).click();
  await expect(page.getByText('Pending stock-transfer request saved.', { exact: false })).toBeVisible();
  await expect(finding).toContainText('Transfer request · pending');

  const transfersResponse = await request.get(`${API}/stock-transfers`, { headers });
  expect(transfersResponse.ok(), await transfersResponse.text()).toBeTruthy();
  const transfers = await transfersResponse.json() as Array<{
    id: string;
    status: string;
    sourceBusinessId: string;
    destBusinessId: string;
    items: Array<{ sourceProductId: string; qty: number }>;
  }>;
  const prepared = transfers.find((transfer) => transfer.destBusinessId === branch.business.id &&
    transfer.items.some((item) => item.sourceProductId === sourceProduct.id));
  expect(prepared).toMatchObject({
    status: 'pending',
    destBusinessId: branch.business.id,
    items: [{ sourceProductId: sourceProduct.id, qty: 9 }],
  });

  const sourceAfterTransfer = await request.get(`${API}/products/${sourceProduct.id}`, { headers });
  const destinationAfterTransfer = await request.get(`${API}/products/${destinationProduct.id}`, { headers: branchHeaders });
  expect(await sourceAfterTransfer.json()).toMatchObject({ stockQty: sourceProductAfterSale.stockQty });
  expect(await destinationAfterTransfer.json()).toMatchObject({ stockQty: destinationProduct.stockQty });
  await page.screenshot({ path: testInfo.outputPath('inventory-agent-transfer-handoff.png'), fullPage: true });
  expect(pageErrors).toEqual([]);
  expect(apiErrors).toEqual([]);
});
