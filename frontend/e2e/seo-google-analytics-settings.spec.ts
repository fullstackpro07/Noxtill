import { expect, test } from "@playwright/test";

const API = process.env.E2E_API_URL ?? "http://127.0.0.1:5001/api/v1";

test("SEO settings honestly shows GA4 as disconnected until a business connects it", async ({
  page,
  request,
}) => {
  test.setTimeout(90_000);
  const healthUrl = API.replace(/\/api\/v1$/, "");
  await expect
    .poll(
      async () => {
        try {
          return (await request.get(`${healthUrl}/health`)).status();
        } catch {
          return 0;
        }
      },
      { timeout: 30_000 },
    )
    .toBe(200);

  const pageErrors: string[] = [];
  const apiErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.url().includes("/api/") && response.status() >= 500) {
      apiErrors.push(`${response.status()} ${response.url()}`);
    }
  });

  const stamp = Date.now();
  const email = `seo-ga4-settings-${stamp}@example.test`;
  const password = `Qa-${stamp}-Owner!`;
  const signup = await request.post(`${API}/auth/signup`, {
    data: {
      businessName: `QA SEO GA4 ${stamp}`,
      name: "QA SEO GA4 Owner",
      email,
      password,
      country: "US",
      currency: "USD",
    },
  });
  expect(signup.ok(), await signup.text()).toBeTruthy();
  const { accessToken } = (await signup.json()) as { accessToken: string };
  const headers = { Authorization: `Bearer ${accessToken}` };
  const providers = await request.get(`${API}/integrations`, { headers });
  expect(providers.ok(), await providers.text()).toBeTruthy();
  expect(await providers.json()).toContainEqual({
    provider: "google_analytics",
    status: "not_connected",
    updatedAt: null,
  });

  await page.goto("/login", { waitUntil: "networkidle" });
  await page.getByLabel("Email or phone number").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/dashboard/);
  await page.goto("/marketing/seo-autopilot/settings");

  const card = page.getByTestId("seo-analytics-attribution");
  await expect(card).toBeVisible();
  await expect(
    card.getByRole("heading", { name: "Google Analytics 4" }),
  ).toBeVisible();
  await expect(card.getByText("Not connected", { exact: true })).toBeVisible();
  await expect(
    card.getByRole("link", { name: "Integrations" }),
  ).toHaveAttribute("href", "/integrations");
  await expect(card).toContainText("read-only Analytics access");

  await page.goto("/marketing/seo-autopilot/reports");
  await expect(
    page.getByText("Google Analytics 4 · latest 28-day windows"),
  ).toBeVisible();
  await expect(
    page.getByText(
      "Not connected. Connect GA4, select a property and sync it in SEO Settings.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText("Organic conversions and revenue", { exact: true }),
  ).toHaveCount(0);
  expect(pageErrors).toEqual([]);
  expect(apiErrors).toEqual([]);
});
