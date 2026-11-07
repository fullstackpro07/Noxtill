"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bookmark, Eye, Pencil, Plus, Search, Send, X } from "lucide-react";
import { ApiError } from "@/lib/api-client";
import { formatCurrency, formatDate } from "@/lib/format";
import { useSession } from "@/lib/session";
import {
  applyProductOpportunityAction,
  createProductOpportunity,
  decideProductOpportunity,
  fetchProductValidationCandidate,
  fetchProductValidationHistory,
  fetchProductOpportunityAudit,
  fetchProductOpportunities,
  updateProductOpportunity,
  type CreateProductOpportunityInput,
  type ProductOpportunity,
  type ProductOpportunityRisk,
  type ProductOpportunityStatus,
  type ProductValidationDecision,
  type UpdateProductOpportunityInput,
} from "@/lib/product-radar-api";
import { toast } from "@/lib/toast";

const STATUS_LABELS: Record<ProductOpportunityStatus, string> = {
  discovered: "Discovered",
  saved: "Saved",
  watching: "Watching",
  dismissed: "Dismissed",
  validation_requested: "Validation requested",
  test_approved: "Test approved",
  launch_approved: "Launch approved",
  rejected: "Rejected",
};

function statusTone(status: ProductOpportunityStatus): string {
  if (status === "dismissed" || status === "rejected")
    return "var(--app-text-disabled)";
  if (status === "validation_requested") return "var(--app-warning-text)";
  if (status === "test_approved") return "var(--app-warning-text)";
  return "var(--app-success-text)";
}

function riskTone(risk: ProductOpportunityRisk): string {
  if (risk === "blocked" || risk === "high") return "var(--app-danger-strong)";
  if (risk === "medium") return "var(--app-warning-text)";
  return "var(--app-success-text)";
}

const AUDIT_FIELD_LABELS: Record<string, string> = {
  title: "Candidate",
  source: "Source",
  sourceReference: "Source reference",
  externalEntityId: "External ID",
  category: "Category",
  market: "Market",
  observedPrice: "Observed price",
  estimatedLandedCost: "Landed cost",
  demandSignal: "Demand signal",
  competitionScore: "Competition",
  trendVelocity: "Trend velocity",
  storeFitScore: "Store fit",
  marginEstimate: "Margin estimate",
  supplierCount: "Supplier count",
  shippingEstimate: "Shipping estimate",
  risk: "Risk",
  status: "Status",
  evidence: "Evidence note",
  confidence: "Confidence",
  sourceFreshAt: "Source freshness",
};

const VALIDATION_DECISION_LABELS: Record<ProductValidationDecision, string> = {
  approve_test: "Approved for test",
  approve_launch: "Approved for launch",
  watch: "Watch",
  reject: "Rejected",
};

const UNAVAILABLE_DIMENSION_LABELS: Record<string, string> = {
  compliance_readiness: "Compliance readiness",
  customer_return_risk: "Customer and return risk",
  ad_saturation: "Advertising saturation",
};

function isAuditSnapshot(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function auditValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Not set";
  if (typeof value === "string") return value.replaceAll("_", " ");
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  return "Recorded";
}

function auditChanges(beforeValue: unknown, afterValue: unknown) {
  if (!isAuditSnapshot(afterValue)) return [];
  const before = isAuditSnapshot(beforeValue) ? beforeValue : {};
  return Object.entries(AUDIT_FIELD_LABELS).flatMap(([key, label]) => {
    if (!(key in afterValue) || Object.is(before[key], afterValue[key]))
      return [];
    return [
      {
        label,
        before: auditValue(before[key]),
        after: auditValue(afterValue[key]),
      },
    ];
  });
}

export function ProductRadarView() {
  const session = useSession();
  const currency = session.business.currency;
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<ProductOpportunityStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [selected, setSelected] = useState<ProductOpportunity | null>(null);
  const query = useQuery({
    queryKey: ["product-radar", status, search],
    queryFn: () =>
      fetchProductOpportunities({
        status: status === "all" ? undefined : status,
        search,
      }),
  });
  const candidates = query.data ?? [];
  const active = candidates.filter(
    (candidate) =>
      candidate.status !== "dismissed" && candidate.status !== "rejected",
  );
  const highRisk = active.filter(
    (candidate) => candidate.risk === "high" || candidate.risk === "blocked",
  ).length;
  // Use the query's fetch time as a stable clock for this result set rather than reading the
  // wall clock during render. A refetch recalculates freshness against its new data snapshot.
  const dataFetchedAt = query.dataUpdatedAt || null;
  const freshToday =
    dataFetchedAt === null
      ? 0
      : candidates.filter(
          (candidate) =>
            candidate.sourceFreshAt &&
            dataFetchedAt - new Date(candidate.sourceFreshAt).getTime() <
              24 * 60 * 60 * 1000,
        ).length;

  const create = useMutation({
    mutationFn: createProductOpportunity,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["product-radar"] });
      toast.success("Product candidate added.");
      setAdding(false);
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError
          ? error.message
          : "Couldn't add this candidate.",
      ),
  });
  const action = useMutation({
    mutationFn: ({
      candidate,
      action,
    }: {
      candidate: ProductOpportunity;
      action: "save" | "watch" | "dismiss" | "send_to_validation";
    }) =>
      applyProductOpportunityAction(candidate.id, action, candidate.version),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["product-radar"] }),
    onError: (error) =>
      toast.error(
        error instanceof ApiError
          ? error.message
          : "This candidate changed. Refresh and try again.",
      ),
  });
  const update = useMutation({
    mutationFn: ({
      candidate,
      input,
    }: {
      candidate: ProductOpportunity;
      input: UpdateProductOpportunityInput;
    }) => updateProductOpportunity(candidate.id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["product-radar"] });
      toast.success("Research details updated.");
      setSelected(null);
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError
          ? error.message
          : "This candidate changed. Refresh and try again.",
      ),
  });
  const decideValidation = useMutation({
    mutationFn: ({
      candidate,
      decision,
      reason,
    }: {
      candidate: ProductOpportunity;
      decision: ProductValidationDecision;
      reason: string;
    }) =>
      decideProductOpportunity(candidate.id, {
        decision,
        reason,
        expectedVersion: candidate.version,
      }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["product-radar"] });
      void queryClient.invalidateQueries({
        queryKey: ["product-radar-audit", result.opportunity.id],
      });
      void queryClient.invalidateQueries({
        queryKey: ["product-validation", result.opportunity.id],
      });
      void queryClient.invalidateQueries({
        queryKey: ["product-validation-history", result.opportunity.id],
      });
      setSelected(result.opportunity);
      toast.success("Validation decision recorded.");
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError
          ? error.message
          : "Couldn't record this validation decision.",
      ),
  });

  const dataHealth = useMemo(() => {
    if (query.isPending) return "Loading sources";
    if (query.isError) return "Source data unavailable";
    if (candidates.length === 0) return "No product research recorded yet";
    return "Manual research is shown with its supplied source and freshness details";
  }, [candidates.length, query.isError, query.isPending]);

  return (
    <main className="flex flex-col gap-4 px-5 pb-7 pt-4 md:px-6">
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <h2
            className="text-[19px] font-extrabold"
            style={{ color: "var(--app-text)" }}
          >
            Product Radar
          </h2>
          <p
            className="mt-1 max-w-[720px] text-[12px]"
            style={{ color: "var(--app-text-muted)" }}
          >
            Research product opportunities before creating a real Product.
            Scores and costs stay empty until a verified source or an operator
            records them.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="ms-auto inline-flex min-h-10 items-center gap-1.5 rounded-[10px] px-3.5 text-[12px] font-extrabold text-white"
          style={{ background: "var(--app-primary)" }}
        >
          <Plus className="h-3.5 w-3.5" aria-hidden /> Add candidate
        </button>
      </div>

      <p
        className="rounded-[10px] px-3 py-2 text-[11.5px]"
        style={{
          background: "var(--app-surface-2)",
          color: "var(--app-text-muted)",
        }}
      >
        {dataHealth}
      </p>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Candidates"
          value={String(candidates.length)}
          detail="Recorded research candidates"
        />
        <Metric
          label="Active opportunities"
          value={String(active.length)}
          detail="Not dismissed or rejected"
        />
        <Metric
          label="High risk or blocked"
          value={String(highRisk)}
          detail="Risk flag from recorded research"
          tone={highRisk > 0 ? "warning" : "default"}
        />
        <Metric
          label="Fresh in 24 hours"
          value={String(freshToday)}
          detail="Based on supplied source timestamps"
        />
      </div>

      <section
        className="overflow-hidden rounded-[14px]"
        style={{
          background: "var(--app-surface)",
          border: "1px solid var(--app-border)",
        }}
      >
        <div
          className="flex flex-wrap gap-2 p-3"
          style={{ borderBottom: "1px solid var(--app-border)" }}
        >
          <label
            className="flex min-w-[220px] flex-1 items-center gap-2 rounded-[9px] px-3"
            style={{
              border: "1px solid var(--app-border)",
              color: "var(--app-text-faint)",
            }}
          >
            <Search className="h-3.5 w-3.5" aria-hidden />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search candidates or sources"
              className="h-10 min-w-0 flex-1 bg-transparent text-[12px] outline-none"
              style={{ color: "var(--app-text)" }}
            />
          </label>
          <select
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as ProductOpportunityStatus | "all")
            }
            className="h-10 rounded-[9px] px-3 text-[12px] font-semibold"
            style={{
              border: "1px solid var(--app-border)",
              color: "var(--app-text-muted)",
              background: "var(--app-surface)",
            }}
          >
            <option value="all">All statuses</option>
            {(Object.keys(STATUS_LABELS) as ProductOpportunityStatus[]).map(
              (value) => (
                <option key={value} value={value}>
                  {STATUS_LABELS[value]}
                </option>
              ),
            )}
          </select>
        </div>

        {query.isPending ? (
          <div
            className="h-48 animate-pulse"
            style={{ background: "var(--app-surface-2)" }}
          />
        ) : query.isError ? (
          <EmptyState
            title="Product Radar is unavailable right now"
            detail="The rest of Noxtill is still available. Retry when the connection is back."
          />
        ) : candidates.length === 0 ? (
          <EmptyState
            title="No product research yet"
            detail="Add a manual candidate to begin. Product-source discovery is not configured yet; no sample opportunities are shown."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] border-collapse text-left text-[11.5px]">
              <thead
                style={{
                  background: "var(--app-surface-2)",
                  color: "var(--app-text-faint)",
                }}
              >
                <tr>
                  {[
                    "Candidate",
                    "Source / freshness",
                    "Market",
                    "Observed price",
                    "Landed cost",
                    "Demand",
                    "Store fit",
                    "Risk",
                    "Status",
                    "Actions",
                  ].map((heading) => (
                    <th key={heading} className="px-3 py-2.5 font-semibold">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {candidates.map((candidate) => (
                  <CandidateRow
                    key={candidate.id}
                    candidate={candidate}
                    currency={currency}
                    busy={action.isPending}
                    onSelect={() => setSelected(candidate)}
                    onAction={(nextAction) =>
                      action.mutate({ candidate, action: nextAction })
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {adding && (
        <CreateCandidateDialog
          busy={create.isPending}
          onClose={() => setAdding(false)}
          onSubmit={(input) => create.mutate(input)}
        />
      )}
      {selected && (
        <CandidateDetailDialog
          candidate={selected}
          currency={currency}
          saving={update.isPending}
          deciding={decideValidation.isPending}
          onSave={(input) => update.mutate({ candidate: selected, input })}
          onDecision={(decision, reason) =>
            decideValidation.mutate({ candidate: selected, decision, reason })
          }
          onClose={() => setSelected(null)}
        />
      )}
    </main>
  );
}

function Metric({
  label,
  value,
  detail,
  tone = "default",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "default" | "warning";
}) {
  return (
    <div
      className="rounded-[13px] p-4"
      style={{
        background: "var(--app-surface)",
        border: "1px solid var(--app-border)",
      }}
    >
      <div
        className="text-[11.5px] font-semibold"
        style={{ color: "var(--app-text-faint)" }}
      >
        {label}
      </div>
      <div
        className="mt-1 text-[22px] font-extrabold"
        style={{
          color:
            tone === "warning" ? "var(--app-warning-text)" : "var(--app-text)",
        }}
      >
        {value}
      </div>
      <div
        className="mt-1 text-[10.5px]"
        style={{ color: "var(--app-text-disabled)" }}
      >
        {detail}
      </div>
    </div>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="px-5 py-14 text-center">
      <div
        className="text-[14px] font-bold"
        style={{ color: "var(--app-text)" }}
      >
        {title}
      </div>
      <p
        className="mx-auto mt-1 max-w-md text-[11.5px]"
        style={{ color: "var(--app-text-muted)" }}
      >
        {detail}
      </p>
    </div>
  );
}

function CandidateRow({
  candidate,
  currency,
  busy,
  onSelect,
  onAction,
}: {
  candidate: ProductOpportunity;
  currency: string;
  busy: boolean;
  onSelect: () => void;
  onAction: (
    action: "save" | "watch" | "dismiss" | "send_to_validation",
  ) => void;
}) {
  return (
    <tr
      className="border-t"
      style={{ borderColor: "var(--app-border)", color: "var(--app-text)" }}
    >
      <td className="max-w-[220px] px-3 py-3">
        <button
          type="button"
          onClick={onSelect}
          className="max-w-full truncate text-left font-bold"
          style={{ color: "var(--app-primary)" }}
          title={candidate.title}
        >
          {candidate.title}
        </button>
        <div
          className="mt-0.5 truncate text-[10px]"
          style={{ color: "var(--app-text-disabled)" }}
        >
          {candidate.category ?? "No category"}
        </div>
      </td>
      <td className="px-3 py-3">
        <div className="font-semibold">{candidate.source}</div>
        <div
          className="mt-0.5 text-[10px]"
          style={{ color: "var(--app-text-disabled)" }}
        >
          {candidate.sourceFreshAt
            ? `Updated ${formatDate(candidate.sourceFreshAt)}`
            : "Freshness not supplied"}
        </div>
      </td>
      <td className="px-3 py-3">{candidate.market ?? "Not set"}</td>
      <td className="px-3 py-3 tabular-nums">
        {candidate.observedPrice === null
          ? "Not available"
          : formatCurrency(candidate.observedPrice, currency)}
      </td>
      <td className="px-3 py-3 tabular-nums">
        {candidate.estimatedLandedCost === null
          ? "Not available"
          : formatCurrency(candidate.estimatedLandedCost, currency)}
      </td>
      <td className="px-3 py-3">
        {candidate.demandSignal === null
          ? "Not scored"
          : `${candidate.demandSignal} / 100`}
      </td>
      <td className="px-3 py-3">
        {candidate.storeFitScore === null
          ? "Not scored"
          : `${candidate.storeFitScore} / 100`}
      </td>
      <td
        className="px-3 py-3 font-semibold capitalize"
        style={{ color: riskTone(candidate.risk) }}
      >
        {candidate.risk}
      </td>
      <td className="px-3 py-3">
        <span
          className="font-semibold"
          style={{ color: statusTone(candidate.status) }}
        >
          {STATUS_LABELS[candidate.status]}
        </span>
      </td>
      <td className="px-3 py-3">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            disabled={busy || candidate.status === "dismissed"}
            onClick={() => onAction("save")}
            title="Save"
            className="rounded-[7px] p-1.5 disabled:opacity-40"
            style={{
              color: "var(--app-primary)",
              background: "var(--app-success-bg)",
            }}
          >
            <Bookmark className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button
            type="button"
            disabled={busy || candidate.status === "dismissed"}
            onClick={() => onAction("watch")}
            title="Watch"
            className="rounded-[7px] p-1.5 disabled:opacity-40"
            style={{
              color: "var(--app-primary)",
              background: "var(--app-success-bg)",
            }}
          >
            <Eye className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button
            type="button"
            disabled={busy || candidate.status === "dismissed"}
            onClick={() => onAction("send_to_validation")}
            title="Request validation"
            className="rounded-[7px] p-1.5 disabled:opacity-40"
            style={{
              color: "var(--app-warning-text)",
              background: "var(--app-warning-bg)",
            }}
          >
            <Send className="h-3.5 w-3.5" aria-hidden />
          </button>
          <button
            type="button"
            disabled={busy || candidate.status === "dismissed"}
            onClick={() => onAction("dismiss")}
            title="Dismiss"
            className="rounded-[7px] p-1.5 disabled:opacity-40"
            style={{ color: "var(--app-danger-strong)", background: "#FEE4E2" }}
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </td>
    </tr>
  );
}

function CandidateDetailDialog({
  candidate,
  currency,
  saving,
  deciding,
  onSave,
  onDecision,
  onClose,
}: {
  candidate: ProductOpportunity;
  currency: string;
  saving: boolean;
  deciding: boolean;
  onSave: (input: UpdateProductOpportunityInput) => void;
  onDecision: (decision: ProductValidationDecision, reason: string) => void;
  onClose: () => void;
}) {
  const auditQuery = useQuery({
    queryKey: ["product-radar-audit", candidate.id],
    queryFn: () => fetchProductOpportunityAudit(candidate.id),
  });
  const validationEvidenceQuery = useQuery({
    queryKey: ["product-validation", candidate.id],
    queryFn: () => fetchProductValidationCandidate(candidate.id),
    enabled: candidate.status === "validation_requested",
  });
  const validationHistoryQuery = useQuery({
    queryKey: ["product-validation-history", candidate.id],
    queryFn: () => fetchProductValidationHistory(candidate.id),
  });
  const [editing, setEditing] = useState(false);

  return (
    <div
      className="fixed z-[80] flex justify-end"
      style={{ inset: 0, background: "rgba(10,27,42,.28)" }}
      onClick={onClose}
    >
      <aside
        className="h-full w-full max-w-[490px] overflow-y-auto p-5"
        style={{ background: "var(--app-surface)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div>
            <h3
              className="text-[17px] font-extrabold"
              style={{ color: "var(--app-text)" }}
            >
              {candidate.title}
            </h3>
            <p
              className="mt-1 text-[11.5px]"
              style={{ color: "var(--app-text-muted)" }}
            >
              {candidate.source} ·{" "}
              {candidate.sourceFreshAt
                ? `source updated ${formatDate(candidate.sourceFreshAt)}`
                : "source freshness not supplied"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ms-auto rounded-[8px] p-2"
            style={{
              color: "var(--app-text-muted)",
              border: "1px solid var(--app-border)",
            }}
            aria-label="Close details"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <section
          className="mt-5 rounded-[12px] p-4"
          style={{ background: "var(--app-surface-2)" }}
        >
          <div className="flex items-center justify-between gap-2">
            <h4
              className="text-[12px] font-extrabold"
              style={{ color: "var(--app-text)" }}
            >
              Research details
            </h4>
            <button
              type="button"
              onClick={() => setEditing(!editing)}
              className="inline-flex items-center gap-1 rounded-[8px] px-2.5 py-1.5 text-[10.5px] font-bold"
              style={{
                background: "var(--app-surface)",
                color: "var(--app-primary)",
                border: "1px solid var(--app-border)",
              }}
            >
              <Pencil className="h-3 w-3" aria-hidden />
              {editing ? "Cancel edit" : "Edit"}
            </button>
          </div>
          {editing ? (
            <ResearchEditor
              candidate={candidate}
              currency={currency}
              saving={saving}
              onCancel={() => setEditing(false)}
              onSave={onSave}
            />
          ) : (
            <>
              <p
                className="mt-2 whitespace-pre-wrap text-[11.5px] leading-relaxed"
                style={{ color: "var(--app-text-muted)" }}
              >
                {candidate.evidence ??
                  "No evidence note has been recorded for this candidate."}
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
                <Detail
                  label="Observed price"
                  value={
                    candidate.observedPrice === null
                      ? "Not available"
                      : formatCurrency(candidate.observedPrice, currency)
                  }
                />
                <Detail
                  label="Estimated landed cost"
                  value={
                    candidate.estimatedLandedCost === null
                      ? "Not available"
                      : formatCurrency(candidate.estimatedLandedCost, currency)
                  }
                />
                <Detail
                  label="Demand signal"
                  value={
                    candidate.demandSignal === null
                      ? "Not scored"
                      : `${candidate.demandSignal} / 100`
                  }
                />
                <Detail
                  label="Competition"
                  value={
                    candidate.competitionScore === null
                      ? "Not scored"
                      : `${candidate.competitionScore} / 100`
                  }
                />
                <Detail
                  label="Trend velocity"
                  value={
                    candidate.trendVelocity === null
                      ? "Not scored"
                      : `${candidate.trendVelocity} / 100`
                  }
                />
                <Detail
                  label="Store fit"
                  value={
                    candidate.storeFitScore === null
                      ? "Not scored"
                      : `${candidate.storeFitScore} / 100`
                  }
                />
                <Detail
                  label="Margin estimate"
                  value={
                    candidate.marginEstimate === null
                      ? "Not available"
                      : `${candidate.marginEstimate}%`
                  }
                />
                <Detail
                  label="Shipping estimate"
                  value={
                    candidate.shippingEstimate === null
                      ? "Not available"
                      : formatCurrency(candidate.shippingEstimate, currency)
                  }
                />
                <Detail
                  label="Supplier count"
                  value={
                    candidate.supplierCount === null
                      ? "Not available"
                      : String(candidate.supplierCount)
                  }
                />
                <Detail
                  label="Confidence"
                  value={
                    candidate.confidence === null
                      ? "Not scored"
                      : `${candidate.confidence} / 100`
                  }
                />
                <Detail
                  label="Source reference"
                  value={candidate.sourceReference ?? "Not supplied"}
                />
                <Detail label="Version" value={String(candidate.version)} />
              </dl>
            </>
          )}
        </section>

        {candidate.status === "validation_requested" && (
          <>
            <ValidationEvidenceSection
              data={validationEvidenceQuery.data}
              isPending={validationEvidenceQuery.isPending}
              isError={validationEvidenceQuery.isError}
              onRetry={() => void validationEvidenceQuery.refetch()}
            />
            <ValidationDecisionEditor
              busy={deciding}
              evidenceReady={!!validationEvidenceQuery.data}
              launchApproval={
                validationEvidenceQuery.data?.evidenceReview.launchApproval
              }
              onSubmit={onDecision}
            />
          </>
        )}

        {validationHistoryQuery.data &&
          validationHistoryQuery.data.length > 0 && (
            <section className="mt-5">
              <h4
                className="text-[12px] font-extrabold"
                style={{ color: "var(--app-text)" }}
              >
                Validation decisions
              </h4>
              <ol className="mt-3 space-y-2">
                {validationHistoryQuery.data.map((run) => (
                  <li
                    key={run.id}
                    className="rounded-[10px] p-3 text-[11.5px]"
                    style={{ background: "var(--app-surface-2)" }}
                  >
                    <div
                      className="font-bold"
                      style={{ color: "var(--app-text)" }}
                    >
                      {VALIDATION_DECISION_LABELS[run.decision]}
                    </div>
                    <p
                      className="mt-1"
                      style={{ color: "var(--app-text-muted)" }}
                    >
                      {formatDate(run.createdAt)} · {run.reason}
                    </p>
                    <details className="mt-2">
                      <summary
                        className="cursor-pointer text-[10.5px] font-semibold"
                        style={{ color: "var(--app-text-muted)" }}
                      >
                        Evidence captured with this decision
                      </summary>
                      <pre
                        className="mt-2 max-h-52 overflow-auto rounded-[8px] p-2 text-[10px]"
                        style={{
                          background: "var(--app-surface)",
                          color: "var(--app-text-muted)",
                        }}
                      >
                        {JSON.stringify(run.evidenceSnapshot, null, 2)}
                      </pre>
                    </details>
                  </li>
                ))}
              </ol>
            </section>
          )}

        <section className="mt-5">
          <h4
            className="text-[12px] font-extrabold"
            style={{ color: "var(--app-text)" }}
          >
            Audit history
          </h4>
          {auditQuery.isPending ? (
            <div
              className="mt-3 h-16 animate-pulse rounded-[10px]"
              style={{ background: "var(--app-surface-2)" }}
            />
          ) : auditQuery.isError ? (
            <p
              className="mt-2 text-[11.5px]"
              style={{ color: "var(--app-danger-strong)" }}
            >
              Audit history is unavailable right now.
            </p>
          ) : auditQuery.data?.length === 0 ? (
            <p
              className="mt-2 text-[11.5px]"
              style={{ color: "var(--app-text-muted)" }}
            >
              No audit entries yet.
            </p>
          ) : (
            <ol className="mt-3 space-y-2">
              {auditQuery.data?.map((entry) => (
                <li
                  key={entry.id}
                  className="rounded-[10px] p-3 text-[11.5px]"
                  style={{ background: "var(--app-surface-2)" }}
                >
                  <div
                    className="font-bold capitalize"
                    style={{ color: "var(--app-text)" }}
                  >
                    {entry.action.replaceAll("_", " ")}
                  </div>
                  <div
                    className="mt-0.5"
                    style={{ color: "var(--app-text-muted)" }}
                  >
                    {formatDate(entry.createdAt)}
                    {entry.reason ? ` · ${entry.reason}` : ""}
                  </div>
                  {entry.action === "created" ? (
                    <div
                      className="mt-2 text-[10.5px]"
                      style={{ color: "var(--app-text-muted)" }}
                    >
                      Initial candidate state recorded.
                    </div>
                  ) : auditChanges(entry.before, entry.after).length > 0 ? (
                    <dl className="mt-2 space-y-1.5">
                      {auditChanges(entry.before, entry.after).map((change) => (
                        <div
                          key={change.label}
                          className="grid grid-cols-[105px_1fr] gap-2"
                        >
                          <dt style={{ color: "var(--app-text-disabled)" }}>
                            {change.label}
                          </dt>
                          <dd
                            className="break-words"
                            style={{ color: "var(--app-text-muted)" }}
                          >
                            {change.before}{" "}
                            <span aria-label="changed to">→</span>{" "}
                            {change.after}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <div
                      className="mt-2 text-[10.5px]"
                      style={{ color: "var(--app-text-muted)" }}
                    >
                      Earlier audit entry has no field-level change snapshot.
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>
      </aside>
    </div>
  );
}

function ValidationEvidenceSection({
  data,
  isPending,
  isError,
  onRetry,
}: {
  data:
    | {
        evidenceReview: {
          evidenceCoverage: { recorded: number; total: number };
          launchApproval: { available: boolean; reason: string };
          unavailableDimensions: Array<{
            key: string;
            reason: string;
          }>;
        };
      }
    | undefined;
  isPending: boolean;
  isError: boolean;
  onRetry: () => void;
}) {
  return (
    <section
      className="mt-5 rounded-[12px] p-4"
      style={{ background: "var(--app-surface-2)" }}
    >
      <h4
        className="text-[12px] font-extrabold"
        style={{ color: "var(--app-text)" }}
      >
        Validation evidence
      </h4>
      {isPending ? (
        <div
          className="mt-3 h-12 animate-pulse rounded-[8px]"
          style={{ background: "var(--app-surface)" }}
        />
      ) : isError || !data ? (
        <div className="mt-2 flex items-center justify-between gap-3">
          <p
            className="text-[11px]"
            style={{ color: "var(--app-danger-strong)" }}
          >
            Evidence could not be loaded so a decision should wait
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="rounded-[8px] px-2.5 py-1.5 text-[10.5px] font-bold"
            style={{
              background: "var(--app-surface)",
              color: "var(--app-primary)",
            }}
          >
            Retry
          </button>
        </div>
      ) : (
        <>
          <p
            className="mt-2 text-[11px]"
            style={{ color: "var(--app-text-muted)" }}
          >
            {data.evidenceReview.evidenceCoverage.recorded} of{" "}
            {data.evidenceReview.evidenceCoverage.total} tracked fields have
            recorded values
          </p>
          {data.evidenceReview.unavailableDimensions.length > 0 && (
            <ul
              className="mt-2 space-y-1 text-[10.5px]"
              style={{ color: "var(--app-text-muted)" }}
            >
              {data.evidenceReview.unavailableDimensions.map((dimension) => (
                <li key={dimension.key}>
                  <span className="font-semibold">
                    {UNAVAILABLE_DIMENSION_LABELS[dimension.key] ??
                      dimension.key}
                    :
                  </span>{" "}
                  {dimension.reason}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}

function ValidationDecisionEditor({
  busy,
  evidenceReady,
  launchApproval,
  onSubmit,
}: {
  busy: boolean;
  evidenceReady: boolean;
  launchApproval?: { available: boolean; reason: string };
  onSubmit: (decision: ProductValidationDecision, reason: string) => void;
}) {
  const [decision, setDecision] =
    useState<ProductValidationDecision>("approve_test");
  const [reason, setReason] = useState("");
  const launchApprovalUnavailable = !launchApproval?.available;

  return (
    <section
      className="mt-3 rounded-[12px] p-4"
      style={{ border: "1px solid var(--app-border)" }}
    >
      <h4
        className="text-[12px] font-extrabold"
        style={{ color: "var(--app-text)" }}
      >
        Record decision
      </h4>
      <label
        className="mt-3 block text-[10.5px] font-bold"
        style={{ color: "var(--app-text-muted)" }}
      >
        Decision
        <select
          value={decision}
          onChange={(event) =>
            setDecision(event.target.value as ProductValidationDecision)
          }
          className="mt-1 block h-10 w-full rounded-[8px] px-2 text-[11.5px]"
          style={{
            background: "var(--app-surface)",
            border: "1px solid var(--app-border)",
          }}
        >
          <option value="approve_test">Approve for test</option>
          <option value="approve_launch" disabled={launchApprovalUnavailable}>
            Approve for launch
          </option>
          <option value="watch">Watch</option>
          <option value="reject">Reject</option>
        </select>
      </label>
      {launchApprovalUnavailable && (
        <p
          className="mt-2 text-[10.5px]"
          style={{ color: "var(--app-warning-text)" }}
        >
          {launchApproval?.reason ??
            "Launch approval status is unavailable until validation evidence loads"}
        </p>
      )}
      <label
        className="mt-3 block text-[10.5px] font-bold"
        style={{ color: "var(--app-text-muted)" }}
      >
        Reason
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={2000}
          rows={3}
          className="mt-1 block w-full rounded-[8px] p-2 text-[11.5px]"
          style={{
            background: "var(--app-surface)",
            border: "1px solid var(--app-border)",
          }}
        />
      </label>
      <p
        className="mt-2 text-[10.5px]"
        style={{ color: "var(--app-text-disabled)" }}
      >
        Saving records the decision and evidence snapshot only. It does not
        create a Product or publish to a channel
      </p>
      <button
        type="button"
        disabled={!evidenceReady || !reason.trim() || busy}
        onClick={() => onSubmit(decision, reason.trim())}
        className="mt-3 rounded-[8px] px-3 py-2 text-[11px] font-extrabold text-white disabled:opacity-50"
        style={{ background: "var(--app-primary)" }}
      >
        {busy ? "Saving decision…" : "Save decision"}
      </button>
    </section>
  );
}

interface ResearchDraft {
  title: string;
  source: string;
  sourceReference: string;
  category: string;
  market: string;
  evidence: string;
  risk: ProductOpportunityRisk;
  observedPrice: string;
  estimatedLandedCost: string;
  demandSignal: string;
  competitionScore: string;
  trendVelocity: string;
  storeFitScore: string;
  marginEstimate: string;
  supplierCount: string;
  shippingEstimate: string;
  confidence: string;
}

function createResearchDraft(candidate: ProductOpportunity): ResearchDraft {
  return {
    title: candidate.title,
    source: candidate.source,
    sourceReference: candidate.sourceReference ?? "",
    category: candidate.category ?? "",
    market: candidate.market ?? "",
    evidence: candidate.evidence ?? "",
    risk: candidate.risk,
    observedPrice: asInput(candidate.observedPrice),
    estimatedLandedCost: asInput(candidate.estimatedLandedCost),
    demandSignal: asInput(candidate.demandSignal),
    competitionScore: asInput(candidate.competitionScore),
    trendVelocity: asInput(candidate.trendVelocity),
    storeFitScore: asInput(candidate.storeFitScore),
    marginEstimate: asInput(candidate.marginEstimate),
    supplierCount: asInput(candidate.supplierCount),
    shippingEstimate: asInput(candidate.shippingEstimate),
    confidence: asInput(candidate.confidence),
  };
}

function ResearchEditor({
  candidate,
  currency,
  saving,
  onCancel,
  onSave,
}: {
  candidate: ProductOpportunity;
  currency: string;
  saving: boolean;
  onCancel: () => void;
  onSave: (input: UpdateProductOpportunityInput) => void;
}) {
  const [draft, setDraft] = useState(() => createResearchDraft(candidate));
  const set =
    <K extends keyof ResearchDraft>(key: K) =>
    (value: ResearchDraft[K]) =>
      setDraft((current) => ({ ...current, [key]: value }));
  const numeric = (value: string) =>
    value.trim() === "" ? null : Number(value);
  const nonNegativeValues = [
    draft.observedPrice,
    draft.estimatedLandedCost,
    draft.shippingEstimate,
  ];
  const boundedValues = [
    draft.demandSignal,
    draft.competitionScore,
    draft.trendVelocity,
    draft.storeFitScore,
    draft.marginEstimate,
    draft.confidence,
  ];
  const integerValues = [
    draft.demandSignal,
    draft.competitionScore,
    draft.trendVelocity,
    draft.storeFitScore,
    draft.supplierCount,
    draft.confidence,
  ];
  const numbersValid = nonNegativeValues.every((value) =>
    isOptionalNumberInRange(value, 0),
  );
  const scoresValid =
    boundedValues.every((value) => isOptionalNumberInRange(value, 0, 100)) &&
    integerValues.every(
      (value) => value.trim() === "" || Number.isInteger(Number(value)),
    );
  const submit = () =>
    onSave({
      expectedVersion: candidate.version,
      title: draft.title.trim(),
      source: draft.source.trim(),
      sourceReference: draft.sourceReference,
      category: draft.category,
      market: draft.market,
      evidence: draft.evidence,
      risk: draft.risk,
      observedPrice: numeric(draft.observedPrice),
      estimatedLandedCost: numeric(draft.estimatedLandedCost),
      demandSignal: numeric(draft.demandSignal),
      competitionScore: numeric(draft.competitionScore),
      trendVelocity: numeric(draft.trendVelocity),
      storeFitScore: numeric(draft.storeFitScore),
      marginEstimate: numeric(draft.marginEstimate),
      supplierCount: numeric(draft.supplierCount),
      shippingEstimate: numeric(draft.shippingEstimate),
      confidence: numeric(draft.confidence),
    });
  const field = <K extends keyof ResearchDraft>(key: K) => draft[key] as string;

  return (
    <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
      <Field
        label="Candidate"
        value={draft.title}
        onChange={set("title")}
        required
      />
      <Field
        label="Source"
        value={draft.source}
        onChange={set("source")}
        required
      />
      <Field
        label="Source reference"
        value={draft.sourceReference}
        onChange={set("sourceReference")}
      />
      <Field
        label="Category"
        value={draft.category}
        onChange={set("category")}
      />
      <Field label="Market" value={draft.market} onChange={set("market")} />
      <NumberField
        label={`Observed price (${currency})`}
        value={field("observedPrice")}
        onChange={set("observedPrice")}
      />
      <NumberField
        label={`Estimated landed cost (${currency})`}
        value={field("estimatedLandedCost")}
        onChange={set("estimatedLandedCost")}
      />
      <NumberField
        label="Demand signal (0–100)"
        value={field("demandSignal")}
        onChange={set("demandSignal")}
        integer
        max={100}
      />
      <NumberField
        label="Competition (0–100)"
        value={field("competitionScore")}
        onChange={set("competitionScore")}
        integer
        max={100}
      />
      <NumberField
        label="Trend velocity (0–100)"
        value={field("trendVelocity")}
        onChange={set("trendVelocity")}
        integer
        max={100}
      />
      <NumberField
        label="Store fit (0–100)"
        value={field("storeFitScore")}
        onChange={set("storeFitScore")}
        integer
        max={100}
      />
      <NumberField
        label="Margin estimate %"
        value={field("marginEstimate")}
        onChange={set("marginEstimate")}
        max={100}
      />
      <NumberField
        label={`Shipping estimate (${currency})`}
        value={field("shippingEstimate")}
        onChange={set("shippingEstimate")}
      />
      <NumberField
        label="Supplier count"
        value={field("supplierCount")}
        onChange={set("supplierCount")}
        integer
      />
      <NumberField
        label="Confidence (0–100)"
        value={field("confidence")}
        onChange={set("confidence")}
        integer
        max={100}
      />
      <label
        className="flex flex-col gap-1.5 text-[11.5px] font-semibold sm:col-span-2"
        style={{ color: "var(--app-text-muted)" }}
      >
        Risk
        <select
          value={draft.risk}
          onChange={(event) =>
            set("risk")(event.target.value as ProductOpportunityRisk)
          }
          className="h-10 rounded-[9px] px-3 text-[12px]"
          style={{
            border: "1px solid var(--app-border)",
            background: "var(--app-surface)",
          }}
        >
          {["low", "medium", "high", "blocked"].map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
      <label
        className="flex flex-col gap-1.5 text-[11.5px] font-semibold sm:col-span-2"
        style={{ color: "var(--app-text-muted)" }}
      >
        Evidence note
        <textarea
          value={draft.evidence}
          onChange={(event) => set("evidence")(event.target.value)}
          rows={3}
          className="rounded-[9px] p-3 text-[12px]"
          style={{
            border: "1px solid var(--app-border)",
            color: "var(--app-text)",
          }}
          placeholder="What was observed and where?"
        />
      </label>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <button
          type="button"
          disabled={saving}
          onClick={onCancel}
          className="rounded-[9px] px-3 py-2 text-[11.5px] font-bold disabled:opacity-50"
          style={{
            border: "1px solid var(--app-border)",
            color: "var(--app-text-muted)",
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={
            saving ||
            !draft.title.trim() ||
            !draft.source.trim() ||
            !numbersValid ||
            !scoresValid
          }
          onClick={submit}
          className="rounded-[9px] px-3 py-2 text-[11.5px] font-extrabold text-white disabled:opacity-50"
          style={{ background: "var(--app-primary)" }}
        >
          {saving ? "Saving…" : "Save research"}
        </button>
      </div>
      <p
        className="m-0 text-[10px] sm:col-span-2"
        style={{ color: "var(--app-text-disabled)" }}
      >
        Scores and cost figures are operator-entered research unless their
        source is separately verified.
      </p>
    </div>
  );
}

function isOptionalNumberInRange(
  value: string,
  min: number,
  max = Number.POSITIVE_INFINITY,
): boolean {
  if (value.trim() === "") return true;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max;
}

function asInput(value: number | null): string {
  return value === null ? "" : String(value);
}

function NumberField({
  label,
  value,
  onChange,
  integer = false,
  max,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  integer?: boolean;
  max?: number;
}) {
  return (
    <label
      className="flex flex-col gap-1.5 text-[10.5px] font-semibold"
      style={{ color: "var(--app-text-muted)" }}
    >
      {label}
      <input
        type="number"
        min={0}
        max={max}
        step={integer ? 1 : "any"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 rounded-[8px] px-2.5 text-[11px]"
        style={{
          border: "1px solid var(--app-border)",
          background: "var(--app-surface)",
          color: "var(--app-text)",
        }}
      />
    </label>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt style={{ color: "var(--app-text-disabled)" }}>{label}</dt>
      <dd className="mt-0.5 font-semibold" style={{ color: "var(--app-text)" }}>
        {value}
      </dd>
    </div>
  );
}

function CreateCandidateDialog({
  busy,
  onClose,
  onSubmit,
}: {
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: CreateProductOpportunityInput) => void;
}) {
  const [title, setTitle] = useState("");
  const [source, setSource] = useState("Manual research");
  const [category, setCategory] = useState("");
  const [market, setMarket] = useState("");
  const [evidence, setEvidence] = useState("");
  const [risk, setRisk] = useState<ProductOpportunityRisk>("medium");
  const submit = () =>
    onSubmit({
      title,
      source,
      category: category || undefined,
      market: market || undefined,
      evidence: evidence || undefined,
      risk,
    });
  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-5"
      style={{ background: "rgba(10,27,42,.36)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-[520px] rounded-[16px] p-5"
        style={{ background: "var(--app-surface)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <h3
          className="text-[16px] font-extrabold"
          style={{ color: "var(--app-text)" }}
        >
          Add product candidate
        </h3>
        <p
          className="mt-1 text-[11.5px]"
          style={{ color: "var(--app-text-muted)" }}
        >
          This creates research data only. It will not create a Product or
          publish a listing.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field
            label="Candidate name"
            value={title}
            onChange={setTitle}
            required
          />
          <Field label="Source" value={source} onChange={setSource} required />
          <Field label="Category" value={category} onChange={setCategory} />
          <Field label="Market" value={market} onChange={setMarket} />
          <label
            className="flex flex-col gap-1.5 text-[11.5px] font-semibold"
            style={{ color: "var(--app-text-muted)" }}
          >
            Risk
            <select
              value={risk}
              onChange={(event) =>
                setRisk(event.target.value as ProductOpportunityRisk)
              }
              className="h-10 rounded-[9px] px-3 text-[12px]"
              style={{
                border: "1px solid var(--app-border)",
                background: "var(--app-surface)",
              }}
            >
              {["low", "medium", "high", "blocked"].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
        </div>
        <label
          className="mt-3 flex flex-col gap-1.5 text-[11.5px] font-semibold"
          style={{ color: "var(--app-text-muted)" }}
        >
          Evidence or source note
          <textarea
            value={evidence}
            onChange={(event) => setEvidence(event.target.value)}
            rows={3}
            className="rounded-[9px] p-3 text-[12px]"
            style={{
              border: "1px solid var(--app-border)",
              color: "var(--app-text)",
            }}
            placeholder="What was observed and where?"
          />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-[9px] px-3.5 py-2 text-[12px] font-bold"
            style={{
              border: "1px solid var(--app-border)",
              color: "var(--app-text-muted)",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !title.trim() || !source.trim()}
            onClick={submit}
            className="rounded-[9px] px-3.5 py-2 text-[12px] font-extrabold text-white disabled:opacity-50"
            style={{ background: "var(--app-primary)" }}
          >
            {busy ? "Saving…" : "Add candidate"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label
      className="flex flex-col gap-1.5 text-[11.5px] font-semibold"
      style={{ color: "var(--app-text-muted)" }}
    >
      {label}
      {required ? " *" : ""}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-[9px] px-3 text-[12px]"
        style={{
          border: "1px solid var(--app-border)",
          color: "var(--app-text)",
        }}
      />
    </label>
  );
}
