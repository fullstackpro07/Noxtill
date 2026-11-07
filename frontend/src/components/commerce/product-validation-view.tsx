"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  ExternalLink,
  PackageCheck,
  RefreshCw,
  Search,
  ShieldAlert,
  X,
} from "lucide-react";
import { ApiError } from "@/lib/api-client";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  decideProductOpportunity,
  createProductFromValidation,
  fetchProductValidationCandidate,
  fetchProductValidationHistory,
  fetchProductValidationQueue,
  type ProductOpportunityRisk,
  type ProductValidationCandidate,
  type ProductValidationDecision,
} from "@/lib/product-radar-api";
import { useSession } from "@/lib/session";
import { toast } from "@/lib/toast";

const RISK_LABELS: Record<ProductOpportunityRisk, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  blocked: "Blocked",
};

const DECISION_LABELS: Record<ProductValidationDecision, string> = {
  approve_test: "Approved for test",
  approve_launch: "Approved for launch",
  watch: "Watch",
  reject: "Rejected",
};

const FACTOR_LABELS: Record<string, string> = {
  demand_signal: "Demand signal",
  competition_score: "Competition score",
  trend_velocity: "Trend velocity",
  store_fit_score: "Store fit",
  observed_price: "Observed price",
  estimated_landed_cost: "Estimated landed cost",
  margin_estimate: "Margin estimate",
  supplier_count: "Supplier count",
  shipping_estimate: "Shipping estimate",
};

const EMPTY_CANDIDATES: ProductValidationCandidate[] = [];

function safeExternalUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function riskStyle(risk: ProductOpportunityRisk) {
  if (risk === "blocked" || risk === "high") {
    return { background: "#FEF3F2", color: "var(--app-danger-strong)" };
  }
  if (risk === "medium") {
    return {
      background: "var(--app-warning-bg)",
      color: "var(--app-warning-text)",
    };
  }
  return {
    background: "var(--app-success-bg)",
    color: "var(--app-success-text)",
  };
}

function factorValue(key: string, value: unknown, currency: string): string {
  if (value === null || value === undefined) return "Not recorded";
  if (typeof value !== "number") return String(value);
  if (
    ["observed_price", "estimated_landed_cost", "shipping_estimate"].includes(
      key,
    )
  ) {
    return formatCurrency(value, currency);
  }
  if (key === "margin_estimate") return `${value}%`;
  if (
    key.endsWith("_signal") ||
    key.endsWith("_score") ||
    key === "trend_velocity"
  ) {
    return `${value} / 100`;
  }
  return String(value);
}

export function ProductValidationView() {
  const { business } = useSession();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [market, setMarket] = useState("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const queueQuery = useQuery({
    queryKey: ["product-validation-queue", search],
    queryFn: () => fetchProductValidationQueue(search),
  });
  const candidates = queueQuery.data ?? EMPTY_CANDIDATES;
  const markets = useMemo(
    () =>
      Array.from(
        new Set(
          candidates.map((candidate) => candidate.market).filter(Boolean),
        ),
      ).sort((left, right) => left!.localeCompare(right!)) as string[],
    [candidates],
  );
  const visibleCandidates = candidates.filter(
    (candidate) => market === "all" || candidate.market === market,
  );
  const evidenceCoverage = candidates.length
    ? Math.round(
        (candidates.reduce(
          (total, candidate) =>
            total +
            candidate.evidenceReview.evidenceCoverage.recorded /
              candidate.evidenceReview.evidenceCoverage.total,
          0,
        ) /
          candidates.length) *
          100,
      )
    : null;
  const highRiskCount = candidates.filter(
    (candidate) => candidate.risk === "high" || candidate.risk === "blocked",
  ).length;
  const recordedDemandCount = candidates.filter(
    (candidate) => candidate.demandSignal !== null,
  ).length;

  const decision = useMutation({
    mutationFn: ({
      candidate,
      action,
      reason,
    }: {
      candidate: ProductValidationCandidate;
      action: ProductValidationDecision;
      reason: string;
    }) =>
      decideProductOpportunity(candidate.id, {
        decision: action,
        reason,
        expectedVersion: candidate.version,
      }),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({
        queryKey: ["product-validation-queue"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["product-validation", result.opportunity.id],
      });
      void queryClient.invalidateQueries({
        queryKey: ["product-validation-history", result.opportunity.id],
      });
      void queryClient.invalidateQueries({ queryKey: ["product-radar"] });
      toast.success("Validation decision recorded.");
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError
          ? error.message
          : "Couldn't record this decision. Refresh the candidate and try again.",
      ),
  });

  return (
    <main className="flex flex-col gap-4 px-5 pb-7 pt-4 md:px-6">
      <div className="flex flex-wrap items-start gap-3">
        <div>
          <h1
            className="text-[19px] font-extrabold"
            style={{ color: "var(--app-text)" }}
          >
            Product Validation
          </h1>
          <p
            className="mt-1 max-w-[760px] text-[12px]"
            style={{ color: "var(--app-text-muted)" }}
          >
            Review recorded evidence and make an auditable test, watch, or
            reject decision before any canonical product is created.
          </p>
        </div>
        <div className="ms-auto flex flex-wrap items-center gap-2">
          <Link
            href="/autonomous-commerce/product-radar"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-[9px] px-3 text-[11px] font-bold"
            style={{
              border: "1px solid var(--app-border)",
              color: "var(--app-primary)",
            }}
          >
            Open Product Radar{" "}
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
          <button
            type="button"
            onClick={() => void queueQuery.refetch()}
            disabled={queueQuery.isFetching}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-[9px] px-3 text-[11px] font-bold disabled:opacity-50"
            style={{
              border: "1px solid var(--app-border)",
              color: "var(--app-text-muted)",
            }}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${queueQuery.isFetching ? "animate-spin" : ""}`}
              aria-hidden
            />
            Refresh
          </button>
        </div>
      </div>

      <div
        className="flex items-start gap-2 rounded-[10px] px-3 py-2.5 text-[11px]"
        style={{
          background: "var(--app-warning-bg)",
          color: "var(--app-warning-text)",
        }}
      >
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>
            External demand, compliance, return-risk, and store data are not
            connected here. Missing evidence stays marked as unavailable, and
            launch approval is blocked.
          </span>
          <Link href="/integrations" className="font-bold underline">
            Review integrations
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Awaiting validation"
          value={String(candidates.length)}
          detail="Candidates in the real review queue"
        />
        <Metric
          label="Evidence recorded"
          value={evidenceCoverage === null ? "—" : `${evidenceCoverage}%`}
          detail="Average of the nine tracked evidence fields"
        />
        <Metric
          label="Demand evidence"
          value={`${recordedDemandCount} / ${candidates.length}`}
          detail="Operator-recorded demand signals"
        />
        <Metric
          label="High risk or blocked"
          value={String(highRiskCount)}
          detail="Risk flags recorded on queued candidates"
          warning={highRiskCount > 0}
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
              placeholder="Search validation candidates"
              aria-label="Search validation candidates"
              className="h-10 min-w-0 flex-1 bg-transparent text-[12px] outline-none"
              style={{ color: "var(--app-text)" }}
            />
          </label>
          <select
            value={market}
            onChange={(event) => setMarket(event.target.value)}
            aria-label="Filter by market"
            className="h-10 rounded-[9px] px-3 text-[12px] font-semibold"
            style={{
              border: "1px solid var(--app-border)",
              color: "var(--app-text-muted)",
              background: "var(--app-surface)",
            }}
          >
            <option value="all">All markets</option>
            {markets.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>

        {queueQuery.isPending ? (
          <div
            className="h-48 animate-pulse"
            style={{ background: "var(--app-surface-2)" }}
          />
        ) : queueQuery.isError ? (
          <div className="p-8 text-center">
            <p
              className="text-[13px] font-bold"
              style={{ color: "var(--app-text)" }}
            >
              Validation queue unavailable
            </p>
            <p
              className="mt-1 text-[11.5px]"
              style={{ color: "var(--app-text-muted)" }}
            >
              I couldn&apos;t load the saved review candidates. Try refreshing.
            </p>
            <button
              type="button"
              onClick={() => void queueQuery.refetch()}
              className="mt-3 rounded-[9px] px-3 py-2 text-[11px] font-bold text-white"
              style={{ background: "var(--app-primary)" }}
            >
              Retry
            </button>
          </div>
        ) : candidates.length === 0 ? (
          <div className="p-8 text-center">
            <ClipboardCheck
              className="mx-auto h-7 w-7"
              style={{ color: "var(--app-text-disabled)" }}
              aria-hidden
            />
            <p
              className="mt-3 text-[13px] font-bold"
              style={{ color: "var(--app-text)" }}
            >
              No candidates are waiting for validation
            </p>
            <p
              className="mt-1 text-[11.5px]"
              style={{ color: "var(--app-text-muted)" }}
            >
              Send a real research candidate here from Product Radar when it is
              ready for review.
            </p>
            <Link
              href="/autonomous-commerce/product-radar"
              className="mt-3 inline-flex items-center gap-1 text-[11px] font-bold"
              style={{ color: "var(--app-primary)" }}
            >
              Go to Product Radar{" "}
              <ArrowUpRight className="h-3 w-3" aria-hidden />
            </Link>
          </div>
        ) : visibleCandidates.length === 0 ? (
          <div
            className="p-8 text-center text-[12px]"
            style={{ color: "var(--app-text-muted)" }}
          >
            No candidates match this market filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1020px] border-collapse text-left text-[11.5px]">
              <thead
                style={{
                  background: "var(--app-surface-2)",
                  color: "var(--app-text-faint)",
                }}
              >
                <tr>
                  {[
                    "Candidate / finding",
                    "Source / market",
                    "Evidence",
                    "Demand",
                    "Confidence",
                    "Risk",
                    "Next step",
                  ].map((label) => (
                    <th key={label} className="px-3 py-2.5 font-semibold">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleCandidates.map((candidate) => (
                  <tr
                    key={candidate.id}
                    className="border-t"
                    style={{ borderColor: "var(--app-border)" }}
                  >
                    <td className="max-w-[300px] px-3 py-3 align-top">
                      <button
                        type="button"
                        onClick={() => setSelectedId(candidate.id)}
                        className="text-left font-bold"
                        style={{ color: "var(--app-primary)" }}
                      >
                        {candidate.title}
                      </button>
                      <p
                        className="mt-1 line-clamp-2"
                        style={{ color: "var(--app-text-muted)" }}
                      >
                        {candidate.evidence ?? "No evidence note recorded."}
                      </p>
                    </td>
                    <td
                      className="px-3 py-3 align-top"
                      style={{ color: "var(--app-text-muted)" }}
                    >
                      <div>{candidate.source}</div>
                      <div className="mt-1">
                        {candidate.market ?? "Market not set"}
                      </div>
                      <div
                        className="mt-1 text-[10px]"
                        style={{ color: "var(--app-text-disabled)" }}
                      >
                        {candidate.sourceFreshAt
                          ? `Source ${formatDate(candidate.sourceFreshAt)}`
                          : "Freshness not supplied"}
                      </div>
                    </td>
                    <td
                      className="px-3 py-3 align-top"
                      style={{ color: "var(--app-text-muted)" }}
                    >
                      {candidate.evidenceReview.evidenceCoverage.recorded} /{" "}
                      {candidate.evidenceReview.evidenceCoverage.total} recorded
                    </td>
                    <td
                      className="px-3 py-3 align-top"
                      style={{ color: "var(--app-text-muted)" }}
                    >
                      {candidate.demandSignal === null
                        ? "Not recorded"
                        : `${candidate.demandSignal} / 100`}
                    </td>
                    <td
                      className="px-3 py-3 align-top"
                      style={{ color: "var(--app-text-muted)" }}
                    >
                      {candidate.confidence === null
                        ? "Not recorded"
                        : `${candidate.confidence} / 100`}
                    </td>
                    <td className="px-3 py-3 align-top">
                      <span
                        className="rounded-full px-2 py-1 text-[10px] font-bold"
                        style={riskStyle(candidate.risk)}
                      >
                        {RISK_LABELS[candidate.risk]}
                      </span>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <button
                        type="button"
                        onClick={() => setSelectedId(candidate.id)}
                        className="rounded-[8px] px-2.5 py-1.5 text-[10.5px] font-bold"
                        style={{
                          border: "1px solid var(--app-border)",
                          color: "var(--app-primary)",
                        }}
                      >
                        Review evidence
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selectedId && (
        <ValidationDrawer
          id={selectedId}
          currency={business.currency}
          busy={decision.isPending}
          onClose={() => setSelectedId(null)}
          onDecision={(candidate, action, reason) =>
            decision.mutate({ candidate, action, reason })
          }
        />
      )}
    </main>
  );
}

function Metric({
  label,
  value,
  detail,
  warning = false,
}: {
  label: string;
  value: string;
  detail: string;
  warning?: boolean;
}) {
  return (
    <div
      className="min-w-0 rounded-[11px] p-3"
      style={{
        background: "var(--app-surface)",
        border: "1px solid var(--app-border)",
      }}
    >
      <div
        className="text-[10.5px] font-semibold"
        style={{ color: "var(--app-text-faint)" }}
      >
        {label}
      </div>
      <div
        className="mt-2 text-[19px] font-extrabold tabular-nums"
        style={{
          color: warning ? "var(--app-warning-text)" : "var(--app-text)",
        }}
      >
        {value}
      </div>
      <div
        className="mt-1 text-[10px]"
        style={{ color: "var(--app-text-disabled)" }}
      >
        {detail}
      </div>
    </div>
  );
}

function ValidationDrawer({
  id,
  currency,
  busy,
  onClose,
  onDecision,
}: {
  id: string;
  currency: string;
  busy: boolean;
  onClose: () => void;
  onDecision: (
    candidate: ProductValidationCandidate,
    action: ProductValidationDecision,
    reason: string,
  ) => void;
}) {
  const queryClient = useQueryClient();
  const [action, setAction] =
    useState<ProductValidationDecision>("approve_test");
  const [reason, setReason] = useState("");
  const [sku, setSku] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const candidateQuery = useQuery({
    queryKey: ["product-validation", id],
    queryFn: () => fetchProductValidationCandidate(id),
  });
  const historyQuery = useQuery({
    queryKey: ["product-validation-history", id],
    queryFn: () => fetchProductValidationHistory(id),
  });
  const candidate = candidateQuery.data;
  const launchBlock = candidate?.evidenceReview.launchApproval.reason;
  const referenceUrl = safeExternalUrl(candidate?.sourceReference ?? null);
  const productMutation = useMutation({
    mutationFn: () => {
      if (!candidate) throw new Error("Candidate details are not loaded.");
      return createProductFromValidation(id, {
        sku: sku.trim() || null,
        costPrice: Number(costPrice),
        sellingPrice: Number(sellingPrice),
        expectedVersion: candidate.version,
      });
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ["product-validation", id] });
      void queryClient.invalidateQueries({ queryKey: ["product-validation-queue"] });
      void queryClient.invalidateQueries({ queryKey: ["product-radar"] });
      toast.success(
        result.alreadyExists
          ? "This candidate is already linked to its catalog product."
          : "Inactive catalog draft created. It has no stock and is not published.",
      );
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError
          ? error.message
          : "Couldn't create the catalog draft. Refresh and try again.",
      ),
  });
  const validPricing =
    costPrice.trim() !== "" &&
    sellingPrice.trim() !== "" &&
    Number.isFinite(Number(costPrice)) &&
    Number.isFinite(Number(sellingPrice)) &&
    Number(costPrice) >= 0 &&
    Number(sellingPrice) >= 0;

  return (
    <div
      className="fixed z-[80] flex justify-end"
      style={{ inset: 0, background: "rgba(10,27,42,.28)" }}
      onClick={onClose}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Product validation details"
        className="h-full w-full max-w-[560px] overflow-y-auto p-5"
        style={{ background: "var(--app-surface)" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div>
            <h2
              className="text-[17px] font-extrabold"
              style={{ color: "var(--app-text)" }}
            >
              {candidate?.title ?? "Validation candidate"}
            </h2>
            {candidate && (
              <p
                className="mt-1 text-[11.5px]"
                style={{ color: "var(--app-text-muted)" }}
              >
                {candidate.source} · {candidate.market ?? "Market not set"} ·
                Version {candidate.version}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="ms-auto rounded-[8px] p-2"
            style={{
              color: "var(--app-text-muted)",
              border: "1px solid var(--app-border)",
            }}
            aria-label="Close validation details"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        {candidateQuery.isPending ? (
          <div
            className="mt-5 h-40 animate-pulse rounded-[12px]"
            style={{ background: "var(--app-surface-2)" }}
          />
        ) : candidateQuery.isError || !candidate ? (
          <div
            className="mt-5 rounded-[12px] p-4"
            style={{ background: "var(--app-surface-2)" }}
          >
            <p
              className="text-[12px] font-bold"
              style={{ color: "var(--app-text)" }}
            >
              Candidate details unavailable
            </p>
            <button
              type="button"
              onClick={() => void candidateQuery.refetch()}
              className="mt-2 text-[11px] font-bold"
              style={{ color: "var(--app-primary)" }}
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            <section
              className="mt-5 rounded-[12px] p-4"
              style={{ background: "var(--app-surface-2)" }}
            >
              <div className="flex items-center justify-between gap-2">
                <h3
                  className="text-[12px] font-extrabold"
                  style={{ color: "var(--app-text)" }}
                >
                  Recorded evidence
                </h3>
                <span
                  className="rounded-full px-2 py-1 text-[10px] font-bold"
                  style={riskStyle(candidate.risk)}
                >
                  {RISK_LABELS[candidate.risk]} risk
                </span>
              </div>
              <p
                className="mt-2 whitespace-pre-wrap text-[11.5px] leading-relaxed"
                style={{ color: "var(--app-text-muted)" }}
              >
                {candidate.evidence ?? "No evidence note has been recorded."}
              </p>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
                {candidate.evidenceReview.factors.map((factor) => (
                  <div key={factor.key}>
                    <dt
                      className="text-[10px] font-semibold"
                      style={{ color: "var(--app-text-disabled)" }}
                    >
                      {FACTOR_LABELS[factor.key] ??
                        factor.key.replaceAll("_", " ")}
                    </dt>
                    <dd
                      className="mt-0.5 text-[11.5px] font-bold"
                      style={{ color: "var(--app-text)" }}
                    >
                      {factorValue(factor.key, factor.value, currency)}
                    </dd>
                  </div>
                ))}
              </dl>
              {referenceUrl && (
                <a
                  href={referenceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex items-center gap-1 text-[11px] font-bold"
                  style={{ color: "var(--app-primary)" }}
                >
                  Open evidence source{" "}
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </a>
              )}
            </section>

            <section
              className="mt-4 rounded-[12px] p-4"
              style={{ border: "1px solid var(--app-border)" }}
            >
              <h3
                className="text-[12px] font-extrabold"
                style={{ color: "var(--app-text)" }}
              >
                Missing evidence
              </h3>
              <ul className="mt-2 space-y-2">
                {candidate.evidenceReview.unavailableDimensions.map((item) => (
                  <li
                    key={item.key}
                    className="flex items-start gap-2 text-[10.5px]"
                  >
                    <ShieldAlert
                      className="mt-0.5 h-3.5 w-3.5 shrink-0"
                      style={{ color: "var(--app-warning-text)" }}
                      aria-hidden
                    />
                    <span style={{ color: "var(--app-text-muted)" }}>
                      <strong
                        className="capitalize"
                        style={{ color: "var(--app-text)" }}
                      >
                        {item.key.replaceAll("_", " ")}:{" "}
                      </strong>
                      {item.reason}
                    </span>
                  </li>
                ))}
              </ul>
              <p
                className="mt-3 text-[10.5px]"
                style={{ color: "var(--app-text-disabled)" }}
              >
                Evidence coverage:{" "}
                {candidate.evidenceReview.evidenceCoverage.recorded} of{" "}
                {candidate.evidenceReview.evidenceCoverage.total} tracked
                fields. Values above are recorded research, not verified
                external data.
              </p>
            </section>

            <section
              className="mt-4 rounded-[12px] p-4"
              style={{ border: "1px solid var(--app-border)" }}
            >
              <div className="flex items-center gap-2">
                <Clock3
                  className="h-3.5 w-3.5"
                  style={{ color: "var(--app-text-disabled)" }}
                  aria-hidden
                />
                <h3
                  className="text-[12px] font-extrabold"
                  style={{ color: "var(--app-text)" }}
                >
                  Decision history
                </h3>
              </div>
              {historyQuery.isPending ? (
                <p
                  className="mt-2 text-[10.5px]"
                  style={{ color: "var(--app-text-disabled)" }}
                >
                  Loading recorded decisions…
                </p>
              ) : historyQuery.isError ? (
                <button
                  type="button"
                  onClick={() => void historyQuery.refetch()}
                  className="mt-2 text-[10.5px] font-bold"
                  style={{ color: "var(--app-primary)" }}
                >
                  Retry history
                </button>
              ) : historyQuery.data?.length ? (
                <ol className="mt-2 space-y-2">
                  {historyQuery.data.map((item) => (
                    <li
                      key={item.id}
                      className="rounded-[9px] p-2.5"
                      style={{ background: "var(--app-surface-2)" }}
                    >
                      <div
                        className="text-[10.5px] font-bold"
                        style={{ color: "var(--app-text)" }}
                      >
                        {DECISION_LABELS[item.decision]}
                      </div>
                      <p
                        className="mt-1 text-[10px]"
                        style={{ color: "var(--app-text-muted)" }}
                      >
                        {formatDate(item.createdAt)} · {item.reason}
                      </p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p
                  className="mt-2 text-[10.5px]"
                  style={{ color: "var(--app-text-disabled)" }}
                >
                  No previous decision has been recorded.
                </p>
              )}
            </section>

            {(candidate.status === "test_approved" ||
              candidate.status === "launch_approved") && (
              <section
                className="mt-4 rounded-[12px] p-4"
                style={{ background: "var(--app-surface-2)" }}
              >
                <h3
                  className="text-[12px] font-extrabold"
                  style={{ color: "var(--app-text)" }}
                >
                  Canonical product handoff
                </h3>
                {candidate.productId ? (
                  <div className="mt-2 rounded-[9px] p-3" style={{ background: "var(--app-surface)" }}>
                    <p className="text-[10.5px]" style={{ color: "var(--app-text-muted)" }}>
                      This approved candidate is linked to catalog product <span className="font-bold" style={{ color: "var(--app-text)" }}>{candidate.productId}</span>.
                    </p>
                    <Link href="/products" className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold" style={{ color: "var(--app-primary)" }}>
                      Open Products <ArrowUpRight className="h-3 w-3" aria-hidden />
                    </Link>
                  </div>
                ) : (
                  <>
                    <p
                      className="mt-1 text-[10.5px]"
                      style={{ color: "var(--app-text-muted)" }}
                    >
                      Create the canonical catalog draft using confirmed business pricing. It stays inactive with zero stock; this does not publish or place a purchase order.
                    </p>
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                      <label className="text-[10px] font-semibold" style={{ color: "var(--app-text-muted)" }}>
                        SKU (optional)
                        <input value={sku} onChange={(event) => setSku(event.target.value)} maxLength={100} className="mt-1 h-9 w-full rounded-[8px] px-2 text-[11px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", color: "var(--app-text)" }} />
                      </label>
                      <label className="text-[10px] font-semibold" style={{ color: "var(--app-text-muted)" }}>
                        Unit cost ({currency})
                        <input type="number" min="0" step="0.01" required value={costPrice} onChange={(event) => setCostPrice(event.target.value)} className="mt-1 h-9 w-full rounded-[8px] px-2 text-[11px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", color: "var(--app-text)" }} />
                      </label>
                      <label className="text-[10px] font-semibold" style={{ color: "var(--app-text-muted)" }}>
                        Selling price ({currency})
                        <input type="number" min="0" step="0.01" required value={sellingPrice} onChange={(event) => setSellingPrice(event.target.value)} className="mt-1 h-9 w-full rounded-[8px] px-2 text-[11px]" style={{ background: "var(--app-surface)", border: "1px solid var(--app-border)", color: "var(--app-text)" }} />
                      </label>
                    </div>
                    <button
                      type="button"
                      disabled={!validPricing || productMutation.isPending}
                      onClick={() => productMutation.mutate()}
                      className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-[9px] text-[11.5px] font-extrabold text-white disabled:opacity-50"
                      style={{ background: "var(--app-primary)" }}
                    >
                      <PackageCheck className="h-3.5 w-3.5" aria-hidden />
                      {productMutation.isPending ? "Creating draft…" : "Create inactive product draft"}
                    </button>
                  </>
                )}
              </section>
            )}

            {(candidate.status === "test_approved" ||
              candidate.status === "launch_approved") && (
              <section
                className="mt-4 rounded-[12px] p-4"
                style={{ background: "var(--app-surface-2)" }}
              >
                <h3
                  className="text-[12px] font-extrabold"
                  style={{ color: "var(--app-text)" }}
                >
                  Continue to supplier sourcing
                </h3>
                <p
                  className="mt-1 text-[10.5px]"
                  style={{ color: "var(--app-text-muted)" }}
                >
                  Start an RFQ linked to this candidate. You can add canonical
                  suppliers and confirm the requirement before saving.
                </p>
                <Link
                  href={`/autonomous-commerce/rfqs?opportunityId=${encodeURIComponent(candidate.id)}`}
                  className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-[9px] text-[11.5px] font-extrabold text-white"
                  style={{ background: "var(--app-primary)" }}
                >
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                  Send to RFQ
                </Link>
              </section>
            )}

            {candidate.status === "validation_requested" && (
              <section
                className="mt-4 rounded-[12px] p-4"
                style={{ background: "var(--app-surface-2)" }}
              >
                <h3
                  className="text-[12px] font-extrabold"
                  style={{ color: "var(--app-text)" }}
                >
                  Record a decision
                </h3>
                <label
                  className="mt-3 block text-[10.5px] font-semibold"
                  style={{ color: "var(--app-text-muted)" }}
                >
                  Decision
                  <select
                    value={action}
                    onChange={(event) =>
                      setAction(event.target.value as ProductValidationDecision)
                    }
                    className="mt-1 h-10 w-full rounded-[8px] px-2 text-[11.5px]"
                    style={{
                      background: "var(--app-surface)",
                      border: "1px solid var(--app-border)",
                      color: "var(--app-text)",
                    }}
                  >
                    <option value="approve_test">Approve for test</option>
                    <option value="watch">Watch</option>
                    <option value="reject">Reject</option>
                  </select>
                </label>
                <label
                  className="mt-3 block text-[10.5px] font-semibold"
                  style={{ color: "var(--app-text-muted)" }}
                >
                  Reason required for audit
                  <textarea
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    rows={3}
                    maxLength={1000}
                    className="mt-1 w-full rounded-[8px] p-2 text-[11.5px]"
                    style={{
                      background: "var(--app-surface)",
                      border: "1px solid var(--app-border)",
                      color: "var(--app-text)",
                    }}
                    placeholder="Summarize the evidence behind this decision"
                  />
                </label>
                <button
                  type="button"
                  disabled={busy || reason.trim().length === 0}
                  onClick={() => onDecision(candidate, action, reason.trim())}
                  className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-[9px] text-[11.5px] font-extrabold text-white disabled:opacity-50"
                  style={{ background: "var(--app-primary)" }}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                  {busy ? "Saving decision…" : "Record decision"}
                </button>
                <div
                  className="mt-3 rounded-[9px] p-2.5 text-[10px]"
                  style={{
                    background: "var(--app-surface)",
                    color: "var(--app-warning-text)",
                  }}
                >
                  <strong>Launch approval unavailable.</strong> {launchBlock} No
                  product is created and no channel is published by these
                  decisions.
                </div>
              </section>
            )}
          </>
        )}
      </aside>
    </div>
  );
}
