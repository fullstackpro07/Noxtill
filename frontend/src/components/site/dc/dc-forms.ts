import { submitLegalForm } from "@/lib/legal-public-api";
import { ApiError } from "@/lib/api-client";

/**
 * Real behaviour for the imported marketing pages' forms, which the designs ship as placeholders
 * ("demo form — nothing is sent"). Demo requests go to the `sales` route of the public forms API
 * (backend/src/legal-public → emailed to sales@noxtill.com); nothing is stored client-side.
 */

export type FormResult = { ok: true } | { ok: false; message: string };

function errorMessage(e: unknown): string {
  if (e instanceof ApiError && e.message) return e.message;
  return "We couldn't send your request just now. Please try again, or email sales@noxtill.com.";
}

/** Contact page demo request: every named field of the form, multi-select checkboxes joined. */
export async function submitDemoRequest(form: HTMLFormElement, page: string): Promise<FormResult> {
  const data = new FormData(form);
  const one = (k: string) => String(data.get(k) ?? "").trim();
  const focus = data
    .getAll("focus")
    .map((v) => form.querySelector<HTMLInputElement>(`input[name="focus"][value="${String(v)}"]`)?.closest("label")?.textContent?.trim() || String(v))
    .join(", ");
  try {
    await submitLegalForm({
      route: "sales",
      page,
      fields: {
        name: one("name"),
        email: one("email"),
        company: one("company"),
        phone: one("phone"),
        businessType: one("industry"),
        teamSize: one("team"),
        locations: one("locations"),
        country: one("country"),
        focus,
        message: one("message"),
      },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, message: errorMessage(e) };
  }
}

/** Book a Demo page: name, email, business type and the chosen day + time slot. */
export async function submitBookDemo(fields: { name: string; email: string; businessType: string; preferredTime: string }): Promise<FormResult> {
  try {
    await submitLegalForm({ route: "sales", page: "/book-a-demo", fields });
    return { ok: true };
  } catch (e) {
    return { ok: false, message: errorMessage(e) };
  }
}

/**
 * Help Centre search: filters the help topics and FAQ questions that are on the page (there is no
 * separate article index) and reports how many matched.
 */
export function searchHelpPage(form: HTMLFormElement): string {
  const q = (form.querySelector<HTMLInputElement>('input[type="search"]')?.value ?? "").trim().toLowerCase();
  const root = form.closest(".dcx") ?? document;
  const items = [...root.querySelectorAll<HTMLElement>("[data-help-item]")];
  if (!items.length) {
    // Mark the searchable items once: linked list items (topic cards, guides) and FAQ rows.
    root.querySelectorAll<HTMLElement>("main li, main details").forEach((el) => {
      if (el.closest("form") || (el.tagName === "LI" && !el.querySelector("a"))) return;
      el.setAttribute("data-help-item", "");
      items.push(el);
    });
  }
  let shown = 0;
  for (const el of items) {
    const hit = !q || q.split(/\s+/).some((w) => (el.textContent ?? "").toLowerCase().includes(w));
    el.style.display = hit ? "" : "none";
    if (hit) shown++;
  }
  if (!q) return "";
  return shown ? `${shown} help topic${shown === 1 ? "" : "s"} and questions on this page match “${q}”.` : `Nothing on this page matches “${q}”. Contact support and we’ll help directly.`;
}

/** Runs the Help Centre search and shows its result line (a polite live region under the form). */
export function runHelpSearch(form: HTMLFormElement) {
  const msg = searchHelpPage(form);
  let note = form.nextElementSibling as HTMLElement | null;
  if (!note || !note.hasAttribute("data-help-note")) {
    note = document.createElement("p");
    note.setAttribute("data-help-note", "");
    note.setAttribute("aria-live", "polite");
    note.style.cssText = "margin: 10px 0 0; font-size: 13px; color: #6B7A72;";
    form.after(note);
  }
  note.textContent = msg;
}
