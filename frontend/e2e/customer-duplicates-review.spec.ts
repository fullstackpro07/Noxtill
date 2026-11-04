import { expect, test } from '@playwright/test';

const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:5001/api/v1';

test('duplicate review shows exact match evidence and conflicting customer fields', async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const healthUrl = API.replace(/\/api\/v1$/, '');
  await expect
    .poll(async () => {
      try {
        return (await request.get(`${healthUrl}/health`)).status();
      } catch {
        return 0;
      }
    })
    .toBe(200);

  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.url().includes('/api/') && response.status() >= 500) {
      errors.push(`${response.status()} ${response.url()}`);
    }
  });

  const stamp = Date.now();
  const email = `duplicate-review-${stamp}@example.test`;
  const password = `Qa-${stamp}-Owner!`;
  const signup = await request.post(`${API}/auth/signup`, {
    data: {
      businessName: `QA Customer Duplicate Review ${stamp}`,
      name: 'QA Duplicate Review Owner',
      email,
      password,
      country: 'US',
      currency: 'USD',
    },
  });
  expect(signup.ok(), await signup.text()).toBeTruthy();
  const { accessToken } = (await signup.json()) as { accessToken: string };
  const headers = { Authorization: `Bearer ${accessToken}` };

  const createdCustomers: { id: string; phone: string }[] = [];

  try {
    const customerA = await request.post(`${API}/customers`, {
      headers,
      data: {
        name: `QA Duplicate A ${stamp}`,
        phone: '+14155550101',
        email: `shared-${stamp}@example.test`,
        address: '1 QA Test Avenue',
      },
    });
    expect(customerA.ok(), await customerA.text()).toBeTruthy();
    createdCustomers.push({
      id: (await customerA.json()).id as string,
      phone: '+14155550101',
    });
    const customerB = await request.post(`${API}/customers`, {
      headers,
      data: {
        name: `QA Duplicate B ${stamp}`,
        phone: '+14155550102',
        email: `shared-${stamp}@example.test`,
        address: '2 QA Test Avenue',
      },
    });
    expect(customerB.ok(), await customerB.text()).toBeTruthy();
    createdCustomers.push({
      id: (await customerB.json()).id as string,
      phone: '+14155550102',
    });

    await page.goto('/login', { waitUntil: 'networkidle' });
    await page.getByLabel('Email or phone number').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.waitForURL(/\/dashboard/);
    await page.route('**/api/v1/customers/duplicates', async (route) => {
      const response = await request.get(`${API}/customers/duplicates`, {
        headers,
      });
      await route.fulfill({ response });
    });

    await page.goto('/customers/duplicates', { waitUntil: 'networkidle' });
    await expect(page.getByText(`QA Duplicate A ${stamp}`)).toBeVisible();
    await expect(page.getByText(`QA Duplicate B ${stamp}`)).toBeVisible();
    await expect(
      page.getByText('Email matches after trimming spaces and ignoring case'),
    ).toBeVisible();
    await expect(page.getByText('name, phone, address')).toBeVisible();

    await page.getByRole('button', { name: 'Review & Merge' }).click();
    await expect(page.getByRole('heading', { name: 'Review & Merge' })).toBeVisible();
    await expect(page.getByText('Address · 1 QA Test Avenue').last()).toBeVisible();
    await expect(page.getByText('Address · 2 QA Test Avenue').last()).toBeVisible();
  } finally {
    for (const customer of createdCustomers) {
      const erase = await request.delete(`${API}/customers/${customer.id}`, {
        headers,
        data: { confirm: customer.phone },
      });
      expect(erase.ok(), await erase.text()).toBeTruthy();
    }
  }

  expect(errors).toEqual([]);
});
