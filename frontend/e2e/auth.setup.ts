import { expect, test as setup } from "@playwright/test";

const API = process.env.E2E_API_URL ?? "http://127.0.0.1:5001/api/v1";

/** Signs up a fresh QA business, enables every module, then logs in through the real form. */
setup("sign up a QA business and log in", async ({ page, request }) => {
  const stamp = Date.now();
  const email = `e2e-module21-${stamp}@example.com`;
  const password = `E2e-${stamp}-Pass!`;
  const signup = await request.post(`${API}/auth/signup`, {
    data: { businessName: `E2E Module21 QA ${stamp}`, name: "E2E QA Owner", email, password, country: "US", currency: "USD" },
  });
  expect(signup.ok(), await signup.text()).toBeTruthy();
  const { accessToken } = (await signup.json()) as { accessToken: string };
  const headers = { Authorization: `Bearer ${accessToken}` };
  const modules = await request.get(`${API}/business-modules`, { headers });
  expect(modules.ok()).toBeTruthy();
  const { modules: list } = (await modules.json()) as { modules: { key: string }[] };
  const enable = await request.patch(`${API}/business-modules/selection`, {
    headers,
    data: { enabled: list.map((m) => m.key) },
  });
  expect(enable.ok(), await enable.text()).toBeTruthy();

  await page.goto("/login");
  await page.getByLabel("Email or phone number").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/dashboard/);
  await page.context().storageState({ path: "e2e-results/.auth/qa-owner.json" });
});
