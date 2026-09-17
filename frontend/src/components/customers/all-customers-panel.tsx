"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchCustomers, updateCustomer, type LiveCustomer } from "@/lib/customers-api";
import { fetchDebtors } from "@/lib/credit-api";
import { createSegment, previewSegmentCount, type SegmentRules } from "@/lib/segments-api";
import { createCampaign } from "@/lib/campaigns-api";
import { fetchCustomerPrivacySettings } from "@/lib/customer-privacy-settings-api";
import { lifecycleOf, isIncompleteProfile, initialsFor, avatarColorFor, daysSince, HIGH_VALUE_THRESHOLD, LIFECYCLE_TONE } from "@/lib/customer-lifecycle";
import { formatCurrency, formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";
import { ApiError } from "@/lib/api-client";
import { useSession } from "@/lib/session";
import { useCustomersSearchStore } from "@/store/customers-search-store";

const selectStyle: React.CSSProperties = { border: "1px solid var(--app-border)", borderRadius: 10, padding: "9px 11px", fontSize: 12.5, fontWeight: 600, color: "var(--app-text-muted)", background: "var(--app-surface)", minHeight: 42 };
const outlineBtn: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 10, padding: "9px 14px", fontSize: 12, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 42 };
const smallOutline: React.CSSProperties = { border: "1px solid var(--app-border)", background: "var(--app-surface)", borderRadius: 9, padding: "8px 11px", fontSize: 11.5, fontWeight: 700, color: "var(--app-text-muted)", minHeight: 40 };
const smallPrimary: React.CSSProperties = { border: 0, background: "var(--app-primary)", borderRadius: 9, padding: "8px 13px", fontSize: 11.5, fontWeight: 800, color: "#fff", minHeight: 40 };

function downloadCsv(rows: LiveCustomer[], balances: Map<string, number>, includeSpend: boolean, includeCredit: boolean) {
  const header = `Name,Phone,Email,Tags${includeSpend ? ",Total Spend" : ""},Visits,Last Visit${includeCredit ? ",Credit Balance" : ""}\n`;
  const body = rows
    .map((c) => {
      const common = `"${c.name}","${c.phone}","${c.email ?? ""}","${c.tags.join("; ")}"`;
      const spend = includeSpend ? `,${c.lifetimeSpend}` : "";
      const visits = `,${c.visitCount},"${c.lastVisitAt ?? ""}"`;
      const credit = includeCredit ? `,${balances.get(c.id) ?? 0}` : "";
      return `${common}${spend}${visits}${credit}`;
    })
    .join("\n");
  const blob = new Blob([header + body], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `customers-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function AllCustomersPanel() {
  const session = useSession();
  const currency = session.business.currency;
  const manager = session.user.role !== "staff";
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const query = useCustomersSearchStore((s) => s.query);

  const { data: privacy } = useQuery({ queryKey: ["customer-privacy-settings"], queryFn: fetchCustomerPrivacySettings, enabled: !manager });
  const canSeeMoney = manager;
  const canSeeCredit = manager || (privacy?.creditBalanceVisibleToStaff ?? false);
  const canExport = manager || (privacy?.staffCanExport ?? false);

  const [tagFilter, setTagFilter] = useState(() => searchParams.get("tag") ?? "All tags");
  const [visitFilter, setVisitFilter] = useState("Any last visit");
  const [minSpend, setMinSpend] = useState("");
  const [maxSpend, setMaxSpend] = useState("");
  const [creditFilter, setCreditFilter] = useState("All customers");
  const [optOutFilter, setOptOutFilter] = useState("All consent");
  const [incompleteOnly] = useState(() => searchParams.get("filter") === "incomplete");
  const [selected, setSelected] = useState<string[]>([]);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [messageOpen, setMessageOpen] = useState(false);

  const { data: customers = [], isPending } = useQuery({ queryKey: ["customers"], queryFn: fetchCustomers });
  const { data: debtors = [] } = useQuery({ queryKey: ["debtors", "overdue"], queryFn: () => fetchDebtors("overdue") });
  const balances = useMemo(() => new Map(debtors.map((d) => [d.customerId, d.balance])), [debtors]);

  const bulkTagMutation = useMutation({
    mutationFn: async (tag: string) => {
      const targets = customers.filter((c) => selected.includes(c.id));
      await Promise.all(targets.map((c) => (c.tags.includes(tag) ? Promise.resolve() : updateCustomer(c.id, { tags: [...c.tags, tag] }))));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["customers"] });
      toast.success(`Tagged ${selected.length} customer(s).`);
      setSelected([]);
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't tag these customers."),
  });

  const allTags = useMemo(() => Array.from(new Set(customers.flatMap((c) => c.tags))).sort(), [customers]);

  const filtered = useMemo(() => {
    return customers.filter((c) => {
      const q = query.trim().toLowerCase();
      if (q && !c.name.toLowerCase().includes(q) && !c.phone.includes(q) && !c.tags.some((t) => t.toLowerCase().includes(q))) return false;
      if (tagFilter !== "All tags" && !c.tags.includes(tagFilter)) return false;
      const d = daysSince(c.lastVisitAt);
      if (visitFilter === "Last 30 days" && d > 30) return false;
      if (visitFilter === "Last 90 days" && d > 90) return false;
      if (visitFilter === "Over 90 days ago" && d <= 90) return false;
      if (minSpend && c.lifetimeSpend < Number(minSpend)) return false;
      if (maxSpend && c.lifetimeSpend > Number(maxSpend)) return false;
      const hasCredit = balances.has(c.id);
      if (creditFilter === "Has credit" && !hasCredit) return false;
      if (creditFilter === "No credit" && hasCredit) return false;
      if (optOutFilter === "Opted out only" && c.consentMarketing) return false;
      if (optOutFilter === "Marketing allowed" && !c.consentMarketing) return false;
      if (incompleteOnly && !isIncompleteProfile(c)) return false;
      return true;
    });
  }, [customers, query, tagFilter, visitFilter, minSpend, maxSpend, creditFilter, optOutFilter, incompleteOnly, balances]);

  const kpis = useMemo(() => {
    const atRisk = customers.filter((c) => lifecycleOf(c) === "At Risk").length;
    const lapsed = customers.filter((c) => { const lc = lifecycleOf(c); return lc === "Lapsed" || lc === "Dormant"; }).length;
    const highValue = customers.filter((c) => c.lifetimeSpend > HIGH_VALUE_THRESHOLD).length;
    const incomplete = customers.filter(isIncompleteProfile).length;
    return { atRisk, lapsed, highValue, withCredit: debtors.length, incomplete };
  }, [customers, debtors]);

  const growth = useMemo(() => {
    const now = new Date();
    const months: { key: string; label: string; count: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString(undefined, { month: "short" }), count: 0 });
    }
    for (const c of customers) {
      const d = new Date(c.createdAt);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const bucket = months.find((m) => m.key === key);
      if (bucket) bucket.count += 1;
    }
    return months;
  }, [customers]);
  const maxGrowth = Math.max(...growth.map((m) => m.count), 1);

  function clearFilters() {
    setTagFilter("All tags");
    setVisitFilter("Any last visit");
    setMinSpend("");
    setMaxSpend("");
    setCreditFilter("All customers");
    setOptOutFilter("All consent");
  }

  function toggleSel(id: string) {
    setSelected((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]));
  }
  function toggleAll() {
    setSelected((ids) => (ids.length === filtered.length ? [] : filtered.map((c) => c.id)));
  }

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <SuggestedActions customers={customers} debtors={debtors.length} incomplete={kpis.incomplete} router={router} />

      <div className="grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(165px,1fr))" }}>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1.5px solid #FDD9D6" }}>
          <div className="text-[11.5px] font-bold" style={{ color: "#B42318" }}>At Risk</div>
          <div className="mt-[5px] text-[20px] font-extrabold" style={{ color: "var(--app-text)" }}>{kpis.atRisk}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[11.5px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Lapsed</div>
          <div className="mt-[5px] text-[20px] font-extrabold" style={{ color: "#B54708" }}>{kpis.lapsed}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[11.5px] font-semibold" style={{ color: "var(--app-text-muted)" }}>High Value</div>
          <div className="mt-[5px] text-[20px] font-extrabold" style={{ color: "var(--app-primary)" }}>{kpis.highValue}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[11.5px] font-semibold" style={{ color: "var(--app-text-muted)" }}>With Credit</div>
          <div className="mt-[5px] text-[20px] font-extrabold" style={{ color: "var(--app-text)" }}>{kpis.withCredit}</div>
        </div>
        <div className="rounded-[14px] p-[15px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
          <div className="text-[11.5px] font-semibold" style={{ color: "var(--app-text-muted)" }}>Incomplete Profiles</div>
          <div className="mt-[5px] text-[20px] font-extrabold" style={{ color: "#B54708" }}>{kpis.incomplete}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-[10px]">
        <span className="text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>Type 3 letters of a name, phone or tag — matches narrow instantly.</span>
        <span className="ml-auto flex flex-wrap gap-2">
          {canExport && <button type="button" onClick={() => downloadCsv(filtered, balances, canSeeMoney, canSeeCredit)} style={outlineBtn}>Export</button>}
          <button type="button" onClick={() => router.push("/customers/import")} style={outlineBtn}>Import</button>
        </span>
      </div>

      <div className="rounded-[16px] p-[17px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <h3 className="m-0 mb-1.5 text-[15px] font-extrabold" style={{ color: "var(--app-text)" }}>Customer growth</h3>
        <div className="flex h-[130px] items-end gap-3">
          {growth.map((m) => (
            <div key={m.key} className="flex flex-1 flex-col items-center gap-1.5">
              <span className="text-[10.5px] font-extrabold" style={{ color: "#0E8442" }}>{m.count}</span>
              <div className="w-full rounded-t-[5px]" style={{ height: `${Math.max((m.count / maxGrowth) * 90, 3)}px`, background: "#BFE7CF" }} />
              <span className="text-[10.5px] font-semibold" style={{ color: "var(--app-text-disabled)" }}>{m.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-[16px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)" }}>
        <div className="flex flex-wrap items-center gap-2 p-[13px_17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <select value={tagFilter} onChange={(e) => setTagFilter(e.target.value)} aria-label="Tag" style={selectStyle}>
            <option>All tags</option>
            {allTags.map((t) => <option key={t}>{t}</option>)}
          </select>
          <select value={visitFilter} onChange={(e) => setVisitFilter(e.target.value)} aria-label="Last visit" style={selectStyle}>
            {["Any last visit", "Last 30 days", "Last 90 days", "Over 90 days ago"].map((o) => <option key={o}>{o}</option>)}
          </select>
          <span className="flex items-center gap-1.5">
            <input type="number" value={minSpend} onChange={(e) => setMinSpend(e.target.value)} placeholder="Min spend" aria-label="Minimum spend" className="w-[104px] rounded-[10px] p-[9px] text-[12.5px]" style={{ border: "1px solid var(--app-border)" }} />
            <span style={{ color: "var(--app-text-disabled)" }}>–</span>
            <input type="number" value={maxSpend} onChange={(e) => setMaxSpend(e.target.value)} placeholder="Max spend" aria-label="Maximum spend" className="w-[104px] rounded-[10px] p-[9px] text-[12.5px]" style={{ border: "1px solid var(--app-border)" }} />
          </span>
          <select value={creditFilter} onChange={(e) => setCreditFilter(e.target.value)} aria-label="Has credit" style={selectStyle}>
            {["All customers", "Has credit", "No credit"].map((o) => <option key={o}>{o}</option>)}
          </select>
          <select value={optOutFilter} onChange={(e) => setOptOutFilter(e.target.value)} aria-label="Opted out" style={selectStyle}>
            {["All consent", "Opted out only", "Marketing allowed"].map((o) => <option key={o}>{o}</option>)}
          </select>
          <button type="button" onClick={clearFilters} style={outlineBtn}>Clear</button>
        </div>

        {selected.length > 0 && (
          <div className="flex flex-wrap items-center gap-3 p-[11px_17px]" style={{ background: "#0A1B2A" }}>
            <span className="text-[12.5px] font-bold text-white">{selected.length} selected</span>
            <button type="button" onClick={() => setSelected([])} className="text-[12px] font-semibold" style={{ color: "#8FF0BB" }}>Clear selection</button>
            <span className="ml-auto flex flex-wrap gap-2">
              <button type="button" onClick={() => { const tag = window.prompt("Tag to add to selected customers:"); if (tag?.trim()) bulkTagMutation.mutate(tag.trim()); }} disabled={bulkTagMutation.isPending} className="rounded-[9px] px-[14px] py-2 text-[12px] font-bold text-white" style={{ background: "var(--app-primary)" }}>Bulk Tag</button>
              <button type="button" onClick={() => setMessageOpen(true)} disabled={tagFilter === "All tags"} title={tagFilter === "All tags" ? "Pick a tag filter above to message this group" : undefined} className="rounded-[9px] px-[14px] py-2 text-[12px] font-bold text-white" style={{ border: "1px solid #1D3547", background: "transparent", opacity: tagFilter === "All tags" ? 0.5 : 1 }}>Message Segment</button>
            </span>
          </div>
        )}

        {!isPending && filtered.length === 0 && (
          <div className="p-[52px_18px] text-center">
            <div className="mx-auto max-w-[56ch] text-[14.5px] font-extrabold" style={{ color: "var(--app-text-muted)" }}>Customers appear here automatically after their first sale — or import your existing list</div>
            <div className="mt-[5px] text-[12.5px]" style={{ color: "var(--app-text-disabled)" }}>Nothing matches your search or filters.</div>
          </div>
        )}

        {filtered.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse" style={{ minWidth: 1100 }}>
              <thead>
                <tr style={{ background: "var(--app-surface-2)" }}>
                  <th className="w-[34px] p-[10px_0_10px_17px]"><input type="checkbox" checked={selected.length > 0 && selected.length === filtered.length} onChange={toggleAll} aria-label="Select all customers" style={{ width: 15, height: 15, accentColor: "var(--app-primary)" }} /></th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Customer</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Phone</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Tags</th>
                  {canSeeMoney && <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Total Spend</th>}
                  <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Visits</th>
                  <th className="p-[10px] text-start text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Last Visit</th>
                  {canSeeCredit && <th className="p-[10px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Credit Balance</th>}
                  <th className="p-[10px_17px] text-end text-[11px] font-bold" style={{ color: "var(--app-text-disabled)" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => {
                  const lc = lifecycleOf(c);
                  const tone = LIFECYCLE_TONE[lc];
                  const avatar = avatarColorFor(c.id);
                  const balance = balances.get(c.id);
                  return (
                    <tr key={c.id} style={{ borderTop: "1px solid var(--app-border-strong)" }}>
                      <td className="p-[11px_0_11px_17px]"><input type="checkbox" checked={selected.includes(c.id)} onChange={() => toggleSel(c.id)} aria-label={`Select ${c.name}`} style={{ width: 15, height: 15, accentColor: "var(--app-primary)" }} /></td>
                      <td className="p-[11px]">
                        <button type="button" onClick={() => router.push(`/customers/${c.id}`)} className="flex items-center gap-[10px] text-start">
                          <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-full text-[11.5px] font-extrabold" style={{ background: avatar.bg, color: avatar.fg }}>{initialsFor(c.name)}</span>
                          <span>
                            <span className="block text-[12.5px] font-bold" style={{ color: "var(--app-primary)" }}>{c.name}</span>
                            <span className="mt-0.5 block text-[11px]" style={{ color: "var(--app-text-disabled)" }}>{lc}</span>
                          </span>
                        </button>
                      </td>
                      <td className="whitespace-nowrap p-[11px] text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>{c.phone}</td>
                      <td className="p-[11px]">
                        <span className="flex flex-wrap gap-[5px]">
                          {c.tags.map((t) => (
                            <span key={t} className="whitespace-nowrap rounded-full px-2 py-[3px] text-[10px] font-extrabold" style={{ background: tone.bg, color: tone.fg }}>{t}</span>
                          ))}
                        </span>
                      </td>
                      {canSeeMoney && <td className="p-[11px] text-end text-[12.5px] font-extrabold" style={{ color: "var(--app-text)" }}>{formatCurrency(c.lifetimeSpend, currency)}</td>}
                      <td className="p-[11px] text-end text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>{c.visitCount}</td>
                      <td className="whitespace-nowrap p-[11px] text-[12px]" style={{ color: "var(--app-text-disabled)" }}>{c.lastVisitAt ? formatDate(c.lastVisitAt) : "—"}</td>
                      {canSeeCredit && <td className="p-[11px] text-end text-[12.5px] font-extrabold" style={{ color: balance ? "#B42318" : "var(--app-text-disabled)" }}>{balance ? formatCurrency(balance, currency) : "—"}</td>}
                      <td className="relative p-[11px_17px] text-end">
                        <span className="inline-flex flex-wrap justify-end gap-[7px]">
                          <a href={`https://wa.me/${c.phone.replace(/\D/g, "")}`} target="_blank" rel="noopener noreferrer" style={smallOutline}>Message</a>
                          <button type="button" onClick={() => { const tag = window.prompt(`Add a tag to ${c.name}:`); if (tag?.trim() && !c.tags.includes(tag.trim())) updateCustomer(c.id, { tags: [...c.tags, tag.trim()] }).then(() => queryClient.invalidateQueries({ queryKey: ["customers"] })); }} style={smallOutline}>Add Tag</button>
                          <button type="button" onClick={() => router.push(`/customers/${c.id}`)} style={smallPrimary}>View Profile</button>
                          <button type="button" onClick={() => setOpenMenuId(openMenuId === c.id ? null : c.id)} aria-label={`More actions for ${c.name}`} className="flex h-10 w-[38px] items-center justify-center rounded-[9px]" style={{ border: "1px solid var(--app-border)", color: "var(--app-text-muted)" }}>⋯</button>
                          {openMenuId === c.id && (
                            <div className="absolute right-[17px] top-[44px] z-20 w-[170px] rounded-[11px] p-[5px] text-start" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", boxShadow: "0 14px 34px rgba(16,24,40,.16)" }}>
                              <button type="button" onClick={() => { setOpenMenuId(null); router.push(`/customers/${c.id}`); }} className="block w-full rounded-[8px] px-[10px] py-[9px] text-start text-[12px] font-semibold" style={{ color: "var(--app-text-muted)" }}>View Profile</button>
                            </div>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {!manager && (
        <div className="rounded-[12px] p-[11px_14px] text-[12px]" style={{ background: "#FFFBF2", border: "1px solid #FDE3B3", color: "#93370D" }}>
          Staff role: spend is always hidden{!canSeeCredit ? ", credit balance is hidden" : ""}{!canExport ? " and export is unavailable" : ""} — configurable in Customer Settings → Privacy &amp; staff access.
        </div>
      )}

      {messageOpen && tagFilter !== "All tags" && (
        <TagSegmentMessageDialog tag={tagFilter} onClose={() => setMessageOpen(false)} />
      )}
    </main>
  );
}

function SuggestedActions({ customers, debtors, incomplete, router }: { customers: LiveCustomer[]; debtors: number; incomplete: number; router: ReturnType<typeof useRouter> }) {
  const lapsed = customers.filter((c) => { const lc = lifecycleOf(c); return lc === "Lapsed" || lc === "Dormant"; });
  if (customers.length === 0) return null;
  const items: { text: string; action: string; href: string }[] = [];
  if (lapsed.length > 0) items.push({ text: `${lapsed.length} customer(s) have stopped coming back.`, action: "Build a reactivation segment", href: "/customers/segments" });
  if (debtors > 0) items.push({ text: `${debtors} customer(s) owe money.`, action: "Open credit list", href: "/credit" });
  if (incomplete > 0) items.push({ text: `${incomplete} profile(s) are missing contact details.`, action: "Review incomplete profiles", href: "/customers?filter=incomplete" });
  if (items.length === 0) return null;

  return (
    <div className="rounded-[16px] p-[17px]" style={{ background: "#0A1B2A", color: "#fff" }}>
      <div className="mb-[11px] flex flex-wrap items-center gap-[9px]">
        <span className="text-[11px] font-extrabold uppercase tracking-wide" style={{ color: "#8FF0BB" }}>Suggested actions</span>
        <span className="text-[10.5px]" style={{ color: "#8EA3B4" }}>Computed from your own customer data</span>
      </div>
      <div className="flex flex-col gap-[9px]">
        {items.slice(0, 3).map((b, i) => (
          <div key={i} className="flex flex-wrap items-center gap-3 rounded-[12px] p-[13px]" style={{ background: "#0F2434", border: "1px solid #1D3547" }}>
            <span className="min-w-[220px] flex-1 text-[13px] font-bold text-white">{b.text}</span>
            <button type="button" onClick={() => router.push(b.href)} className="rounded-[10px] px-[15px] py-[10px] text-[12px] font-extrabold text-white" style={{ background: "var(--app-primary)" }}>{b.action}</button>
          </div>
        ))}
      </div>
    </div>
  );
}

function TagSegmentMessageDialog({ tag, onClose }: { tag: string; onClose: () => void }) {
  const [body, setBody] = useState(`Hi {{customerName}}, `);
  const rules: SegmentRules = { combinator: "AND", conditions: [{ field: "tags", operator: "contains", value: tag }] };
  const { data: preview } = useQuery({ queryKey: ["segment-preview", tag], queryFn: () => previewSegmentCount(rules) });

  const mutation = useMutation({
    mutationFn: async () => {
      const segment = await createSegment({ name: `Tag: ${tag}`, rules });
      return createCampaign({ segment: segment.id, body });
    },
    onSuccess: (campaign) => {
      toast.success(`Sent to ${campaign.sentCount} customer(s) tagged "${tag}".`);
      onClose();
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Couldn't send this message."),
  });

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: "rgba(10,27,42,.42)" }}>
      <div className="w-[460px] max-w-full rounded-[18px] p-0" style={{ background: "var(--app-surface)" }}>
        <div className="flex items-center gap-3 p-[17px]" style={{ borderBottom: "1px solid var(--app-surface-2)" }}>
          <h3 className="m-0 flex-1 text-[16px] font-extrabold" style={{ color: "var(--app-text)" }}>Message tag &quot;{tag}&quot;</h3>
          <button type="button" onClick={onClose} aria-label="Close" className="flex h-8 w-8 items-center justify-center rounded-[9px]" style={{ border: "1px solid var(--app-border)" }}>×</button>
        </div>
        <div className="flex flex-col gap-3 p-[17px]">
          <div className="text-[12.5px]" style={{ color: "var(--app-text-muted)" }}>{preview ? `${preview.count} customer(s) will receive this.` : "Counting…"}</div>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} className="w-full rounded-[11px] p-[11px] text-[13px]" style={{ border: "1px solid var(--app-border)" }} />
          <div className="rounded-[10px] p-[10px_12px] text-[12px]" style={{ background: "#FFFBF2", border: "1px solid #FDE3B3", color: "#93370D" }}>Only customers who consented to marketing are included.</div>
        </div>
        <div className="flex justify-end gap-[10px] p-[14px_17px]" style={{ borderTop: "1px solid var(--app-surface-2)" }}>
          <button type="button" onClick={onClose} style={outlineBtn}>Cancel</button>
          <button type="button" onClick={() => mutation.mutate()} disabled={!body.trim() || mutation.isPending} className="rounded-[11px] px-5 py-[11px] text-[12.5px] font-extrabold text-white" style={{ background: "var(--app-primary)" }}>{mutation.isPending ? "Sending…" : "Send"}</button>
        </div>
      </div>
    </div>
  );
}
