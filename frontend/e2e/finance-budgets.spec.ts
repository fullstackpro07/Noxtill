import { expect, test } from '@playwright/test';

const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:5001/api/v1';
const BUDGETS_API = process.env.E2E_BUDGETS_API_URL;

test('Finance budgets save, submit and approve against real expense rows', async ({ page, request }, testInfo) => {
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

  await page.goto('/dashboard');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  const token = await page.evaluate(() => {
    const stored = window.localStorage.getItem('noxtill-auth');
    if (!stored) return null;
    return (JSON.parse(stored) as { state?: { accessToken?: string } }).state
      ?.accessToken;
  });
  expect(token).toBeTruthy();

  const stamp = Date.now();
  const category = `QA Budget ${stamp}`;
  const today = new Date().toISOString().slice(0, 10);
  const expense = await request.post(`${API}/expenses`, {
    headers: { Authorization: `Bearer ${token}` },
    data: {
      description: `Recorded expense for QA budget ${stamp}`,
      category,
      amount: 42,
      incurredOn: today,
    },
  });
  expect(expense.ok(), await expense.text()).toBeTruthy();

  if (BUDGETS_API) await page.route('**/api/v1/profit/budgets**', (route) => {
    return (async () => {
      const original = route.request();
      const requestUrl = new URL(original.url());
      const targetUrl = new URL(BUDGETS_API);
      targetUrl.pathname = `${targetUrl.pathname.replace(/\/$/, '')}${requestUrl.pathname.replace(/^\/api\/v1/, '')}`;
      targetUrl.search = requestUrl.search;
      const upstream = await request.fetch(targetUrl.toString(), {
        method: original.method(),
        headers: original.headers(),
        data: original.postDataBuffer() ?? undefined,
      });
      const body = await upstream.body();
      await route.fulfill({
        status: upstream.status(),
        headers: {
          'content-type': upstream.headers()['content-type'] ?? 'application/json',
        },
        body,
      });
    })();
  });
  await page.goto('/profit');

  const panel = page.getByRole('region', {
    name: 'Finance budgets and actual expenses',
  });
  await expect(panel.getByText(category)).toBeVisible();
  await expect(panel.getByText('$42', { exact: true })).toBeVisible();
  await panel.getByLabel('Expense budget category').fill(category);
  await panel.getByLabel('Monthly budget amount').fill('30.00');
  await panel.getByLabel('Budget note').fill('Browser QA approval-flow check');
  const saveResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith('/profit/budgets') &&
      response.request().method() === 'POST',
  );
  await panel.getByRole('button', { name: 'Save draft' }).click();
  expect((await saveResponse).ok()).toBeTruthy();

  const row = panel.locator('tbody tr').filter({ hasText: category });
  await expect(row.getByText('draft')).toBeVisible();
  const submitResponse = page.waitForResponse(
    (response) =>
      response.url().match(/\/profit\/budgets\/[^/]+\/submit$/) !== null,
  );
  await row.getByRole('button', { name: 'Submit' }).click();
  expect((await submitResponse).ok()).toBeTruthy();
  await expect(row.getByText('pending approval')).toBeVisible();
  await row.getByRole('button', { name: 'Approve' }).click();
  await row.getByLabel(/approve reason/).fill('Approved for browser QA verification');
  const approvalResponse = page.waitForResponse(
    (response) =>
      response.url().match(/\/profit\/budgets\/[^/]+\/approve$/) !== null,
  );
  await row.getByRole('button', { name: 'Record decision' }).click();
  expect((await approvalResponse).ok()).toBeTruthy();

  await expect(row.getByText('approved', { exact: true })).toBeVisible();
  await expect(row.getByText('$30', { exact: true })).toBeVisible();
  await expect(row.getByText('$42', { exact: true })).toBeVisible();
  await expect(row.getByText('Over $12')).toBeVisible();
  await expect(row.getByText('Approved for browser QA verification')).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('finance-budgets-approved.png'),
    fullPage: true,
  });

  expect(pageErrors).toEqual([]);
  expect(apiErrors).toEqual([]);
});
