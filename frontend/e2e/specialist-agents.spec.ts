import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:5001/api/v1';

test('Inventory approval handoff and live privacy-aware customer profile review', async ({ page, request }, testInfo) => {
  test.setTimeout(120_000);
  await expect.poll(async () => {
    try { return (await request.get(`${API.replace(/\/api\/v1$/, '')}/health`)).status(); }
    catch { return 0; }
  }, { timeout: 30_000 }).toBe(200);
  const errors: string[] = [];
  const networkErrors: string[] = [];
  let expectedAiProviderFailure = false;
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !(expectedAiProviderFailure && message.text().includes('503 (Service Unavailable)'))) errors.push(message.text());
  });
  page.on('response', (response) => {
    const expectedFailure = expectedAiProviderFailure && response.status() === 503 && response.url().endsWith('/agent-message-drafts/generate');
    if (!expectedFailure && response.url().includes('/api/') && response.status() >= 500) networkErrors.push(`${response.status()} ${response.url()}`);
  });
  const stamp = Date.now();
  const email = `specialist-agent-browser-${stamp}@example.test`;
  const password = `Qa-${stamp}-Owner!`;
  const signup = await request.post(`${API}/auth/signup`, { data: {
    businessName: `QA Specialist Agents ${stamp}`, name: 'QA Specialist Owner', email, password, country: 'US', currency: 'USD',
  } });
  expect(signup.ok(), await signup.text()).toBeTruthy();
  const { accessToken } = await signup.json() as { accessToken: string };
  const headers = { Authorization: `Bearer ${accessToken}` };
  const inventoryAiSettings = await request.patch(`${API}/ai/settings`, {
    headers,
    data: { featureToggles: { inventoryAgent: false } },
  });
  expect(inventoryAiSettings.ok(), await inventoryAiSettings.text()).toBeTruthy();
  const modules = await request.get(`${API}/business-modules`, { headers });
  const { modules: available } = await modules.json() as { modules: { key: string }[] };
  const enabled = await request.patch(`${API}/business-modules/selection`, { headers, data: { enabled: available.map((module) => module.key) } });
  expect(enabled.ok(), await enabled.text()).toBeTruthy();
  const productResponse = await request.post(`${API}/products`, { headers, data: {
    kind: 'product', name: `QA Agent Product ${stamp}`, costPrice: 9, sellingPrice: 20, stockQty: 65, lowStockThreshold: 10,
  } });
  expect(productResponse.ok(), await productResponse.text()).toBeTruthy();
  const product = await productResponse.json() as { id: string };
  const noDemandProductResponse = await request.post(`${API}/products`, { headers, data: {
    kind: 'product', name: `QA Low-Stock No-Demand Product ${stamp}`, costPrice: 5, sellingPrice: 12, stockQty: 2, lowStockThreshold: 5,
  } });
  expect(noDemandProductResponse.ok(), await noDemandProductResponse.text()).toBeTruthy();
  const waitlistCustomerResponse = await request.post(`${API}/customers`, { headers, data: {
    name: `QA Waitlist Customer ${stamp}`, phone: '+12025550124', consentMarketing: false,
  } });
  expect(waitlistCustomerResponse.ok(), await waitlistCustomerResponse.text()).toBeTruthy();
  const waitlistCustomer = await waitlistCustomerResponse.json() as { id: string };
  const waitlistEntryResponse = await request.post(`${API}/stock/${product.id}/waitlist`, { headers, data: { customerId: waitlistCustomer.id } });
  expect(waitlistEntryResponse.ok(), await waitlistEntryResponse.text()).toBeTruthy();
  const supplierResponse = await request.post(`${API}/suppliers`, { headers, data: { name: `QA Agent Supplier ${stamp}` } });
  expect(supplierResponse.ok(), await supplierResponse.text()).toBeTruthy();
  const supplier = await supplierResponse.json() as { id: string };
  const sale = await request.post(`${API}/sales`, { headers, data: { items: [{ productId: product.id, qty: 60 }], payment: { method: 'cash', amount: 1200 } } });
  expect(sale.ok(), await sale.text()).toBeTruthy();
  const wastageProductResponse = await request.post(`${API}/products`, { headers, data: {
    kind: 'product', name: `QA Wastage Product ${stamp}`, costPrice: 4, sellingPrice: 8, stockQty: 1, lowStockThreshold: 0,
  } });
  expect(wastageProductResponse.ok(), await wastageProductResponse.text()).toBeTruthy();
  const wastageProduct = await wastageProductResponse.json() as { id: string };
  const wastage = await request.post(`${API}/inventory/wastage`, { headers, data: {
    productId: wastageProduct.id, qty: 1, reason: 'Damaged', note: 'QA Inventory Agent review fixture',
  } });
  expect(wastage.ok(), await wastage.text()).toBeTruthy();
  const countDraft = await request.post(`${API}/stock/counts`, { headers, data: {
    note: 'QA Inventory Agent recount finding', lines: [{ productId: product.id, countedQty: 4 }],
  } });
  expect(countDraft.ok(), await countDraft.text()).toBeTruthy();

  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByLabel('Email or phone number').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/dashboard/);
  await page.goto('/settings/ai');
  const countVarianceThreshold = page.getByRole('button', {
    name: /Minimum repeated count adjustment units/,
  });
  await expect(countVarianceThreshold).toContainText('No minimum');
  await countVarianceThreshold.click();
  const thresholdInput = page.getByRole('spinbutton', {
    name: 'Minimum repeated count adjustment units',
  });
  await thresholdInput.fill('2');
  const saveThreshold = page.waitForResponse(
    (response) =>
      response.url().endsWith('/settings/hub/changes') &&
      response.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'Save change' }).click();
  expect((await saveThreshold).ok()).toBeTruthy();
  await expect(countVarianceThreshold).toContainText('2 units');
  await page.screenshot({
    path: testInfo.outputPath('inventory-agent-threshold-setting.png'),
    fullPage: true,
  });
  await countVarianceThreshold.click();
  await page
    .getByRole('spinbutton', {
      name: 'Minimum repeated count adjustment units',
    })
    .fill('');
  const clearThreshold = page.waitForResponse(
    (response) =>
      response.url().endsWith('/settings/hub/changes') &&
      response.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'Save change' }).click();
  expect((await clearThreshold).ok()).toBeTruthy();
  await expect(countVarianceThreshold).toContainText('No minimum');

  await page.goto('/inventory/reorder-suggestions');
  const inventoryAnalysisResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/inventory/agent-runs') &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Analyze current inventory' }).click();
  expect((await inventoryAnalysisResponse).ok()).toBeTruthy();
  const configurationHistoryResponse = await request.get(
    `${API}/agents/inventory_intelligence/configuration-history`,
    { headers },
  );
  expect(configurationHistoryResponse.ok(), await configurationHistoryResponse.text()).toBeTruthy();
  const configurationHistory = await configurationHistoryResponse.json() as { items: { version: number; configuration: Record<string, unknown> }[] };
  expect(configurationHistory.items[0].version).toBeGreaterThan(0);
  expect(configurationHistory.items[0]).toMatchObject({
    configuration: expect.objectContaining({
      'agents.inventoryEnabled': true,
      'ai.featureToggles.inventoryAgent': false,
    }),
  });
  await expect(
    page.getByText(/Low-stock items without recent demand history\s+2/),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Prepare purchase request draft' }).first(),
  ).toBeVisible();
  await expect(page.getByText('Historical forecast range: not available because recorded-sales history is too sparse.')).toBeVisible();
  await expect(
    page.getByRole('status').filter({
      hasText: 'Historical lead-time sensitivity is not calculated',
    }),
  ).toContainText('0 matching completed product/supplier orders recorded, 3 required');
  const wastageTaskButton = page.getByRole('button', { name: 'Create wastage review task' });
  await expect(wastageTaskButton).toBeVisible();
  const wastageTaskPromise = page.waitForResponse((response) => response.url().endsWith('/wastage-review-task') && response.request().method() === 'POST');
  await wastageTaskButton.click();
  const wastageTaskResponse = await wastageTaskPromise;
  expect(wastageTaskResponse.ok(), await wastageTaskResponse.text()).toBeTruthy();
  const wastageTask = await wastageTaskResponse.json() as { id: string; status: string; sourceRecommendationId: string };
  expect(wastageTask.status).toBe('open');
  await expect(page.getByRole('status').filter({ hasText: 'Wastage review task · open' })).toBeVisible();
  await page.getByRole('button', { name: 'Record review' }).click();
  await page.getByRole('textbox', { name: 'Record the wastage review' }).fill('QA verified the recorded wastage movement in the canonical log');
  await page.getByRole('button', { name: 'Save review note' }).click();
  const reviewedWastageStatus = page.getByRole('status').filter({ hasText: 'Wastage review task · reviewed' });
  await expect(reviewedWastageStatus).toContainText('QA verified the recorded wastage movement');
  await reviewedWastageStatus.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('inventory-wastage-review-task.png') });
  const reviewedRunsResponse = await request.get(`${API}/inventory/agent-runs`, { headers });
  expect(reviewedRunsResponse.ok(), await reviewedRunsResponse.text()).toBeTruthy();
  const reviewedRuns = await reviewedRunsResponse.json() as { recommendations: { id: string; inventoryWastageReviewTask: { id: string; status: string; reviewNote: string | null } | null }[] }[];
  expect(reviewedRuns.flatMap((savedRun) => savedRun.recommendations).find((item) => item.id === wastageTask.sourceRecommendationId)?.inventoryWastageReviewTask).toMatchObject({
    id: wastageTask.id,
    status: 'reviewed',
    reviewNote: 'QA verified the recorded wastage movement in the canonical log',
  });
  await expect(page.getByRole('status').filter({ hasText: 'Branch comparison is not available until this business has another active location.' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'InventoryService value at recorded cost:' })).toContainText('$55');
  const recountRequestButton = page.getByRole('button', { name: 'Request a physical recount' });
  await expect(recountRequestButton).toBeVisible();
  const recountTaskPromise = page.waitForResponse((response) => response.url().endsWith('/count-task') && response.request().method() === 'POST');
  await recountRequestButton.click();
  const recountTaskResponse = await recountTaskPromise;
  expect(recountTaskResponse.ok(), await recountTaskResponse.text()).toBeTruthy();
  const recountTask = await recountTaskResponse.json() as { id: string; status: string; sourceRecommendationId: string };
  expect(recountTask.status).toBe('open');
  await expect(page.getByRole('status').filter({ hasText: 'Recount request · open' })).toBeVisible();
  const physicalCount = await request.post(`${API}/stock/counts`, { headers, data: {
    note: 'QA Inventory Agent physical recount recorded', lines: [{ productId: product.id, countedQty: 5 }],
  } });
  expect(physicalCount.ok(), await physicalCount.text()).toBeTruthy();
  await page.reload();
  await expect(page.getByRole('status').filter({ hasText: 'Recount request · physical count recorded' })).toBeVisible();
  const inventoryRuns = await request.get(`${API}/inventory/agent-runs`, { headers });
  expect(inventoryRuns.ok(), await inventoryRuns.text()).toBeTruthy();
  const savedInventoryRuns = await inventoryRuns.json() as { recommendations: { id: string; inventoryCountTask: { id: string; status: string } | null }[] }[];
  expect(savedInventoryRuns.flatMap((run) => run.recommendations).find((item) => item.id === recountTask.sourceRecommendationId)?.inventoryCountTask).toMatchObject({ id: recountTask.id, status: 'completed' });
  const dismissalRunResponse = await request.post(`${API}/inventory/agent-runs`, { headers });
  expect(dismissalRunResponse.ok(), await dismissalRunResponse.text()).toBeTruthy();
  const dismissalRun = await dismissalRunResponse.json() as { recommendations: { id: string; details: { signalType?: string; productId?: string } }[] };
  const dismissalFinding = dismissalRun.recommendations.find((item) => item.details.signalType === 'count_variance' && item.details.productId === product.id);
  expect(dismissalFinding).toBeDefined();
  if (!dismissalFinding) throw new Error('Expected a count variance finding for dismissal QA');
  const dismissalTaskResponse = await request.post(`${API}/inventory/agent-recommendations/${dismissalFinding.id}/count-task`, { headers });
  expect(dismissalTaskResponse.ok(), await dismissalTaskResponse.text()).toBeTruthy();
  const dismissalTask = await dismissalTaskResponse.json() as { id: string };
  const dismissalReason = 'QA confirmed the follow-up count is not needed';
  const dismissedResponse = await request.post(`${API}/inventory/agent-count-tasks/${dismissalTask.id}/dismiss`, { headers, data: { reason: dismissalReason } });
  expect(dismissedResponse.ok(), await dismissedResponse.text()).toBeTruthy();
  expect(await dismissedResponse.json()).toMatchObject({ status: 'dismissed', dismissReason: dismissalReason });
  await page.reload();
  await expect(page.getByRole('status').filter({ hasText: `Recount request · dismissed: ${dismissalReason}` })).toBeVisible();
  await page.getByRole('button', { name: 'Prepare notification preview' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Current preview · 1 eligible · 0 blocked' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'it does not send or verify provider delivery' })).toContainText('Hi QA Waitlist Customer');
  const waitlistReview = page.getByRole('button', { name: 'Review canonical waitlist' });
  await expect(waitlistReview).toBeVisible();
  await waitlistReview.click();
  await expect(page.getByRole('dialog').getByText('QA Waitlist Customer', { exact: false })).toBeVisible();
  await expect(page.getByText('1 customer waiting to be notified.')).toBeVisible();
  await page.getByLabel('Close').click();
  await page.screenshot({ path: testInfo.outputPath('inventory-evidence.png'), fullPage: true });
  const savedResponse = page.waitForResponse((response) => response.url().endsWith('/purchase-request') && response.request().method() === 'POST');
  await page
    .getByRole('button', { name: 'Prepare purchase request draft' })
    .first()
    .click();
  const saved = await savedResponse;
  expect(saved.ok(), await saved.text()).toBeTruthy();
  const draft = await saved.json() as { id: string };
  await page.getByRole('link', { name: 'Open purchase request · draft' }).click();
  const card = page.locator(`#request-${draft.id}`);
  await expect(card.getByText('Prepared from Inventory Intelligence')).toBeVisible();
  await card.getByRole('button', { name: 'Edit draft' }).click();
  await page.getByLabel('Suggested supplier').selectOption(supplier.id);
  await page.getByRole('button', { name: 'Save & submit', exact: true }).click();
  await expect(card.getByRole('link', { name: /Review in Action Center/ })).toBeVisible();
  await page.goto('/assistant/settings');
  await expect(page.getByRole('heading', { name: 'Agent configuration history' })).toBeVisible();
  await page.getByLabel('Select specialist agent configuration history').selectOption('inventory_intelligence');
  const inventoryConfigVersion = page.locator('details').filter({ hasText: `Version ${configurationHistory.items[0].version} ·` });
  await expect(inventoryConfigVersion).toBeVisible();
  await inventoryConfigVersion.locator('summary').click();
  await expect(inventoryConfigVersion.locator('pre')).toContainText('"ai.featureToggles.inventoryAgent": false');
  const specialistActionRow = page.getByRole('row').filter({ hasText: draft.id });
  const proposalVersionLabel = await specialistActionRow.getByText(/Proposal version:/).textContent();
  const proposalVersion = Number(proposalVersionLabel?.match(/Proposal version:\s*(\d+)/)?.[1]);
  expect(Number.isSafeInteger(proposalVersion) && proposalVersion > 0).toBeTruthy();
  await expect(specialistActionRow.getByRole('button', { name: 'Approve', exact: true })).toBeVisible();
  const approveAgentAction = page.waitForResponse((response) => response.url().includes('/agent-actions/') && response.url().endsWith('/approve') && response.request().method() === 'POST');
  await specialistActionRow.getByRole('button', { name: 'Approve', exact: true }).click();
  const approvalResponse = await approveAgentAction;
  expect(approvalResponse.ok()).toBeTruthy();
  expect(approvalResponse.request().postDataJSON()).toMatchObject({ expectedVersion: proposalVersion });
  const executeAgentAction = page.waitForResponse((response) => response.url().includes('/agent-actions/') && response.url().endsWith('/execute') && response.request().method() === 'POST');
  await specialistActionRow.getByRole('button', { name: 'Create purchase order' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Create purchase order' }).click();
  const executionResponse = await executeAgentAction;
  expect(executionResponse.ok()).toBeTruthy();
  expect(executionResponse.request().postDataJSON()).toMatchObject({ expectedVersion: proposalVersion });
  await page.goto('/procurement/requests');
  await expect(card.getByText('converted', { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('procurement-handoff.png'), fullPage: true });
  const canonicalResponse = await request.get(`${API}/procurement/requests/${draft.id}`, { headers });
  expect(canonicalResponse.ok()).toBeTruthy();
  const canonical = await canonicalResponse.json() as { status: string; convertedPurchaseOrder: { status: string } };
  expect(canonical).toMatchObject({ status: 'converted', convertedPurchaseOrder: { status: 'draft' } });

  const customerResponse = await request.post(`${API}/customers`, { headers, data: { name: `QA Profile Customer ${stamp}`, phone: '+12025550123', consentMarketing: false } });
  expect(customerResponse.ok(), await customerResponse.text()).toBeTruthy();
  const customer = await customerResponse.json() as { id: string };
  const customerRead = await request.get(`${API}/customers/${customer.id}`, { headers });
  expect(customerRead.ok(), `Customer detail API returned ${customerRead.status()}: ${await customerRead.text()}`).toBeTruthy();
  const customerSale = await request.post(`${API}/sales`, { headers, data: { customerId: customer.id, items: [{ productId: product.id, qty: 1 }], payment: { method: 'cash', amount: 20 } } });
  expect(customerSale.ok(), await customerSale.text()).toBeTruthy();
  await page.goto(`/customers/${customer.id}`);
  const profileReview = page.getByRole('region', { name: 'Customer intelligence review' });
  await expect(profileReview.getByText(/No live profile review is loaded/)).toBeVisible();
  const liveResponsePromise = page.waitForResponse((response) => response.url().endsWith(`/customers/${customer.id}/intelligence`) && response.request().method() === 'GET');
  await profileReview.getByRole('button', { name: 'Review profile intelligence' }).click();
  const liveResponse = await liveResponsePromise;
  expect(liveResponse.ok(), await liveResponse.text()).toBeTruthy();
  expect(liveResponse.headers()['cache-control']).toBe('no-store');
  expect(await liveResponse.json()).toMatchObject({ orders: { currentCount: 1, previousCount: 0, allTimeCompletedCount: 1 }, windows: { minimumOrderDecline: 1 }, rfm: { state: 'available', frequency: { completedNonQuotationOrderCount: 1 }, score: { state: 'not_configured', value: null } }, followUp: { state: 'insufficient_history' }, marketing: { state: 'excluded', sendsMessages: false }, narrative: { state: 'available', method: 'deterministic' }, feedback: { state: 'available', count: 0, averageStars: null } });
  await expect(profileReview.getByRole('heading', { name: 'Customer 360 summary · deterministic' })).toBeVisible();
  await expect(profileReview.getByRole('heading', { name: 'RFM source values · no score' })).toBeVisible();
  await profileReview.getByRole('heading', { name: 'RFM source values · no score' }).locator('..').screenshot({ path: testInfo.outputPath('customer-rfm-source-values.png') });
  await expect(profileReview.getByText(/No AI conclusion · source records below/)).toBeVisible();
  await expect(profileReview.getByRole('heading', { name: 'Customer-linked feedback · last 90 days' })).toBeVisible();
  await expect(profileReview.getByText(/Public reviews are not linked to individual customers/)).toBeVisible();
  await expect(profileReview.getByText('Marketing consent is not recorded.')).toBeVisible();

  await page.goto('/settings/ai');
  const retentionThreshold = page.getByRole('button', {
    name: /Minimum completed-order decline/,
  });
  await expect(retentionThreshold).toContainText('1 fewer order');
  await retentionThreshold.click();
  await page
    .getByRole('spinbutton', { name: 'Minimum completed-order decline' })
    .fill('3');
  const saveRetentionThreshold = page.waitForResponse(
    (response) =>
      response.url().endsWith('/settings/hub/changes') &&
      response.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'Save change' }).click();
  expect((await saveRetentionThreshold).ok()).toBeTruthy();
  await expect(retentionThreshold).toContainText('3 fewer orders');
  await retentionThreshold.click();
  await page
    .getByRole('spinbutton', { name: 'Minimum completed-order decline' })
    .fill('1');
  const resetRetentionThreshold = page.waitForResponse(
    (response) =>
      response.url().endsWith('/settings/hub/changes') &&
      response.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'Save change' }).click();
  expect((await resetRetentionThreshold).ok()).toBeTruthy();
  await expect(retentionThreshold).toContainText('1 fewer order');

  await page.goto(`/customers/${customer.id}`);
  const reopenedProfileReview = page.getByRole('region', {
    name: 'Customer intelligence review',
  });
  await reopenedProfileReview
    .getByRole('button', { name: 'Review profile intelligence' })
    .click();
  await expect(
    reopenedProfileReview.getByText(/Drop threshold: at least 1 fewer completed order\./),
  ).toBeVisible();

  const consentChange = await request.patch(`${API}/customers/${customer.id}`, { headers, data: { consentMarketing: true } });
  expect(consentChange.ok(), await consentChange.text()).toBeTruthy();
  await profileReview.getByRole('button', { name: 'Refresh profile review' }).click();
  await expect(profileReview.getByRole('heading', { name: 'Marketing eligibility · Channel check required' })).toBeVisible();
  await profileReview.getByLabel('AI draft purpose').selectOption('winback_follow_up');
  await expect(profileReview.getByText(/60 days without a visit/)).toBeVisible();
  await profileReview.getByLabel('AI draft purpose').selectOption('general_follow_up');
  const followUpTitle = `QA customer follow-up ${stamp}`;
  await profileReview.getByLabel('Follow-up task title').fill(followUpTitle);
  await profileReview.getByLabel('Follow-up reason').fill('QA browser verification of the real customer follow-up queue.');
  const taskResponsePromise = page.waitForResponse((response) => response.url().endsWith(`/customers/${customer.id}/follow-up-tasks`) && response.request().method() === 'POST');
  await profileReview.getByRole('button', { name: 'Create follow-up task' }).click();
  const taskResponse = await taskResponsePromise;
  expect(taskResponse.ok(), await taskResponse.text()).toBeTruthy();
  const followUpTask = await taskResponse.json() as { id: string; status: string; title: string };
  expect(followUpTask).toMatchObject({ status: 'open', title: followUpTitle });
  await expect(profileReview.getByText(new RegExp(`${followUpTitle} · normal · open`))).toBeVisible();

  expectedAiProviderFailure = true;
  const insufficientCreditFailure = {
    error: {
      code: 'AI_PROVIDER_INSUFFICIENT_CREDIT',
      message: 'The AI provider account has insufficient credit. Ask the platform administrator to add credit before retrying.',
    },
  };
  await page.route(
    `**/api/v1/customers/${customer.id}/agent-message-drafts/generate`,
    (route) => route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify(insufficientCreditFailure),
    }),
  );
  const aiDraftResponsePromise = page.waitForResponse((response) => response.url().endsWith(`/customers/${customer.id}/agent-message-drafts/generate`) && response.request().method() === 'POST');
  await profileReview.getByRole('button', { name: 'Generate AI draft for review' }).click();
  const aiDraftResponse = await aiDraftResponsePromise;
  expect(aiDraftResponse.status()).toBe(503);
  await page.unroute(`**/api/v1/customers/${customer.id}/agent-message-drafts/generate`);
  const aiDraftFailure = await aiDraftResponse.json() as {
    error: { code: string; message: string };
  };
  expect(aiDraftFailure).toEqual(insufficientCreditFailure);
  await expect(profileReview.getByRole('alert')).toContainText(insufficientCreditFailure.error.message);
  const draftsAfterProviderFailure = await request.get(
    `${API}/customers/${customer.id}/agent-message-drafts`,
    { headers },
  );
  expect(draftsAfterProviderFailure.ok(), await draftsAfterProviderFailure.text()).toBeTruthy();
  expect(await draftsAfterProviderFailure.json()).toEqual([]);
  expectedAiProviderFailure = false;

  const messageBody = `QA draft for customer ${stamp}; this must remain a draft and must not be delivered.`;
  await profileReview.getByLabel('Link message draft to follow-up task').selectOption(followUpTask.id);
  await profileReview.getByLabel('Customer message draft').fill(messageBody);
  const messageDraftPromise = page.waitForResponse((response) => response.url().endsWith(`/customers/${customer.id}/agent-message-drafts`) && response.request().method() === 'POST');
  await profileReview.getByRole('button', { name: 'Save my draft for review' }).click();
  const messageDraftResponse = await messageDraftPromise;
  expect(messageDraftResponse.ok(), await messageDraftResponse.text()).toBeTruthy();
  const messageDraft = await messageDraftResponse.json() as { id: string; status: string; body: string; followUpTaskId: string | null };
  expect(messageDraft).toMatchObject({ status: 'draft', body: messageBody, followUpTaskId: followUpTask.id });
  await expect(profileReview.getByText(messageBody, { exact: true })).toBeVisible();
  await expect(profileReview.getByText(/Staff-written ·/)).toBeVisible();
  await expect(profileReview.getByText('Draft only · not sent')).toBeVisible();
  await profileReview.getByRole('button', { name: 'Edit draft', exact: true }).click();
  const reviewedBody = `${messageBody} Reviewed by QA; still not delivered.`;
  await profileReview.getByLabel('Customer message draft').fill(reviewedBody);
  const updateDraftPromise = page.waitForResponse((response) => response.url().endsWith(`/customers/${customer.id}/agent-message-drafts/${messageDraft.id}`) && response.request().method() === 'PATCH');
  await profileReview.getByRole('button', { name: 'Save reviewed draft' }).click();
  const updateDraftResponse = await updateDraftPromise;
  expect(updateDraftResponse.ok(), await updateDraftResponse.text()).toBeTruthy();
  expect(await updateDraftResponse.json()).toMatchObject({ id: messageDraft.id, body: reviewedBody, generatedByAgent: false });
  await expect(profileReview.getByText(reviewedBody, { exact: true })).toBeVisible();
  const revokedConsent = await request.patch(`${API}/customers/${customer.id}`, { headers, data: { consentMarketing: false } });
  expect(revokedConsent.ok(), await revokedConsent.text()).toBeTruthy();
  const refusedQueue = await request.post(`${API}/customers/${customer.id}/agent-message-drafts/${messageDraft.id}/queue-send`, { headers });
  expect(refusedQueue.status()).toBe(403);
  expect(await refusedQueue.json()).toMatchObject({ error: { code: 'CUSTOMER_MESSAGE_DRAFT_CONSENT_REQUIRED' } });
  const refusalSummary = await request.get(`${API}/ai/specialist-operations`, { headers });
  expect(refusalSummary.ok(), await refusalSummary.text()).toBeTruthy();
  expect((await refusalSummary.json()).securityEvents).toMatchObject({ auditedCustomerMessageQueueRefusals: 1 });
  const consentRestored = await request.patch(`${API}/customers/${customer.id}`, { headers, data: { consentMarketing: true } });
  expect(consentRestored.ok(), await consentRestored.text()).toBeTruthy();
  await page.screenshot({ path: testInfo.outputPath('customer-message-drafts.png'), fullPage: true });

  await page.goto('/assistant/settings');
  const refusalMetric = page.getByText('Audited Customer Agent message queue refusals · business-wide', { exact: true }).locator('..');
  await expect(refusalMetric).toContainText('1');
  await expect(page.getByRole('heading', { name: 'Material action audit trail' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Download audit CSV' })).toBeVisible();
  const actionAuditResponse = await request.get(`${API}/ai/specialist-operations/audit`, { headers });
  expect(actionAuditResponse.ok(), await actionAuditResponse.text()).toBeTruthy();
  const actionAudit = await actionAuditResponse.json() as { scope: string; actions: { id: string; events: { eventType: string }[]; proposedPayload?: unknown; actualResult?: unknown }[]; disclosure: string };
  expect(actionAudit.scope).toBe('current_business');
  expect(actionAudit.actions.length).toBeGreaterThan(0);
  expect(actionAudit.actions.every((action) => !('proposedPayload' in action) && !('actualResult' in action))).toBeTruthy();
  expect(actionAudit.disclosure).toContain('up to 100 material actions from the last 30 days');
  const auditCsvButton = page.getByRole('button', { name: 'Download audit CSV' });
  await expect(auditCsvButton).toBeEnabled();
  const auditDownloadPromise = page.waitForEvent('download');
  await auditCsvButton.click();
  const auditDownload = await auditDownloadPromise;
  expect(auditDownload.suggestedFilename()).toMatch(/^specialist-action-audit-\d{4}-\d{2}-\d{2}\.csv$/);
  const auditCsvPath = await auditDownload.path();
  expect(auditCsvPath).not.toBeNull();
  const auditCsv = await readFile(auditCsvPath!, 'utf8');
  expect(auditCsv).toContain(actionAudit.actions[0].id);
  expect(auditCsv).not.toContain('proposedPayload');
  const operationsSummaryResponse = await request.get(`${API}/ai/specialist-operations`, { headers });
  expect(operationsSummaryResponse.ok(), await operationsSummaryResponse.text()).toBeTruthy();
  const operationsSummary = await operationsSummaryResponse.json() as { agents: { agentKey: string; evidence: { sampledRecords: number; freshnessCounts: Record<string, number> } }[] };
  const inventoryEvidence = operationsSummary.agents.find((agent) => agent.agentKey === 'inventory_intelligence')?.evidence;
  expect(inventoryEvidence?.sampledRecords).toBeGreaterThan(0);
  // This table's existing semantic snapshot exposes header cells as `cell`, so
  // assert the rendered header text directly instead of relying on columnheader.
  await expect(page.getByText('Saved evidence freshness & source timestamps', { exact: true })).toBeVisible();
  await expect(page.getByText(/Recorded freshness:/).first()).toBeVisible();
  await page.getByText(/Recorded freshness:/).first().scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('specialist-evidence-freshness.png') });

  await page.goto('/customers');
  const customerQueue = page.getByRole('region', { name: 'Customer follow-up queue' });
  await expect(customerQueue.getByText(/Ordered by saved task priority, due date and age—not an AI score/)).toBeVisible();
  const queuedFollowUp = customerQueue.getByRole('link').filter({ hasText: followUpTitle });
  await expect(queuedFollowUp).toHaveAttribute('href', `/customers/${customer.id}`);
  await expect(customerQueue.getByRole('button', { name: 'Complete & record' })).toBeVisible();
  await expect(customerQueue.getByText(/not provider-confirmed message delivery/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('customer-follow-up-queue.png'), fullPage: true });

  await page.goto('/staff/tasks');
  const taskRow = page.getByRole('row').filter({ hasText: followUpTitle });
  await expect(taskRow).toBeVisible();
  await taskRow.getByRole('combobox', { name: `Outcome for ${followUpTitle}` }).selectOption('contacted');
  await taskRow.getByRole('button', { name: 'Complete & record' }).click();
  await expect(taskRow).toHaveCount(0);
  const completedTask = await request.post(`${API}/customers/follow-up-tasks/${followUpTask.id}/complete`, { headers });
  expect(completedTask.ok(), await completedTask.text()).toBeTruthy();
  expect(await completedTask.json()).toMatchObject({ status: 'completed', completionOutcome: 'contacted' });
  const outcomeSummary = await request.get(`${API}/customers/follow-up-outcomes`, { headers });
  expect(outcomeSummary.ok(), await outcomeSummary.text()).toBeTruthy();
  expect(await outcomeSummary.json()).toMatchObject({ completedCount: 1, recordedCount: 1, notRecordedCount: 0, outcomes: { contacted: 1 } });

  await page.goto(`/customers/${customer.id}`);
  const reopenedReviewPromise = page.waitForResponse((response) => response.url().endsWith(`/customers/${customer.id}/intelligence`) && response.request().method() === 'GET');
  await page.getByRole('button', { name: 'Review profile intelligence' }).click();
  expect((await reopenedReviewPromise).ok()).toBeTruthy();
  await profileReview.locator('[aria-label="Customer 360 summary"]').screenshot({ path: testInfo.outputPath('customer-360-summary.png') });
  await profileReview.getByText('Evidence windows and limits', { exact: true }).click();
  await expect(profileReview.getByText(/Returns\/refunds are not netted/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('customer-profile-review.png'), fullPage: true });

  await page.goto('/customers/insights');
  const duplicateEmail = `qa-duplicate-${stamp}@example.test`;
  const duplicatePhones = ['+12025550121', '+12025550122'];
  const duplicateNames = [`QA duplicate A ${stamp}`, `QA duplicate B ${stamp}`];
  for (const [index, name] of duplicateNames.entries()) {
    const duplicateCustomer = await request.post(`${API}/customers`, { headers, data: {
      name,
      phone: duplicatePhones[index],
      email: duplicateEmail,
    } });
    expect(duplicateCustomer.ok(), await duplicateCustomer.text()).toBeTruthy();
  }
  const aiDisabled = await request.patch(`${API}/ai/settings`, { headers, data: { featureToggles: { customerAgent: false } } });
  expect(aiDisabled.ok(), await aiDisabled.text()).toBeTruthy();
  const customerAgentRunPromise = page.waitForResponse((response) => response.url().endsWith('/analytics/customers/agent-runs') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Run review', exact: true }).click();
  const customerAgentRunResponse = await customerAgentRunPromise;
  expect(customerAgentRunResponse.ok(), await customerAgentRunResponse.text()).toBeTruthy();
  const customerAgentRun = await customerAgentRunResponse.json() as { output: { aiSummary: { status: string }; snapshot: { dataQuality: { exactMatchCandidatePairCount: number; sharedEmailPairCount: number; activeProfilesMissingEmailOrPhoneCount: number }; winbackCampaignBrief: { state: string; lapsedDays: number; lapsedCandidateCount: number | null; consentPassCount: number | null; campaignCreated: false; messagesQueued: false } } } };
  expect(customerAgentRun.output.snapshot.dataQuality).toMatchObject({ exactMatchCandidatePairCount: 1, sharedEmailPairCount: 1 });
  expect(customerAgentRun.output).toMatchObject({
    aiSummary: { status: 'blocked' },
    snapshot: { winbackCampaignBrief: { state: 'available', lapsedDays: 60, lapsedCandidateCount: 0, campaignCreated: false, messagesQueued: false } },
  });
  expect(JSON.stringify(customerAgentRun)).not.toContain(duplicateEmail);
  expect(JSON.stringify(customerAgentRun)).not.toContain(duplicateNames[0]);
  await expect(page.getByRole('button', { name: 'Review duplicate candidates' })).toBeVisible();
  await expect(page.getByText(/CRM data quality · 1 exact-match duplicate pair/)).toBeVisible();
  await expect(page.getByText('Win-back campaign brief · review only')).toBeVisible();
  await expect(page.getByText(/Recorded channel consent is context, not send authorization/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('customer-agent-data-quality.png') });
  await page.getByRole('button', { name: 'Review duplicate candidates' }).click();
  await expect(page).toHaveURL(/\/customers\/duplicates$/);
  await expect(page.getByRole('row').filter({ hasText: duplicateNames[0] }).filter({ hasText: duplicateNames[1] })).toBeVisible();
  await page.goto('/customers/insights');
  await page.getByRole('button', { name: 'Run review', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Prepare editable segment draft' })).toBeVisible();
  const preparedPromise = page.waitForResponse((response) => response.url().endsWith('/segment-draft') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Prepare editable segment draft' }).click();
  const prepared = await preparedPromise;
  expect(prepared.ok(), await prepared.text()).toBeTruthy();
  const segmentDraft = await prepared.json() as { id: string };
  const editor = page.locator(`#segment-draft-${segmentDraft.id}`);
  await expect(editor.getByText('Repeat visitors · version 1', { exact: true })).toBeVisible();
  await editor.getByLabel('Draft segment name').fill('QA Reviewed repeat visitors');
  await editor.getByLabel('Rule 1 value', { exact: true }).fill('0');
  await editor.getByLabel('Revision or rejection reason').fill('QA inspect rule revision only');
  await editor.getByRole('button', { name: 'Save draft revision' }).click();
  await expect(editor.getByText('QA Reviewed repeat visitors · version 2', { exact: true })).toBeVisible();
  await expect(editor.getByText(/Saved-rule matches now: 1/)).toBeVisible();
  await editor.getByText('Immutable revision history and rule evidence', { exact: true }).click();
  await expect(editor.getByText(/Version 1 ·/)).toBeVisible();
  await expect(editor.getByText(/Version 2 ·/)).toBeVisible();
  const canonicalSegments = await request.get(`${API}/segments`, { headers });
  expect(canonicalSegments.ok()).toBeTruthy();
  expect(await canonicalSegments.json()).toEqual([]);
  await editor.getByRole('button', { name: 'Submit exact version for approval' }).click();
  await expect(editor.getByText('Pending exact approval · version 2', { exact: true })).toBeVisible();
  await editor.getByRole('link', { name: 'Open Action Center', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Review segment', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve', exact: true })).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath('segment-action-center.png'), fullPage: true });
  await page.getByRole('link', { name: 'Review segment', exact: true }).click();
  await editor.getByRole('button', { name: 'Approve exact version and save Segment' }).click();
  await expect(editor.getByText('Canonical Segment verification: verified', { exact: true })).toBeVisible();
  const savedSegments = await request.get(`${API}/segments`, { headers });
  const [savedSegment] = await savedSegments.json() as { id: string; version: number; agentApprovalState: string }[];
  expect(savedSegment).toMatchObject({ version: 1, agentApprovalState: 'approved' });
  const canonicalRow = page.locator(`#canonical-segment-${savedSegment.id}`);
  await expect(canonicalRow.getByText(/Agent approval: approved/)).toBeVisible();
  await canonicalRow.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('dialog').getByLabel('Name', { exact: true }).fill('QA Changed canonical visitors');
  await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
  await expect(editor.getByText('Canonical Segment verification: changed', { exact: true })).toBeVisible();
  await expect(canonicalRow.getByRole('button', { name: 'Message', exact: true })).toBeDisabled();
  const blocked = await request.get(`${API}/segments/${savedSegment.id}`, { headers });
  expect(blocked.status()).toBe(409);
  expect(await blocked.json()).toMatchObject({ error: { code: 'CUSTOMER_SEGMENT_APPROVAL_INVALIDATED' } });
  await editor.getByLabel('Fresh canonical review reason').fill('QA inspect live canonical edit before reapproval');
  await editor.getByRole('button', { name: 'Start fresh canonical review' }).click();
  await expect(editor.getByLabel('Draft segment name')).toHaveValue('QA Changed canonical visitors');
  await editor.getByRole('button', { name: 'Submit exact version for approval' }).click();
  await editor.getByRole('button', { name: 'Approve exact version and save Segment' }).click();
  await expect(editor.getByText('Canonical Segment verification: verified', { exact: true })).toBeVisible();
  await expect(canonicalRow.getByRole('button', { name: 'Message', exact: true })).toBeEnabled();
  const refreshedSegments = await request.get(`${API}/segments`, { headers });
  expect(await refreshedSegments.json()).toEqual([expect.objectContaining({ id: savedSegment.id, version: 3, agentApprovalState: 'approved' })]);
  await page.screenshot({ path: testInfo.outputPath('customer-segment-approved.png'), fullPage: true });

  // A separate pending proposal can be rejected with a real reason; it creates no Segment.
  await page.goto('/customers/insights');
  await page.getByRole('button', { name: 'Run review', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Prepare editable segment draft' })).toBeVisible();
  const anotherResponse = page.waitForResponse((response) => response.url().endsWith('/segment-draft') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Prepare editable segment draft' }).click();
  const another = await (await anotherResponse).json() as { id: string };
  const rejectedEditor = page.locator(`#segment-draft-${another.id}`);
  await rejectedEditor.getByRole('button', { name: 'Submit exact version for approval' }).click();
  await expect(rejectedEditor.getByText('Pending exact approval · version 1', { exact: true })).toBeVisible();
  await rejectedEditor.getByLabel('Revision or rejection reason').fill('QA rejected pending proposal after review');
  await rejectedEditor.getByRole('button', { name: 'Reject draft', exact: true }).click();
  await expect(rejectedEditor.getByText('Rejected: QA rejected pending proposal after review')).toBeVisible();

  // The existing canonical rule builder still works separately after extracting its shared UI.
  await page.getByRole('button', { name: 'Create Segment', exact: true }).first().click();
  const segmentDialog = page.getByRole('dialog');
  await segmentDialog.getByLabel('Name', { exact: true }).fill('QA Manual Segment');
  await segmentDialog.getByLabel('Rule 1 field').selectOption('visitCount');
  await segmentDialog.getByLabel('Rule 1 value', { exact: true }).fill('0');
  await segmentDialog.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'QA Manual Segment', exact: true })).toBeVisible();

  // An Action Center deep link must load a pending proposal even outside the latest-20 list.
  async function prepareSource() {
    const sourceResponse = await request.post(`${API}/analytics/customers/agent-runs`, { headers });
    expect(sourceResponse.ok(), await sourceResponse.text()).toBeTruthy();
    const source = await sourceResponse.json() as { recommendations: { id: string }[] };
    const response = await request.post(`${API}/customers/agent-recommendations/${source.recommendations[0].id}/segment-draft`, { headers });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json() as Promise<{ id: string; current: { version: number; payloadHash: string }; countsHash: string }>;
  }
  const older = await prepareSource();
  const oldSubmitted = await request.post(`${API}/customers/agent-recommendations/${older.id}/segment-draft/submit`, { headers, data: { expectedVersion: older.current.version, expectedPayloadHash: older.current.payloadHash, expectedCountsHash: older.countsHash } });
  expect(oldSubmitted.ok(), await oldSubmitted.text()).toBeTruthy();
  for (let index = 0; index < 20; index++) await prepareSource();
  const recent = await request.get(`${API}/customers/segment-drafts`, { headers });
  expect((await recent.json() as { id: string }[]).some((draft) => draft.id === older.id)).toBe(false);
  await page.goto('/dashboard/actions');
  await page.getByRole('link', { name: 'Review segment', exact: true }).click();
  const olderEditor = page.locator(`#segment-draft-${older.id}`);
  await expect(olderEditor.getByText('Pending exact approval · version 1', { exact: true })).toBeVisible();
  await olderEditor.getByLabel('Revision or rejection reason').fill('QA older queue entry verified');
  await olderEditor.getByRole('button', { name: 'Reject draft', exact: true }).click();
  await expect(olderEditor.getByText('Rejected: QA older queue entry verified')).toBeVisible();
  expect(errors).toEqual([]);
  expect(networkErrors).toEqual([]);
});
