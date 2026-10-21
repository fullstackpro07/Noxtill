import { expect, test } from "@playwright/test";

const PATHS = ["/receptionist", "/receptionist/live", "/receptionist/missed-calls", "/receptionist/queue", "/receptionist/bookings", "/receptionist/history", "/receptionist/analytics", "/receptionist/settings", "/phone/agents", "/phone/workspace", "/phone/outbound", "/phone/routing", "/phone/supervisor", "/phone/tracking", "/phone/quality", "/phone/meetings", "/phone/compliance"];
const TABS = 80;

/** Keyboard-only use: Tab must keep moving focus (no trap) and every focused element must show a focus indicator. */
for (const path of PATHS) {
  test(`keyboard focus moves and is visible (${path})`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const seen = new Set<string>();
    const invisible: string[] = [];
    for (let i = 0; i < TABS; i += 1) {
      await page.keyboard.press("Tab");
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        // NEXTJS-PORTAL is the Next.js development overlay; it does not exist in production builds.
        if (!el || el === document.body || el.tagName === "NEXTJS-PORTAL") return null;
        const style = getComputedStyle(el);
        const ring =
          (style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0) ||
          (style.boxShadow !== "none" && style.boxShadow !== "") ;
        const label = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || el.tagName).trim().slice(0, 50);
        const path: string[] = [];
        let node: Element | null = el;
        while (node && path.length < 6) {
          path.unshift(`${node.tagName}:${Array.from(node.parentElement?.children ?? []).indexOf(node)}`);
          node = node.parentElement;
        }
        return { key: path.join(">"), label, ring, tag: el.tagName };
      });
      if (!info) continue;
      seen.add(info.key);
      if (!info.ring) invisible.push(`${info.tag} "${info.label}"`);
    }
    expect(seen.size, "Tab should reach several distinct elements (no keyboard trap)").toBeGreaterThan(5);
    expect([...new Set(invisible)], "focused elements without a visible focus indicator").toEqual([]);
  });
}
