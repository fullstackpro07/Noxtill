import { expect, test } from '@playwright/test';

const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:5001/api/v1';

test('failed-delivery Customer Agent review requires owner approval before creating an internal task', async ({ page, request }, testInfo) => {
  test.setTimeout(120_000);
  const root = API.replace(/\/api\/v1$/, '');
  await expect.poll(async () => {
    try {
      return (await request.get(`${root}/health`)).status();
    } catch {
      return 0;
    }
  }, { timeout: 30_000 }).toBe(200);

  const consoleErrors: string[] = [];
  const apiErrors: string[] = [];
  page.on('pageerror', (error) => consoleErrors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.url().includes('/api/') && response.status() >= 500) {
      apiErrors.push(`${response.status()} ${response.url()}`);
    }
  });
  // Reuse the already-open frontend dev server while routing this isolated browser journey to
  // the source-backed QA API, so it never depends on a stale compiled backend process.
  await page.route('**/api/v1/**', (route) => {
    const requestUrl = new URL(route.request().url());
    const apiPath = requestUrl.pathname.replace(/^\/api\/v1/, '');
    return route.fetch({ url: `${API}${apiPath}${requestUrl.search}` }).then((response) =>
      route.fulfill({ response }),
    );
  });

  const stamp = Date.now();
  const email = `qa-delivery-follow-up-${stamp}@example.test`;
  const password = `Qa-${stamp}-Owner!`;
  const signup = await request.post(`${API}/auth/signup`, {
    data: {
      businessName: `QA Failed Delivery Follow-up ${stamp}`,
      name: 'QA Follow-up Owner',
      email,
      password,
      country: 'US',
      currency: 'USD',
    },
  });
  expect(signup.ok(), await signup.text()).toBeTruthy();
  const { accessToken, refreshToken } = await signup.json() as { accessToken: string; refreshToken: string };
  const headers = { Authorization: `Bearer ${accessToken}` };
  const meResponse = await request.get(`${API}/users/me`, { headers });
  expect(meResponse.ok(), await meResponse.text()).toBeTruthy();
  const session = await meResponse.json() as { user: unknown; business: unknown };

  const modulesResponse = await request.get(`${API}/business-modules`, { headers });
  expect(modulesResponse.ok(), await modulesResponse.text()).toBeTruthy();
  const { modules } = await modulesResponse.json() as { modules: { key: string }[] };
  const moduleSelection = await request.patch(`${API}/business-modules/selection`, {
    headers,
    data: { enabled: modules.map((module) => module.key) },
  });
  expect(moduleSelection.ok(), await moduleSelection.text()).toBeTruthy();

  const eventReviewSetting = await request.put(`${API}/settings/hub/changes`, {
    headers,
    data: {
      changes: [{
        category: 'ai',
        rowKey: 'specialist-agent-customer-delivery-failed-event-review',
        value: true,
      }],
    },
  });
  expect(eventReviewSetting.ok(), await eventReviewSetting.text()).toBeTruthy();

  const customerResponse = await request.post(`${API}/customers`, {
    headers,
    data: {
      name: `QA Delivery Customer ${stamp}`,
      phone: `+1202555${String(stamp).slice(-4)}`,
      email: `qa-delivery-${stamp}@example.test`,
      consentMarketing: false,
    },
  });
  expect(customerResponse.ok(), await customerResponse.text()).toBeTruthy();
  const customer = await customerResponse.json() as { id: string };

  const productResponse = await request.post(`${API}/products`, {
    headers,
    data: {
      kind: 'product',
      name: `QA Delivery Product ${stamp}`,
      costPrice: 5,
      sellingPrice: 10,
      stockQty: 5,
      lowStockThreshold: 1,
    },
  });
  expect(productResponse.ok(), await productResponse.text()).toBeTruthy();
  const product = await productResponse.json() as { id: string };
  const orderResponse = await request.post(`${API}/orders`, {
    headers,
    data: {
      orderType: 'delivery',
      customerId: customer.id,
      paymentMethod: 'cash',
      items: [{ productId: product.id, qty: 1 }],
    },
  });
  expect(orderResponse.ok(), await orderResponse.text()).toBeTruthy();
  const order = await orderResponse.json() as { id: string };

  const riderResponse = await request.post(`${API}/riders`, {
    headers,
    data: { name: `QA Rider ${stamp}`, phone: `+1202556${String(stamp).slice(-4)}` },
  });
  expect(riderResponse.ok(), await riderResponse.text()).toBeTruthy();
  const rider = await riderResponse.json() as { id: string };
  const deliveryResponse = await request.post(`${API}/deliveries`, {
    headers,
    data: { orderId: order.id, addressLine: 'QA test address' },
  });
  expect(deliveryResponse.ok(), await deliveryResponse.text()).toBeTruthy();
  const delivery = await deliveryResponse.json() as { id: string };
  const assignment = await request.patch(`${API}/deliveries/${delivery.id}/assign`, {
    headers,
    data: { riderId: rider.id },
  });
  expect(assignment.ok(), await assignment.text()).toBeTruthy();
  const failure = await request.patch(`${API}/deliveries/${delivery.id}/status`, {
    headers,
    data: { status: 'failed', failureReason: 'QA follow-up review fixture' },
  });
  expect(failure.ok(), await failure.text()).toBeTruthy();

  let sourceRecommendationId: string | undefined;
  await expect.poll(async () => {
    const response = await request.get(`${API}/analytics/customers/agent-runs`, { headers });
    if (!response.ok()) return false;
    const runs = await response.json() as Array<{
      triggerType: string;
      recommendations: Array<{
        id: string;
        evidence: Array<{ resourceType: string; resourceId: string }>;
      }>;
    }>;
    const recommendation = runs
      .filter((run) => run.triggerType === 'event')
      .flatMap((run) => run.recommendations)
      .find((item) => item.evidence.some(
        (evidence) => evidence.resourceType === 'delivery_contact_context' && evidence.resourceId === delivery.id,
      ));
    sourceRecommendationId = recommendation?.id;
    return Boolean(sourceRecommendationId);
  }, { timeout: 30_000 }).toBe(true);

  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.evaluate((auth) => {
    localStorage.setItem('noxtill-auth', JSON.stringify({
      state: { ...auth.session, accessToken: auth.accessToken, refreshToken: auth.refreshToken },
      version: 0,
    }));
  }, { session, accessToken, refreshToken });
  await page.goto('/customers/insights');

  const createTaskButton = page.getByRole('button', {
    name: 'Propose follow-up task',
  });
  await expect(createTaskButton).toBeVisible();
  await expect(page.getByText(/An owner must approve it before the CRM task is created/)).toBeVisible();

  const proposalUrl = `${API}/customers/agent-recommendations/${sourceRecommendationId}/follow-up-task-action`;
  const proposalPath = new URL(proposalUrl).pathname;
  const firstProposalResponsePromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname === proposalPath && response.request().method() === 'POST',
  );
  await createTaskButton.click();
  const firstProposalResponse = await firstProposalResponsePromise;
  expect(firstProposalResponse.ok(), await firstProposalResponse.text()).toBeTruthy();
  const proposal = await firstProposalResponse.json() as {
    id: string;
    actionType: string;
    state: string;
    expectedVersion: number;
  };
  expect(proposal).toMatchObject({
    actionType: 'customer_follow_up_task',
    state: 'approval_required',
    expectedVersion: 1,
  });

  const replayProposalResponsePromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname === proposalPath && response.request().method() === 'POST',
  );
  await createTaskButton.click();
  const replayProposalResponse = await replayProposalResponsePromise;
  expect(replayProposalResponse.ok(), await replayProposalResponse.text()).toBeTruthy();
  const replayProposal = await replayProposalResponse.json() as { id: string };
  expect(replayProposal.id).toBe(proposal.id);

  const tasksResponse = await request.get(`${API}/customers/${customer.id}/follow-up-tasks`, { headers });
  expect(tasksResponse.ok(), await tasksResponse.text()).toBeTruthy();
  const tasksBeforeApproval = await tasksResponse.json() as Array<{ id: string; title: string }>;
  expect(tasksBeforeApproval).toEqual([]);
  const draftsResponse = await request.get(`${API}/customers/${customer.id}/agent-message-drafts`, { headers });
  expect(draftsResponse.ok(), await draftsResponse.text()).toBeTruthy();
  expect(await draftsResponse.json()).toEqual([]);

  await page.goto('/assistant/settings', { waitUntil: 'networkidle' });
  const actionAuditRow = page.getByRole('row').filter({ hasText: proposal.id });
  await expect(actionAuditRow).toContainText('customer follow up task');
  await expect(actionAuditRow).toContainText('approval_required');
  const approveResponsePromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname === `/api/v1/agent-actions/${proposal.id}/approve` &&
    response.request().method() === 'POST',
  );
  await actionAuditRow.getByRole('button', { name: 'Approve internal task' }).click();
  const approveResponse = await approveResponsePromise;
  expect(approveResponse.ok(), await approveResponse.text()).toBeTruthy();
  await expect(actionAuditRow).toContainText('approved');

  const confirm = page.getByRole('dialog', { name: 'Create the CRM follow-up task?' });
  const executeResponsePromise = page.waitForResponse((response) =>
    new URL(response.url()).pathname === `/api/v1/agent-actions/${proposal.id}/execute` &&
    response.request().method() === 'POST',
  );
  await actionAuditRow.getByRole('button', { name: 'Create internal task' }).click();
  await confirm.getByRole('button', { name: 'Create internal task' }).click();
  const executeResponse = await executeResponsePromise;
  expect(executeResponse.ok(), await executeResponse.text()).toBeTruthy();
  await expect(actionAuditRow).toContainText('verified');

  const completedTasksResponse = await request.get(`${API}/customers/${customer.id}/follow-up-tasks`, { headers });
  expect(completedTasksResponse.ok(), await completedTasksResponse.text()).toBeTruthy();
  const completedTasks = await completedTasksResponse.json() as Array<{ id: string; title: string }>;
  expect(completedTasks).toHaveLength(1);
  expect(completedTasks[0].title).toBe('Follow up on failed delivery');
  const draftsAfterExecutionResponse = await request.get(`${API}/customers/${customer.id}/agent-message-drafts`, { headers });
  expect(draftsAfterExecutionResponse.ok(), await draftsAfterExecutionResponse.text()).toBeTruthy();
  expect(await draftsAfterExecutionResponse.json()).toEqual([]);

  await page.screenshot({ path: testInfo.outputPath('customer-failed-delivery-follow-up.png'), fullPage: true });
  expect(consoleErrors).toEqual([]);
  expect(apiErrors).toEqual([]);
});
