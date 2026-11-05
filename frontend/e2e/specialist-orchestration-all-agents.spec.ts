import { expect, test } from '@playwright/test';

const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:5001/api/v1';
const AGENT_KEYS = [
  'inventory_intelligence',
  'financial_intelligence',
  'customer_intelligence',
  'seo_autopilot',
  'autonomous_commerce',
] as const;

test('cross-agent review completes all five enabled specialist reviews without provider calls', async ({ page, request }, testInfo) => {
  test.setTimeout(180_000);
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
  const email = `specialist-all-${stamp}@example.test`;
  const password = `Qa-${stamp}-Owner!`;
  const signup = await request.post(`${API}/auth/signup`, {
    data: {
      businessName: `QA All Specialist Agents ${stamp}`,
      name: 'QA All Specialist Agents Owner',
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

  const accessPolicies = await request.put(`${API}/settings/hub/changes`, {
    headers,
    data: {
      changes: [
        { category: 'ai', rowKey: 'specialist-agent-inventory-enabled', value: true },
        { category: 'ai', rowKey: 'specialist-agent-finance-enabled', value: true },
        { category: 'ai', rowKey: 'specialist-agent-customer-enabled', value: true },
        { category: 'ai', rowKey: 'specialist-agent-seo-enabled', value: true },
        { category: 'ai', rowKey: 'specialist-agent-commerce-enabled', value: true },
        { category: 'automations', rowKey: 'commerce-autonomy', value: 1 },
      ],
    },
  });
  expect(accessPolicies.ok(), await accessPolicies.text()).toBeTruthy();

  const aiSettings = await request.patch(`${API}/ai/settings`, {
    headers,
    data: {
      featureToggles: {
        inventoryAgent: false,
        financeAgent: false,
        customerAgent: false,
        seoAgent: false,
        commerceAgent: false,
      },
    },
  });
  expect(aiSettings.ok(), await aiSettings.text()).toBeTruthy();

  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByLabel('Email or phone number').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/dashboard/);
  await page.goto('/assistant/settings');

  const review = page.getByRole('region', { name: 'Cross-agent review' });
  await expect(review).toBeVisible();
  const startPromise = page.waitForResponse((response) =>
    response.url().endsWith('/ai/specialist-orchestrations') &&
    response.request().method() === 'POST',
  );
  await review.getByRole('button', { name: 'Run enabled agents' }).click();
  const startResponse = await startPromise;
  expect(startResponse.ok(), await startResponse.text()).toBeTruthy();
  const started = await startResponse.json() as { id: string };

  let completedRun: {
    id: string;
    status: string;
    result: {
      aiProviderCalls: number;
      completedCount: number;
      children: { agentKey: string; status: string; runId: string | null }[];
    } | null;
  } | undefined;
  await expect.poll(async () => {
    const response = await request.get(`${API}/ai/specialist-orchestrations`, { headers });
    if (!response.ok()) return null;
    const result = await response.json() as { runs: NonNullable<typeof completedRun>[] };
    completedRun = result.runs.find((run) => run.id === started.id);
    return completedRun?.status ?? null;
  }, { timeout: 60_000 }).toBe('completed');

  expect(completedRun?.result?.aiProviderCalls).toBe(0);
  expect(completedRun?.result?.completedCount).toBe(AGENT_KEYS.length);
  expect(completedRun?.result?.children.map((child) => child.agentKey)).toEqual(AGENT_KEYS);
  expect(completedRun?.result?.children).toEqual(
    AGENT_KEYS.map((agentKey) => expect.objectContaining({
      agentKey,
      status: 'completed',
      runId: expect.any(String),
    })),
  );

  await page.reload();
  await expect(review.getByText(`trace ${started.id.slice(0, 8)}`)).toBeVisible();
  for (const agentKey of AGENT_KEYS) {
    await expect(review.getByText(new RegExp(agentKey.replaceAll('_', ' '), 'i'))).toBeVisible();
  }
  await page.screenshot({ path: testInfo.outputPath('all-five-specialist-reviews.png'), fullPage: true });
  const operations = page.getByRole('region', { name: 'Specialist agent operations' });
  await expect(operations.getByText(/Proposal revisions: 0 · Approval events:/)).toHaveCount(AGENT_KEYS.length);
  const commerceOperationsRow = operations.getByRole('row').filter({ hasText: 'Autonomous Commerce' });
  await expect(commerceOperationsRow.getByText('No completed or failed Commerce registry calls measured')).toBeVisible();
  await expect(
    operations.getByText('Execution time · p50 / p95', { exact: true }),
  ).toBeVisible();
  const queuePickup = page.getByRole('region', {
    name: 'Cross-agent worker pickup',
  });
  await queuePickup.scrollIntoViewIfNeeded();
  await expect(queuePickup).toBeVisible();
  await expect(queuePickup).toContainText(
    /Saved review to first worker pickup: \d+ ms p50 \/ \d+ ms p95/,
  );
  await queuePickup.screenshot({
    path: testInfo.outputPath('cross-agent-queue-pickup-metrics.png'),
  });
  await expect(operations.getByText(/\d+ user-initiated operators in this 30-day window/)).toHaveCount(AGENT_KEYS.length);
  await expect(
    operations.getByText('Action execution time: No complete action execution measured'),
  ).toHaveCount(AGENT_KEYS.length);
  await expect(
    operations.getByText(/Open actions awaiting attention · business-wide: 0 · none currently open/),
  ).toHaveCount(AGENT_KEYS.length);
  await expect(operations.getByText('Audited Commerce tool blocks · business-wide', { exact: true })).toBeVisible();
  await expect(operations.getByText('Audited Commerce approval refusals · business-wide', { exact: true })).toBeVisible();
  await expect(operations.getByText('Audited Customer Agent message queue refusals · business-wide', { exact: true })).toBeVisible();
  await page.goto('/assistant/settings');
  const runHistory = page.getByRole('region', { name: 'Recent specialist runs' });
  await runHistory.scrollIntoViewIfNeeded();
  await expect(runHistory.getByRole('button', { name: 'View events' }).first()).toBeVisible();
  const lifecycleResponsePromise = page.waitForResponse((response) =>
    /\/agent-runs\/[^/]+\/events$/.test(new URL(response.url()).pathname),
  );
  await runHistory.getByRole('button', { name: 'View events' }).first().click();
  const lifecycleResponse = await lifecycleResponsePromise;
  expect(lifecycleResponse.ok(), await lifecycleResponse.text()).toBeTruthy();
  const lifecycle = await lifecycleResponse.json() as {
    items: { eventName: string }[];
    eventHistoryNote: string;
    payloadValuesRedacted: boolean;
  };
  expect(lifecycle.payloadValuesRedacted).toBe(true);
  expect(lifecycle.items.map((event) => event.eventName)).toContain('agent.run.created');
  await expect(runHistory.getByText('agent.run.created', { exact: true }).first()).toBeVisible();
  await expect(runHistory.getByRole('note')).toContainText(
    /Intermediate run-state changes and non-action activity are not captured/i,
  );
  await runHistory.screenshot({
    path: testInfo.outputPath('specialist-run-lifecycle-events.png'),
  });
  await page.goto('/settings/ai');
  const perRunLimit = page.getByRole('button', {
    name: /Maximum AI provider requests per specialist run/,
  });
  await expect(perRunLimit).toContainText('10 requests / run');
  await perRunLimit.click();
  const perRunLimitInput = page.getByRole('spinbutton', {
    name: 'Maximum AI provider requests per specialist run',
  });
  await perRunLimitInput.fill('1');
  const savePerRunLimit = page.waitForResponse(
    (response) =>
      response.url().endsWith('/settings/hub/changes') &&
      response.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'Save change' }).click({ force: true });
  expect((await savePerRunLimit).ok()).toBeTruthy();
  await expect(perRunLimit).toContainText('1 request / run');
  await page.screenshot({
    path: testInfo.outputPath('specialist-provider-request-limit.png'),
    fullPage: true,
  });
  await perRunLimit.click();
  await page
    .getByRole('spinbutton', {
      name: 'Maximum AI provider requests per specialist run',
    })
    .fill('10');
  const resetPerRunLimit = page.waitForResponse(
    (response) =>
      response.url().endsWith('/settings/hub/changes') &&
      response.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'Save change' }).click();
  expect((await resetPerRunLimit).ok()).toBeTruthy();
  await expect(perRunLimit).toContainText('10 requests / run');

  const outputTokenLimit = page.getByRole('button', {
    name: /Maximum output tokens per specialist AI request/,
  });
  await expect(outputTokenLimit).toContainText('1024 output tokens / request');
  await outputTokenLimit.click();
  const outputTokenLimitInput = page.getByRole('spinbutton', {
    name: 'Maximum output tokens per specialist AI request',
  });
  await outputTokenLimitInput.fill('256');
  const saveOutputTokenLimit = page.waitForResponse(
    (response) =>
      response.url().endsWith('/settings/hub/changes') &&
      response.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'Save change' }).click();
  expect((await saveOutputTokenLimit).ok()).toBeTruthy();
  await expect(outputTokenLimit).toContainText('256 output tokens / request');
  await outputTokenLimit.click();
  await page
    .getByRole('spinbutton', {
      name: 'Maximum output tokens per specialist AI request',
    })
    .fill('1024');
  const resetOutputTokenLimit = page.waitForResponse(
    (response) =>
      response.url().endsWith('/settings/hub/changes') &&
      response.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'Save change' }).click();
  expect((await resetOutputTokenLimit).ok()).toBeTruthy();
  await expect(outputTokenLimit).toContainText('1024 output tokens / request');
  const inputByteLimit = page.getByRole('button', {
    name: /Maximum serialized input size per specialist AI request/,
  });
  await expect(inputByteLimit).toContainText('1,048,576 bytes / request');
  await inputByteLimit.click();
  const inputByteLimitInput = page.getByRole('spinbutton', {
    name: 'Maximum serialized input size per specialist AI request',
  });
  await inputByteLimitInput.fill('8192');
  const saveInputByteLimit = page.waitForResponse(
    (response) =>
      response.url().endsWith('/settings/hub/changes') &&
      response.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'Save change' }).click();
  expect((await saveInputByteLimit).ok()).toBeTruthy();
  await expect(inputByteLimit).toContainText('8,192 bytes / request');
  await inputByteLimit.click();
  await page
    .getByRole('spinbutton', {
      name: 'Maximum serialized input size per specialist AI request',
    })
    .fill('1048576');
  const resetInputByteLimit = page.waitForResponse(
    (response) =>
      response.url().endsWith('/settings/hub/changes') &&
      response.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'Save change' }).click();
  expect((await resetInputByteLimit).ok()).toBeTruthy();
  await expect(inputByteLimit).toContainText('1,048,576 bytes / request');

  const cancelledAppointmentReviewSetting = page.getByRole('button', {
    name: /Review customer context after appointment cancellations/,
  });
  await expect(cancelledAppointmentReviewSetting).toContainText('Manual only');
  await cancelledAppointmentReviewSetting.click();
  const cancelledAppointmentReviewToggle = page
    .getByRole('dialog', { name: 'Setting details' })
    .getByRole('switch', {
      name: 'Review customer context after appointment cancellations',
    });
  await expect(cancelledAppointmentReviewToggle).toHaveAttribute(
    'aria-checked',
    'false',
  );
  await cancelledAppointmentReviewToggle.click();
  const saveCancelledAppointmentReview = page.waitForResponse(
    (response) =>
      response.url().endsWith('/settings/hub/changes') &&
      response.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'Save change' }).click();
  expect((await saveCancelledAppointmentReview).ok()).toBeTruthy();
  await expect(cancelledAppointmentReviewSetting).toContainText(
    'Cancellation review on',
  );
  await expect(
    cancelledAppointmentReviewSetting.getByRole('switch', {
      name: 'Review customer context after appointment cancellations',
    }),
  ).toHaveAttribute('aria-checked', 'true');

  await cancelledAppointmentReviewSetting.click();
  const disableCancelledAppointmentReviewToggle = page
    .getByRole('dialog', { name: 'Setting details' })
    .getByRole('switch', {
      name: 'Review customer context after appointment cancellations',
    });
  await expect(disableCancelledAppointmentReviewToggle).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await disableCancelledAppointmentReviewToggle.click();
  const disableCancelledAppointmentReview = page.waitForResponse(
    (response) =>
      response.url().endsWith('/settings/hub/changes') &&
      response.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'Save change' }).click();
  expect((await disableCancelledAppointmentReview).ok()).toBeTruthy();
  await expect(cancelledAppointmentReviewSetting).toContainText('Manual only');
  await expect(
    cancelledAppointmentReviewSetting.getByRole('switch', {
      name: 'Review customer context after appointment cancellations',
    }),
  ).toHaveAttribute('aria-checked', 'false');

  const transferReviewSetting = page.getByRole('button', {
    name: /Review inventory after branch transfers/,
  });
  await expect(transferReviewSetting).toContainText('Manual only');
  await transferReviewSetting.click();
  const transferReviewToggle = page
    .getByRole('dialog', { name: 'Setting details' })
    .getByRole('switch', { name: 'Review inventory after branch transfers' });
  await expect(transferReviewToggle).toHaveAttribute('aria-checked', 'false');
  await transferReviewToggle.click();
  const saveTransferReview = page.waitForResponse(
    (response) =>
      response.url().endsWith('/settings/hub/changes') &&
      response.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'Save change' }).click();
  expect((await saveTransferReview).ok()).toBeTruthy();
  await expect(transferReviewSetting).toContainText('Transfer review on');
  await expect(
    transferReviewSetting.getByRole('switch', {
      name: 'Review inventory after branch transfers',
    }),
  ).toHaveAttribute('aria-checked', 'true');

  await transferReviewSetting.click();
  const disableTransferReviewToggle = page
    .getByRole('dialog', { name: 'Setting details' })
    .getByRole('switch', { name: 'Review inventory after branch transfers' });
  await expect(disableTransferReviewToggle).toHaveAttribute('aria-checked', 'true');
  await disableTransferReviewToggle.click();
  const disableTransferReview = page.waitForResponse(
    (response) =>
      response.url().endsWith('/settings/hub/changes') &&
      response.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'Save change' }).click();
  expect((await disableTransferReview).ok()).toBeTruthy();
  await expect(transferReviewSetting).toContainText('Manual only');
  await expect(
    transferReviewSetting.getByRole('switch', {
      name: 'Review inventory after branch transfers',
    }),
  ).toHaveAttribute('aria-checked', 'false');

  const wastageReviewSetting = page.getByRole('button', {
    name: /Review inventory after recorded wastage/,
  });
  await expect(wastageReviewSetting).toContainText('Manual only');
  await wastageReviewSetting.click();
  const wastageReviewToggle = page
    .getByRole('dialog', { name: 'Setting details' })
    .getByRole('switch', { name: 'Review inventory after recorded wastage' });
  await expect(wastageReviewToggle).toHaveAttribute('aria-checked', 'false');
  await wastageReviewToggle.click();
  const saveWastageReview = page.waitForResponse(
    (response) =>
      response.url().endsWith('/settings/hub/changes') &&
      response.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'Save change' }).click();
  expect((await saveWastageReview).ok()).toBeTruthy();
  await expect(wastageReviewSetting).toContainText('Wastage review on');
  await expect(
    wastageReviewSetting.getByRole('switch', {
      name: 'Review inventory after recorded wastage',
    }),
  ).toHaveAttribute('aria-checked', 'true');

  await wastageReviewSetting.click();
  const disableWastageReviewToggle = page
    .getByRole('dialog', { name: 'Setting details' })
    .getByRole('switch', { name: 'Review inventory after recorded wastage' });
  await expect(disableWastageReviewToggle).toHaveAttribute('aria-checked', 'true');
  await disableWastageReviewToggle.click({ force: true });
  const disableWastageReview = page.waitForResponse(
    (response) =>
      response.url().endsWith('/settings/hub/changes') &&
      response.request().method() === 'PUT',
  );
  await page.getByRole('button', { name: 'Save change' }).click();
  expect((await disableWastageReview).ok()).toBeTruthy();
  await expect(wastageReviewSetting).toContainText('Manual only');
  await expect(
    wastageReviewSetting.getByRole('switch', {
      name: 'Review inventory after recorded wastage',
    }),
  ).toHaveAttribute('aria-checked', 'false');
  await page.screenshot({
    path: testInfo.outputPath('inventory-event-review-settings.png'),
    fullPage: true,
  });

  await page.goto('/customers/insights');
  await expect(
    page.getByRole('heading', { name: 'Customer Intelligence Agent' }),
  ).toBeVisible();
  const customerReviewResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/analytics/customers/agent-runs') &&
      response.request().method() === 'POST',
  );
  await page.getByRole('button', { name: 'Run review' }).click();
  expect((await customerReviewResponse).ok()).toBeTruthy();
  const customerFeedback = page
    .getByRole('status')
    .filter({ hasText: 'Customer-linked review responses · last 90 days' });
  await expect(customerFeedback).toBeVisible();
  await expect(
    customerFeedback.getByText(
      /0 submitted · average Not available · 0 routed public · 0 routed private/,
    ),
  ).toBeVisible();
  await expect(
    customerFeedback.getByText(/External platform reviews are not linked to CRM customers here/),
  ).toBeVisible();
  const channelConsent = page.getByText(
    'Latest recorded channel consent in this audience',
  );
  await expect(channelConsent).toBeVisible();
  await expect(
    page.getByText(/email: 0 granted · 0 granted with destination on file · 0 revoked · 0 unknown/),
  ).toBeVisible();
  await expect(
    page.getByText(/sms: 0 granted · 0 granted with destination on file · 0 revoked · 0 unknown/),
  ).toBeVisible();
  await expect(
    page.getByText(/whatsapp: 0 granted · 0 granted with destination on file · 0 revoked · 0 unknown/),
  ).toBeVisible();
  await expect(
    page.getByText(/Recorded channel consent is context, not send authorization/),
  ).toBeVisible();
  const followUpOutcomes = page
    .getByRole('status')
    .filter({ hasText: 'Staff-recorded follow-up outcomes · last 90 days' });
  await expect(followUpOutcomes).toBeVisible();
  await expect(
    followUpOutcomes.getByText(/0 completed · 0 with an outcome · 0 without an outcome/),
  ).toBeVisible();
  await expect(
    followUpOutcomes.getByText(/not provider-confirmed message delivery/),
  ).toBeVisible();
  const followUpDelivery = page
    .getByRole('status')
    .filter({ hasText: 'Linked follow-up message delivery · last 90 days' });
  await expect(followUpDelivery).toBeVisible();
  await expect(
    followUpDelivery.getByText(
      /0 linked drafts · 0 provider-confirmed delivered\/read · 0 provider-reported failed · 0 queued\/sent without confirmation/,
    ),
  ).toBeVisible();
  await expect(
    followUpDelivery.getByText(/Delivered\/read are provider-confirmed/),
  ).toBeVisible();

  const specialistPages = [
    {
      route: '/inventory/reorder-suggestions',
      heading: 'Inventory Intelligence Agent',
    },
    { route: '/profit', heading: 'Financial Intelligence Agent' },
    {
      route: '/marketing/seo-autopilot/agent-workspace',
      heading: 'SEO Autopilot Agent',
    },
    {
      route: '/autonomous-commerce/agent-tools',
      heading: 'Product sourcing readiness',
    },
  ];
  for (const specialistPage of specialistPages) {
    await page.goto(specialistPage.route, { waitUntil: 'domcontentloaded' });
    await expect(
      page.getByRole('heading', {
        name: specialistPage.heading,
        exact: true,
      }),
    ).toBeVisible();
  }

  expect(pageErrors).toEqual([]);
  expect(apiErrors).toEqual([]);
});
