import { expect, test } from "@playwright/test";

const API = process.env.E2E_API_URL ?? "http://127.0.0.1:5001/api/v1";

test("SEO Agent Workspace uses real content opportunities and respects the AI-drafts switch", async ({
  page,
  request,
}, testInfo) => {
  await expect
    .poll(
      async () => {
        try {
          return (
            await request.get(`${API.replace(/\/api\/v1$/, "")}/health`)
          ).status();
        } catch {
          return 0;
        }
      },
      { timeout: 30_000 },
    )
    .toBe(200);

  const errors: string[] = [];
  const serverErrors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.url().includes("/api/") && response.status() >= 500) {
      serverErrors.push(`${response.status()} ${response.url()}`);
    }
  });

  const stamp = Date.now();
  const email = `qa-seo-agent-${stamp}@example.test`;
  const password = `Qa-${stamp}-Owner!`;
  const signup = await request.post(`${API}/auth/signup`, {
    data: {
      businessName: `QA SEO Agent ${stamp}`,
      name: "QA SEO Agent Owner",
      email,
      password,
      country: "US",
      currency: "USD",
    },
  });
  expect(signup.ok(), await signup.text()).toBeTruthy();
  const { accessToken } = (await signup.json()) as { accessToken: string };
  const headers = { Authorization: `Bearer ${accessToken}` };

  const modulesResponse = await request.get(`${API}/business-modules`, {
    headers,
  });
  expect(modulesResponse.ok(), await modulesResponse.text()).toBeTruthy();
  const { modules } = (await modulesResponse.json()) as {
    modules: { key: string }[];
  };
  const moduleSelection = await request.patch(
    `${API}/business-modules/selection`,
    {
      headers,
      data: { enabled: modules.map((module) => module.key) },
    },
  );
  expect(moduleSelection.ok(), await moduleSelection.text()).toBeTruthy();

  const keyword = `QA real content opportunity ${stamp}`;
  const keywordResponse = await request.post(`${API}/keywords`, {
    headers,
    data: { keyword },
  });
  expect(keywordResponse.ok(), await keywordResponse.text()).toBeTruthy();
  const savedKeyword = (await keywordResponse.json()) as { id: string };
  const aiPolicy = await request.put(`${API}/settings/hub/changes`, {
    headers,
    data: {
      changes: [{ category: "seo", rowKey: "seo-ai-drafts", value: false }],
    },
  });
  expect(aiPolicy.ok(), await aiPolicy.text()).toBeTruthy();

  await page.goto("/login", { waitUntil: "networkidle" });
  await page.getByLabel("Email or phone number").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/dashboard/);
  await page.goto("/marketing/seo-autopilot/agent-workspace");

  const opportunity = page.getByRole("listitem").filter({ hasText: keyword });
  await expect(
    page.getByRole("heading", { name: "SEO Autopilot Agent" }),
  ).toBeVisible();
  await expect(opportunity).toContainText(
    "No page on your site is mapped to this keyword.",
  );
  const createBrief = opportunity.getByRole("button", {
    name: "Generate AI brief",
  });
  await expect(createBrief).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("seo-agent-content-opportunity.png"),
    fullPage: true,
  });

  const blockedRequest = page.waitForResponse(
    (response) =>
      response
        .url()
        .endsWith(
          `/seo-autopilot/workspace/content-opportunities/${savedKeyword.id}/brief`,
        ) && response.request().method() === "POST",
  );
  await createBrief.click();
  const blockedResponse = await blockedRequest;
  expect(blockedResponse.status()).toBe(409);
  expect(await blockedResponse.json()).toMatchObject({
    error: { code: "SEO_AI_DRAFTS_OFF" },
  });
  await expect(
    page.getByText(/AI drafts are turned off in Settings/),
  ).toBeVisible();
  const briefs = await request.get(`${API}/seo-autopilot/content/briefs`, {
    headers,
  });
  expect(briefs.ok(), await briefs.text()).toBeTruthy();
  expect(await briefs.json()).toEqual([]);

  expect(
    errors.filter((message) => !message.includes("409 (Conflict)")),
  ).toEqual([]);
  expect(serverErrors).toEqual([]);
});

test("SEO Content refresh queue shows the honest GA4 state for published pages", async ({
  page,
  request,
}, testInfo) => {
  await expect
    .poll(
      async () => {
        try {
          return (
            await request.get(`${API.replace(/\/api\/v1$/, "")}/health`)
          ).status();
        } catch {
          return 0;
        }
      },
      { timeout: 30_000 },
    )
    .toBe(200);

  const errors: string[] = [];
  const serverErrors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.url().includes("/api/") && response.status() >= 500) {
      serverErrors.push(`${response.status()} ${response.url()}`);
    }
  });

  const stamp = Date.now();
  const email = `qa-seo-content-ga4-${stamp}@example.test`;
  const password = `Qa-${stamp}-Owner!`;
  const signup = await request.post(`${API}/auth/signup`, {
    data: {
      businessName: `QA SEO Content GA4 ${stamp}`,
      name: "QA SEO Content Owner",
      email,
      password,
      country: "US",
      currency: "USD",
    },
  });
  expect(signup.ok(), await signup.text()).toBeTruthy();
  const { accessToken } = (await signup.json()) as { accessToken: string };
  const headers = { Authorization: `Bearer ${accessToken}` };

  const modulesResponse = await request.get(`${API}/business-modules`, {
    headers,
  });
  expect(modulesResponse.ok(), await modulesResponse.text()).toBeTruthy();
  const { modules } = (await modulesResponse.json()) as {
    modules: { key: string }[];
  };
  const selection = await request.patch(`${API}/business-modules/selection`, {
    headers,
    data: { enabled: modules.map((module) => module.key) },
  });
  expect(selection.ok(), await selection.text()).toBeTruthy();

  const keywordResponse = await request.post(`${API}/keywords`, {
    headers,
    data: { keyword: `QA GA4 landing keyword ${stamp}` },
  });
  expect(keywordResponse.ok(), await keywordResponse.text()).toBeTruthy();
  const keyword = (await keywordResponse.json()) as { id: string };
  const briefResponse = await request.post(
    `${API}/seo-autopilot/content/briefs`,
    {
      headers,
      data: {
        topic: `QA published page ${stamp}`,
        keywordId: keyword.id,
        format: "landing_page",
      },
    },
  );
  expect(briefResponse.ok(), await briefResponse.text()).toBeTruthy();
  const brief = (await briefResponse.json()) as { id: string };
  const transition = async (status: string, note?: string) => {
    const response = await request.post(
      `${API}/seo-autopilot/content/briefs/${brief.id}/status`,
      {
        headers,
        data: { status, ...(note ? { note } : {}) },
      },
    );
    expect(response.ok(), await response.text()).toBeTruthy();
  };
  await transition("drafting");
  const draftUpdate = await request.patch(
    `${API}/seo-autopilot/content/briefs/${brief.id}`,
    {
      headers,
      data: {
        draftTitle: `QA ${stamp}`,
        draftBody: "Clearly labeled local QA content fixture.",
      },
    },
  );
  expect(draftUpdate.ok(), await draftUpdate.text()).toBeTruthy();
  await transition("approval_required");
  await transition("approved");
  const published = await request.post(
    `${API}/seo-autopilot/content/briefs/${brief.id}/published`,
    {
      headers,
      data: { publishedUrl: `https://example.test/qa-seo-content-${stamp}` },
    },
  );
  expect(published.ok(), await published.text()).toBeTruthy();

  await page.goto("/login", { waitUntil: "networkidle" });
  await page.getByLabel("Email or phone number").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/dashboard/);
  await page.goto("/marketing/seo-autopilot/content");
  await page.getByRole("tab", { name: "Refresh queue & performance" }).click();
  await expect(
    page.getByRole("button", { name: `QA published page ${stamp}` }),
  ).toBeVisible();
  await expect(page.getByText("Connect GA4 in SEO Settings")).toBeVisible();
  await expect(page.getByText("Not tracked", { exact: true })).toHaveCount(0);
  await page.screenshot({
    path: testInfo.outputPath("seo-content-ga4-state.png"),
    fullPage: true,
  });

  expect(errors).toEqual([]);
  expect(serverErrors).toEqual([]);
});

test("SEO Technical URL Inspection discloses when Search Console is not connected", async ({
  page,
  request,
}) => {
  await expect
    .poll(
      async () => {
        try {
          return (
            await request.get(`${API.replace(/\/api\/v1$/, "")}/health`)
          ).status();
        } catch {
          return 0;
        }
      },
      { timeout: 30_000 },
    )
    .toBe(200);

  const errors: string[] = [];
  const serverErrors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.url().includes("/api/") && response.status() >= 500) {
      serverErrors.push(`${response.status()} ${response.url()}`);
    }
  });

  const stamp = Date.now();
  const email = `qa-seo-url-inspection-${stamp}@example.test`;
  const password = `Qa-${stamp}-Owner!`;
  const signup = await request.post(`${API}/auth/signup`, {
    data: {
      businessName: `QA SEO URL Inspection ${stamp}`,
      name: "QA SEO URL Inspection Owner",
      email,
      password,
      country: "US",
      currency: "USD",
    },
  });
  expect(signup.ok(), await signup.text()).toBeTruthy();
  const { accessToken } = (await signup.json()) as { accessToken: string };
  const headers = { Authorization: `Bearer ${accessToken}` };

  const modulesResponse = await request.get(`${API}/business-modules`, {
    headers,
  });
  expect(modulesResponse.ok(), await modulesResponse.text()).toBeTruthy();
  const { modules } = (await modulesResponse.json()) as {
    modules: { key: string }[];
  };
  const selection = await request.patch(`${API}/business-modules/selection`, {
    headers,
    data: { enabled: modules.map((module) => module.key) },
  });
  expect(selection.ok(), await selection.text()).toBeTruthy();

  await page.goto("/login", { waitUntil: "networkidle" });
  await page.getByLabel("Email or phone number").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/dashboard/);
  await page.goto("/marketing/seo-autopilot/technical");

  await page.getByRole("tab", { name: "URL inspection" }).click();
  await expect(
    page.getByRole("heading", { name: "Google Search Console URL Inspection" }),
  ).toBeVisible();
  await expect(
    page.getByText("Google Search Console is not connected."),
  ).toBeVisible();
  await expect(
    page.locator("main").getByRole("link", { name: "Integrations" }),
  ).toHaveAttribute("href", "/integrations");
  await expect(page.getByLabel("Page URL")).toHaveCount(0);

  expect(errors).toEqual([]);
  expect(serverErrors).toEqual([]);
});

test("SEO Agent saves and renders actual merchant-entered off-page evidence", async ({
  page,
  request,
}, testInfo) => {
  await expect
    .poll(
      async () => {
        try {
          return (
            await request.get(`${API.replace(/\/api\/v1$/, "")}/health`)
          ).status();
        } catch {
          return 0;
        }
      },
      { timeout: 30_000 },
    )
    .toBe(200);

  const errors: string[] = [];
  const serverErrors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.url().includes("/api/") && response.status() >= 500) {
      serverErrors.push(`${response.status()} ${response.url()}`);
    }
  });

  const stamp = Date.now();
  const email = `qa-seo-offpage-agent-${stamp}@example.test`;
  const password = `Qa-${stamp}-Owner!`;
  const signup = await request.post(`${API}/auth/signup`, {
    data: {
      businessName: `QA SEO Offpage Agent ${stamp}`,
      name: "QA SEO Offpage Owner",
      email,
      password,
      country: "US",
      currency: "USD",
    },
  });
  expect(signup.ok(), await signup.text()).toBeTruthy();
  const { accessToken } = (await signup.json()) as { accessToken: string };
  const headers = { Authorization: `Bearer ${accessToken}` };

  const modulesResponse = await request.get(`${API}/business-modules`, {
    headers,
  });
  expect(modulesResponse.ok(), await modulesResponse.text()).toBeTruthy();
  const { modules } = (await modulesResponse.json()) as {
    modules: { key: string }[];
  };
  const moduleSelection = await request.patch(
    `${API}/business-modules/selection`,
    {
      headers,
      data: { enabled: modules.map((module) => module.key) },
    },
  );
  expect(moduleSelection.ok(), await moduleSelection.text()).toBeTruthy();

  // Prevent a paid provider request; the deterministic review and persisted evidence still run.
  const aiSettings = await request.patch(`${API}/ai/settings`, {
    headers,
    data: { featureToggles: { seoAgent: false } },
  });
  expect(aiSettings.ok(), await aiSettings.text()).toBeTruthy();

  for (const [status, sourcePath] of [
    ["active", "article"],
    ["lost", "archive"],
  ] as const) {
    const link = await request.post(`${API}/seo-autopilot/off-page/links`, {
      headers,
      data: {
        sourceUrl: `https://qa-${stamp}.example.test/${sourcePath}`,
        targetUrl: `https://merchant-${stamp}.example.test/landing`,
        status,
        evidenceNote:
          "QA-only merchant-record fixture from a local browser test.",
      },
    });
    expect(link.ok(), await link.text()).toBeTruthy();
  }
  const opportunity = await request.post(
    `${API}/seo-autopilot/off-page/opportunities`,
    {
      headers,
      data: {
        kind: "resource",
        title: `QA-only opportunity ${stamp}`,
        prospectUrl: `https://prospect-${stamp}.example.test/resources`,
        targetUrl: `https://merchant-${stamp}.example.test/landing`,
        evidenceNote: "QA-only evidence fixture.",
        relevanceNote: "QA-only relevance fixture.",
      },
    },
  );
  expect(opportunity.ok(), await opportunity.text()).toBeTruthy();

  const publication = await request.post(
    `${API}/seo-autopilot/guest-posting/publications`,
    {
      headers,
      data: {
        name: `QA-only publication ${stamp}`,
        websiteUrl: `https://publisher-${stamp}.example.test`,
        topicNiches: ["QA test topic"],
        market: "US",
        relevanceEvidence: "QA-only relevance fixture.",
        qualityEvidence: "QA-only quality fixture.",
      },
    },
  );
  expect(publication.ok(), await publication.text()).toBeTruthy();
  const publicationRow = (await publication.json()) as { id: string };
  const qualifiedPublication = await request.post(
    `${API}/seo-autopilot/guest-posting/publications/${publicationRow.id}/qualification`,
    {
      headers,
      data: { status: "qualified", reason: "QA-only qualification fixture." },
    },
  );
  expect(
    qualifiedPublication.ok(),
    await qualifiedPublication.text(),
  ).toBeTruthy();
  const pitch = await request.post(
    `${API}/seo-autopilot/guest-posting/publications/${publicationRow.id}/topic-ideas`,
    {
      headers,
      data: {
        topicIdea: `QA-only pitch ${stamp}`,
        sourceNotes: "QA-only source fixture.",
      },
    },
  );
  expect(pitch.ok(), await pitch.text()).toBeTruthy();

  const agentRun = await request.post(
    `${API}/seo-autopilot/workspace/agent-runs`,
    {
      headers: { ...headers, "Idempotency-Key": `qa-seo-offpage-${stamp}` },
    },
  );
  expect(agentRun.ok(), await agentRun.text()).toBeTruthy();
  const savedRun = (await agentRun.json()) as {
    output: { snapshot: { offPageRecords: Record<string, unknown> } };
  };
  expect(savedRun.output.snapshot.offPageRecords).toMatchObject({
    source: "merchant_entered_records",
    trackedLinks: 2,
    activeLinks: 1,
    lostLinks: 1,
    openTrackedOpportunities: 1,
    guestPublications: 1,
    guestPitches: 1,
  });

  await page.goto("/login", { waitUntil: "networkidle" });
  await page.getByLabel("Email or phone number").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/dashboard/);
  await page.goto("/marketing/seo-autopilot/agent-workspace");

  await expect(
    page.getByRole("heading", { name: "SEO Autopilot Agent" }),
  ).toBeVisible();
  await expect(page.getByText(/Team records: 2 tracked links/)).toBeVisible();
  await expect(
    page.getByText(/1 active · 1 marked lost · 0 unverified/),
  ).toBeVisible();
  await expect(
    page.getByText(/1 open opportunities, 1 publications and 1 pitches/),
  ).toBeVisible();
  await expect(
    page.getByText("Merchant-entered only · no provider authority score"),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("seo-agent-offpage-evidence.png"),
    fullPage: true,
  });

  expect(errors).toEqual([]);
  expect(serverErrors).toEqual([]);
});

test("SEO Technical URL Inspection renders the provider-response contract without converting search metrics to sales", async ({
  page,
  request,
}, testInfo) => {
  await expect
    .poll(
      async () => {
        try {
          return (
            await request.get(`${API.replace(/\/api\/v1$/, "")}/health`)
          ).status();
        } catch {
          return 0;
        }
      },
      { timeout: 30_000 },
    )
    .toBe(200);

  const errors: string[] = [];
  const serverErrors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("response", (response) => {
    if (response.url().includes("/api/") && response.status() >= 500) {
      serverErrors.push(`${response.status()} ${response.url()}`);
    }
  });

  const stamp = Date.now();
  const email = `qa-seo-url-inspection-ui-${stamp}@example.test`;
  const password = `Qa-${stamp}-Owner!`;
  const signup = await request.post(`${API}/auth/signup`, {
    data: {
      businessName: `QA SEO URL Inspection UI ${stamp}`,
      name: "QA SEO URL Inspection UI Owner",
      email,
      password,
      country: "US",
      currency: "USD",
    },
  });
  expect(signup.ok(), await signup.text()).toBeTruthy();
  const { accessToken } = (await signup.json()) as { accessToken: string };
  const headers = { Authorization: `Bearer ${accessToken}` };
  const modulesResponse = await request.get(`${API}/business-modules`, {
    headers,
  });
  expect(modulesResponse.ok(), await modulesResponse.text()).toBeTruthy();
  const { modules } = (await modulesResponse.json()) as {
    modules: { key: string }[];
  };
  const selection = await request.patch(`${API}/business-modules/selection`, {
    headers,
    data: { enabled: modules.map((module) => module.key) },
  });
  expect(selection.ok(), await selection.text()).toBeTruthy();

  await page.route("**/seo-autopilot/search-console", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    await route.fulfill({
      json: {
        status: "connected",
        properties: [
          { siteUrl: "https://example.com/", permissionLevel: "siteOwner" },
        ],
        selectedProperty: "https://example.com/",
        lastPropertyRefreshAt: null,
        lastSyncAt: null,
        snapshots: [],
        windowDays: 28,
      },
    });
  });
  await page.route(
    "**/seo-autopilot/search-console/url-inspection",
    async (route) => {
      await route.fulfill({
        json: {
          inspectionResultLink: null,
          verdict: "PASS",
          coverageState: "Submitted and indexed",
          indexingState: "INDEXING_ALLOWED",
          robotsTxtState: "ALLOWED",
          pageFetchState: "SUCCESSFUL",
          lastCrawlTime: "2026-10-30T12:00:00Z",
          googleCanonical: "https://example.com/canonical-page",
          userCanonical: "https://example.com/page",
          sitemaps: ["https://example.com/sitemap.xml"],
          referringUrls: [],
          propertyUrl: "https://example.com/",
          inspectionUrl: "https://example.com/page",
          inspectedAt: "2026-10-31T00:00:00Z",
          source: "google_search_console_index",
          searchPerformance: {
            status: "final",
            startDate: "2026-10-01",
            endDate: "2026-10-28",
            pageUrl: "https://example.com/canonical-page",
            clicks: "12",
            impressions: "345",
            clickThroughRate: 12 / 345,
            averagePosition: 6.25,
          },
          searchPerformanceDisclosure:
            "Final Google web-search performance; not visits, conversions, orders or revenue attribution.",
          disclosure:
            "Stored index version only; not a live-page test and does not request indexing.",
        },
      });
    },
  );

  await page.goto("/login", { waitUntil: "networkidle" });
  await page.getByLabel("Email or phone number").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(/\/dashboard/);
  await page.goto("/marketing/seo-autopilot/technical");
  await page.getByRole("tab", { name: "URL inspection" }).click();
  await page.getByLabel("Page URL").fill("https://example.com/page");
  await page.getByRole("button", { name: "Inspect URL" }).click();

  const result = page.getByRole("region", { name: "URL inspection result" });
  await expect(
    result.getByRole("heading", { name: "Index status: PASS" }),
  ).toBeVisible();
  await expect(
    result.getByText(
      "Google grouped this row under canonical page https://example.com/canonical-page",
    ),
  ).toBeVisible();
  await expect(result.getByText("12", { exact: true })).toBeVisible();
  await expect(result.getByText("345", { exact: true })).toBeVisible();
  await expect(result.getByText("3.48%", { exact: true })).toBeVisible();
  await expect(result.getByText("6.25", { exact: true })).toBeVisible();
  await expect(
    result.getByText(/not visits, conversions, orders or revenue attribution/),
  ).toBeVisible();
  await result.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: testInfo.outputPath("seo-url-inspection-provider-contract.png"),
  });

  expect(errors).toEqual([]);
  expect(serverErrors).toEqual([]);
});
