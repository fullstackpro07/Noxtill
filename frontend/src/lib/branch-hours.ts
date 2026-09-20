import type { Branch } from "@/lib/branches-api";

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** Real open/closed status computed from the branch's own `workingHours` + `timezone` fields
 * against the current instant — not a fabricated "Open until 7 PM" string. Returns null ranges
 * (closed all day) as "Closed today" rather than guessing a reopen time we don't have. */
export function computeOpenStatus(branch: Pick<Branch, "workingHours" | "timezone">): { label: string; isOpen: boolean } {
  const now = new Date();
  let weekday = "";
  let hhmm = "";
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: branch.timezone,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
    weekday = (parts.find((p) => p.type === "weekday")?.value ?? "").toLowerCase().slice(0, 3);
    const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
    const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
    hhmm = `${hour}:${minute}`;
  } catch {
    return { label: "Hours unknown", isOpen: false };
  }

  const ranges = branch.workingHours?.[weekday] ?? [];
  if (ranges.length === 0) {
    return { label: "Closed today", isOpen: false };
  }
  const nowMinutes = toMinutes(hhmm);
  for (const [start, end] of ranges) {
    if (nowMinutes >= toMinutes(start) && nowMinutes < toMinutes(end)) {
      return { label: `Open until ${formatHour(end)}`, isOpen: true };
    }
  }
  const nextRange = ranges.find(([start]) => toMinutes(start) > nowMinutes);
  if (nextRange) {
    return { label: `Closed · opens ${formatHour(nextRange[0])}`, isOpen: false };
  }
  return { label: "Closed for today", isOpen: false };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function formatHour(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const period = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${h12} ${period}` : `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

export { DAY_KEYS };
