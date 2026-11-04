import { expect, test } from "@playwright/test";

const API = process.env.E2E_API_URL ?? "http://127.0.0.1:5001/api/v1";

test("Period Close shows current source activity and discloses unavailable accounting checks", async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(120_000);
  const pageErrors: string[] = [];
  const serverErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.url().includes("/api/") && response.status() >= 500) {
      serverErrors.push(`${response.status()} ${response.url()}`);
    }
  });

  const stamp = Date.now();
  const email = `qa-period-close-${stamp}@example.test`;
  const password = `Period-${stamp}-Owner!`;
  const signup = await request.post(`${API}/auth/signup`, {
    data: {
      businessName: `QA Period Close ${stamp}`,
      name: "QA Period Close Owner",
      email,
      password,
      country: "US",
      currency: "USD",
    },
  });
  expect(signup.ok(), await signup.text()).toBeTruthy();
  const { accessToken } = (await signup.json()) as { accessToken: string };
  const headers = { Authorization: `Bearer ${accessToken}` };
  const moduleResponse = await request.get(`${API}/business-modules`, {
    headers,
  });
  expect(moduleResponse.ok(), await moduleResponse.text()).toBeTruthy();
  const { modules } = (await moduleResponse.json()) as {
    modules: Array<{ key: string }>;
  };
  const enabled = await request.patch(`${API}/business-modules/selection`, {
    headers,
    data: { enabled: modules.map((module) => module.key) },
  });
  expect(enabled.ok(), await enabled.text()).toBeTruthy();

  const product = await request.post(`${API}/products`, {
    headers,
    data: {
      kind: "product",
      name: `QA Close Sale ${stamp}`,
      sku: `QA-CLOSE-${stamp}`,
      costPrice: 8,
      sellingPrice: 40,
      stockQty: 3,
    },
  });
  expect(product.ok(), await product.text()).toBeTruthy();
  const { id: productId } = (await product.json()) as { id: string };
  const sale = await request.post(`${API}/sales`, {
    headers,
    data: {
      items: [{ productId, qty: 1 }],
      payment: { method: "cash", amount: 40 },
    },
  });
  expect(sale.ok(), await sale.text()).toBeTruthy();
  const { id: orderId } = (await sale.json()) as { id: string };
  const pendingReturn = await request.post(`${API}/returns`, {
    headers,
    data: {
      orderId,
      reason: `QA period close review ${stamp}`,
      refundMethod: "cash",
      items: [{ productId, qty: 1 }],
    },
  });
  expect(pendingReturn.ok(), await pendingReturn.text()).toBeTruthy();
  const expense = await request.post(`${API}/expenses`, {
    headers,
    data: {
      description: `QA period close expense ${stamp}`,
      category: "QA supplies",
      amount: 12.5,
      incurredOn: new Date().toISOString().slice(0, 10),
    },
  });
  expect(expense.ok(), await expense.text()).toBeTruthy();

  await page.goto("/login");
  await page.getByLabel("Email or phone number").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/dashboard/);
  await page.goto("/profit/period-close");

  await expect(
    page.getByRole("heading", { name: "Period Close Readiness" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: `QA Period Close ${stamp}`,
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText(/1 completed of 1 non-quotation orders/),
  ).toBeVisible();
  await expect(
    page.getByText(/1 without attached receipt evidence/),
  ).toBeVisible();
  await expect(page.getByText("Pending return requests")).toBeVisible();
  await expect(page.getByText("Not connected", { exact: true })).toBeVisible();
  await expect(page.getByText("Noxtill manual journal checks")).toBeVisible();
  await expect(page.getByText("0 balanced of 0 posted")).toBeVisible();
  await expect(page.getByText("Imported statement review")).toBeVisible();
  await expect(page.getByText("0 statement lines")).toBeVisible();
  await expect(
    page.getByText("Native bank feeds and complete bank reconciliation"),
  ).toBeVisible();
  await expect(
    page.getByText("Bank reconciliation and an authoritative accounting close"),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("period-close-readiness.png"),
    fullPage: true,
  });

  const [year, monthNumber] = new Date()
    .toISOString()
    .slice(0, 7)
    .split("-")
    .map(Number);
  const previousMonth = new Date(Date.UTC(year, monthNumber - 2, 1))
    .toISOString()
    .slice(0, 7);
  await page.getByLabel("Month").fill(previousMonth);
  await expect(
    page.getByText(/0 completed of 0 non-quotation orders/),
  ).toBeVisible();
  await expect(
    page.getByText(/0 rows · 0 without attached receipt evidence/),
  ).toBeVisible();

  expect(pageErrors).toEqual([]);
  expect(serverErrors).toEqual([]);
});
