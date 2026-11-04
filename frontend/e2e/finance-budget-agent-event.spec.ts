import { expect, test } from "@playwright/test";

const API = process.env.E2E_API_URL ?? "http://127.0.0.1:5001/api/v1";

test("an approved budget can opt into a real read-only Finance Agent review", async ({
  page,
  request,
}) => {
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
  await page.route("**/api/v1/**", async (route) => {
    const target = new URL(route.request().url());
    if (target.pathname.endsWith("/activity/stream")) {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: "",
      });
      return;
    }
    const apiOrigin = new URL(API);
    target.protocol = apiOrigin.protocol;
    target.hostname = apiOrigin.hostname;
    target.port = apiOrigin.port;
    const response = await route.fetch({ url: target.toString() });
    await route.fulfill({ response });
  });

  const stamp = Date.now();
  const email = `finance-budget-event-${stamp}@example.test`;
  const password = `Finance-${stamp}-Owner!`;
  const signup = await request.post(`${API}/auth/signup`, {
    data: {
      businessName: `QA Finance Budget Event ${stamp}`,
      name: "QA Finance Owner",
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
    modules: { key: string }[];
  };
  const moduleSelection = await request.patch(
    `${API}/business-modules/selection`,
    { headers, data: { enabled: modules.map((module) => module.key) } },
  );
  expect(moduleSelection.ok(), await moduleSelection.text()).toBeTruthy();

  const aiSettings = await request.patch(`${API}/ai/settings`, {
    headers,
    data: { featureToggles: { financeAgent: false } },
  });
  expect(aiSettings.ok(), await aiSettings.text()).toBeTruthy();

  const policySave = await request.put(`${API}/settings/hub/changes`, {
    headers,
    data: {
      changes: [
        {
          category: "ai",
          rowKey: "specialist-agent-finance-approved-budget-event-review",
          value: true,
        },
        {
          category: "ai",
          rowKey: "specialist-agent-finance-statement-imported-event-review",
          value: true,
        },
      ],
    },
  });
  expect(policySave.ok(), await policySave.text()).toBeTruthy();

  const month = new Date().toISOString().slice(0, 7);
  const category = `QA Budget Event ${stamp}`;
  const draftResponse = await request.post(`${API}/profit/budgets`, {
    headers,
    data: { month, category, amount: "125.00" },
  });
  expect(draftResponse.ok(), await draftResponse.text()).toBeTruthy();
  const draft = (await draftResponse.json()) as { id: string; version: number };
  const submitResponse = await request.post(
    `${API}/profit/budgets/${draft.id}/submit`,
    { headers },
  );
  expect(submitResponse.ok(), await submitResponse.text()).toBeTruthy();
  const approveResponse = await request.post(
    `${API}/profit/budgets/${draft.id}/approve`,
    {
      headers,
      data: { reason: "Approved for isolated browser QA review" },
    },
  );
  expect(approveResponse.ok(), await approveResponse.text()).toBeTruthy();

  const accountResponse = await request.post(`${API}/profit/journals/accounts`, {
    headers,
    data: {
      code: `QA${String(stamp).slice(-6)}`,
      name: `QA statement account ${stamp}`,
      type: "asset",
    },
  });
  expect(accountResponse.ok(), await accountResponse.text()).toBeTruthy();
  const account = (await accountResponse.json()) as { id: string };
  const importResponse = await request.post(
    `${API}/profit/reconciliation/imports`,
    {
      headers,
      data: {
        financeAccountId: account.id,
        currencyCode: "USD",
        csv: `date,amount,description\n${new Date().toISOString().slice(0, 10)},125.00,private QA memo ${stamp}`,
      },
    },
  );
  expect(importResponse.ok(), await importResponse.text()).toBeTruthy();
  const statementImport = (await importResponse.json()) as { id: string };

  await page.goto("/login", { waitUntil: "networkidle" });
  await page.getByLabel("Email or phone number").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/dashboard/);
  await page.goto("/settings/ai");
  await expect(
    page.getByText("Review Finance after approved budgets", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Review Finance after journals are posted", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Budget review on", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Review Finance after statement imports", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Import review on", { exact: true }),
  ).toBeVisible();

  let pollDebug = "No poll response yet";
  try {
    await expect
      .poll(
        async () => {
          const response = await request.get(`${API}/profit/agent-runs`, {
            headers,
          });
          if (!response.ok()) {
            pollDebug = `HTTP ${response.status()}: ${await response.text()}`;
            return false;
          }
          const runs = (await response.json()) as Array<{
            triggerType: string;
            inputRefs: Array<{
              eventId?: string;
              entityType?: string;
              entityId?: string;
              entityVersion?: string;
            }>;
          }>;
          pollDebug = JSON.stringify(
            runs.map((run) => ({
              triggerType: run.triggerType,
              refs: run.inputRefs?.filter(
                (reference) => reference.entityType === "FinanceBudget",
              ),
            })),
          );
          return runs.some(
            (run) =>
              run.triggerType === "event" &&
              run.inputRefs?.some(
                (reference) =>
                  reference.entityType === "FinanceBudget" &&
                  reference.entityId === draft.id &&
                  reference.entityVersion === `${month}:v${draft.version}`,
              ),
          );
        },
        { timeout: 20_000, intervals: [250, 500, 1_000] },
      )
      .toBe(true);
  } catch (error) {
    throw new Error(
      `No Finance budget event run found for ${draft.id} v${draft.version}: ${pollDebug}; ${String(error)}`,
    );
  }

  let statementPollDebug = "No poll response yet";
  try {
    await expect
      .poll(
        async () => {
          const response = await request.get(`${API}/profit/agent-runs`, {
            headers,
          });
          if (!response.ok()) {
            statementPollDebug = `HTTP ${response.status()}: ${await response.text()}`;
            return false;
          }
          const runs = (await response.json()) as Array<{
            triggerType: string;
            inputRefs: Array<{
              entityType?: string;
              entityId?: string;
            }>;
          }>;
          statementPollDebug = JSON.stringify(
            runs.map((run) =>
              run.inputRefs?.filter(
                (reference) =>
                  reference.entityType === "FinanceBankStatementImport",
              ),
            ),
          );
          return runs.some(
            (run) =>
              run.triggerType === "event" &&
              run.inputRefs?.some(
                (reference) =>
                  reference.entityType === "FinanceBankStatementImport" &&
                  reference.entityId === statementImport.id,
              ),
          );
        },
        { timeout: 20_000, intervals: [250, 500, 1_000] },
      )
      .toBe(true);
  } catch (error) {
    throw new Error(
      `No Finance statement-import event run found for ${statementImport.id}: ${statementPollDebug}; ${String(error)}`,
    );
  }

  await page.unrouteAll({ behavior: "ignoreErrors" });
  expect(pageErrors).toEqual([]);
  expect(apiErrors).toEqual([]);
});
