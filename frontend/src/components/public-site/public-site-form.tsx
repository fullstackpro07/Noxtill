"use client";

import { useRef, useState } from "react";
import { ApiError } from "@/lib/api-client";
import { submitPublicForm, type PublicFormSchema } from "@/lib/website-api";
import { onColor } from "@/lib/website-theme";

/** Website form: posts to the canonical CRM through the public endpoint, once per idempotency key. */
export function PublicSiteForm({ form, pageId, primary, radius }: { form: PublicFormSchema; pageId?: string; primary: string; radius: number }) {
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [consent, setConsent] = useState(false);
  const [company, setCompany] = useState("");
  const [state, setState] = useState<{ status: "idle" | "sending" | "done" | "error"; message?: string }>({ status: "idle" });
  // One key per form instance, created on first submit, so retries never create a second lead.
  const key = useRef<string | null>(null);

  if (state.status === "done") {
    return <p role="status" style={{ padding: 16, borderRadius: radius, border: `1px solid ${primary}` }}>{state.message}</p>;
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setState({ status: "sending" });
        key.current ??= typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
        const utm = Object.fromEntries([...new URLSearchParams(window.location.search)].filter(([k]) => k.startsWith("utm_")));
        submitPublicForm(form.token, { values, idempotencyKey: key.current, marketingConsent: consent, company: company || undefined, pageId, utm })
          .then((r) => setState({ status: "done", message: r.message }))
          .catch((err: unknown) => setState({ status: "error", message: err instanceof ApiError ? err.message : "Something went wrong. Please try again." }));
      }}
      style={{ display: "grid", gap: 12, maxWidth: 560 }}
    >
      {form.fields.map((f) => {
        const id = `f-${form.token}-${f.key}`;
        const common = { id, name: f.key, required: f.required, style: { width: "100%", padding: "10px 12px", borderRadius: radius, border: "1px solid rgba(127,127,127,.45)", background: "transparent", color: "inherit", font: "inherit" } };
        if (f.type === "checkbox") {
          return (
            <label key={f.key} htmlFor={id} style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" id={id} checked={values[f.key] === true} onChange={(e) => setValues({ ...values, [f.key]: e.target.checked })} /> {f.label}
            </label>
          );
        }
        return (
          <label key={f.key} htmlFor={id} style={{ display: "grid", gap: 4, fontSize: 14 }}>
            <span>{f.label}{f.required ? " *" : ""}</span>
            {f.type === "textarea" ? (
              <textarea {...common} rows={4} value={String(values[f.key] ?? "")} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
            ) : f.type === "select" ? (
              <select {...common} value={String(values[f.key] ?? "")} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}>
                <option value="">Choose…</option>
                {f.options.map((o) => <option key={o}>{o}</option>)}
              </select>
            ) : (
              <input {...common} type={f.type === "email" ? "email" : f.type === "phone" ? "tel" : "text"} autoComplete={f.type === "email" ? "email" : f.type === "phone" ? "tel" : undefined} value={String(values[f.key] ?? "")} onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
            )}
          </label>
        );
      })}
      {/* Spam trap: invisible to people and screen readers; bots that fill it are blocked. */}
      <div aria-hidden="true" style={{ position: "absolute", left: -10000, width: 1, height: 1, overflow: "hidden" }}>
        <label>Company<input tabIndex={-1} autoComplete="off" value={company} onChange={(e) => setCompany(e.target.value)} /></label>
      </div>
      {form.consentText && (
        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 14 }}>
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 3 }} /> {form.consentText}
        </label>
      )}
      {state.status === "error" && <p role="alert" style={{ color: "#b91c1c", margin: 0 }}>{state.message}</p>}
      <button type="submit" disabled={state.status === "sending"} style={{ justifySelf: "start", padding: "10px 18px", borderRadius: radius, border: `2px solid ${primary}`, background: primary, color: onColor(primary), fontWeight: 600, cursor: "pointer" }}>
        {state.status === "sending" ? "Sending…" : "Send"}
      </button>
    </form>
  );
}
