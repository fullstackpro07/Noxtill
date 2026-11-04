import { expect, test } from '@playwright/test';

const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:5001/api/v1';

test('Finance Agent shows real expense comparisons and approved returns separately from profit', async ({ page, request }, testInfo) => {
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
  const email = `finance-agent-browser-${stamp}@example.test`;
  const password = `Finance-${stamp}-Owner!`;
  const signup = await request.post(`${API}/auth/signup`, {
    data: {
      businessName: `QA Finance Agent ${stamp}`,
      name: 'QA Finance Owner',
      email,
      password,
      country: 'US',
      currency: 'USD',
    },
  });
  expect(signup.ok(), await signup.text()).toBeTruthy();
  const { accessToken } = (await signup.json()) as { accessToken: string };
  const headers = { Authorization: `Bearer ${accessToken}` };
  const aiSettings = await request.patch(`${API}/ai/settings`, {
    headers,
    data: { featureToggles: { financeAgent: false } },
  });
  expect(aiSettings.ok(), await aiSettings.text()).toBeTruthy();
  const modules = await request.get(`${API}/business-modules`, { headers });
  expect(modules.ok(), await modules.text()).toBeTruthy();
  const { modules: available } = (await modules.json()) as {
    modules: { key: string }[];
  };
  const enabled = await request.patch(`${API}/business-modules/selection`, {
    headers,
    data: { enabled: available.map((module) => module.key) },
  });
  expect(enabled.ok(), await enabled.text()).toBeTruthy();

  const productResponse = await request.post(`${API}/products`, {
    headers,
    data: {
      kind: 'product',
      name: `QA Finance Return ${stamp}`,
      sku: `QA-FIN-RETURN-${stamp}`,
      costPrice: 10,
      sellingPrice: 40,
      stockQty: 5,
    },
  });
  expect(productResponse.ok(), await productResponse.text()).toBeTruthy();
  const product = (await productResponse.json()) as { id: string };
  const saleResponse = await request.post(`${API}/sales`, {
    headers,
    data: {
      items: [{ productId: product.id, qty: 1 }],
      payment: { method: 'cash', amount: 40 },
    },
  });
  expect(saleResponse.ok(), await saleResponse.text()).toBeTruthy();
  const sale = (await saleResponse.json()) as { id: string };
  const returnResponse = await request.post(`${API}/returns`, {
    headers,
    data: {
      orderId: sale.id,
      reason: `QA Finance return review ${stamp}`,
      refundMethod: 'cash',
      items: [{ productId: product.id, qty: 1 }],
    },
  });
  expect(returnResponse.ok(), await returnResponse.text()).toBeTruthy();
  const returnRecord = (await returnResponse.json()) as { id: string };
  const approvedReturnResponse = await request.post(
    `${API}/returns/${returnRecord.id}/approve`,
    { headers },
  );
  expect(approvedReturnResponse.ok(), await approvedReturnResponse.text()).toBeTruthy();

  const creditCustomer = await request.post(`${API}/customers`, {
    headers,
    data: {
      name: `QA Finance Aging ${stamp}`,
      phone: `+1415555${String(stamp).slice(-4)}`,
      openingBalance: 87.65,
    },
  });
  expect(creditCustomer.ok(), await creditCustomer.text()).toBeTruthy();

  const today = new Date().toISOString().slice(0, 10);
  const description = `QA exact-match expense ${stamp}`;
  for (const expense of [
    { description: ` ${description} `, category: 'Supplies', amount: 123.45 },
    {
      description: description.toUpperCase().replace(/ /g, '   '),
      category: 'Supplies',
      amount: 123.45,
    },
  ]) {
    const response = await request.post(`${API}/expenses`, {
      headers,
      data: { ...expense, incurredOn: today },
    });
    expect(response.ok(), await response.text()).toBeTruthy();
  }
  const nonCandidate = await request.post(`${API}/expenses`, {
    headers,
    data: {
      description,
      category: 'Supplies',
      amount: 123.46,
      incurredOn: today,
    },
  });
  expect(nonCandidate.ok(), await nonCandidate.text()).toBeTruthy();
  const [year, monthNumber] = today.split('-').map(Number);
  const priorMonth = new Date(Date.UTC(year, monthNumber - 2, 1))
    .toISOString()
    .slice(0, 10);
  const priorCategoryExpense = await request.post(`${API}/expenses`, {
    headers,
    data: {
      description: `QA prior category expense ${stamp}`,
      category: 'Supplies',
      amount: 90,
      incurredOn: priorMonth,
    },
  });
  expect(priorCategoryExpense.ok(), await priorCategoryExpense.text()).toBeTruthy();
  for (let monthOffset = 3; monthOffset <= 5; monthOffset += 1) {
    const baselineDate = new Date(Date.UTC(year, monthNumber - monthOffset, 1))
      .toISOString()
      .slice(0, 10);
    const baselineExpense = await request.post(`${API}/expenses`, {
      headers,
      data: {
        description: `QA monthly expense baseline ${stamp} ${monthOffset}`,
        category: 'Supplies',
        amount: 50,
        incurredOn: baselineDate,
      },
    });
    expect(baselineExpense.ok(), await baselineExpense.text()).toBeTruthy();
  }

  await page.goto('/login', { waitUntil: 'networkidle' });
  await page.getByLabel('Email or phone number').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForURL(/\/dashboard/);
  await page.goto('/profit');

  const panel = page.getByRole('region', {
    name: 'Financial Intelligence Agent',
  });
  await expect(panel.getByText('No saved financial-agent review yet.')).toBeVisible();
  const runResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith('/profit/agent-runs') &&
      response.request().method() === 'POST',
  );
  await panel.getByRole('button', { name: 'Run review' }).click();
  const runResponse = await runResponsePromise;
  expect(runResponse.ok(), await runResponse.text()).toBeTruthy();
  const run = (await runResponse.json()) as {
    output: {
      cashFlowReview: {
        status: string;
        basis: string | null;
        endingRelativeNetFlow: number | null;
      };
      creditAgingReview: {
        status: string;
        debtorCount: number | null;
        totalBalance: string | null;
      };
      expenseDuplicateReview: {
        candidateGroups: number;
        additionalEntries: number;
        additionalEntryAmount: string;
      };
      periodVariance: {
        status: string;
        currentMonth: string | null;
        priorMonth: string | null;
        metrics: { expensesAndWastage: { delta: number } | null };
      };
      expenseCategoryVariance: {
        categoryCount: number;
        omittedCategoryCount: number;
        categories: {
          businessName: string;
          category: string;
          currentAmount: string;
          priorAmount: string;
          difference: string;
        }[];
      };
      expenseAnomalyReview: {
        candidateCount: number;
        candidates: {
          businessName: string;
          category: string;
          currentAmount: string;
          baselineMedian: string;
          reviewThreshold: string;
          amountAboveThreshold: string;
          observedBaselineMonths: number;
        }[];
      };
      approvedReturnReview: {
        status: string;
        source: string;
        calendarMonth: string;
        approvedCount: number;
        refundAmountTotal: string;
        byMethod: { method: string; count: number; amount: string }[];
      };
    };
  };
  expect(run.output.expenseDuplicateReview).toMatchObject({
    candidateGroups: 1,
    additionalEntries: 1,
    additionalEntryAmount: '123.45',
  });
  expect(run.output.cashFlowReview).toMatchObject({
    status: 'available',
    basis: 'relative_net_flow_not_bank_balance',
  });
  expect(run.output.creditAgingReview).toMatchObject({
    status: 'available',
    debtorCount: 1,
    totalBalance: '87.65',
  });
  expect(run.output.periodVariance).toMatchObject({
    status: 'available',
    currentMonth: new Date().toISOString().slice(0, 7),
    metrics: { expensesAndWastage: { delta: expect.any(Number) } },
  });
  expect(run.output.expenseCategoryVariance.categories).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        businessName: `QA Finance Agent ${stamp}`,
        category: 'Supplies',
        currentAmount: '370.36',
        priorAmount: '90.00',
        difference: '280.36',
      }),
    ]),
  );
  expect(run.output.expenseAnomalyReview).toMatchObject({
    candidateCount: 1,
    candidates: [
      expect.objectContaining({
        businessName: `QA Finance Agent ${stamp}`,
        category: 'Supplies',
        currentAmount: '370.36',
        baselineMedian: '50.00',
        reviewThreshold: '50.00',
        amountAboveThreshold: '320.36',
        observedBaselineMonths: 4,
      }),
    ],
  });
  expect(run.output.approvedReturnReview).toMatchObject({
    status: 'available',
    source: 'Return',
    calendarMonth: new Date().toISOString().slice(0, 7),
    approvedCount: 1,
    refundAmountTotal: '40.00',
    byMethod: [{ method: 'cash', count: 1, amount: '40.00' }],
  });
  await expect(panel.getByText(/1 candidate groups · 1 additional entries/)).toBeVisible();
  await expect(panel.getByText(/A match is not proof of a duplicate or fraud/)).toBeVisible();
  await expect(panel.getByText(/30-day projected cumulative net flow:/)).toBeVisible();
  await expect(panel.getByText('Month-over-month variance')).toBeVisible();
  await expect(panel.getByText('Expense category movement')).toBeVisible();
  await expect(panel.getByText(/Differences describe the records only; they do not explain why spending changed/)).toBeVisible();
  await expect(panel.getByText(/Supplies/).first()).toBeVisible();
  await expect(panel.getByText(/Differences describe the recorded totals; they do not explain the cause/)).toBeVisible();
  const anomalyReview = panel.getByLabel('Expense anomaly review');
  await expect(anomalyReview.getByText(/1 category pattern\(s\) crossed the comparison rule/)).toBeVisible();
  await expect(anomalyReview.getByText(/not a calibrated probability/)).toBeVisible();
  const anomalyExpensesLink = anomalyReview.getByRole('link', { name: 'Review expenses' });
  await expect(anomalyExpensesLink).toHaveAttribute(
    'href',
    `/expenses?month=${new Date().toISOString().slice(0, 7)}&category=Supplies`,
  );
  const approvedReturnSummary = panel.getByText(/1 approved return · \$40 recorded for \d{4}-\d{2}/);
  await expect(approvedReturnSummary).toBeVisible();
  await expect(panel.getByText(/Approval alone does not prove a provider settlement or cash payout/)).toBeVisible();
  await approvedReturnSummary.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath('finance-agent-approved-returns.png'),
    fullPage: true,
  });
  await expect(panel.getByRole('link', { name: 'Open Cash Flow' })).toHaveAttribute('href', '/profit/cash-flow');
  await expect(panel.getByText(/1 customers · \$88 outstanding in the Credit module/)).toBeVisible();
  await expect(panel.getByText(/Age is since the balance last reached zero or the first credit entry/)).toBeVisible();
  const creditLink = panel.getByRole('link', { name: 'Review in Credit' });
  await expect(creditLink).toHaveAttribute('href', '/credit');
  const expensesLink = panel.locator('a[href*="review=exact-match"]');
  const reviewedMonth = new Date().toISOString().slice(0, 7);
  await expect(expensesLink).toHaveAttribute('href', `/expenses?month=${reviewedMonth}&review=exact-match`);
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath('finance-agent-expense-candidates.png'),
    fullPage: true,
  });
  await expensesLink.click();
  await expect(page).toHaveURL(new RegExp(`/expenses\\?month=${reviewedMonth}&review=exact-match$`));
  await expect(page.getByLabel('Month')).toHaveValue(reviewedMonth);
  const candidateReview = page.getByRole('region', { name: 'Potential exact-match expense candidates' });
  await expect(candidateReview.getByText(/1 candidate group · 1 additional entry/)).toBeVisible();
  await expect(page.locator('tbody tr')).toHaveCount(2);
  await expect(page.getByText('Potential match · not confirmed')).toHaveCount(2);
  await page.screenshot({
    path: testInfo.outputPath('finance-agent-candidate-expenses.png'),
    fullPage: true,
  });
  await expect(page.getByText('By category', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add Expense' })).toBeVisible();
  await page.goto('/profit');
  const currentAnomalyReview = page.getByRole('region', { name: 'Financial Intelligence Agent' }).getByLabel('Expense anomaly review');
  await currentAnomalyReview.getByRole('link', { name: 'Review expenses' }).click();
  await expect(page).toHaveURL(/\/expenses\?month=\d{4}-\d{2}&category=Supplies$/);
  await expect(page.getByLabel('Category')).toHaveValue('Supplies');
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await page.goto('/profit');
  await expect(page.getByRole('region', { name: 'Financial Intelligence Agent' }).getByRole('link', { name: 'Review in Credit' })).toBeVisible();
  await page.getByRole('region', { name: 'Financial Intelligence Agent' }).getByRole('link', { name: 'Review in Credit' }).click();
  await expect(page).toHaveURL(/\/credit$/);
  await expect(
    page.getByRole('button', { name: `QA Finance Aging ${stamp}` }),
  ).toBeVisible();

  expect(pageErrors).toEqual([]);
  expect(apiErrors).toEqual([]);
});
