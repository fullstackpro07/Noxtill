import { expect, test } from '@playwright/test';

const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:5001/api/v1';

test('Commerce Agent compares current recorded RFQ quotes without awarding or sending', async ({ page, request }, testInfo) => {
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
  const email = `commerce-sourcing-agent-${stamp}@example.test`;
  const password = `Qa-${stamp}-Owner!`;
  const signup = await request.post(`${API}/auth/signup`, {
    data: {
      businessName: `QA Commerce Sourcing ${stamp}`,
      name: 'QA Commerce Owner',
      email,
      password,
      country: 'US',
      currency: 'USD',
    },
  });
  expect(signup.ok(), await signup.text()).toBeTruthy();
  const { accessToken } = await signup.json() as { accessToken: string };
  const headers = { Authorization: `Bearer ${accessToken}` };
  const moduleResponse = await request.get(`${API}/business-modules`, { headers });
  expect(moduleResponse.ok(), await moduleResponse.text()).toBeTruthy();
  const { modules } = await moduleResponse.json() as { modules: { key: string }[] };
  const enabledModules = await request.patch(`${API}/business-modules/selection`, {
    headers,
    data: { enabled: modules.map((module) => module.key) },
  });
  expect(enabledModules.ok(), await enabledModules.text()).toBeTruthy();
  const aiSettings = await request.patch(`${API}/ai/settings`, {
    headers,
    data: { featureToggles: { commerceAgent: false } },
  });
  expect(aiSettings.ok(), await aiSettings.text()).toBeTruthy();

  const candidateResponse = await request.post(`${API}/commerce/product-radar`, {
    headers,
    data: {
      title: `QA validation scorecard ${stamp}`,
      source: 'Manual QA research',
      market: 'US',
      demandSignal: 72,
      observedPrice: 40,
      estimatedLandedCost: 20,
      supplierCount: 2,
      evidence: 'Obviously named QA-only candidate; no external data is implied.',
    },
  });
  expect(candidateResponse.ok(), await candidateResponse.text()).toBeTruthy();
  const candidate = await candidateResponse.json() as { id: string; version: number };
  const validationRequest = await request.post(
    `${API}/commerce/product-radar/${candidate.id}/actions/send_to_validation`,
    { headers, data: { expectedVersion: candidate.version } },
  );
  expect(validationRequest.ok(), await validationRequest.text()).toBeTruthy();

  const suppliers = await Promise.all(
    ['QA Quote Supplier A', 'QA Quote Supplier B'].map(async (suffix) => {
      const response = await request.post(`${API}/suppliers`, {
        headers,
        data: { name: `${suffix} ${stamp}` },
      });
      expect(response.ok(), await response.text()).toBeTruthy();
      return response.json() as Promise<{ id: string }>;
    }),
  );
  const createRfq = await request.post(`${API}/commerce/rfqs`, {
    headers,
    data: {
      requirement: `QA comparable supplier quotes ${stamp}`,
      currency: 'USD',
      items: [{ description: `QA sourcing item ${stamp}`, qty: 2 }],
      supplierIds: suppliers.map((supplier) => supplier.id),
    },
  });
  expect(createRfq.ok(), await createRfq.text()).toBeTruthy();
  let rfq = await createRfq.json() as {
    id: string;
    version: number;
    items: { id: string }[];
    suppliers: { id: string; supplierId: string }[];
  };
  const openedResponse = await request.post(`${API}/commerce/rfqs/${rfq.id}/actions/open`, {
    headers,
    data: { expectedVersion: rfq.version },
  });
  expect(openedResponse.ok(), await openedResponse.text()).toBeTruthy();
  rfq = await openedResponse.json() as typeof rfq;
  const markedSent = await request.post(`${API}/commerce/rfqs/${rfq.id}/actions/confirm-manual-supplier-send`, {
    headers,
    data: { expectedVersion: rfq.version, supplierIds: suppliers.map((supplier) => supplier.id) },
  });
  expect(markedSent.ok(), await markedSent.text()).toBeTruthy();
  rfq = await markedSent.json() as typeof rfq;

  for (const [index, supplier] of suppliers.entries()) {
    const invitation = rfq.suppliers.find((row) => row.supplierId === supplier.id);
    if (!invitation) throw new Error('Expected the RFQ supplier invitation to exist.');
    const quote = await request.post(`${API}/commerce/rfqs/${rfq.id}/quotes`, {
      headers,
      data: {
        invitationId: invitation.id,
        expectedVersion: rfq.version,
        currency: 'USD',
        freight: index === 0 ? 5.01 : 1.75,
        duties: index === 0 ? 1.01 : 0.25,
        leadTimeDays: index === 0 ? 12 : 18,
        paymentTerms: index === 0 ? 'Net 30' : 'Prepaid',
        items: [{ rfqItemId: rfq.items[0].id, quotedQty: 2, unitPrice: index === 0 ? 456.18 : 460 }],
      },
    });
    expect(quote.ok(), await quote.text()).toBeTruthy();
    rfq = await quote.json() as typeof rfq;
  }

  const claimResponse = await request.post(`${API}/commerce/supplier-claims`, {
    headers,
    data: {
      supplierId: suppliers[0].id,
      reasonCode: 'damage',
      reason: `QA-only supplier claim ${stamp}; not a real supplier dispute.`,
      currency: 'USD',
      items: [{
        description: `QA-only recorded loss ${stamp}`,
        quantityAffected: 1,
        productLossAmount: 18.5,
        freightLossAmount: 2.25,
        otherLossAmount: 0,
      }],
    },
  });
  expect(claimResponse.ok(), await claimResponse.text()).toBeTruthy();

  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByLabel('Email or phone number').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/dashboard/);
  await page.goto('/autonomous-commerce/agent-tools');
  const reviewButton = page.getByRole('button', { name: 'Run read-only review' });
  await expect(reviewButton).toBeVisible();
  const reviewResponsePromise = page.waitForResponse((response) =>
    response.url().endsWith('/commerce/agent-tools/specialist-runs') &&
    response.request().method() === 'POST',
  );
  await reviewButton.click();
  const reviewResponse = await reviewResponsePromise;
  expect(reviewResponse.ok(), await reviewResponse.text()).toBeTruthy();
  const run = await reviewResponse.json() as {
    output: { sourcingReview: { comparisons: { rfqId: string; lowestComparableLandedTotal: string | null; comparableQuoteCount: number }[] } };
  };
  const detailedRun = run as typeof run & {
    output: typeof run.output & {
      validationScorecards: {
        reviewedCount: number;
        candidates: { opportunityId: string; scorecard: { status: string; dimensions: { key: string; status: string }[] } }[];
      };
      experimentReview: { state: string; experiments: unknown[] };
      supplierClaimReview: {
        state: string;
        totalClaims: number;
        statusCounts: Record<string, number>;
        claims: { status: string; currency: string; recordedLossAmount: string; recordedSettlementAmount: string }[];
      };
      deliveryExceptionReview: {
        state: string;
        failedCount: number;
        recentFailures: { resolutionStatus: string }[];
      };
      fulfillmentReview: {
        state: string;
        totalOpenOrders: number;
        orders: unknown[];
      };
    };
  };
  expect(run.output.sourcingReview.comparisons).toEqual(expect.arrayContaining([
    expect.objectContaining({ rfqId: rfq.id, lowestComparableLandedTotal: '918.38', comparableQuoteCount: 2 }),
  ]));
  expect(detailedRun.output.validationScorecards).toMatchObject({ reviewedCount: 1 });
  expect(detailedRun.output.validationScorecards.candidates[0]).toMatchObject({
    opportunityId: candidate.id,
    scorecard: {
      status: 'evidence_only_not_scored',
      dimensions: expect.arrayContaining([
        expect.objectContaining({ key: 'demand_and_competition', status: 'partial_evidence' }),
        expect.objectContaining({ key: 'economics', status: 'partial_evidence' }),
        expect.objectContaining({ key: 'compliance', status: 'not_tracked' }),
        expect.objectContaining({ key: 'return_risk', status: 'not_tracked' }),
      ]),
    },
  });
  const sourcingPanel = page.getByRole('region', { name: 'Recorded supplier quote comparison' });
  await expect(sourcingPanel.getByText('Lowest comparable landed total:')).toBeVisible();
  await expect(sourcingPanel.getByText('QA Quote Supplier A', { exact: false })).toBeVisible();
  await expect(sourcingPanel.getByText('QA Quote Supplier B', { exact: false })).toBeVisible();
  await expect(sourcingPanel.getByText(/not an overall supplier score/)).toBeVisible();
  const validationPanel = page.getByRole('region', { name: 'Product validation scorecards' });
  await expect(validationPanel.getByText('Demand and competition')).toBeVisible();
  await expect(validationPanel.getByText('Compliance', { exact: true })).toBeVisible();
  await expect(validationPanel.getByText(/No dimension score/)).toBeVisible();
  const reconciliationPanel = page.getByRole('region', { name: 'Saved listing reconciliation review' });
  await expect(reconciliationPanel.getByText('No reconciliation check is recorded yet. This review does not contact a store.')).toBeVisible();
  await expect(reconciliationPanel.getByRole('link', { name: 'Open Reconciliation' })).toHaveAttribute('href', '/autonomous-commerce/reconciliation');
  await reconciliationPanel.screenshot({ path: testInfo.outputPath('commerce-agent-reconciliation-review.png') });
  expect(detailedRun.output.experimentReview).toMatchObject({ state: 'no_experiments', experiments: [] });
  const experimentPanel = page.getByRole('region', { name: 'Commerce experiment evidence review' });
  await expect(experimentPanel.getByText('No running or decision-stage experiments are recorded for review. Draft experiments are not included.')).toBeVisible();
  await expect(experimentPanel.getByRole('link', { name: 'Open Experiment Lab' })).toHaveAttribute('href', '/autonomous-commerce/experiment-lab');
  await experimentPanel.screenshot({ path: testInfo.outputPath('commerce-agent-experiment-review.png') });
  expect(detailedRun.output.supplierClaimReview).toMatchObject({
    state: 'available',
    totalClaims: 1,
    statusCounts: { draft: 1 },
    claims: [expect.objectContaining({ status: 'draft', currency: 'USD', recordedLossAmount: '20.75', recordedSettlementAmount: '0.00' })],
  });
  const claimPanel = page.getByRole('region', { name: 'Supplier claim evidence review' });
  await expect(claimPanel.getByRole('link', { name: 'Open Supplier Claims' })).toHaveAttribute('href', '/autonomous-commerce/supplier-claims');
  await expect(claimPanel.getByText(/Settlement amounts are recorded values and may include credits or replacements/)).toBeVisible();
  await expect(claimPanel.getByText('USD 20.75')).toBeVisible();
  await claimPanel.screenshot({ path: testInfo.outputPath('commerce-agent-supplier-claim-review.png') });
  expect(detailedRun.output.deliveryExceptionReview).toMatchObject({
    state: 'no_failed_deliveries',
    failedCount: 0,
    recentFailures: [],
  });
  const deliveryPanel = page.getByRole('region', { name: 'Recorded delivery exception review' });
  await expect(deliveryPanel.getByText('No failed deliveries are recorded for this business.')).toBeVisible();
  await expect(deliveryPanel.getByRole('link', { name: 'Open Delivery Exceptions' })).toHaveAttribute('href', '/deliveries/exceptions');
  await deliveryPanel.screenshot({ path: testInfo.outputPath('commerce-agent-delivery-follow-up.png') });
  expect(detailedRun.output.fulfillmentReview).toMatchObject({
    state: 'no_open_orders',
    totalOpenOrders: 0,
    orders: [],
  });
  const fulfillmentPanel = page.getByRole('region', { name: 'Commerce fulfillment queue review' });
  await expect(fulfillmentPanel.getByText('No open online or delivery orders with physical products are in the routing queue.')).toBeVisible();
  await expect(fulfillmentPanel.getByRole('link', { name: 'Open Fulfillment Router' })).toHaveAttribute('href', '/autonomous-commerce/fulfillment-router');
  await fulfillmentPanel.screenshot({ path: testInfo.outputPath('commerce-agent-fulfillment-queue.png') });
  await page.screenshot({ path: testInfo.outputPath('commerce-agent-sourcing-review.png'), fullPage: true });

  await page.goto('/autonomous-commerce/product-validation');
  await expect(page.getByText(`QA validation scorecard ${stamp}`)).toBeVisible();
  await page.getByRole('button', { name: 'Review evidence' }).click();
  const validationDrawer = page.getByRole('region', { name: 'Product validation evidence scorecard' });
  await expect(validationDrawer.getByText('Evidence scorecard')).toBeVisible();
  await expect(validationDrawer.getByText('Demand and competition')).toBeVisible();
  await expect(validationDrawer.getByText('Return risk')).toBeVisible();
  await expect(validationDrawer.getByText('Not scored', { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('commerce-product-validation-scorecard.png'), fullPage: true });

  const unchangedRfq = await request.get(`${API}/commerce/rfqs/${rfq.id}`, { headers });
  expect(unchangedRfq.ok(), await unchangedRfq.text()).toBeTruthy();
  expect(await unchangedRfq.json()).toMatchObject({ id: rfq.id, status: 'open', purchaseOrderId: null });
  expect(pageErrors).toEqual([]);
  expect(apiErrors).toEqual([]);
});
