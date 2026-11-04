import { expect, test } from "@playwright/test";

const API = process.env.E2E_API_URL ?? "http://127.0.0.1:5001/api/v1";

test("manual finance journal saves, receives second-person approval and posts", async ({
  page,
  request,
  browser,
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

  await page.goto("/dashboard");
  const token = await page.evaluate(() => {
    const stored = window.localStorage.getItem("noxtill-auth");
    if (!stored) return null;
    return (JSON.parse(stored) as { state?: { accessToken?: string } }).state
      ?.accessToken;
  });
  expect(token).toBeTruthy();
  const headers = { Authorization: `Bearer ${token}` };
  const stamp = Date.now();
  const reference = `QA-JE-${stamp}`;
  const debitCode = `QA${stamp}`;
  const creditCode = `QB${stamp}`;
  const managerEmail = `finance-reviewer-${stamp}@example.test`;

  const managerResponse = await request.post(`${API}/staff`, {
    headers,
    data: {
      name: `Finance QA Reviewer ${stamp}`,
      email: managerEmail,
      role: "manager",
    },
  });
  expect(managerResponse.ok(), await managerResponse.text()).toBeTruthy();
  const manager = (await managerResponse.json()) as { tempPassword?: string };
  expect(manager.tempPassword).toBeTruthy();

  await page.goto("/profit/journals");
  await expect(
    page.getByRole("heading", { name: "Chart of accounts" }),
  ).toBeVisible();
  await expect(page.getByText(/No accounts yet/)).toBeVisible();
  await page.getByLabel("Account code").fill(debitCode);
  await page.getByLabel("Account name").fill(`QA debit account ${stamp}`);
  await page.getByLabel("Account type").selectOption("asset");
  await page.getByRole("button", { name: "Add account" }).click();
  await expect(
    page.getByRole("cell", { name: `QA debit account ${stamp}`, exact: true }),
  ).toBeVisible();
  await page.getByLabel("Account code").fill(creditCode);
  await page.getByLabel("Account name").fill(`QA credit account ${stamp}`);
  await page.getByLabel("Account type").selectOption("revenue");
  await page.getByRole("button", { name: "Add account" }).click();
  await expect(
    page.getByRole("cell", { name: `QA credit account ${stamp}`, exact: true }),
  ).toBeVisible();

  await page.getByLabel("Reference").fill(reference);
  await page
    .getByLabel("Entry date")
    .fill(new Date().toISOString().slice(0, 10));
  await page
    .getByLabel("Description")
    .fill(`QA manual journal review ${stamp}`);
  const accountSelectors = page.getByLabel("Journal account");
  await accountSelectors
    .nth(0)
    .selectOption({ label: `${debitCode} · QA debit account ${stamp}` });
  await accountSelectors
    .nth(1)
    .selectOption({ label: `${creditCode} · QA credit account ${stamp}` });
  await page.getByLabel("Debit amount").nth(0).fill("125.00");
  await page.getByLabel("Credit amount").nth(1).fill("125.00");
  const draftResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/profit/journals") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Save balanced draft" }).click();
  const draftResponse = await draftResponsePromise;
  expect(draftResponse.ok()).toBeTruthy();
  const original = (await draftResponse.json()) as { id: string };
  const journal = page.locator("article").filter({ hasText: reference });
  await expect(journal.getByText("draft", { exact: true })).toBeVisible();
  await journal.getByRole("button", { name: "Submit for approval" }).click();
  await expect(journal.getByText("pending approval")).toBeVisible();

  const reviewerContext = await browser.newContext({
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
  });
  const reviewerPage = await reviewerContext.newPage();
  reviewerPage.on("pageerror", (error) => pageErrors.push(error.message));
  reviewerPage.on("console", (message) => {
    if (message.type() === "error") pageErrors.push(message.text());
  });
  reviewerPage.on("response", (response) => {
    if (response.url().includes("/api/") && response.status() >= 500) {
      serverErrors.push(`${response.status()} ${response.url()}`);
    }
  });
  await reviewerPage.goto("/login");
  await reviewerPage.getByLabel("Email or phone number").fill(managerEmail);
  await reviewerPage
    .getByLabel("Password", { exact: true })
    .fill(manager.tempPassword!);
  await reviewerPage
    .getByRole("button", { name: "Sign in", exact: true })
    .click();
  await reviewerPage.waitForURL(/\/dashboard/);
  await reviewerPage.goto("/dashboard/actions");
  const actionRow = reviewerPage
    .getByRole("link", { name: `Finance journal · ${reference}` })
    .locator("xpath=../..");
  await expect(
    actionRow.getByRole("button", { name: "Approve" }),
  ).toBeVisible();
  await actionRow.getByRole("button", { name: "Approve" }).click();
  await reviewerPage
    .getByRole("textbox", { name: "Approve finance journal" })
    .fill("Second-person browser QA review confirms the balanced entry");
  const approveResponsePromise = reviewerPage.waitForResponse(
    (response) =>
      /\/actions\/[^/]+\/approve-finance-journal$/.test(response.url()) &&
      response.request().method() === "POST",
  );
  await reviewerPage.getByRole("button", { name: "Approve journal" }).click();
  expect((await approveResponsePromise).ok()).toBeTruthy();
  await reviewerPage.goto("/profit/journals");
  const approvedJournal = reviewerPage
    .locator("article")
    .filter({ hasText: reference });
  await expect(
    approvedJournal.getByText("approved", { exact: true }),
  ).toBeVisible();
  await approvedJournal
    .getByRole("button", { name: "Post approved journal" })
    .click();
  await expect(
    approvedJournal.getByText("posted", { exact: true }),
  ).toBeVisible();
  const postedActivity = reviewerPage.getByRole("region", {
    name: "Posted journal activity",
  });
  await expect(
    postedActivity.getByText("Total debits 125.00 · Total credits 125.00"),
  ).toBeVisible();
  await page.goto("/profit/journals");
  const originalOnLedger = page.locator(`#journal-${original.id}`);
  await expect(
    originalOnLedger.getByRole("button", { name: "Create reversal draft" }),
  ).toBeVisible();
  await originalOnLedger
    .getByRole("button", { name: "Create reversal draft" })
    .click();
  await page
    .getByRole("textbox", { name: "Create a reversing journal draft" })
    .fill("QA reversal test for a posted journal correction");
  const reversalResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith(`/profit/journals/${original.id}/reversal`) &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Create draft" }).click();
  const reversalResponse = await reversalResponsePromise;
  expect(reversalResponse.ok()).toBeTruthy();
  const reversal = (await reversalResponse.json()) as {
    id: string;
    reference: string;
    reversalOfId: string;
  };
  expect(reversal.reversalOfId).toBe(original.id);
  const reversalArticle = page.locator(`#journal-${reversal.id}`);
  await expect(reversalArticle.getByText("draft", { exact: true })).toBeVisible();
  await reversalArticle.getByRole("button", { name: "Submit for approval" }).click();
  await expect(reversalArticle.getByText("pending approval", { exact: true })).toBeVisible();
  await reviewerPage.goto("/dashboard/actions");
  const reversalAction = reviewerPage
    .getByRole("link", { name: `Finance journal · ${reversal.reference}` })
    .locator("xpath=../..");
  await expect(reversalAction.getByRole("button", { name: "Approve" })).toBeVisible();
  await reversalAction.getByRole("button", { name: "Approve" }).click();
  await reviewerPage
    .getByRole("textbox", { name: "Approve finance journal" })
    .fill("Reviewed the reversal lines and correction reason");
  const approveReversalResponsePromise = reviewerPage.waitForResponse(
    (response) =>
      /\/actions\/[^/]+\/approve-finance-journal$/.test(response.url()) &&
      response.request().method() === "POST",
  );
  await reviewerPage.getByRole("button", { name: "Approve journal" }).click();
  expect((await approveReversalResponsePromise).ok()).toBeTruthy();
  await reviewerPage.goto("/profit/journals");
  const approvedReversal = reviewerPage.locator(`#journal-${reversal.id}`);
  await expect(approvedReversal.getByText("approved", { exact: true })).toBeVisible();
  await approvedReversal
    .getByRole("button", { name: "Post approved journal" })
    .click();
  await expect(approvedReversal.getByText("posted", { exact: true })).toBeVisible();
  await expect(
    reviewerPage
      .getByRole("region", { name: "Posted journal activity" })
      .getByText("Total debits 250.00 · Total credits 250.00"),
  ).toBeVisible();
  await expect(
    reviewerPage
      .locator(`#journal-${original.id}`)
      .getByText(`Reversed by ${reversal.reference} · posted`),
  ).toBeVisible();
  await reviewerPage.screenshot({
    path: testInfo.outputPath("finance-journal-posted.png"),
    fullPage: true,
  });

  expect(pageErrors).toEqual([]);
  expect(serverErrors).toEqual([]);
  await reviewerPage.close();
  await reviewerContext.close();
});
