"use client";

import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { fetchProducts } from "@/lib/products-api";
import { useSession } from "@/lib/session";
import { toast } from "@/lib/toast";
import {
  archiveComplianceDocument,
  createComplianceDocument,
  fetchComplianceDocuments,
  fetchMarketEligibility,
  fetchRiskAudit,
  fetchRiskCases,
  fetchRiskRules,
  fetchRiskSummary,
  removeMarketEligibility,
  runRiskChecks,
  setMarketEligibility,
  updateRiskCase,
  updateRiskRule,
  updateComplianceDocument,
  type ComplianceDocType,
  type ComplianceDocument,
  type ComplianceDocumentInput,
  type MarketEligibilityStatus,
  type RiskCase,
  type RiskCaseStatus,
  type RiskRule,
} from "@/lib/commerce-risk-api";
import type { Product } from "@/lib/products";

type Tab = "cases" | "rules" | "documents" | "markets";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "cases", label: "Risk cases" },
  { id: "rules", label: "Rules & policies" },
  { id: "documents", label: "Documents" },
  { id: "markets", label: "Market eligibility" },
];

const RULE_LABEL: Record<RiskRule["key"], { title: string; description: string }> = {
  repeat_returns: { title: "Repeat returns", description: "Flag customers with repeated non-rejected returns in the selected window." },
  over_returned_order: { title: "Returned quantity exceeds order", description: "Flag an order when recorded returned quantity exceeds ordered quantity for a product." },
  coupon_repeat_use: { title: "Repeated coupon use", description: "Flag customers with repeated coupon orders in the selected window." },
};

const DOC_TYPES: Array<{ value: ComplianceDocType; label: string }> = [
  { value: "certificate", label: "Certificate" },
  { value: "test_report", label: "Test report" },
  { value: "license", label: "License" },
  { value: "declaration", label: "Declaration" },
  { value: "safety_data_sheet", label: "Safety data sheet" },
  { value: "other", label: "Other" },
];

const STATUS_LABEL: Record<RiskCaseStatus, string> = {
  open: "Open",
  investigating: "Investigating",
  resolved: "Resolved",
  dismissed: "Dismissed",
};

const fieldClass = "w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--app-primary)]";
const fieldStyle = { borderColor: "var(--app-border)", background: "var(--app-surface)", color: "var(--app-text)" };
const primaryButton = "inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50";
const secondaryButton = "inline-flex items-center justify-center rounded-lg border px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50";

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

function dateLabel(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function money(value: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(value);
  } catch {
    return `${currency} ${value.toFixed(2)}`;
  }
}

function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "warning" | "danger" }) {
  const colors = {
    neutral: { color: "var(--app-text-muted)", background: "var(--app-surface-2)", borderColor: "var(--app-border)" },
    success: { color: "var(--app-success-text)", background: "var(--app-success-bg)", borderColor: "var(--app-success-border)" },
    warning: { color: "var(--app-warning-text)", background: "var(--app-warning-bg)", borderColor: "var(--app-warning-border)" },
    danger: { color: "var(--app-danger-strong)", background: "var(--app-danger-bg)", borderColor: "var(--app-danger-border)" },
  };
  return <span className="inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold" style={colors[tone]}>{children}</span>;
}

function Kpi({ label, value, note, tone }: { label: string; value: ReactNode; note: string; tone?: "warning" | "danger" }) {
  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
      <p className="m-0 text-xs font-semibold" style={{ color: "var(--app-text-faint)" }}>{label}</p>
      <p className="m-0 mt-1 text-2xl font-bold" style={{ color: tone === "danger" ? "var(--app-danger-strong)" : tone === "warning" ? "var(--app-warning-text)" : "var(--app-text)" }}>{value}</p>
      <p className="m-0 mt-1 text-xs" style={{ color: "var(--app-text-faintest)" }}>{note}</p>
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="flex flex-col gap-1 text-xs font-semibold" style={{ color: "var(--app-text-muted)" }}>{label}{children}{hint && <span className="font-normal" style={{ color: "var(--app-text-faintest)" }}>{hint}</span>}</label>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section role="dialog" aria-modal="true" aria-label={title} className="my-auto max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border p-5 shadow-xl" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)", color: "var(--app-text)" }}>
        <div className="mb-4 flex items-center justify-between gap-3"><h2 className="m-0 text-base font-bold">{title}</h2><button type="button" onClick={onClose} className="text-sm font-semibold" style={{ color: "var(--app-text-faint)" }}>Close</button></div>
        {children}
      </section>
    </div>
  );
}

function jsonLines(value: unknown): Array<[string, string]> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, typeof item === "string" ? item : JSON.stringify(item)]);
  }
  return [["Evidence", typeof value === "string" ? value : JSON.stringify(value)]];
}

function nextStatuses(status: RiskCaseStatus): RiskCaseStatus[] {
  if (status === "open") return ["investigating", "resolved", "dismissed"];
  if (status === "investigating") return ["open", "resolved", "dismissed"];
  return ["open"];
}

function CaseDecisionDialog({ riskCase, onClose, onSave, saving }: { riskCase: RiskCase; onClose: () => void; onSave: (status: RiskCaseStatus, reason: string) => void; saving: boolean }) {
  const [status, setStatus] = useState<RiskCaseStatus>(nextStatuses(riskCase.status)[0] ?? "open");
  const [reason, setReason] = useState("");
  const needsReason = status === "resolved" || status === "dismissed";
  return (
    <Modal title={`Update case · ${riskCase.entityLabel}`} onClose={onClose}>
      <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); if (needsReason && reason.trim().length < 3) { toast.error("Add a reason of at least 3 characters."); return; } onSave(status, reason.trim()); }}>
        <Field label="New status"><select value={status} onChange={(event) => setStatus(event.target.value as RiskCaseStatus)} className={fieldClass} style={fieldStyle}>{nextStatuses(riskCase.status).map((item) => <option key={item} value={item}>{STATUS_LABEL[item]}</option>)}</select></Field>
        <Field label={needsReason ? "Reason (required)" : "Note (optional)"}><textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={3} maxLength={1000} className={fieldClass} style={fieldStyle} placeholder="Record why this decision was made" /></Field>
        <p className="m-0 text-xs" style={{ color: "var(--app-text-faint)" }}>Case decisions are written to the audit history. A case is a review signal and does not hold or release an order.</p>
        <button type="submit" disabled={saving} className={`${primaryButton} self-end`} style={{ background: "var(--app-primary)" }}>{saving ? "Saving…" : "Save decision"}</button>
      </form>
    </Modal>
  );
}

function DocumentDialog({ products, initial, onClose, onSave, saving }: { products: Product[]; initial?: ComplianceDocument; onClose: () => void; onSave: (input: ComplianceDocumentInput) => void; saving: boolean }) {
  const [productId, setProductId] = useState(initial?.productId ?? "");
  const [docType, setDocType] = useState<ComplianceDocType>(initial?.docType ?? "certificate");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [reference, setReference] = useState(initial?.reference ?? "");
  const [issuer, setIssuer] = useState(initial?.issuer ?? "");
  const [markets, setMarkets] = useState(initial?.markets.join(", ") ?? "");
  const [issuedAt, setIssuedAt] = useState(initial?.issuedAt?.slice(0, 10) ?? "");
  const [expiresAt, setExpiresAt] = useState(initial?.expiresAt?.slice(0, 10) ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  return (
    <Modal title={initial ? "Update compliance document record" : "Add compliance document record"} onClose={onClose}>
      <form className="grid gap-3 sm:grid-cols-2" onSubmit={(event) => {
        event.preventDefault();
        if (!title.trim()) { toast.error("Give the record a title."); return; }
        onSave({ productId: productId || null, docType, title: title.trim(), reference: reference.trim() || null, issuer: issuer.trim() || null, markets: markets.split(/[\s,]+/).filter(Boolean).map((value) => value.toUpperCase()), issuedAt: issuedAt || null, expiresAt: expiresAt || null, notes: notes.trim() || null });
      }}>
        <Field label="Record type"><select value={docType} onChange={(event) => setDocType(event.target.value as ComplianceDocType)} className={fieldClass} style={fieldStyle}>{DOC_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field>
        <Field label="Product (optional)"><select value={productId} onChange={(event) => setProductId(event.target.value)} className={fieldClass} style={fieldStyle}><option value="">Business-wide</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}{product.sku ? ` · ${product.sku}` : ""}</option>)}</select></Field>
        <Field label="Title"><input required value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} className={fieldClass} style={fieldStyle} /></Field>
        <Field label="Reference"><input value={reference} onChange={(event) => setReference(event.target.value)} maxLength={200} className={fieldClass} style={fieldStyle} /></Field>
        <Field label="Issuer"><input value={issuer} onChange={(event) => setIssuer(event.target.value)} maxLength={200} className={fieldClass} style={fieldStyle} /></Field>
        <Field label="Markets (ISO country codes)" hint="For example US, CA, GB"><input value={markets} onChange={(event) => setMarkets(event.target.value)} className={fieldClass} style={fieldStyle} /></Field>
        <Field label="Issued on"><input type="date" value={issuedAt} onChange={(event) => setIssuedAt(event.target.value)} className={fieldClass} style={fieldStyle} /></Field>
        <Field label="Expires on"><input type="date" value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} className={fieldClass} style={fieldStyle} /></Field>
        <div className="sm:col-span-2"><Field label="Notes"><textarea rows={2} maxLength={2000} value={notes} onChange={(event) => setNotes(event.target.value)} className={fieldClass} style={fieldStyle} /></Field></div>
        <p className="m-0 text-xs sm:col-span-2" style={{ color: "var(--app-warning-text)" }}>This records document metadata only. File upload, authenticity checks and regulatory verification are not configured.</p>
        <button type="submit" disabled={saving} className={`${primaryButton} justify-self-end sm:col-span-2`} style={{ background: "var(--app-primary)" }}>{saving ? "Saving…" : "Save document record"}</button>
      </form>
    </Modal>
  );
}

function RuleCard({ rule, onSave, saving }: { rule: RiskRule; onSave: (input: { enabled: boolean; threshold: number; windowDays: number }) => void; saving: boolean }) {
  const [enabled, setEnabled] = useState(rule.enabled);
  const [threshold, setThreshold] = useState(String(rule.threshold));
  const [windowDays, setWindowDays] = useState(String(rule.windowDays));
  const meta = RULE_LABEL[rule.key];
  return (
    <form onSubmit={(event) => { event.preventDefault(); const t = Number(threshold); const days = Number(windowDays); if (!Number.isInteger(t) || t < 1 || t > 1000 || !Number.isInteger(days) || days < 1 || days > 730) { toast.error("Threshold must be 1–1000 and window 1–730 days."); return; } onSave({ enabled, threshold: t, windowDays: days }); }} className="rounded-xl border p-4" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="m-0 text-sm font-bold">{meta.title}</h3><p className="mb-0 mt-1 text-xs" style={{ color: "var(--app-text-faint)" }}>{meta.description}</p></div><label className="flex items-center gap-2 text-xs font-semibold"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} /> Enabled</label></div>
      <div className="mt-4 flex flex-wrap items-end gap-3"><Field label="Count threshold"><input type="number" min={1} max={1000} value={threshold} onChange={(event) => setThreshold(event.target.value)} className={`${fieldClass} w-32`} style={fieldStyle} /></Field><Field label="Window (days)"><input type="number" min={1} max={730} value={windowDays} onChange={(event) => setWindowDays(event.target.value)} className={`${fieldClass} w-32`} style={fieldStyle} /></Field><button type="submit" disabled={saving} className={primaryButton} style={{ background: "var(--app-primary)" }}>{saving ? "Saving…" : "Save rule"}</button></div>
    </form>
  );
}

function riskTone(severity: RiskCase["severity"]): "danger" | "warning" | "neutral" {
  return severity === "high" ? "danger" : severity === "medium" ? "warning" : "neutral";
}

function documentTone(status: "expired" | "expiring" | "valid" | "no_expiry"): "danger" | "warning" | "success" | "neutral" {
  return status === "expired" ? "danger" : status === "expiring" ? "warning" : status === "valid" ? "success" : "neutral";
}

export function CommerceRiskComplianceView() {
  useModuleHeader({ title: "Risk & Compliance", subtitle: "Review explainable risk signals and maintain product-market compliance records." });
  const session = useSession();
  const currency = session.business.currency;
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("cases");
  const [caseFilter, setCaseFilter] = useState<RiskCaseStatus | "all">("all");
  const [selectedCase, setSelectedCase] = useState<RiskCase | null>(null);
  const [documentDialog, setDocumentDialog] = useState(false);
  const [editingDocument, setEditingDocument] = useState<ComplianceDocument | null>(null);
  const [marketProduct, setMarketProduct] = useState("");
  const [marketCode, setMarketCode] = useState("");
  const [marketStatus, setMarketStatus] = useState<MarketEligibilityStatus>("eligible");
  const [marketReason, setMarketReason] = useState("");

  const summaryQuery = useQuery({ queryKey: ["commerce-risk-summary"], queryFn: fetchRiskSummary });
  const casesQuery = useQuery({ queryKey: ["commerce-risk-cases", caseFilter], queryFn: () => fetchRiskCases(caseFilter) });
  const rulesQuery = useQuery({ queryKey: ["commerce-risk-rules"], queryFn: fetchRiskRules });
  const documentsQuery = useQuery({ queryKey: ["commerce-risk-documents"], queryFn: fetchComplianceDocuments });
  const eligibilityQuery = useQuery({ queryKey: ["commerce-market-eligibility"], queryFn: fetchMarketEligibility });
  const productsQuery = useQuery({ queryKey: ["risk-compliance-products"], queryFn: () => fetchProducts({ kind: "product", active: true }) });
  const products = useMemo(() => productsQuery.data ?? [], [productsQuery.data]);

  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ["commerce-risk-summary"] }),
    queryClient.invalidateQueries({ queryKey: ["commerce-risk-cases"] }),
    queryClient.invalidateQueries({ queryKey: ["commerce-risk-rules"] }),
    queryClient.invalidateQueries({ queryKey: ["commerce-risk-documents"] }),
    queryClient.invalidateQueries({ queryKey: ["commerce-market-eligibility"] }),
  ]);
  const runChecks = useMutation({ mutationFn: runRiskChecks, onSuccess: async (result) => { await refresh(); toast.success(`Checks finished: ${result.findings} findings, ${result.created} new cases.`); }, onError: (error) => toast.error(errorMessage(error, "Risk checks could not run.")) });
  const caseMutation = useMutation({ mutationFn: ({ id, status, reason }: { id: string; status: RiskCaseStatus; reason: string }) => updateRiskCase(id, { status, reason }), onSuccess: async () => { await refresh(); setSelectedCase(null); toast.success("Case decision saved and audited."); }, onError: (error) => toast.error(errorMessage(error, "Case decision could not be saved.")) });
  const ruleMutation = useMutation({ mutationFn: ({ key, input }: { key: RiskRule["key"]; input: { enabled: boolean; threshold: number; windowDays: number } }) => updateRiskRule(key, input), onSuccess: async () => { await refresh(); toast.success("Risk rule updated."); }, onError: (error) => toast.error(errorMessage(error, "Risk rule could not be saved.")) });
  const documentMutation = useMutation({ mutationFn: createComplianceDocument, onSuccess: async () => { await refresh(); setDocumentDialog(false); toast.success("Document record saved."); }, onError: (error) => toast.error(errorMessage(error, "Document record could not be saved.")) });
  const archiveMutation = useMutation({ mutationFn: archiveComplianceDocument, onSuccess: async () => { await refresh(); toast.success("Document record archived."); }, onError: (error) => toast.error(errorMessage(error, "Document record could not be archived.")) });
  const documentUpdateMutation = useMutation({ mutationFn: ({ id, input }: { id: string; input: ComplianceDocumentInput }) => updateComplianceDocument(id, input), onSuccess: async () => { await refresh(); setEditingDocument(null); toast.success("Document record updated."); }, onError: (error) => toast.error(errorMessage(error, "Document record could not be updated.")) });
  const eligibilityMutation = useMutation({ mutationFn: setMarketEligibility, onSuccess: async () => { await refresh(); setMarketCode(""); setMarketReason(""); toast.success("Market eligibility decision saved."); }, onError: (error) => toast.error(errorMessage(error, "Eligibility decision could not be saved.")) });
  const removeEligibilityMutation = useMutation({ mutationFn: removeMarketEligibility, onSuccess: async () => { await refresh(); toast.success("Eligibility decision removed."); }, onError: (error) => toast.error(errorMessage(error, "Decision could not be removed.")) });

  const summary = summaryQuery.data;
  const cases = casesQuery.data ?? [];
  const failed = [summaryQuery, casesQuery, rulesQuery, documentsQuery, eligibilityQuery, productsQuery].some((query) => query.isError);

  return (
    <main className="flex flex-col gap-5 p-5 md:p-7" style={{ color: "var(--app-text)" }}>
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4" style={{ background: "var(--app-surface)", borderColor: "var(--app-border)" }}>
        <div><h1 className="m-0 text-lg font-bold">Commerce Risk &amp; Compliance</h1><p className="mb-0 mt-1 text-sm" style={{ color: "var(--app-text-faint)" }}>Rule-based risk review and human-managed market eligibility for {session.business.name}.</p></div>
        <div className="flex flex-wrap gap-2"><button type="button" onClick={() => void refresh()} className={secondaryButton} style={{ borderColor: "var(--app-border)", color: "var(--app-text)" }}>Refresh</button><button type="button" onClick={() => runChecks.mutate()} disabled={runChecks.isPending} className={primaryButton} style={{ background: "var(--app-primary)" }}>{runChecks.isPending ? "Checking…" : "Run risk checks"}</button></div>
      </section>

      {failed && <div role="alert" className="rounded-xl border p-3 text-sm" style={{ borderColor: "var(--app-warning-border)", background: "var(--app-warning-bg)", color: "var(--app-warning-text)" }}>Some risk data could not be loaded. Refresh the affected section or check your connection; other sections remain available.</div>}
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Open risk cases" value={summaryQuery.isLoading ? "…" : summary?.openCases ?? "—"} note={`${summary?.highSeverityOpen ?? 0} high severity`} tone={summary?.highSeverityOpen ? "danger" : undefined} />
        <Kpi label="Open exposure" value={summary ? money(summary.openExposure, currency) : summaryQuery.isLoading ? "…" : "—"} note="Sum of open case exposure" />
        <Kpi label="Documents needing attention" value={summary ? summary.documentsExpired + summary.documentsExpiring : summaryQuery.isLoading ? "…" : "—"} note={`${summary?.documentsExpired ?? 0} expired · ${summary?.documentsExpiring ?? 0} expiring`} tone={summary?.documentsExpired ? "danger" : summary?.documentsExpiring ? "warning" : undefined} />
        <Kpi label="Markets blocked / review" value={summary ? `${summary.blockedMarkets} / ${summary.marketsInReview}` : summaryQuery.isLoading ? "…" : "—"} note="Product-market decisions" tone={summary?.blockedMarkets ? "warning" : undefined} />
      </section>

      <section className="rounded-xl border p-3 text-xs leading-5" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-2)", color: "var(--app-text-muted)" }}>
        Current coverage: checks use recorded returns, order quantities and coupon use. No payment-provider fraud/chargeback feed is connected; flagged cases do not place order holds. Market eligibility is a human decision, not a legal verification. Document records store metadata only; file upload and certificate authenticity checks are not configured.
      </section>

      <section className="overflow-hidden rounded-2xl border" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
        <div role="tablist" aria-label="Risk and compliance sections" className="flex gap-1 overflow-x-auto border-b px-3" style={{ borderColor: "var(--app-border)" }}>
          {TABS.map((item) => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)} className="whitespace-nowrap border-b-2 px-3 py-3 text-sm font-semibold" style={{ borderColor: tab === item.id ? "var(--app-primary)" : "transparent", color: tab === item.id ? "var(--app-text)" : "var(--app-text-faint)" }}>{item.label}</button>)}
        </div>

        {tab === "cases" && <div className="p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="m-0 text-base font-bold">Risk cases</h2><p className="mb-0 mt-1 text-xs" style={{ color: "var(--app-text-faint)" }}>Each case includes the recorded rule evidence that triggered it.</p></div><label className="flex items-center gap-2 text-xs font-semibold" style={{ color: "var(--app-text-muted)" }}>Status<select value={caseFilter} onChange={(event) => setCaseFilter(event.target.value as RiskCaseStatus | "all")} className="rounded-lg border px-2 py-2" style={fieldStyle}><option value="all">All statuses</option>{Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
          {casesQuery.isError ? <SectionError onRetry={() => void casesQuery.refetch()} /> : casesQuery.isLoading ? <p className="text-sm" style={{ color: "var(--app-text-faint)" }}>Loading risk cases…</p> : cases.length === 0 ? <div className="rounded-xl border border-dashed p-8 text-center" style={{ borderColor: "var(--app-border)" }}><p className="m-0 font-semibold">No risk cases in this view</p><p className="mb-0 mt-1 text-sm" style={{ color: "var(--app-text-faint)" }}>Run the available checks to review recorded order, return and coupon patterns.</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead><tr style={{ color: "var(--app-text-faint)" }}>{["Case / entity", "Rule", "Severity", "Exposure", "Signals", "Status", "Last detected", ""].map((label) => <th key={label} className="border-b px-3 py-2 text-xs font-bold" style={{ borderColor: "var(--app-border)" }}>{label}</th>)}</tr></thead><tbody>{cases.map((riskCase) => <RiskCaseRow key={riskCase.id} riskCase={riskCase} currency={currency} onDecide={() => setSelectedCase(riskCase)} />)}</tbody></table></div>}
        </div>}

        {tab === "rules" && <div className="flex flex-col gap-3 p-4"><div className="mb-1"><h2 className="m-0 text-base font-bold">Risk rules &amp; policies</h2><p className="mb-0 mt-1 text-xs" style={{ color: "var(--app-text-faint)" }}>Rules identify patterns for human review; they do not automatically block orders.</p></div>{rulesQuery.isError ? <SectionError onRetry={() => void rulesQuery.refetch()} /> : rulesQuery.isLoading ? <p className="text-sm" style={{ color: "var(--app-text-faint)" }}>Loading rules…</p> : (rulesQuery.data ?? []).length === 0 ? <p className="text-sm" style={{ color: "var(--app-text-faint)" }}>No rules are available.</p> : (rulesQuery.data ?? []).map((rule) => <RuleCard key={rule.id} rule={rule} saving={ruleMutation.isPending && ruleMutation.variables?.key === rule.key} onSave={(input) => ruleMutation.mutate({ key: rule.key, input })} />)}</div>}

        {tab === "documents" && <div className="p-4"><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h2 className="m-0 text-base font-bold">Documents &amp; certificates</h2><p className="mb-0 mt-1 text-xs" style={{ color: "var(--app-text-faint)" }}>Track references, applicable markets and expiry dates against canonical products.</p></div><button type="button" onClick={() => setDocumentDialog(true)} className={primaryButton} style={{ background: "var(--app-primary)" }}>Add document record</button></div>{documentsQuery.isError ? <SectionError onRetry={() => void documentsQuery.refetch()} /> : documentsQuery.isLoading ? <p className="text-sm" style={{ color: "var(--app-text-faint)" }}>Loading document records…</p> : (documentsQuery.data ?? []).length === 0 ? <div className="rounded-xl border border-dashed p-8 text-center" style={{ borderColor: "var(--app-border)" }}><p className="m-0 font-semibold">No compliance documents recorded</p><p className="mb-0 mt-1 text-sm" style={{ color: "var(--app-text-faint)" }}>Add a metadata record when you have a certificate, test report or licence to track.</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[800px] text-left text-sm"><thead><tr style={{ color: "var(--app-text-faint)" }}>{["Document", "Product", "Markets", "Issuer / reference", "Expiry", "Status", ""].map((label) => <th key={label} className="border-b px-3 py-2 text-xs font-bold" style={{ borderColor: "var(--app-border)" }}>{label}</th>)}</tr></thead><tbody>{(documentsQuery.data ?? []).map((document) => <tr key={document.id} className="border-b last:border-0" style={{ borderColor: "var(--app-border)" }}><td className="px-3 py-3"><span className="block font-semibold">{document.title}</span><span className="text-xs" style={{ color: "var(--app-text-faint)" }}>{DOC_TYPES.find((item) => item.value === document.docType)?.label ?? document.docType}</span></td><td className="px-3 py-3">{document.product?.name ?? "Business-wide"}</td><td className="px-3 py-3">{document.markets.length ? document.markets.join(", ") : "Not specified"}</td><td className="px-3 py-3">{document.issuer ?? "—"}{document.reference ? <span className="block text-xs" style={{ color: "var(--app-text-faint)" }}>{document.reference}</span> : null}</td><td className="px-3 py-3">{dateLabel(document.expiresAt)}</td><td className="px-3 py-3"><Pill tone={documentTone(document.status)}>{document.status.replace("_", " ")}</Pill></td><td className="px-3 py-3 text-right"><div className="flex justify-end gap-3"><button type="button" onClick={() => setEditingDocument(document)} className="text-xs font-semibold underline">Edit</button><button type="button" onClick={() => { if (window.confirm(`Archive “${document.title}”?`)) archiveMutation.mutate(document.id); }} disabled={archiveMutation.isPending} className="text-xs font-semibold underline" style={{ color: "var(--app-danger-strong)" }}>Archive</button></div></td></tr>)}</tbody></table></div>}</div>}

        {tab === "markets" && <div className="p-4"><div className="mb-4"><h2 className="m-0 text-base font-bold">Market eligibility</h2><p className="mb-0 mt-1 text-xs" style={{ color: "var(--app-text-faint)" }}>Eligibility is an explicit owner decision per product and ISO country code. A blocked decision prevents that product from syncing to that market through the supported channel-listing flow.</p></div>
          <form className="mb-5 grid gap-3 rounded-xl border p-4 sm:grid-cols-2 xl:grid-cols-5" style={{ borderColor: "var(--app-border)" }} onSubmit={(event: FormEvent<HTMLFormElement>) => { event.preventDefault(); const code = marketCode.trim().toUpperCase(); if (!marketProduct || !/^[A-Z]{2}$/.test(code)) { toast.error("Select a product and enter a two-letter ISO country code."); return; } if (marketStatus !== "eligible" && marketReason.trim().length < 3) { toast.error("Give a reason for review-required or blocked decisions."); return; } eligibilityMutation.mutate({ productId: marketProduct, market: code, status: marketStatus, reason: marketReason.trim() || undefined }); }}>
            <Field label="Product"><select value={marketProduct} onChange={(event) => setMarketProduct(event.target.value)} required className={fieldClass} style={fieldStyle}><option value="">Select product</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}{product.sku ? ` · ${product.sku}` : ""}</option>)}</select></Field>
            <Field label="Market country code"><input value={marketCode} onChange={(event) => setMarketCode(event.target.value.toUpperCase())} maxLength={2} placeholder="US" required className={fieldClass} style={fieldStyle} /></Field>
            <Field label="Decision"><select value={marketStatus} onChange={(event) => setMarketStatus(event.target.value as MarketEligibilityStatus)} className={fieldClass} style={fieldStyle}><option value="eligible">Eligible</option><option value="review_required">Review required</option><option value="blocked">Blocked</option></select></Field>
            <Field label="Reason" hint={marketStatus === "eligible" ? "Optional" : "Required for non-eligible decisions"}><input value={marketReason} onChange={(event) => setMarketReason(event.target.value)} maxLength={1000} className={fieldClass} style={fieldStyle} /></Field>
            <button type="submit" disabled={eligibilityMutation.isPending} className={`${primaryButton} self-end`} style={{ background: "var(--app-primary)" }}>{eligibilityMutation.isPending ? "Saving…" : "Save decision"}</button>
          </form>
          {productsQuery.isError && <SectionError onRetry={() => void productsQuery.refetch()} message="The product list couldn't be loaded." />}
          {eligibilityQuery.isError ? <SectionError onRetry={() => void eligibilityQuery.refetch()} /> : eligibilityQuery.isLoading ? <p className="text-sm" style={{ color: "var(--app-text-faint)" }}>Loading eligibility decisions…</p> : (eligibilityQuery.data ?? []).length === 0 ? <div className="rounded-xl border border-dashed p-8 text-center" style={{ borderColor: "var(--app-border)" }}><p className="m-0 font-semibold">No market decisions recorded</p><p className="mb-0 mt-1 text-sm" style={{ color: "var(--app-text-faint)" }}>No legal or marketplace eligibility is inferred until an owner records a decision.</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead><tr style={{ color: "var(--app-text-faint)" }}>{["Product", "Market", "Decision", "Reason", "Updated", ""].map((label) => <th key={label} className="border-b px-3 py-2 text-xs font-bold" style={{ borderColor: "var(--app-border)" }}>{label}</th>)}</tr></thead><tbody>{(eligibilityQuery.data ?? []).map((item) => <tr key={item.id} className="border-b last:border-0" style={{ borderColor: "var(--app-border)" }}><td className="px-3 py-3 font-semibold">{item.product.name}{item.product.sku ? <span className="ml-2 text-xs font-normal" style={{ color: "var(--app-text-faint)" }}>{item.product.sku}</span> : null}</td><td className="px-3 py-3">{item.market}</td><td className="px-3 py-3"><EligibilityPill status={item.status} /></td><td className="max-w-md px-3 py-3">{item.reason ?? "—"}</td><td className="px-3 py-3">{dateLabel(item.updatedAt)}</td><td className="px-3 py-3 text-right"><button type="button" onClick={() => { if (window.confirm(`Remove the ${item.market} eligibility decision for ${item.product.name}?`)) removeEligibilityMutation.mutate(item.id); }} disabled={removeEligibilityMutation.isPending} className="text-xs font-semibold underline" style={{ color: "var(--app-danger-strong)" }}>Remove</button></td></tr>)}</tbody></table></div>}
        </div>}
      </section>
      {selectedCase && <CaseDecisionDialog riskCase={selectedCase} onClose={() => setSelectedCase(null)} saving={caseMutation.isPending} onSave={(status, reason) => caseMutation.mutate({ id: selectedCase.id, status, reason })} />}
      {documentDialog && <DocumentDialog products={products} onClose={() => setDocumentDialog(false)} saving={documentMutation.isPending} onSave={(input) => documentMutation.mutate(input)} />}
      {editingDocument && <DocumentDialog initial={editingDocument} products={products} onClose={() => setEditingDocument(null)} saving={documentUpdateMutation.isPending} onSave={(input) => documentUpdateMutation.mutate({ id: editingDocument.id, input })} />}
    </main>
  );
}

function SectionError({ message = "This section couldn't be loaded.", onRetry }: { message?: string; onRetry: () => void }) {
  return <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3 text-sm" style={{ borderColor: "var(--app-warning-border)", background: "var(--app-warning-bg)", color: "var(--app-warning-text)" }}><span>{message}</span><button type="button" onClick={onRetry} className="font-semibold underline">Retry</button></div>;
}

function RiskCaseRow({ riskCase, currency, onDecide }: { riskCase: RiskCase; currency: string; onDecide: () => void }) {
  const [expanded, setExpanded] = useState(false);
  return <>
    <tr className="border-b" style={{ borderColor: "var(--app-border)" }}><td className="px-3 py-3"><button type="button" onClick={() => setExpanded((value) => !value)} className="text-left font-semibold underline decoration-dotted">{riskCase.entityLabel}</button><span className="block text-xs" style={{ color: "var(--app-text-faint)" }}>{riskCase.entityType} · {riskCase.ruleKey.replaceAll("_", " ")}</span></td><td className="px-3 py-3">{RULE_LABEL[riskCase.ruleKey].title}</td><td className="px-3 py-3"><Pill tone={riskTone(riskCase.severity)}>{riskCase.severity}</Pill></td><td className="px-3 py-3">{money(riskCase.exposureAmount, currency)}</td><td className="px-3 py-3">{riskCase.signalCount}</td><td className="px-3 py-3">{STATUS_LABEL[riskCase.status]}</td><td className="px-3 py-3">{dateLabel(riskCase.lastDetectedAt)}</td><td className="px-3 py-3 text-right"><button type="button" onClick={onDecide} className="text-xs font-semibold underline">Update</button></td></tr>
    {expanded && <tr className="border-b" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-2)" }}><td colSpan={8} className="px-4 py-3"><p className="mb-2 mt-0 text-xs font-bold">Recorded evidence</p><dl className="m-0 grid gap-x-5 gap-y-2 text-xs sm:grid-cols-2">{jsonLines(riskCase.evidence).map(([key, value]) => <div key={key}><dt className="font-semibold" style={{ color: "var(--app-text-faint)" }}>{key.replaceAll("_", " ")}</dt><dd className="m-0 break-words">{value}</dd></div>)}</dl>{riskCase.resolution && <p className="mb-0 mt-3 text-xs"><strong>Resolution:</strong> {riskCase.resolution}</p>}<CaseAudit entityId={riskCase.id} /></td></tr>}
  </>;
}

function CaseAudit({ entityId }: { entityId: string }) {
  const auditQuery = useQuery({ queryKey: ["commerce-risk-audit", "case", entityId], queryFn: () => fetchRiskAudit("case", entityId) });
  return <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--app-border)" }}><h3 className="m-0 text-xs font-bold">Decision audit</h3>{auditQuery.isLoading ? <p className="mb-0 mt-2 text-xs" style={{ color: "var(--app-text-faint)" }}>Loading audit history…</p> : auditQuery.isError ? <SectionError message="Audit history couldn't be loaded." onRetry={() => void auditQuery.refetch()} /> : (auditQuery.data ?? []).length === 0 ? <p className="mb-0 mt-2 text-xs" style={{ color: "var(--app-text-faint)" }}>No audit entries recorded.</p> : <ul className="mb-0 mt-2 flex flex-col gap-1 pl-4 text-xs">{auditQuery.data?.map((entry) => <li key={entry.id}>{entry.action.replaceAll("_", " ")} · {dateLabel(entry.createdAt)}{entry.reason ? ` · ${entry.reason}` : ""}</li>)}</ul>}</div>;
}

function EligibilityPill({ status }: { status: MarketEligibilityStatus }) {
  const tone = status === "eligible" ? "success" : status === "blocked" ? "danger" : "warning";
  const label = status === "review_required" ? "Review required" : status.charAt(0).toUpperCase() + status.slice(1);
  return <Pill tone={tone}>{label}</Pill>;
}
