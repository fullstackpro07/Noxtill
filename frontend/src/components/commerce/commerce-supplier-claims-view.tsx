"use client";

import { useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  ExternalLink,
  FileText,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Upload,
  X,
} from "lucide-react";
import { ApiError } from "@/lib/api-client";
import {
  acknowledgeCommerceSupplierClaim,
  closeCommerceSupplierClaim,
  createCommerceSupplierClaim,
  fetchCommerceSupplierClaimHistory,
  fetchCommerceSupplierClaims,
  fetchCommerceSupplierLossPatterns,
  recordCommerceSupplierClaimCommunication,
  recordCommerceSupplierClaimSettlement,
  rejectCommerceSupplierClaim,
  submitCommerceSupplierClaim,
  uploadCommerceSupplierClaimEvidence,
  type CommerceSupplierClaim,
  type CommerceSupplierClaimAudit,
  type CommerceSupplierClaimCommunicationChannel,
  type CommerceSupplierClaimCommunicationDirection,
  type CommerceSupplierClaimEvidenceType,
  type CommerceSupplierClaimSettlementType,
  type CommerceSupplierClaimStatus,
} from "@/lib/commerce-supplier-claims-api";
import { fetchPurchaseOrders } from "@/lib/purchase-orders-api";
import { fetchSuppliers } from "@/lib/suppliers-api";
import { useSession } from "@/lib/session";
import { toast } from "@/lib/toast";

const ACTIVE_STATUSES = new Set<CommerceSupplierClaimStatus>([
  "submitted",
  "acknowledged",
  "partially_settled",
]);

const STATUS_LABEL: Record<CommerceSupplierClaimStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  acknowledged: "Response received",
  partially_settled: "Partially recovered",
  settled: "Recovered",
  rejected: "Rejected",
  closed: "Closed",
};

const STATUS_FILTERS: Array<{ value: "all" | CommerceSupplierClaimStatus; label: string }> = [
  { value: "all", label: "All claims" },
  { value: "draft", label: "Draft" },
  { value: "submitted", label: "Submitted" },
  { value: "acknowledged", label: "Response received" },
  { value: "partially_settled", label: "Partially recovered" },
  { value: "settled", label: "Recovered" },
  { value: "rejected", label: "Rejected" },
  { value: "closed", label: "Closed" },
];

const EVIDENCE_TYPES: Array<{ value: CommerceSupplierClaimEvidenceType; label: string }> = [
  { value: "photo", label: "Photo" },
  { value: "invoice", label: "Invoice" },
  { value: "delivery_record", label: "Delivery record" },
  { value: "inspection_report", label: "Inspection report" },
  { value: "correspondence", label: "Correspondence" },
  { value: "other", label: "Other" },
];

const COMMUNICATION_CHANNELS: CommerceSupplierClaimCommunicationChannel[] = [
  "email",
  "phone",
  "portal",
  "messaging",
  "other",
];

const EMPTY_CLAIMS: CommerceSupplierClaim[] = [];

function currentMonthKey(): string {
  const current = new Date();
  return `${current.getFullYear()}-${current.getMonth()}`;
}

function money(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

function date(value: string | null | undefined): string {
  if (!value) return "Not recorded";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Not available" : parsed.toLocaleDateString();
}

function dateTime(value: string | null | undefined): string {
  if (!value) return "Not recorded";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Not available" : parsed.toLocaleString();
}

function shortId(id: string): string {
  return `CLM-${id.slice(0, 8).toUpperCase()}`;
}

function ageInDays(value: string | null): number | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : Math.max(0, Math.floor((Date.now() - timestamp) / 86_400_000));
}

function statusStyle(status: CommerceSupplierClaimStatus): CSSProperties {
  if (status === "settled") return { background: "var(--app-success-bg)", color: "var(--app-success-text)" };
  if (ACTIVE_STATUSES.has(status)) return { background: "var(--app-warning-bg)", color: "var(--app-warning-text)" };
  if (status === "rejected" || status === "closed") return { background: "var(--app-surface-2)", color: "var(--app-text-muted)" };
  return { background: "var(--app-success-bg)", color: "var(--app-primary)" };
}

function shortError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : "The request could not be completed.";
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-xs font-semibold" style={{ color: "var(--app-text-muted)" }}>
      {label}
      {children}
    </label>
  );
}

function controlClass(): string {
  return "w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-[var(--app-primary)]";
}

function Panel({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="rounded-xl border p-4" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold" style={{ color: "var(--app-text)" }}>{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function ClaimCreateDialog({
  currency,
  onClose,
  onCreated,
}: {
  currency: string;
  onClose: () => void;
  onCreated: (claim: CommerceSupplierClaim) => void;
}) {
  const suppliersQuery = useQuery({ queryKey: ["commerce-supplier-claims-suppliers"], queryFn: fetchSuppliers });
  const purchaseOrdersQuery = useQuery({ queryKey: ["commerce-supplier-claims-purchase-orders"], queryFn: () => fetchPurchaseOrders() });
  const [supplierId, setSupplierId] = useState("");
  const [purchaseOrderId, setPurchaseOrderId] = useState("");
  const [purchaseOrderItemId, setPurchaseOrderItemId] = useState("");
  const [reference, setReference] = useState("");
  const [reasonCode, setReasonCode] = useState("quality_issue");
  const [reason, setReason] = useState("");
  const [description, setDescription] = useState("");
  const [quantityAffected, setQuantityAffected] = useState("1");
  const [productLossAmount, setProductLossAmount] = useState("");
  const [freightLossAmount, setFreightLossAmount] = useState("0");
  const [otherLossAmount, setOtherLossAmount] = useState("0");
  const queryClient = useQueryClient();

  const purchaseOrders = (purchaseOrdersQuery.data ?? []).filter((order) => order.supplierId === supplierId);
  const selectedOrder = purchaseOrders.find((order) => order.id === purchaseOrderId);
  const selectedOrderItem = selectedOrder?.items.find((item) => item.id === purchaseOrderItemId);

  const createMutation = useMutation({
    mutationFn: createCommerceSupplierClaim,
    onSuccess: (claim) => {
      void queryClient.invalidateQueries({ queryKey: ["commerce-supplier-claims"] });
      onCreated(claim);
      toast.success("Draft supplier claim created. Add evidence before submitting it.");
    },
    onError: (error) => toast.error(shortError(error)),
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supplierId) return toast.error("Select a supplier from the canonical supplier list.");
    if (!reason.trim() || !description.trim()) return toast.error("Add the reason and affected-item description.");
    const amount = Number(productLossAmount);
    if (!Number.isFinite(amount) || amount < 0) return toast.error("Enter a valid product loss amount.");
    const freight = Number(freightLossAmount || 0);
    const other = Number(otherLossAmount || 0);
    if (amount + freight + other <= 0) return toast.error("The claim must include a positive loss amount.");
    createMutation.mutate({
      supplierId,
      ...(purchaseOrderId ? { purchaseOrderId } : {}),
      ...(reference.trim() ? { reference: reference.trim() } : {}),
      reasonCode: reasonCode.trim() || "other",
      reason: reason.trim(),
      currency,
      items: [{
        ...(selectedOrderItem ? { purchaseOrderItemId: selectedOrderItem.id, productId: selectedOrderItem.productId } : {}),
        description: description.trim(),
        quantityAffected: Math.max(1, Math.floor(Number(quantityAffected) || 1)),
        productLossAmount: amount,
        freightLossAmount: freight,
        otherLossAmount: other,
      }],
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="claim-create-title" className="my-auto max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border p-5 shadow-xl" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 id="claim-create-title" className="text-lg font-extrabold" style={{ color: "var(--app-text)" }}>Create supplier claim</h2>
            <p className="mt-1 text-xs" style={{ color: "var(--app-text-muted)" }}>This creates an internal draft. It does not contact the supplier.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 hover:bg-[var(--app-surface-muted)]"><X size={18} /></button>
        </div>
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={submit}>
          <Field label="Supplier *">
            <select className={controlClass()} required value={supplierId} onChange={(event) => { setSupplierId(event.target.value); setPurchaseOrderId(""); setPurchaseOrderItemId(""); }}>
              <option value="">Choose a supplier</option>
              {(suppliersQuery.data ?? []).map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
            </select>
            {suppliersQuery.isError && <span className="font-normal text-red-600">Could not load suppliers. Refresh and try again.</span>}
          </Field>
          <Field label="Related purchase order">
            <select className={controlClass()} value={purchaseOrderId} disabled={!supplierId} onChange={(event) => { setPurchaseOrderId(event.target.value); setPurchaseOrderItemId(""); }}>
              <option value="">No purchase order linked</option>
              {purchaseOrders.map((order) => <option key={order.id} value={order.id}>{`PO-${order.id.slice(0, 8).toUpperCase()} · ${order.status}`}</option>)}
            </select>
            {purchaseOrdersQuery.isError && <span className="font-normal text-red-600">Purchase orders are unavailable; a claim can still be created without one.</span>}
          </Field>
          {selectedOrder && <Field label="Affected purchase-order item">
            <select className={controlClass()} value={purchaseOrderItemId} onChange={(event) => { setPurchaseOrderItemId(event.target.value); const item = selectedOrder.items.find((line) => line.id === event.target.value); if (item) setDescription(item.product.name); }}>
              <option value="">Describe without linking a line</option>
              {selectedOrder.items.map((item) => <option key={item.id} value={item.id}>{item.product.name}{item.product.sku ? ` · ${item.product.sku}` : ""}</option>)}
            </select>
          </Field>}
          <Field label="Reference"><input className={controlClass()} value={reference} maxLength={120} onChange={(event) => setReference(event.target.value)} placeholder="Supplier or incident reference" /></Field>
          <Field label="Reason category *"><select className={controlClass()} value={reasonCode} onChange={(event) => setReasonCode(event.target.value)}>
            <option value="quality_issue">Quality issue</option><option value="shortage">Short shipment</option><option value="damage">Damaged goods</option><option value="late_delivery">Late delivery</option><option value="incorrect_item">Incorrect item</option><option value="other">Other</option>
          </select></Field>
          <Field label="Quantity affected *"><input className={controlClass()} type="number" min="1" step="1" required value={quantityAffected} onChange={(event) => setQuantityAffected(event.target.value)} /></Field>
          <div className="sm:col-span-2"><Field label="What happened? *"><textarea className={`${controlClass()} min-h-20`} required maxLength={5000} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Describe the supplier-related loss and what resolution is requested" /></Field></div>
          <div className="sm:col-span-2"><Field label="Affected product or item *"><input className={controlClass()} required maxLength={500} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Use the canonical purchase-order item when available" /></Field></div>
          <Field label={`Product loss (${currency}) *`}><input className={controlClass()} type="number" min="0" step="0.01" required value={productLossAmount} onChange={(event) => setProductLossAmount(event.target.value)} /></Field>
          <Field label={`Freight loss (${currency})`}><input className={controlClass()} type="number" min="0" step="0.01" value={freightLossAmount} onChange={(event) => setFreightLossAmount(event.target.value)} /></Field>
          <Field label={`Other loss (${currency})`}><input className={controlClass()} type="number" min="0" step="0.01" value={otherLossAmount} onChange={(event) => setOtherLossAmount(event.target.value)} /></Field>
          <div className="sm:col-span-2 mt-2 flex justify-end gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border px-4 py-2 text-sm font-semibold" style={{ borderColor: "var(--app-border)", color: "var(--app-text)" }}>Cancel</button>
            <button type="submit" disabled={createMutation.isPending || suppliersQuery.isLoading} className="rounded-lg px-4 py-2 text-sm font-bold text-white disabled:opacity-50" style={{ background: "var(--app-primary)" }}>{createMutation.isPending ? "Creating…" : "Create draft"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function CommerceSupplierClaimsView() {
  const session = useSession();
  const currency = session.business.currency || "USD";
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<"all" | CommerceSupplierClaimStatus>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [actionReason, setActionReason] = useState("");
  const [evidenceType, setEvidenceType] = useState<CommerceSupplierClaimEvidenceType>("other");
  const [evidenceNote, setEvidenceNote] = useState("");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [communicationChannel, setCommunicationChannel] = useState<CommerceSupplierClaimCommunicationChannel>("email");
  const [communicationDirection, setCommunicationDirection] = useState<CommerceSupplierClaimCommunicationDirection>("outbound");
  const [communicationSummary, setCommunicationSummary] = useState("");
  const [settlementType, setSettlementType] = useState<CommerceSupplierClaimSettlementType>("credit");
  const [settlementAmount, setSettlementAmount] = useState("");
  const [settlementReference, setSettlementReference] = useState("");
  const [settlementNote, setSettlementNote] = useState("");

  const claimsQuery = useQuery({
    queryKey: ["commerce-supplier-claims"],
    queryFn: () => fetchCommerceSupplierClaims(),
  });
  const claims = claimsQuery.data ?? EMPTY_CLAIMS;
  const selectedClaim = claims.find((claim) => claim.id === selectedId) ?? claims[0] ?? null;
  const historyQuery = useQuery({
    queryKey: ["commerce-supplier-claim-history", selectedClaim?.id],
    queryFn: () => fetchCommerceSupplierClaimHistory(selectedClaim!.id),
    enabled: Boolean(selectedClaim),
  });
  const lossPatternQuery = useQuery({
    queryKey: ["commerce-supplier-claim-loss-patterns"],
    queryFn: fetchCommerceSupplierLossPatterns,
  });
  const visibleClaims = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase();
    return claims.filter((claim) => {
      if (statusFilter !== "all" && claim.status !== statusFilter) return false;
      if (!normalized) return true;
      return [claim.id, claim.reference, claim.supplier.name, claim.reason, claim.reasonCode, claim.purchaseOrder?.id, ...claim.items.flatMap((item) => [item.description, item.product?.name, item.product?.sku])]
        .some((value) => value?.toLocaleLowerCase().includes(normalized));
    });
  }, [claims, search, statusFilter]);

  const actionMutation = useMutation({
    mutationFn: async (input: { claim: CommerceSupplierClaim; action: "submit" | "acknowledge" | "reject" | "close"; reason: string }) => {
      const { claim, action, reason } = input;
      switch (action) {
        case "submit": return submitCommerceSupplierClaim(claim.id, claim.version, reason);
        case "acknowledge": return acknowledgeCommerceSupplierClaim(claim.id, claim.version, reason);
        case "reject": return rejectCommerceSupplierClaim(claim.id, claim.version, reason);
        case "close": return closeCommerceSupplierClaim(claim.id, claim.version, reason);
      }
    },
    onSuccess: (updated) => {
      setActionReason("");
      void queryClient.invalidateQueries({ queryKey: ["commerce-supplier-claims"] });
      void queryClient.invalidateQueries({ queryKey: ["commerce-supplier-claim-history", updated.id] });
      void queryClient.invalidateQueries({ queryKey: ["commerce-supplier-claim-loss-patterns"] });
      toast.success(`Claim updated: ${STATUS_LABEL[updated.status]}.`);
    },
    onError: (error) => {
      void queryClient.invalidateQueries({ queryKey: ["commerce-supplier-claims"] });
      toast.error(shortError(error));
    },
  });

  const evidenceMutation = useMutation({
    mutationFn: ({ claim, file }: { claim: CommerceSupplierClaim; file: File }) =>
      uploadCommerceSupplierClaimEvidence(claim.id, { file, evidenceType, note: evidenceNote }),
    onSuccess: () => {
      setEvidenceFile(null);
      setEvidenceNote("");
      void queryClient.invalidateQueries({ queryKey: ["commerce-supplier-claims"] });
      void queryClient.invalidateQueries({ queryKey: ["commerce-supplier-claim-history", selectedClaim?.id] });
      toast.success("Evidence added to the draft claim.");
    },
    onError: (error) => toast.error(shortError(error)),
  });

  const communicationMutation = useMutation({
    mutationFn: (claim: CommerceSupplierClaim) => recordCommerceSupplierClaimCommunication(claim.id, {
      channel: communicationChannel,
      direction: communicationDirection,
      summary: communicationSummary,
      occurredAt: new Date().toISOString(),
    }),
    onSuccess: () => {
      setCommunicationSummary("");
      void queryClient.invalidateQueries({ queryKey: ["commerce-supplier-claims"] });
      void queryClient.invalidateQueries({ queryKey: ["commerce-supplier-claim-history", selectedClaim?.id] });
      toast.success("Communication recorded. No message was sent by Noxtill.");
    },
    onError: (error) => toast.error(shortError(error)),
  });

  const settlementMutation = useMutation({
    mutationFn: (claim: CommerceSupplierClaim) => recordCommerceSupplierClaimSettlement(claim.id, {
      expectedVersion: claim.version,
      settlementType,
      amount: Number(settlementAmount),
      currency: claim.currency,
      ...(settlementReference.trim() ? { financialReference: settlementReference.trim() } : {}),
      ...(settlementNote.trim() ? { note: settlementNote.trim() } : {}),
    }),
    onSuccess: (updated) => {
      setSettlementAmount("");
      setSettlementReference("");
      setSettlementNote("");
      void queryClient.invalidateQueries({ queryKey: ["commerce-supplier-claims"] });
      void queryClient.invalidateQueries({ queryKey: ["commerce-supplier-claim-history", updated.id] });
      void queryClient.invalidateQueries({ queryKey: ["commerce-supplier-claim-loss-patterns"] });
      toast.success("Supplier recovery recorded against the claim.");
    },
    onError: (error) => {
      void queryClient.invalidateQueries({ queryKey: ["commerce-supplier-claims"] });
      toast.error(shortError(error));
    },
  });

  const openClaims = claims.filter((claim) => ACTIVE_STATUSES.has(claim.status));
  const recoverableValue = openClaims.reduce((sum, claim) => sum + claim.outstandingAmount, 0);
  const month = currentMonthKey();
  const recoveredThisMonth = claims.flatMap((claim) => claim.settlements)
    .filter((settlement) => {
      const settled = new Date(settlement.settledAt);
      return !Number.isNaN(settled.getTime()) && `${settled.getFullYear()}-${settled.getMonth()}` === month;
    })
    .reduce((sum, settlement) => sum + settlement.amount, 0);
  const agingClaims = openClaims.filter((claim) => {
    const age = ageInDays(claim.submittedAt);
    return age !== null && age >= 30;
  }).length;
  const evidenceIncomplete = claims.filter((claim) => claim.status === "draft" && claim.evidence.length === 0).length;

  function performAction(action: "submit" | "acknowledge" | "reject" | "close") {
    if (!selectedClaim) return;
    if (!actionReason.trim()) return toast.error("Add a reason so the decision is recorded in the audit history.");
    actionMutation.mutate({ claim: selectedClaim, action, reason: actionReason.trim() });
  }

  function createDone(claim: CommerceSupplierClaim) {
    setShowCreate(false);
    setSelectedId(claim.id);
  }

  const inputStyle = { borderColor: "var(--app-border)", background: "var(--app-surface)", color: "var(--app-text)" };

  return (
    <main className="mx-auto w-full max-w-[1500px] p-4 sm:p-6">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><ShieldAlert size={22} style={{ color: "var(--app-primary)" }} /><h1 className="text-2xl font-extrabold" style={{ color: "var(--app-text)" }}>Supplier Claims</h1></div>
          <p className="mt-1 max-w-3xl text-sm" style={{ color: "var(--app-text-muted)" }}>Track supplier-caused losses and recovery separately from customer returns and refunds.</p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void claimsQuery.refetch()} disabled={claimsQuery.isFetching} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50" style={{ borderColor: "var(--app-border)", color: "var(--app-text)" }}><RefreshCw size={15} className={claimsQuery.isFetching ? "animate-spin" : ""} />Refresh</button>
          <button type="button" onClick={() => setShowCreate(true)} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-bold text-white" style={{ background: "var(--app-primary)" }}><Plus size={16} />Create claim</button>
        </div>
      </header>

      <div className="mb-4 rounded-lg border px-3 py-2.5 text-xs" style={{ borderColor: "var(--app-warning-border, var(--app-border))", background: "var(--app-warning-bg)", color: "var(--app-warning-text)" }}>
        Supplier contact is not connected: submitting a claim only updates Noxtill records. Log the real supplier response manually; recording a communication does not send it.
      </div>
      <p className="mb-3 text-[11px]" style={{ color: "var(--app-text-muted)" }}>The queue and its summary metrics use up to the latest 100 claims returned by the server.</p>

      {claimsQuery.isError && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">Claims could not be loaded. {shortError(claimsQuery.error)}</div>}

      <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Metric label="Open claims" value={claimsQuery.isLoading ? "Loading" : String(openClaims.length)} note="From claims currently loaded" />
        <Metric label="Recoverable value" value={claimsQuery.isLoading ? "Loading" : money(recoverableValue, currency)} note="Submitted or acknowledged claims" />
        <Metric label="Recovered this month" value={claimsQuery.isLoading ? "Loading" : money(recoveredThisMonth, currency)} note="Recorded supplier settlements" />
        <Metric label="Aging claims" value={claimsQuery.isLoading ? "Loading" : String(agingClaims)} note="Open for 30+ days" />
        <Metric label="Evidence incomplete" value={claimsQuery.isLoading ? "Loading" : String(evidenceIncomplete)} note="Drafts without evidence" />
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(480px,0.92fr)_minmax(520px,1.08fr)]">
        <section className="min-w-0 overflow-hidden rounded-xl border" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
          <div className="flex flex-wrap items-center gap-2 border-b p-3" style={{ borderColor: "var(--app-border)" }}>
            <div className="relative min-w-[180px] flex-1"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: "var(--app-text-muted)" }} /><input aria-label="Search supplier claims" className={`${controlClass()} pl-9`} style={inputStyle} value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search claims, supplier, product…" /></div>
            <select aria-label="Filter claims by status" className={`${controlClass()} w-auto min-w-36`} style={inputStyle} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as "all" | CommerceSupplierClaimStatus)}>{STATUS_FILTERS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
          </div>
          <div className="max-h-[720px] overflow-auto">
            {claimsQuery.isLoading ? <div className="p-8 text-center text-sm" style={{ color: "var(--app-text-muted)" }}>Loading supplier claims…</div> : visibleClaims.length === 0 ? <div className="p-8 text-center"><FileText size={25} className="mx-auto mb-2" style={{ color: "var(--app-text-muted)" }} /><p className="text-sm font-semibold" style={{ color: "var(--app-text)" }}>{claims.length ? "No claims match these filters" : "No supplier claims yet"}</p><p className="mt-1 text-xs" style={{ color: "var(--app-text-muted)" }}>{claims.length ? "Try another search or clear the status filter." : "Create a draft when there is a supplier-caused loss to document."}</p>{claims.length > 0 && <button type="button" className="mt-3 text-xs font-bold" style={{ color: "var(--app-primary)" }} onClick={() => { setSearch(""); setStatusFilter("all"); }}>Clear filters</button>}</div> : (
              <table className="w-full min-w-[640px] border-collapse text-left text-xs">
                <thead className="sticky top-0 z-10" style={{ background: "var(--app-surface-muted)", color: "var(--app-text-muted)" }}><tr><th className="px-3 py-3 font-semibold">Claim / supplier</th><th className="px-3 py-3 font-semibold">Reason / item</th><th className="px-3 py-3 font-semibold">Amount</th><th className="px-3 py-3 font-semibold">Evidence</th><th className="px-3 py-3 font-semibold">Status</th></tr></thead>
                <tbody>{visibleClaims.map((claim) => {
                  const age = ageInDays(claim.submittedAt);
                  const selected = selectedClaim?.id === claim.id;
                  return <tr key={claim.id} onClick={() => setSelectedId(claim.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedId(claim.id); } }} tabIndex={0} aria-selected={selected} className="cursor-pointer border-t outline-none focus-visible:ring-2 focus-visible:ring-inset" style={{ borderColor: "var(--app-border)", background: selected ? "var(--app-primary-soft)" : undefined }}>
                    <td className="px-3 py-3 align-top"><div className="font-bold" style={{ color: "var(--app-text)" }}>{shortId(claim.id)}</div><div className="mt-1" style={{ color: "var(--app-text-muted)" }}>{claim.supplier.name}</div><div className="mt-1" style={{ color: "var(--app-text-muted)" }}>{claim.purchaseOrder ? `PO-${claim.purchaseOrder.id.slice(0, 8).toUpperCase()}` : "No PO linked"}</div></td>
                    <td className="max-w-[170px] px-3 py-3 align-top"><div className="truncate font-semibold capitalize" style={{ color: "var(--app-text)" }}>{claim.reasonCode.replaceAll("_", " ")}</div><div className="mt-1 truncate" style={{ color: "var(--app-text-muted)" }}>{claim.items.map((item) => item.product?.name ?? item.description).join(", ")}</div>{age !== null && <div className="mt-1 flex items-center gap-1" style={{ color: "var(--app-text-muted)" }}><Clock3 size={12} />{age}d</div>}</td>
                    <td className="px-3 py-3 align-top"><div className="font-bold" style={{ color: "var(--app-text)" }}>{money(claim.requestedAmount, claim.currency)}</div><div className="mt-1" style={{ color: "var(--app-text-muted)" }}>Outstanding {money(claim.outstandingAmount, claim.currency)}</div></td>
                    <td className="px-3 py-3 align-top"><span className={claim.evidence.length ? "font-semibold text-[var(--app-success-text)]" : "font-semibold text-[var(--app-warning-text)]"}>{claim.evidence.length} file{claim.evidence.length === 1 ? "" : "s"}</span></td>
                    <td className="px-3 py-3 align-top"><span className="inline-flex rounded-full px-2 py-1 font-bold" style={statusStyle(claim.status)}>{STATUS_LABEL[claim.status]}</span></td>
                  </tr>;
                })}</tbody>
              </table>
            )}
          </div>
          <div className="border-t px-3 py-2 text-[11px]" style={{ borderColor: "var(--app-border)", color: "var(--app-text-muted)" }}>Showing up to {claims.length} of the latest 100 claims from this business.</div>
        </section>

        <div className="min-w-0 space-y-4">
          {!selectedClaim ? <section className="rounded-xl border p-10 text-center" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}><ShieldAlert size={28} className="mx-auto mb-2" style={{ color: "var(--app-text-muted)" }} /><p className="text-sm font-semibold" style={{ color: "var(--app-text)" }}>Select a claim to review</p></section> : <ClaimDetail
            claim={selectedClaim}
            history={historyQuery.data ?? []}
            historyLoading={historyQuery.isLoading}
            reason={actionReason}
            setReason={setActionReason}
            actionPending={actionMutation.isPending}
            performAction={performAction}
            evidenceType={evidenceType}
            setEvidenceType={setEvidenceType}
            evidenceNote={evidenceNote}
            setEvidenceNote={setEvidenceNote}
            evidenceFile={evidenceFile}
            setEvidenceFile={setEvidenceFile}
            evidencePending={evidenceMutation.isPending}
            uploadEvidence={() => { if (evidenceFile) evidenceMutation.mutate({ claim: selectedClaim, file: evidenceFile }); }}
            communicationChannel={communicationChannel}
            setCommunicationChannel={setCommunicationChannel}
            communicationDirection={communicationDirection}
            setCommunicationDirection={setCommunicationDirection}
            communicationSummary={communicationSummary}
            setCommunicationSummary={setCommunicationSummary}
            communicationPending={communicationMutation.isPending}
            recordCommunication={() => { if (!communicationSummary.trim()) return toast.error("Add a communication summary first."); communicationMutation.mutate(selectedClaim); }}
            settlementType={settlementType}
            setSettlementType={setSettlementType}
            settlementAmount={settlementAmount}
            setSettlementAmount={setSettlementAmount}
            settlementReference={settlementReference}
            setSettlementReference={setSettlementReference}
            settlementNote={settlementNote}
            setSettlementNote={setSettlementNote}
            settlementPending={settlementMutation.isPending}
            recordSettlement={() => {
              const value = Number(settlementAmount);
              if (!Number.isFinite(value) || value <= 0) return toast.error("Enter a settlement amount greater than zero.");
              if (value + selectedClaim.recoveredAmount > selectedClaim.requestedAmount) return toast.error("Recovery cannot exceed the recorded claim amount.");
              settlementMutation.mutate(selectedClaim);
            }}
          />}

          <Panel title="Supplier loss patterns" action={<span className="text-[10px]" style={{ color: "var(--app-text-muted)" }}>From recorded claims</span>}>
            {lossPatternQuery.isLoading ? <p className="text-xs" style={{ color: "var(--app-text-muted)" }}>Loading loss patterns…</p> : lossPatternQuery.isError ? <p className="text-xs" style={{ color: "var(--app-text-muted)" }}>Loss patterns are currently unavailable.</p> : (lossPatternQuery.data ?? []).length === 0 ? <p className="text-xs" style={{ color: "var(--app-text-muted)" }}>No submitted claim patterns have been recorded.</p> : <div className="space-y-2">{(lossPatternQuery.data ?? []).slice(0, 5).map((pattern) => <div key={`${pattern.supplier.id}:${pattern.product?.id ?? "unspecified"}`} className="flex items-center justify-between gap-3 text-xs"><div className="min-w-0"><p className="truncate font-semibold" style={{ color: "var(--app-text)" }}>{pattern.supplier.name} · {pattern.product?.name ?? "Unspecified product"}</p><p style={{ color: "var(--app-text-muted)" }}>{pattern.claimCount} claim{pattern.claimCount === 1 ? "" : "s"} · {pattern.quantityAffected} affected</p></div><span className="shrink-0 font-bold" style={{ color: "var(--app-text)" }}>{money(pattern.claimedLossAmount, currency)}</span></div>)}</div>}
          </Panel>
          <p className="rounded-lg border p-3 text-[11px]" style={{ borderColor: "var(--app-border)", color: "var(--app-text-muted)" }}><AlertTriangle size={13} className="mr-1 inline" />Supplier dispute rate is not tracked because the current data does not provide a verified supplier-incident denominator. Recovery records are also not automatically posted to accounting.</p>
        </div>
      </div>

      {showCreate && <ClaimCreateDialog currency={currency} onClose={() => setShowCreate(false)} onCreated={createDone} />}
    </main>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note: string }) {
  return <div className="rounded-xl border p-3 sm:p-4" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}><p className="text-[11px] font-semibold" style={{ color: "var(--app-text-muted)" }}>{label}</p><p className="mt-2 truncate text-xl font-extrabold sm:text-2xl" style={{ color: "var(--app-text)" }}>{value}</p><p className="mt-1 text-[10px]" style={{ color: "var(--app-text-muted)" }}>{note}</p></div>;
}

function ClaimDetail(props: {
  claim: CommerceSupplierClaim;
  history: CommerceSupplierClaimAudit[];
  historyLoading: boolean;
  reason: string;
  setReason: (value: string) => void;
  actionPending: boolean;
  performAction: (action: "submit" | "acknowledge" | "reject" | "close") => void;
  evidenceType: CommerceSupplierClaimEvidenceType;
  setEvidenceType: (value: CommerceSupplierClaimEvidenceType) => void;
  evidenceNote: string;
  setEvidenceNote: (value: string) => void;
  evidenceFile: File | null;
  setEvidenceFile: (value: File | null) => void;
  evidencePending: boolean;
  uploadEvidence: () => void;
  communicationChannel: CommerceSupplierClaimCommunicationChannel;
  setCommunicationChannel: (value: CommerceSupplierClaimCommunicationChannel) => void;
  communicationDirection: CommerceSupplierClaimCommunicationDirection;
  setCommunicationDirection: (value: CommerceSupplierClaimCommunicationDirection) => void;
  communicationSummary: string;
  setCommunicationSummary: (value: string) => void;
  communicationPending: boolean;
  recordCommunication: () => void;
  settlementType: CommerceSupplierClaimSettlementType;
  setSettlementType: (value: CommerceSupplierClaimSettlementType) => void;
  settlementAmount: string;
  setSettlementAmount: (value: string) => void;
  settlementReference: string;
  setSettlementReference: (value: string) => void;
  settlementNote: string;
  setSettlementNote: (value: string) => void;
  settlementPending: boolean;
  recordSettlement: () => void;
}) {
  const { claim } = props;
  const canRespond = claim.status === "submitted" || claim.status === "acknowledged";
  const canSettle = ACTIVE_STATUSES.has(claim.status);
  const canRecordCommunication = canRespond || claim.status === "partially_settled";
  const age = ageInDays(claim.submittedAt);
  const inputStyle = { borderColor: "var(--app-border)", background: "var(--app-surface)", color: "var(--app-text)" };

  return <>
    <section className="overflow-hidden rounded-xl border" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b p-4" style={{ borderColor: "var(--app-border)" }}>
        <div><div className="flex flex-wrap items-center gap-2"><h2 className="text-lg font-extrabold" style={{ color: "var(--app-text)" }}>{shortId(claim.id)}</h2><span className="rounded-full px-2.5 py-1 text-[10px] font-bold" style={statusStyle(claim.status)}>{STATUS_LABEL[claim.status]}</span></div><p className="mt-1 text-sm font-semibold" style={{ color: "var(--app-text)" }}>{claim.supplier.name}</p><p className="mt-1 text-xs" style={{ color: "var(--app-text-muted)" }}>{claim.supplier.email ?? claim.supplier.phone ?? "No supplier contact on file"} · Created {date(claim.createdAt)}</p></div>
        <div className="text-right"><div className="text-xl font-extrabold" style={{ color: "var(--app-text)" }}>{money(claim.requestedAmount, claim.currency)}</div><div className="mt-1 text-xs" style={{ color: "var(--app-text-muted)" }}>Requested · {money(claim.outstandingAmount, claim.currency)} outstanding</div></div>
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-3">
        <div><p className="text-[10px] font-semibold uppercase" style={{ color: "var(--app-text-muted)" }}>Purchase order</p><p className="mt-1 text-xs font-semibold" style={{ color: "var(--app-text)" }}>{claim.purchaseOrder ? `PO-${claim.purchaseOrder.id.slice(0, 8).toUpperCase()} · ${claim.purchaseOrder.status}` : "Not linked"}</p></div>
        <div><p className="text-[10px] font-semibold uppercase" style={{ color: "var(--app-text-muted)" }}>Reference</p><p className="mt-1 text-xs font-semibold" style={{ color: "var(--app-text)" }}>{claim.reference || "Not recorded"}</p></div>
        <div><p className="text-[10px] font-semibold uppercase" style={{ color: "var(--app-text-muted)" }}>Age</p><p className="mt-1 text-xs font-semibold" style={{ color: "var(--app-text)" }}>{age === null ? "Not submitted" : `${age} day${age === 1 ? "" : "s"} since submission`}</p></div>
      </div>

      <div className="border-t p-4" style={{ borderColor: "var(--app-border)" }}>
        <p className="mb-2 text-xs font-bold" style={{ color: "var(--app-text)" }}>Reason · {claim.reasonCode.replaceAll("_", " ")}</p>
        <p className="whitespace-pre-wrap text-xs leading-relaxed" style={{ color: "var(--app-text-muted)" }}>{claim.reason}</p>
        <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[420px] text-left text-xs"><thead style={{ color: "var(--app-text-muted)" }}><tr><th className="py-2 pr-3 font-semibold">Affected product / item</th><th className="px-2 py-2 font-semibold">Qty</th><th className="px-2 py-2 text-right font-semibold">Loss</th></tr></thead><tbody>{claim.items.map((item) => <tr key={item.id} className="border-t" style={{ borderColor: "var(--app-border)" }}><td className="py-2 pr-3" style={{ color: "var(--app-text)" }}>{item.product?.name ?? item.description}{item.product?.sku ? <span className="ml-1" style={{ color: "var(--app-text-muted)" }}>({item.product.sku})</span> : null}</td><td className="px-2 py-2" style={{ color: "var(--app-text-muted)" }}>{item.quantityAffected}</td><td className="px-2 py-2 text-right font-semibold" style={{ color: "var(--app-text)" }}>{money(item.lineLossAmount, claim.currency)}</td></tr>)}</tbody></table></div>
      </div>

      <div className="grid gap-3 border-t p-4 md:grid-cols-2" style={{ borderColor: "var(--app-border)" }}>
        <Panel title={`Evidence package · ${claim.evidence.length}`}>
          {claim.evidence.length ? <div className="mb-3 space-y-2">{claim.evidence.map((evidence) => <div key={evidence.id} className="flex items-center justify-between gap-2 rounded-lg border p-2" style={{ borderColor: "var(--app-border)" }}><div className="min-w-0"><p className="truncate text-xs font-semibold capitalize" style={{ color: "var(--app-text)" }}>{evidence.evidenceType.replaceAll("_", " ")}</p><p className="truncate text-[10px]" style={{ color: "var(--app-text-muted)" }}>{evidence.note || dateTime(evidence.createdAt)}</p></div><a href={evidence.downloadUrl} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-[11px] font-bold" style={{ color: "var(--app-primary)" }}>Open <ExternalLink size={12} /></a></div>)}</div> : <p className="mb-3 text-xs" style={{ color: "var(--app-text-muted)" }}>No evidence file has been added.</p>}
          {claim.status === "draft" ? <div className="space-y-2"><div className="grid grid-cols-2 gap-2"><select aria-label="Evidence type" className={controlClass()} style={inputStyle} value={props.evidenceType} onChange={(event) => props.setEvidenceType(event.target.value as CommerceSupplierClaimEvidenceType)}>{EVIDENCE_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><input aria-label="Evidence note" className={controlClass()} style={inputStyle} maxLength={2000} value={props.evidenceNote} onChange={(event) => props.setEvidenceNote(event.target.value)} placeholder="Short note (optional)" /></div><div className="flex flex-wrap items-center gap-2"><input aria-label="Evidence file" className="min-w-0 flex-1 text-xs" type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => props.setEvidenceFile(event.target.files?.[0] ?? null)} /><button type="button" disabled={!props.evidenceFile || props.evidencePending} onClick={props.uploadEvidence} className="inline-flex items-center gap-1 rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-50" style={{ borderColor: "var(--app-border)", color: "var(--app-text)" }}><Upload size={13} />{props.evidencePending ? "Uploading…" : "Add file"}</button></div><p className="text-[10px]" style={{ color: "var(--app-text-muted)" }}>PDF, JPEG, PNG or WebP · max 10 MB. Evidence is append-only and submission locks the package.</p></div> : null}
        </Panel>

        <Panel title={`Supplier conversation · ${claim.communications.length}`}>
          {claim.communications.length ? <div className="mb-3 max-h-36 space-y-2 overflow-y-auto">{claim.communications.map((communication) => <div key={communication.id} className="rounded-lg border p-2 text-xs" style={{ borderColor: "var(--app-border)" }}><div className="flex justify-between gap-2"><span className="font-semibold capitalize" style={{ color: "var(--app-text)" }}>{communication.direction} · {communication.channel}</span><span style={{ color: "var(--app-text-muted)" }}>{dateTime(communication.occurredAt)}</span></div><p className="mt-1 whitespace-pre-wrap" style={{ color: "var(--app-text-muted)" }}>{communication.summary}</p></div>)}</div> : <p className="mb-3 text-xs" style={{ color: "var(--app-text-muted)" }}>No supplier conversation has been recorded.</p>}
          {canRecordCommunication && <div className="space-y-2"><div className="grid grid-cols-2 gap-2"><select aria-label="Communication channel" className={controlClass()} style={inputStyle} value={props.communicationChannel} onChange={(event) => props.setCommunicationChannel(event.target.value as CommerceSupplierClaimCommunicationChannel)}>{COMMUNICATION_CHANNELS.map((channel) => <option key={channel} value={channel}>{channel}</option>)}</select><select aria-label="Communication direction" className={controlClass()} style={inputStyle} value={props.communicationDirection} onChange={(event) => props.setCommunicationDirection(event.target.value as CommerceSupplierClaimCommunicationDirection)}><option value="outbound">Outbound</option><option value="inbound">Inbound</option><option value="internal">Internal note</option></select></div><textarea aria-label="Communication summary" className={`${controlClass()} min-h-16`} style={inputStyle} maxLength={5000} value={props.communicationSummary} onChange={(event) => props.setCommunicationSummary(event.target.value)} placeholder="Record a real call, email, portal response or note" /><button type="button" disabled={props.communicationPending || !props.communicationSummary.trim()} onClick={props.recordCommunication} className="rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-50" style={{ borderColor: "var(--app-border)", color: "var(--app-text)" }}>{props.communicationPending ? "Saving…" : "Record communication"}</button><p className="text-[10px]" style={{ color: "var(--app-text-muted)" }}>This logs only an interaction that already happened; Noxtill does not send the message.</p></div>}
        </Panel>
      </div>

      <div className="grid gap-3 border-t p-4 md:grid-cols-2" style={{ borderColor: "var(--app-border)" }}>
        <Panel title={`Settlement · ${claim.settlements.length}`}>
          {claim.settlements.length ? <div className="mb-3 space-y-2">{claim.settlements.map((settlement) => <div key={settlement.id} className="flex justify-between gap-2 rounded-lg border p-2 text-xs" style={{ borderColor: "var(--app-border)" }}><div><p className="font-semibold capitalize" style={{ color: "var(--app-text)" }}>{settlement.settlementType} · {date(settlement.settledAt)}</p><p style={{ color: "var(--app-text-muted)" }}>{settlement.financialReference || settlement.note || "No financial reference recorded"}</p></div><p className="font-bold" style={{ color: "var(--app-text)" }}>{money(settlement.amount, settlement.currency)}</p></div>)}</div> : <p className="mb-3 text-xs" style={{ color: "var(--app-text-muted)" }}>No recovery has been recorded.</p>}
          {canSettle && <div className="space-y-2"><div className="grid grid-cols-2 gap-2"><select aria-label="Settlement type" className={controlClass()} style={inputStyle} value={props.settlementType} onChange={(event) => props.setSettlementType(event.target.value as CommerceSupplierClaimSettlementType)}><option value="credit">Supplier credit</option><option value="refund">Refund</option><option value="replacement">Replacement</option><option value="other">Other</option></select><input aria-label="Settlement amount" className={controlClass()} style={inputStyle} type="number" min="0.01" max={claim.outstandingAmount} step="0.01" value={props.settlementAmount} onChange={(event) => props.setSettlementAmount(event.target.value)} placeholder={`Amount (${claim.currency})`} /></div><input aria-label="Financial reference" className={controlClass()} style={inputStyle} maxLength={160} value={props.settlementReference} onChange={(event) => props.setSettlementReference(event.target.value)} placeholder="Financial reference (optional)" /><input aria-label="Settlement note" className={controlClass()} style={inputStyle} maxLength={2000} value={props.settlementNote} onChange={(event) => props.setSettlementNote(event.target.value)} placeholder="Note (optional)" /><button type="button" disabled={props.settlementPending || !props.settlementAmount} onClick={props.recordSettlement} className="rounded-lg px-3 py-2 text-xs font-bold text-white disabled:opacity-50" style={{ background: "var(--app-primary)" }}>{props.settlementPending ? "Saving…" : "Record recovery"}</button><p className="text-[10px]" style={{ color: "var(--app-text-muted)" }}>Records recovery against this claim only. It does not post to accounting.</p></div>}
        </Panel>

        <Panel title="Claim history" action={<span className="text-[10px]" style={{ color: "var(--app-text-muted)" }}>Audit trail</span>}>
          {props.historyLoading ? <p className="text-xs" style={{ color: "var(--app-text-muted)" }}>Loading history…</p> : props.history.length ? <div className="max-h-60 space-y-2 overflow-y-auto">{props.history.map((row) => <AuditRow key={row.id} row={row} />)}</div> : <p className="text-xs" style={{ color: "var(--app-text-muted)" }}>No audit entries are available.</p>}
        </Panel>
      </div>

      <div className="border-t p-4" style={{ borderColor: "var(--app-border)" }}>
        {(claim.status === "draft" || canRespond || claim.status === "partially_settled") && <>
          <label className="mb-2 block text-xs font-semibold" style={{ color: "var(--app-text-muted)" }}>Reason for status change <span className="font-normal">(required and saved to audit)</span><textarea className={`${controlClass()} mt-1 min-h-16`} style={inputStyle} maxLength={2000} value={props.reason} onChange={(event) => props.setReason(event.target.value)} placeholder="Enter the reason for the action below" /></label>
          <div className="flex flex-wrap gap-2">
            {claim.status === "draft" && <button type="button" disabled={props.actionPending || claim.evidence.length === 0} onClick={() => props.performAction("submit")} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-xs font-bold text-white disabled:opacity-50" style={{ background: "var(--app-primary)" }}><CheckCircle2 size={14} />{props.actionPending ? "Saving…" : "Submit claim"}</button>}
            {claim.status === "submitted" && <button type="button" disabled={props.actionPending} onClick={() => props.performAction("acknowledge")} className="rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-50" style={{ borderColor: "var(--app-border)", color: "var(--app-text)" }}>Record supplier response</button>}
            {canRespond && <button type="button" disabled={props.actionPending} onClick={() => props.performAction("reject")} className="rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-50" style={{ borderColor: "var(--app-border)", color: "var(--app-danger-strong)" }}>Reject claim</button>}
            {(claim.status === "draft" || canRespond || claim.status === "partially_settled") && <button type="button" disabled={props.actionPending} onClick={() => props.performAction("close")} className="rounded-lg border px-3 py-2 text-xs font-bold disabled:opacity-50" style={{ borderColor: "var(--app-border)", color: "var(--app-text-muted)" }}>Close claim</button>}
          </div>
          {claim.status === "draft" && claim.evidence.length === 0 && <p className="mt-2 text-[11px]" style={{ color: "var(--app-warning-text)" }}>Add at least one evidence file before you can submit this claim.</p>}
        </>}
        {claim.status === "settled" && <p className="inline-flex items-center gap-2 text-xs font-semibold" style={{ color: "var(--app-success-text)" }}><CheckCircle2 size={15} />Claim fully recovered.</p>}
        {(claim.status === "rejected" || claim.status === "closed") && <p className="text-xs" style={{ color: "var(--app-text-muted)" }}>This claim is closed to further changes.</p>}
      </div>
    </section>
  </>;
}

function AuditRow({ row }: { row: CommerceSupplierClaimAudit }) {
  const description = row.reason || row.action.replaceAll("_", " ");
  return <div className="flex gap-2 border-l-2 pl-3" style={{ borderColor: "var(--app-primary)" }}><div className="min-w-0"><p className="text-xs font-semibold capitalize" style={{ color: "var(--app-text)" }}>{description}</p><p className="mt-0.5 text-[10px]" style={{ color: "var(--app-text-muted)" }}>{dateTime(row.createdAt)}{row.actorUserId ? ` · Actor ${row.actorUserId.slice(0, 8)}` : ""}</p></div></div>;
}
