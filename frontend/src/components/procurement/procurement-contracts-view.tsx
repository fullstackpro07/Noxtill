"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCircle2, ExternalLink, History, Plus } from "lucide-react";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { Btn, Card, Empty, Field, Kpi, Notice, Page, StatusBadge, errorText, formatDate, inputClass, inputStyle, money } from "@/components/website/website-ui";
import { procurementContractsApi, type ContractEffectiveStatus, type ContractInput, type DiscountTier, type SupplierContract } from "@/lib/procurement-contracts-api";

const STATUS_LABEL: Record<ContractEffectiveStatus, { label: string; tone: string }> = {
  draft: { label: "Draft", tone: "draft" },
  active: { label: "Active", tone: "live" },
  renewal_due: { label: "Renewal due", tone: "pending" },
  renewal_unconfirmed: { label: "Auto-renewal to confirm", tone: "pending" },
  expired: { label: "Expired", tone: "failed" },
  terminated: { label: "Terminated", tone: "unpublished" },
};

type Form = Required<Pick<ContractInput, "supplierId" | "reference" | "title" | "effectiveFrom">> & ContractInput;

const EMPTY: Form = { supplierId: "", reference: "", title: "", effectiveFrom: new Date().toISOString().slice(0, 10), expiresAt: "", autoRenew: false, noticeDays: null, discountTiers: [], complianceRequirements: [], categories: [] };

function toForm(c: SupplierContract): Form {
  return {
    supplierId: c.supplier.id,
    reference: c.reference,
    title: c.title,
    effectiveFrom: c.effectiveFrom,
    expiresAt: c.expiresAt ?? "",
    autoRenew: c.autoRenew,
    noticeDays: c.noticeDays,
    documentUrl: c.documentUrl ?? "",
    currency: c.currency,
    paymentTerms: c.paymentTerms ?? "",
    discountTiers: c.discountTiers,
    priceValidUntil: c.priceValidUntil ?? "",
    minimumOrderQty: c.minimumOrderQty,
    sla: c.sla ?? "",
    deliveryTerms: c.deliveryTerms ?? "",
    incoterms: c.incoterms ?? "",
    warranty: c.warranty ?? "",
    complianceRequirements: c.complianceRequirements,
    categories: c.categories,
    ownerUserId: c.ownerUserId,
  };
}

export function ProcurementContractsView() {
  useModuleHeader({ title: "Supplier Contracts & Terms", subtitle: "Commercial terms, renewals and compliance for your suppliers" });
  const qc = useQueryClient();
  const params = useSearchParams();
  const q = useQuery({ queryKey: ["procurement", "contracts"], queryFn: procurementContractsApi.list });
  const options = useQuery({ queryKey: ["procurement", "contract-options"], queryFn: procurementContractsApi.options });
  const [filter, setFilter] = useState<"all" | "expiring" | "issues" | ContractEffectiveStatus>("all");
  const [supplierFilter, setSupplierFilter] = useState("");
  const [editing, setEditing] = useState<{ id: string | null; form: Form; reason: string } | null>(null);
  const [historyFor, setHistoryFor] = useState<string | null>(params.get("contract"));
  const [message, setMessage] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);

  const act = useMutation({
    mutationFn: async ({ fn }: { fn: () => Promise<unknown>; ok: string }) => fn(),
    onSuccess: (_d, v) => { setMessage({ tone: "ok", text: v.ok }); void qc.invalidateQueries({ queryKey: ["procurement"] }); },
    onError: (e) => setMessage({ tone: "danger", text: errorText(e) }),
  });
  const run = (ok: string, fn: () => Promise<unknown>) => act.mutate({ fn, ok });

  const rows = useMemo(() => (q.data?.contracts ?? []).filter((c) => {
    if (supplierFilter && c.supplier.id !== supplierFilter) return false;
    if (filter === "all") return true;
    if (filter === "expiring") return c.daysToExpiry !== null && c.daysToExpiry >= 0 && c.daysToExpiry <= 90;
    if (filter === "issues") return c.issues.length > 0;
    return c.effectiveStatus === filter;
  }), [q.data, filter, supplierFilter]);

  if (q.isLoading) return <Page><p className="m-0 text-sm" style={{ color: "var(--app-text-faint)" }}>Loading…</p></Page>;
  if (q.isError || !q.data) return <Page><Notice tone="danger">{errorText(q.error, "Couldn't load contracts.")}</Notice></Page>;
  const d = q.data;

  const save = () => {
    if (!editing) return;
    const f = editing.form;
    const payload: ContractInput = {
      ...f,
      expiresAt: f.expiresAt || null,
      priceValidUntil: f.priceValidUntil || null,
      documentUrl: f.documentUrl || null,
      ownerUserId: f.ownerUserId || null,
      reason: editing.reason || undefined,
    };
    if (editing.id) {
      delete payload.supplierId;
      delete payload.reference;
      run("Terms saved as a new version. Confirm them against the document when ready.", async () => { await procurementContractsApi.update(editing.id!, payload); setEditing(null); });
    } else {
      delete payload.reason;
      run("Contract created as a draft.", async () => { await procurementContractsApi.create(payload); setEditing(null); });
    }
  };

  return (
    <Page>
      {message && <Notice tone={message.tone}>{message.text}</Notice>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Kpi label="Active contracts" value={d.kpis.active} />
        <Kpi label="Expiring 30 / 60 / 90 days" value={`${d.kpis.expiring30} / ${d.kpis.expiring60} / ${d.kpis.expiring90}`} tone={d.kpis.expiring30 ? "warn" : undefined} />
        <Kpi label="Auto-renewing" value={d.kpis.autoRenewing} />
        <Kpi label="Spend under contract" value={money(d.kpis.spendUnderContract, d.currency)} hint="PO commitments, not billed" />
        <Kpi label="Non-compliant" value={d.kpis.nonCompliant} tone={d.kpis.nonCompliant ? "danger" : "ok"} hint="Unconfirmed terms or POs after expiry" />
      </div>

      <Card
        title="Contract register"
        actions={<Btn variant="primary" disabled={!options.data?.suppliers.length} title={options.data?.suppliers.length ? undefined : "Add a supplier first"} onClick={() => setEditing({ id: null, form: { ...EMPTY, currency: d.currency }, reason: "" })}><Plus className="h-3.5 w-3.5" aria-hidden /> New contract</Btn>}
      >
        {options.data && options.data.suppliers.length === 0 && <div className="mb-3"><Notice tone="warn">No suppliers yet. Add them in <Link className="font-semibold underline" href="/products/suppliers">Products → Suppliers</Link>; contracts always link to an existing supplier.</Notice></div>}
        <div className="mb-3 flex flex-wrap gap-2">
          <select aria-label="Filter" className={inputClass} style={{ ...inputStyle, maxWidth: 220 }} value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
            <option value="all">All contracts</option>
            <option value="expiring">Expiring in 90 days</option>
            <option value="issues">With compliance issues</option>
            {(Object.keys(STATUS_LABEL) as ContractEffectiveStatus[]).map((s) => <option key={s} value={s}>{STATUS_LABEL[s].label}</option>)}
          </select>
          <select aria-label="Supplier" className={inputClass} style={{ ...inputStyle, maxWidth: 220 }} value={supplierFilter} onChange={(e) => setSupplierFilter(e.target.value)}>
            <option value="">All suppliers</option>
            {(options.data?.suppliers ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        {rows.length === 0 ? <Empty>{d.contracts.length ? "No contracts match these filters." : "No supplier contracts yet. Record the terms of an agreement and link its document."}</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-xs">
              <thead style={{ color: "var(--app-text-faint)" }}>
                <tr><th className="py-2 pr-2">Contract</th><th className="py-2 pr-2">Supplier</th><th className="py-2 pr-2">Status</th><th className="py-2 pr-2">Term</th><th className="py-2 pr-2">Key terms</th><th className="py-2 pr-2">Spend under contract</th><th className="py-2 pr-2">Owner</th><th /></tr>
              </thead>
              <tbody>
                {rows.map((c) => (
                  <tr key={c.id} className="border-t align-top" style={{ borderColor: "var(--app-border)" }}>
                    <td className="py-2 pr-2"><span className="font-semibold">{c.reference}</span><br />{c.title}{c.documentUrl && <><br /><a className="inline-flex items-center gap-1 underline" href={c.documentUrl} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3" aria-hidden /> Document</a></>}</td>
                    <td className="py-2 pr-2">{c.supplier.name}</td>
                    <td className="py-2 pr-2">
                      <StatusBadge status={STATUS_LABEL[c.effectiveStatus].tone} label={STATUS_LABEL[c.effectiveStatus].label} />
                      {c.issues.map((i) => <p key={i} className="m-0 mt-1" style={{ color: "var(--app-danger-strong)" }}>{i}</p>)}
                      {c.termsConfirmedAt && <p className="m-0 mt-1" style={{ color: "var(--app-success-text)" }}>Terms confirmed v{c.version}{c.termsConfirmedBy ? ` by ${c.termsConfirmedBy}` : ""}</p>}
                    </td>
                    <td className="py-2 pr-2">{c.effectiveFrom} → {c.expiresAt ?? "no end"}{c.daysToExpiry !== null && c.daysToExpiry >= 0 && <><br />{c.daysToExpiry} days left</>}{c.noticeDeadline && c.noticeDays ? <><br />Notice by {c.noticeDeadline}</> : null}{c.autoRenew && <><br />Auto-renews</>}{c.renewalAlertSent && <><br />Renewal alert sent</>}</td>
                    <td className="py-2 pr-2" style={{ color: "var(--app-text-muted)" }}>
                      {[c.paymentTerms && `Pay: ${c.paymentTerms}`, c.minimumOrderQty && `MOQ ${c.minimumOrderQty}`, c.discountTiers.length && `${c.discountTiers.length} discount tier(s)`, c.incoterms, c.priceValidUntil && `Prices valid to ${c.priceValidUntil}`].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="py-2 pr-2">{money(c.spendUnderContract, d.currency)}<br /><span style={{ color: "var(--app-text-faint)" }}>{c.posUnderContract} PO(s)</span></td>
                    <td className="py-2 pr-2">{c.ownerName ?? "Business owners"}</td>
                    <td className="py-2 pr-2">
                      <div className="flex flex-col items-end gap-1">
                        {c.status !== "terminated" && <Btn onClick={() => setEditing({ id: c.id, form: toForm(c), reason: "" })}>Edit terms</Btn>}
                        {c.status === "draft" && <Btn variant="primary" onClick={() => run("Contract activated.", () => procurementContractsApi.setStatus(c.id, "active"))}>Activate</Btn>}
                        {c.status !== "draft" && c.status !== "terminated" && !c.termsConfirmedAt && <Btn disabled={!c.documentUrl} title={c.documentUrl ? undefined : "Link the source document first"} onClick={() => run("Terms confirmed.", () => procurementContractsApi.confirmTerms(c.id))}><CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Confirm terms</Btn>}
                        {c.status === "active" && <Btn onClick={() => run("Reminder sent.", () => procurementContractsApi.remind(c.id))}><Bell className="h-3.5 w-3.5" aria-hidden /> Notify owner</Btn>}
                        <Link className="rounded-lg border px-3 py-1.5 text-xs font-semibold" style={{ borderColor: "var(--app-border)" }} href="/autonomous-commerce/rfqs">Start RFQ</Link>
                        <Btn variant="ghost" onClick={() => setHistoryFor(historyFor === c.id ? null : c.id)}><History className="h-3.5 w-3.5" aria-hidden /> History</Btn>
                        {c.status === "active" && <Btn variant="danger" onClick={() => { const reason = window.prompt("Reason for terminating this contract?"); if (reason) run("Contract terminated.", () => procurementContractsApi.setStatus(c.id, "terminated", reason)); }}>Terminate</Btn>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="m-0 mt-2 text-[11px]" style={{ color: "var(--app-text-faint)" }}>
          {d.spendNote} Renewal alerts go out {d.alertLeadDays} days before each notice deadline (change in <Link className="underline" href="/settings/procurement">Procurement Settings</Link>). Contract files stay where they are hosted: there is no Documents &amp; eSign module, so contracts link to the file instead of storing a copy. Supplier details stay in <Link className="underline" href="/products/suppliers">Products → Suppliers</Link>.
        </p>
      </Card>

      {editing && <ContractEditor editing={editing} options={options.data} onChange={setEditing} onSave={save} saving={act.isPending} />}
      {historyFor && <ContractHistory id={historyFor} />}
    </Page>
  );
}

function ContractEditor({ editing, options, onChange, onSave, saving }: { editing: { id: string | null; form: Form; reason: string }; options?: { suppliers: { id: string; name: string }[]; members: { userId: string; name: string }[] }; onChange: (e: { id: string | null; form: Form; reason: string } | null) => void; onSave: () => void; saving: boolean }) {
  const f = editing.form;
  const set = (patch: Partial<Form>) => onChange({ ...editing, form: { ...f, ...patch } });
  const tiers = f.discountTiers ?? [];
  const setTier = (i: number, patch: Partial<DiscountTier>) => set({ discountTiers: tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const num = (v: string) => (v === "" ? null : Number(v));
  return (
    <Card title={editing.id ? `Edit terms: ${f.reference}` : "New supplier contract"} actions={<><Btn variant="primary" onClick={onSave} disabled={saving}>Save</Btn><Btn variant="ghost" onClick={() => onChange(null)}>Cancel</Btn></>}>
      {editing.id && <div className="mb-3"><Notice tone="warn">Saving changed terms creates a new version and clears the &ldquo;terms confirmed&rdquo; status until someone checks them against the document again.</Notice></div>}
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Supplier"><select className={inputClass} style={inputStyle} value={f.supplierId} disabled={!!editing.id} onChange={(e) => set({ supplierId: e.target.value })}><option value="">Choose…</option>{(options?.suppliers ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <Field label="Contract reference"><input className={inputClass} style={inputStyle} value={f.reference} disabled={!!editing.id} onChange={(e) => set({ reference: e.target.value })} /></Field>
        <Field label="Title"><input className={inputClass} style={inputStyle} value={f.title} onChange={(e) => set({ title: e.target.value })} /></Field>
        <Field label="Source document link" hint="Where the signed file lives (https://…)."><input className={inputClass} style={inputStyle} value={f.documentUrl ?? ""} onChange={(e) => set({ documentUrl: e.target.value })} /></Field>
        <Field label="Effective from"><input type="date" className={inputClass} style={inputStyle} value={f.effectiveFrom} onChange={(e) => set({ effectiveFrom: e.target.value })} /></Field>
        <Field label="Expires"><input type="date" className={inputClass} style={inputStyle} value={f.expiresAt ?? ""} onChange={(e) => set({ expiresAt: e.target.value })} /></Field>
        <Field label="Notice period (days)"><input type="number" min={0} max={730} className={inputClass} style={inputStyle} value={f.noticeDays ?? ""} onChange={(e) => set({ noticeDays: num(e.target.value) })} /></Field>
        <label className="flex items-center gap-2 self-end pb-2 text-xs"><input type="checkbox" checked={!!f.autoRenew} onChange={(e) => set({ autoRenew: e.target.checked })} /> Auto-renews</label>
        <Field label="Owner (gets renewal alerts)"><select className={inputClass} style={inputStyle} value={f.ownerUserId ?? ""} onChange={(e) => set({ ownerUserId: e.target.value || null })}><option value="">All business owners</option>{(options?.members ?? []).map((m) => <option key={m.userId} value={m.userId}>{m.name}</option>)}</select></Field>
        <Field label="Currency"><input className={inputClass} style={inputStyle} value={f.currency ?? ""} maxLength={3} onChange={(e) => set({ currency: e.target.value.toUpperCase() })} /></Field>
        <Field label="Payment terms"><input className={inputClass} style={inputStyle} value={f.paymentTerms ?? ""} placeholder="e.g. Net 30" onChange={(e) => set({ paymentTerms: e.target.value })} /></Field>
        <Field label="Prices valid until"><input type="date" className={inputClass} style={inputStyle} value={f.priceValidUntil ?? ""} onChange={(e) => set({ priceValidUntil: e.target.value })} /></Field>
        <Field label="Minimum order quantity"><input type="number" min={1} className={inputClass} style={inputStyle} value={f.minimumOrderQty ?? ""} onChange={(e) => set({ minimumOrderQty: num(e.target.value) })} /></Field>
        <Field label="Incoterms (optional)"><input className={inputClass} style={inputStyle} value={f.incoterms ?? ""} placeholder="e.g. FOB" onChange={(e) => set({ incoterms: e.target.value })} /></Field>
        <Field label="Delivery terms"><input className={inputClass} style={inputStyle} value={f.deliveryTerms ?? ""} onChange={(e) => set({ deliveryTerms: e.target.value })} /></Field>
        <Field label="Warranty"><input className={inputClass} style={inputStyle} value={f.warranty ?? ""} onChange={(e) => set({ warranty: e.target.value })} /></Field>
        <div className="md:col-span-2"><Field label="SLA"><textarea className={inputClass} style={{ ...inputStyle, minHeight: 50 }} value={f.sla ?? ""} onChange={(e) => set({ sla: e.target.value })} /></Field></div>
        <Field label="Insurance / certification requirements (comma separated)"><input className={inputClass} style={inputStyle} value={(f.complianceRequirements ?? []).join(", ")} onChange={(e) => set({ complianceRequirements: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} /></Field>
        <Field label="Categories covered (comma separated)"><input className={inputClass} style={inputStyle} value={(f.categories ?? []).join(", ")} onChange={(e) => set({ categories: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} /></Field>
      </div>
      <div className="mt-3">
        <p className="m-0 mb-2 text-xs font-bold">Discount tiers</p>
        {tiers.map((t, i) => (
          <div key={i} className="mb-2 grid gap-2 md:grid-cols-[1fr_1fr_1fr_auto]">
            <Field label="Min quantity"><input type="number" min={0} className={inputClass} style={inputStyle} value={t.minQty ?? ""} onChange={(e) => setTier(i, { minQty: num(e.target.value) })} /></Field>
            <Field label="or min spend"><input type="number" min={0} className={inputClass} style={inputStyle} value={t.minSpend ?? ""} onChange={(e) => setTier(i, { minSpend: num(e.target.value) })} /></Field>
            <Field label="Discount %"><input type="number" min={0} max={100} step="0.1" className={inputClass} style={inputStyle} value={t.percent} onChange={(e) => setTier(i, { percent: Number(e.target.value) })} /></Field>
            <Btn variant="ghost" className="self-end" onClick={() => set({ discountTiers: tiers.filter((_, j) => j !== i) })}>Remove</Btn>
          </div>
        ))}
        <Btn onClick={() => set({ discountTiers: [...tiers, { minQty: null, minSpend: null, percent: 5 }] })}><Plus className="h-3.5 w-3.5" aria-hidden /> Add tier</Btn>
      </div>
      {editing.id && <div className="mt-3"><Field label="Reason for the change"><input className={inputClass} style={inputStyle} value={editing.reason} onChange={(e) => onChange({ ...editing, reason: e.target.value })} placeholder="e.g. Renewed for 12 months" /></Field></div>}
    </Card>
  );
}

function ContractHistory({ id }: { id: string }) {
  const q = useQuery({ queryKey: ["procurement", "contract-history", id], queryFn: () => procurementContractsApi.history(id) });
  return (
    <Card title="Contract history">
      {q.isLoading ? <p className="m-0 text-sm">Loading…</p> : q.isError ? <Notice tone="danger">{errorText(q.error)}</Notice> : (q.data ?? []).length === 0 ? <Empty>No history.</Empty> : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0 text-xs">
          {q.data!.map((h) => (
            <li key={h.id} className="rounded-lg border p-2" style={{ borderColor: "var(--app-border)" }}>
              <strong>{h.kind === "terms" ? `Terms v${h.version}` : "Status"}</strong> · {h.reason ?? "—"} · {formatDate(h.createdAt)}{h.actorName ? ` · ${h.actorName}` : ""}
              {h.terms && <p className="m-0 mt-1" style={{ color: "var(--app-text-muted)" }}>{["effectiveFrom", "expiresAt", "paymentTerms", "noticeDays", "minimumOrderQty"].map((k) => `${k}: ${String(h.terms![k] ?? "—")}`).join(" · ")}</p>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
