import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/** The 17 Module 21 screens (8 upgraded originals + 9 new). */
const SCREENS: { name: string; path: string }[] = [
  { name: "Call Overview", path: "/receptionist" },
  { name: "Incoming Calls (Live)", path: "/receptionist/live" },
  { name: "Missed Calls", path: "/receptionist/missed-calls" },
  { name: "Call Queue", path: "/receptionist/queue" },
  { name: "Bookings from Calls", path: "/receptionist/bookings" },
  { name: "Transcripts & Recordings", path: "/receptionist/history" },
  { name: "Call Analytics", path: "/receptionist/analytics" },
  { name: "Receptionist Settings", path: "/receptionist/settings" },
  { name: "Agents & Availability", path: "/phone/agents" },
  { name: "Agent Workspace", path: "/phone/workspace" },
  { name: "Outbound Dialers", path: "/phone/outbound" },
  { name: "IVR & Routing Studio", path: "/phone/routing" },
  { name: "Supervisor Center", path: "/phone/supervisor" },
  { name: "Tracking & Attribution", path: "/phone/tracking" },
  { name: "Speech & Quality", path: "/phone/quality" },
  { name: "Video Meetings", path: "/phone/meetings" },
  { name: "Consent & Compliance", path: "/phone/compliance" },
];

/** Opens a screen and collects uncaught page errors and failed API calls (5xx). */
async function open(page: Page, path: string) {
  const pageErrors: string[] = [];
  const serverErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("response", (response) => {
    if (response.url().includes("/api/") && response.status() >= 500) serverErrors.push(`${response.status()} ${response.url()}`);
  });
  await page.goto(path);
  await page.waitForLoadState("networkidle");
  return { pageErrors, serverErrors };
}

for (const screen of SCREENS) {
  test.describe(screen.name, () => {
    test(`loads without crashes or server errors (${screen.path})`, async ({ page }) => {
      const { pageErrors, serverErrors } = await open(page, screen.path);
      await expect(page).not.toHaveURL(/\/login/);
      await expect(page.getByText(/Application error|Unhandled Runtime Error/)).toHaveCount(0);
      await expect(page.getByText(/is not enabled for this business|Module not enabled/i)).toHaveCount(0);
      expect(pageErrors, "uncaught browser errors").toEqual([]);
      expect(serverErrors, "API calls that returned 5xx").toEqual([]);
    });

    test(`has no serious or critical WCAG 2.2 AA violations (${screen.path})`, async ({ page }, testInfo) => {
      await open(page, screen.path);
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .analyze();
      const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      await testInfo.attach("axe-violations.json", {
        body: JSON.stringify(
          blocking.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, targets: v.nodes.slice(0, 5).map((n) => n.target.join(" ")) })),
          null,
          2,
        ),
        contentType: "application/json",
      });
      expect(blocking.map((v) => `${v.id} (${v.impact}, ${v.nodes.length} elements): ${v.help}`)).toEqual([]);
    });
  });
}
