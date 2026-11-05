"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { apiFetch } from "@/lib/api-client";
import { useSession } from "@/lib/session";
import { ErrorState, Pill, Skeleton, Toast, U, ghostBtn, h2, inputStyle, primaryBtn, section, sub } from "@/components/usage/usage-ui";

interface Profile {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  email: string | null;
  currency: string;
  timezone: string;
  country: string | null;
  type: { label: string } | null;
}

type Editable = Pick<Profile, "name" | "phone" | "address" | "email" | "currency" | "timezone">;

const TIMEZONES = ["America/Los_Angeles", "America/Denver", "America/Chicago", "America/New_York", "Europe/London", "Asia/Karachi", "Asia/Dubai", "UTC"];
const CURRENCIES: [string, string][] = [["USD", "USD — US Dollar"], ["EUR", "EUR — Euro"], ["GBP", "GBP — British Pound"], ["PKR", "PKR — Pakistani Rupee"], ["AED", "AED — UAE Dirham"]];

const toDraft = (p: Profile): Editable => ({ name: p.name, phone: p.phone ?? "", address: p.address ?? "", email: p.email ?? "", currency: p.currency, timezone: p.timezone });

export function ProfileTab() {
  const session = useSession();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["business-profile-account"], queryFn: () => apiFetch<Profile>("/businesses/me") });
  const [draft, setDraft] = useState<Editable | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 4200);
  };
  useEffect(() => {
    if (q.data && !draft) setDraft(toDraft(q.data));
  }, [q.data, draft]);
  // The server gate is `business_profile.manage`; owner and managers hold it by default.
  const locked = session.user.role === "staff";

  const save = useMutation({
    mutationFn: (d: Editable) =>
      apiFetch<Profile>("/businesses/me", {
        method: "PATCH",
        body: JSON.stringify({ name: d.name.trim(), phone: d.phone || undefined, address: d.address || undefined, email: d.email || undefined, currency: d.currency, timezone: d.timezone }),
      }),
    onSuccess: (p) => {
      qc.setQueryData(["business-profile-account"], p);
      setDraft(toDraft(p));
      flash("Business profile saved.");
    },
    onError: (e) => flash(e instanceof ApiError ? e.message : "Couldn't save. Try again."),
  });

  if (q.isLoading || !draft) return q.isError ? <ErrorState title="We couldn't load your settings" body="The settings service didn't respond. Nothing was changed. Try again, or check your connection." onRetry={() => q.refetch()} /> : <Skeleton />;
  if (q.isError || !q.data) return <ErrorState title="We couldn't load your settings" body="The settings service didn't respond. Nothing was changed. Try again, or check your connection." onRetry={() => q.refetch()} />;

  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(q.data));
  const set = (k: keyof Editable, v: string) => setDraft({ ...draft, [k]: v });
  const label = { display: "flex", flexDirection: "column" as const, gap: 6, fontSize: 12, fontWeight: 700, color: U.text2 };
  const text = (k: keyof Editable, l: string, type = "text") => (
    <label key={k} style={label}>
      {l}
      <input type={type} value={draft[k] ?? ""} disabled={locked} onChange={(e) => set(k, e.target.value)} style={inputStyle} />
    </label>
  );
  const select = (k: keyof Editable, l: string, opts: [string, string][]) => (
    <label key={k} style={label}>
      {l}
      <select value={draft[k] ?? ""} disabled={locked} onChange={(e) => set(k, e.target.value)} style={inputStyle}>
        {opts.map(([v, t]) => (
          <option key={v} value={v}>
            {t}
          </option>
        ))}
        {!opts.some(([v]) => v === draft[k]) ? <option value={draft[k] ?? ""}>{draft[k]}</option> : null}
      </select>
    </label>
  );

  return (
    <section style={{ ...section, padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <h2 style={h2}>Business profile</h2>
          <p style={sub}>Shown on receipts, invoices and your public listings.</p>
        </div>
        {locked ? <Pill bg={U.line} fg={U.text3} style={{ fontSize: 11.5, fontWeight: 700, padding: "5px 10px" }}>View only for Staff</Pill> : null}
      </div>
      <div data-form="1" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: "14px 16px" }}>
        {text("name", "Business name")}
        <label style={label}>
          Business category
          <input value={q.data.type?.label ?? "Not set"} disabled style={{ ...inputStyle, color: U.muted }} />
        </label>
        {text("phone", "Phone", "tel")}
        {text("email", "Public email", "email")}
        {text("address", "Address")}
        {select("timezone", "Time zone", TIMEZONES.map((t) => [t, t]))}
        {select("currency", "Currency", CURRENCIES)}
      </div>
      <div style={{ fontSize: 11.5, color: U.muted }}>Business category is the business type chosen at setup.</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "flex-end", borderTop: `1px solid ${U.line}`, paddingTop: 14, flexWrap: "wrap" }}>
        {dirty ? <span style={{ fontSize: 12, color: U.warnText, fontWeight: 700, marginRight: "auto" }}>Unsaved changes</span> : null}
        <button type="button" disabled={!dirty || save.isPending} onClick={() => setDraft(toDraft(q.data!))} style={ghostBtn(!dirty)}>
          Discard
        </button>
        <button
          type="button"
          disabled={!dirty || save.isPending || locked}
          onClick={() => {
            if (!draft.name.trim()) return flash("Business name is required.");
            save.mutate(draft);
          }}
          style={primaryBtn(!dirty || locked)}
        >
          {save.isPending ? "Saving…" : "Save changes"}
        </button>
      </div>
      <Toast message={toast} />
    </section>
  );
}
