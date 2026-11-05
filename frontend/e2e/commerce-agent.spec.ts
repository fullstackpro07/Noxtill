import { expect, test } from '@playwright/test';

const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:5001/api/v1';
const BROWSER_API = process.env.E2E_BROWSER_API_URL;

test('Commerce Agent shows a real read-only review and refuses AI when its feature is disabled', async ({ page, request }, testInfo) => {
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
  const email = `commerce-agent-browser-${stamp}@example.test`;
  const password = `Qa-${stamp}-Owner!`;
  const signup = await request.post(`${API}/auth/signup`, {
    data: {
      businessName: `QA Commerce Agent ${stamp}`,
      name: 'QA Commerce Agent Owner',
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
  const selection = await request.patch(`${API}/business-modules/selection`, {
    headers,
    data: { enabled: available.map((module) => module.key) },
  });
  expect(selection.ok(), await selection.text()).toBeTruthy();

  const autonomy = await request.put(`${API}/settings/hub/changes`, {
    headers,
    data: { changes: [{ category: 'automations', rowKey: 'commerce-autonomy', value: 1 }] },
  });
  expect(autonomy.ok(), await autonomy.text()).toBeTruthy();
  const toolLimit = await request.put(`${API}/settings/hub/changes`, {
    headers,
    data: { changes: [{ category: 'ai', rowKey: 'specialist-agent-commerce-read-tools-per-run', value: 1 }] },
  });
  expect(toolLimit.ok(), await toolLimit.text()).toBeTruthy();
  const actionLimit = await request.put(`${API}/settings/hub/changes`, {
    headers,
    data: { changes: [{ category: 'ai', rowKey: 'specialist-agent-actions-per-run', value: 2 }] },
  });
  expect(actionLimit.ok(), await actionLimit.text()).toBeTruthy();
  const toolAllowlist = await request.put(`${API}/settings/hub/changes`, {
    headers,
    data: {
      changes: [{
        category: 'ai',
        rowKey: 'commerce-agent-write-tool-allowlist',
        value: 'create_listing_draft',
      }],
    },
  });
  expect(toolAllowlist.ok(), await toolAllowlist.text()).toBeTruthy();
  const aiSettings = await request.patch(`${API}/ai/settings`, {
    headers,
    data: { featureToggles: { commerceAgent: false } },
  });
  expect(aiSettings.ok(), await aiSettings.text()).toBeTruthy();

  const productResponse = await request.post(`${API}/products`, {
    headers,
    data: {
      kind: 'product',
      name: `QA orchestration product ${stamp}`,
      costPrice: 9,
      sellingPrice: 20,
      stockQty: 5,
      lowStockThreshold: 1,
    },
  });
  expect(productResponse.ok(), await productResponse.text()).toBeTruthy();
  const product = await productResponse.json() as { id: string };
  const nodeResponse = await request.post(`${API}/commerce/fulfillment-network/nodes`, {
    headers,
    data: {
      name: `QA route node ${stamp}`,
      type: 'third_party_warehouse',
      serviceMarkets: ['US'],
      processingDays: 3,
      costPerOrder: 4.5,
    },
  });
  expect(nodeResponse.ok(), await nodeResponse.text()).toBeTruthy();
  const node = await nodeResponse.json() as { id: string };
  const mappingResponse = await request.post(`${API}/commerce/fulfillment-network/mappings`, {
    headers,
    data: { nodeId: node.id, productId: product.id, role: 'primary' },
  });
  expect(mappingResponse.ok(), await mappingResponse.text()).toBeTruthy();
  const orderResponse = await request.post(`${API}/orders`, {
    headers,
    data: {
      orderType: 'online',
      paymentMethod: 'unpaid',
      items: [{ productId: product.id, qty: 1 }],
    },
  });
  expect(orderResponse.ok(), await orderResponse.text()).toBeTruthy();
  const order = await orderResponse.json() as { id: string; status: string };

  if (BROWSER_API) {
    const apiBase = BROWSER_API.replace(/\/$/, '');
    await page.route('**/api/v1/commerce/agent-tools/specialist-runs*', (route) => {
      const requestUrl = new URL(route.request().url());
      const rewrittenUrl = `${apiBase}${requestUrl.pathname.replace(/^\/api\/v1/, '')}${requestUrl.search}`;
      return route.fetch({ url: rewrittenUrl }).then((response) =>
        route.fulfill({ response }),
      );
    });
  }

  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByLabel('Email or phone number').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/dashboard/);
  await page.goto('/settings/ai', { waitUntil: 'networkidle' });
  await expect(page.getByText('Maximum read-tool calls per Commerce Agent run')).toBeVisible();
  await expect(page.getByText('1 read-tool call / run', { exact: true })).toBeVisible();
  await expect(page.getByText('Maximum material actions per specialist run')).toBeVisible();
  await expect(page.getByText('2 actions / run', { exact: true })).toBeVisible();
  await expect(page.getByText('Allowed Commerce Agent write tools')).toBeVisible();
  await page.goto('/autonomous-commerce/agent-tools');

  await expect(page.getByRole('heading', { name: 'Agents & Tools' })).toBeVisible();
  const allowlistRegion = page.getByRole('region', { name: 'Commerce Agent write-tool allow-list' });
  await expect(allowlistRegion).toContainText('valid');
  await expect(allowlistRegion).toContainText('create_listing_draft');
  await expect(page.getByRole('row').filter({ hasText: 'Create RFQ' })).toContainText('Excluded by business allow-list');
  const questionSection = page.getByRole('region', { name: 'Ask the Commerce Agent' });
  await expect(questionSection).toBeVisible();
  await expect(questionSection.getByText(/read-only tools only/)).toBeVisible();

  const orderSection = page.getByRole('region', { name: 'Order fulfillment readiness' });
  await expect(orderSection).toBeVisible();
  await orderSection.getByLabel('Canonical order ID').fill(order.id);
  await orderSection.getByLabel('Destination country (optional)').fill('US');
  const orchestrationPromise = page.waitForResponse((response) =>
    response.url().endsWith('/commerce/agent-tools/specialist-runs/order-fulfillment') &&
    response.request().method() === 'POST',
  );
  await orderSection.getByRole('button', { name: 'Run bounded review' }).click();
  const orchestrationResponse = await orchestrationPromise;
  expect(orchestrationResponse.ok(), await orchestrationResponse.text()).toBeTruthy();
  const orchestrationRun = await orchestrationResponse.json() as {
    id: string;
    status: string;
    output: {
      orderFulfillmentOrchestration?: {
        state: string;
        steps: { toolKey: string; status: string; toolRunId: string | null }[];
        routeEvaluation: {
          candidateCount: number;
          recommendation: { mode: string } | null;
          candidates: { name: string; eligibleForAll: boolean }[];
        } | null;
      };
    };
  };
  expect(orchestrationRun.status).toBe('completed');
  expect(orchestrationRun.output.orderFulfillmentOrchestration).toMatchObject({
    state: 'ready',
    steps: [
      { toolKey: 'get_order', status: 'completed' },
      { toolKey: 'calculate_fulfillment_route', status: 'completed' },
    ],
    routeEvaluation: {
      candidateCount: 1,
      recommendation: { mode: 'single' },
      candidates: [{ name: `QA route node ${stamp}`, eligibleForAll: true }],
    },
  });
  expect(orchestrationRun.output.orderFulfillmentOrchestration?.steps.every((step) => step.toolRunId)).toBe(true);
  await expect(orderSection.getByText('Order fulfillment readiness · ready')).toBeVisible();
  await expect(orderSection.getByText(`QA route node ${stamp}`, { exact: true })).toBeVisible();
  await expect(orderSection.getByText('Eligible for every line')).toBeVisible();
  const orderAfter = await request.get(`${API}/orders/${order.id}`, { headers });
  expect(orderAfter.ok(), await orderAfter.text()).toBeTruthy();
  expect((await orderAfter.json() as { status: string }).status).toBe(order.status);
  await page.screenshot({ path: testInfo.outputPath('commerce-agent-order-fulfillment-readiness.png'), fullPage: true });

  const opportunityResponse = await request.post(`${API}/commerce/product-radar`, {
    headers,
    data: {
      title: `QA sourcing opportunity ${stamp}`,
      source: 'Manual QA input',
      market: 'US',
    },
  });
  expect(opportunityResponse.ok(), await opportunityResponse.text()).toBeTruthy();
  const opportunity = await opportunityResponse.json() as { id: string; version: number };
  const requestValidation = await request.post(
    `${API}/commerce/product-radar/${opportunity.id}/actions/send_to_validation`,
    { headers, data: { expectedVersion: opportunity.version } },
  );
  expect(requestValidation.ok(), await requestValidation.text()).toBeTruthy();
  const linkedRfqResponse = await request.post(`${API}/commerce/rfqs`, {
    headers,
    data: {
      requirement: `QA sourcing RFQ ${stamp}`,
      currency: 'USD',
      sourceOpportunityId: opportunity.id,
      items: [{ description: `QA sourcing item ${stamp}`, qty: 1 }],
    },
  });
  expect(linkedRfqResponse.ok(), await linkedRfqResponse.text()).toBeTruthy();
  const linkedRfq = await linkedRfqResponse.json() as { id: string };

  const sourcingSection = page.getByRole('region', { name: 'Product sourcing readiness' });
  await expect(sourcingSection).toBeVisible();
  await sourcingSection.getByLabel('Canonical Product Radar opportunity ID').fill(opportunity.id);
  const sourcingPromise = page.waitForResponse((response) =>
    response.url().endsWith('/commerce/agent-tools/specialist-runs/product-sourcing') &&
    response.request().method() === 'POST',
  );
  await sourcingSection.getByRole('button', { name: 'Run sourcing review' }).click();
  const sourcingResponse = await sourcingPromise;
  expect(sourcingResponse.ok(), await sourcingResponse.text()).toBeTruthy();
  const sourcingRun = await sourcingResponse.json() as {
    status: string;
    output: {
      productSourcingOrchestration?: {
        state: string;
        opportunityId: string;
        rfqId: string | null;
        steps: { toolKey: string; status: string; toolRunId: string | null }[];
      };
    };
  };
  expect(sourcingRun.status).toBe('completed');
  expect(sourcingRun.output.productSourcingOrchestration).toMatchObject({
    state: 'ready',
    opportunityId: opportunity.id,
    rfqId: linkedRfq.id,
    steps: [
      { toolKey: 'get_product_opportunity', status: 'completed' },
      { toolKey: 'get_validation_case', status: 'completed' },
      { toolKey: 'compare_quotes', status: 'completed' },
    ],
  });
  await expect(sourcingSection.getByText('Product sourcing readiness · ready')).toBeVisible();

  const reviewPromise = page.waitForResponse((response) =>
    response.url().endsWith('/commerce/agent-tools/specialist-runs') &&
    response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Run read-only review' }).click();
  const reviewResponse = await reviewPromise;
  expect(reviewResponse.ok(), await reviewResponse.text()).toBeTruthy();
  const review = await reviewResponse.json() as { status: string; output: { snapshot?: Record<string, unknown> } };
  expect(review.status).toBe('completed');
  expect(review.output.snapshot).toBeDefined();
  await expect(page.getByText(/Latest review · .* · completed/)).toBeVisible();
  const reviewSourceStatus = page.getByRole('region', {
    name: 'Commerce review source status',
  });
  await expect(reviewSourceStatus).toBeVisible();
  await expect(reviewSourceStatus).toContainText('Recorded supplier quotes');
  await expect(reviewSourceStatus).toContainText('Production and assembly records');
  await expect(page.getByText(/No records|No open RFQ|No reconciliation|No supplier claim|No running/i).first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('commerce-agent-read-only-review.png'), fullPage: true });

  await questionSection.getByLabel('Question about this business').fill('Summarize the current Commerce status records for this business.');
  const askPromise = page.waitForResponse((response) =>
    response.url().endsWith('/commerce/agent-tools/specialist-runs/ask') &&
    response.request().method() === 'POST',
  );
  await questionSection.getByRole('button', { name: 'Ask with read-only tools' }).click();
  const askResponse = await askPromise;
  expect(askResponse.ok(), await askResponse.text()).toBeTruthy();
  const answer = await askResponse.json() as { status: string; errorMessage: string | null; output: { answer: string | null; message: string | null } };
  expect(answer).toMatchObject({
    status: 'failed',
    output: {
      answer: null,
      message: 'This AI feature has been turned off in AI Settings.',
    },
  });
  await expect(questionSection.getByText(/Commerce Agent answer · failed/)).toBeVisible();
  await expect(questionSection.getByRole('status').filter({ hasText: 'This AI feature has been turned off in AI Settings.' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('commerce-agent-ai-feature-disabled.png'), fullPage: true });

  expect(pageErrors).toEqual([]);
  expect(apiErrors).toEqual([]);
});
