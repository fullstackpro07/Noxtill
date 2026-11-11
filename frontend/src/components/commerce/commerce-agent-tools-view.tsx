"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import { toast } from "@/lib/toast";
import { useModuleHeader } from "@/components/layout/module-header-context";
import { saveHubChanges } from "@/lib/settings-hub-api";
import { decideAgentToolRun, fetchAgentToolRuns, fetchAgentTools, runAgentTool, type AgentRiskClass, type AgentTool, type AgentToolRun } from "@/lib/commerce-agent-tools-api";
import { askCommerceAgent, fetchCommerceAgentSpecialistRuns, runCommerceAgentOrderFulfillmentOrchestration, runCommerceAgentProductSourcingOrchestration, runCommerceAgentReview, type CommerceAgentSpecialistRun, type CommerceAgentStatusSnapshot, type CommerceDeliveryExceptionReview, type CommerceExperimentReview, type CommerceFulfillmentReview, type CommerceInventoryAvailabilityReview, type CommerceOrderFulfillmentOrchestration, type CommerceProductSourcingOrchestration, type CommerceProductionReview, type CommerceReconciliationReview, type CommerceSupplierClaimReview, type CommerceValidationScorecardReview } from "@/lib/commerce-specialist-agent-api";
import { SpecialistAgentUsage } from "@/components/agents/specialist-agent-usage";

const RISK_COLOR: Record<AgentRiskClass, string> = {
  READ_ONLY: "var(--app-success-text)",
  LOW_RISK_WRITE: "var(--app-text-muted)",
  MEDIUM_RISK_WRITE: "var(--app-warning-text)",
  HIGH_RISK_WRITE: "var(--app-danger-strong)",
  FINANCIAL: "var(--app-danger-strong)",
  IRREVERSIBLE: "var(--app-danger-strong)",
};
const KEYS = { registry: ["commerce-agent-tools"], runs: ["commerce-agent-tool-runs"], specialistRuns: ["commerce-specialist-agent-runs"] };

const SNAPSHOT_GROUPS: { key: keyof CommerceAgentStatusSnapshot; label: string }[] = [
  { key: "productOpportunities", label: "Product opportunities" },
  { key: "rfqs", label: "RFQs" },
  { key: "riskCases", label: "Risk cases" },
  { key: "channelListings", label: "Channel listings" },
  { key: "experiments", label: "Experiments" },
];

function errorMessage(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

function validationEvidenceStatus(status: string) {
  if (status === "inputs_recorded") return "Inputs recorded · not scored";
  if (status === "partial_evidence") return "Partial evidence";
  return "Not tracked";
}

function OrderFulfillmentOrchestrationResult({ review }: { review: CommerceOrderFulfillmentOrchestration }) {
  return (
    <article aria-label="Commerce order fulfillment orchestration result" className="mt-4 rounded-xl border p-3" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-2)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="text-xs">Order fulfillment readiness · {review.state}</strong>
        <span className="text-[11px]" style={{ color: "var(--app-text-faint)" }}>Order {review.orderId.slice(0, 12)} · trace {review.correlationId.slice(0, 8)}</span>
      </div>
      <p className="mb-0 mt-2 text-sm">{review.summary}</p>
      <ol className="mb-0 mt-3 flex list-decimal flex-col gap-2 pl-5 text-xs">
        {review.steps.map((step, index) => (
          <li key={`${step.toolRunId ?? step.toolKey}-${index}`}>
            <strong>{step.worker.replaceAll("_", " ")} · {step.status}</strong>
            <span className="ml-2" style={{ color: "var(--app-text-muted)" }}>{step.summary}</span>
            <Link href={step.screen} className="ml-2 font-bold underline">Open source</Link>
          </li>
        ))}
      </ol>
      {review.routeEvaluation && (
        <section aria-label="Fulfillment route evidence" className="mt-4 rounded-lg border p-3" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="text-xs">Recorded route evaluation · {review.routeEvaluation.candidateCount} candidate node(s)</strong>
            <span className="text-[11px]" style={{ color: "var(--app-text-faint)" }}>
              {review.routeEvaluation.destinationCountry ?? "Destination not set"}
              {review.routeEvaluation.policyVersion ? ` · policy ${review.routeEvaluation.policyVersion}` : ""}
            </span>
          </div>
          {review.routeEvaluation.recommendation ? (
            <div className="mt-2 rounded-md border p-2 text-xs" style={{ borderColor: "var(--app-border)" }}>
              <strong>Current recommendation · {review.routeEvaluation.recommendation.mode.replaceAll("_", " ")}</strong>
              {review.routeEvaluation.recommendation.allocations.length > 0 && (
                <ul className="mb-0 mt-2 flex list-none flex-col gap-1 p-0">
                  {review.routeEvaluation.recommendation.allocations.map((allocation) => {
                    const node = review.routeEvaluation!.candidates.find((candidate) => candidate.nodeId === allocation.nodeId);
                    return <li key={`${allocation.orderItemId}-${allocation.nodeId}`}>Line {allocation.orderItemId.slice(0, 8)} → {node?.name ?? `Node ${allocation.nodeId.slice(0, 8)}`}</li>;
                  })}
                </ul>
              )}
              {review.routeEvaluation.recommendation.why.map((reason) => <p key={reason} className="mb-0 mt-1" style={{ color: "var(--app-text-muted)" }}>{reason}</p>)}
            </div>
          ) : (
            <p className="mb-0 mt-2 text-xs" style={{ color: "var(--app-warning-text)" }}>
              No complete route recommendation is recorded.
              {review.routeEvaluation.unroutableLineCount > 0 && ` ${review.routeEvaluation.unroutableLineCount} line(s) have no eligible route.`}
            </p>
          )}
          {review.routeEvaluation.candidates.length > 0 ? (
            <ul className="mb-0 mt-2 flex list-none flex-col gap-2 p-0">
              {review.routeEvaluation.candidates.map((candidate) => (
                <li key={candidate.nodeId} className="rounded-md border p-2 text-xs" style={{ borderColor: "var(--app-border)" }}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <strong>{candidate.name}</strong>
                    <span style={{ color: candidate.eligibleForAll ? "var(--app-success-text)" : "var(--app-warning-text)" }}>
                      {candidate.eligibleForAll ? "Eligible for every line" : "Not eligible for every line"} · market {candidate.market}
                    </span>
                  </div>
                  <p className="mb-0 mt-1" style={{ color: "var(--app-text-muted)" }}>
                    {candidate.processingDays === null ? "Processing time not tracked" : `${candidate.processingDays} processing day(s)`}
                    {candidate.costPerOrder === null ? " · Cost not tracked" : ` · Recorded cost input ${candidate.costPerOrder} (currency not specified)`}
                    {` · ${candidate.lineCount} line check(s)`}
                  </p>
                  {candidate.lines.length > 0 && (
                    <ul className="mb-0 mt-2 flex list-none flex-wrap gap-x-3 gap-y-1 p-0 text-[11px]">
                      {candidate.lines.map((line) => (
                        <li key={`${candidate.nodeId}-${line.orderItemId}`}>
                          Line {line.orderItemId.slice(0, 8)} · {line.stock} stock · {line.eligible ? "eligible" : "not eligible"}
                          {line.reasons.length > 0 && ` · ${line.reasons.join("; ")}`}
                        </li>
                      ))}
                    </ul>
                  )}
                  {candidate.linesTruncated && <p className="mb-0 mt-1 text-[11px]" style={{ color: "var(--app-text-faint)" }}>Additional line checks are available in Fulfillment Router.</p>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mb-0 mt-2 text-xs" style={{ color: "var(--app-text-muted)" }}>No candidate nodes are configured for this order&apos;s products.</p>
          )}
          {review.routeEvaluation.candidatesTruncated && <p className="mb-0 mt-2 text-[11px]" style={{ color: "var(--app-text-faint)" }}>Showing the first recorded route candidates; open Fulfillment Router for the full result.</p>}
        </section>
      )}
      <ul className="mb-0 mt-3 list-disc pl-5 text-[11px]" style={{ color: "var(--app-text-faint)" }}>
        {review.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
      </ul>
    </article>
  );
}

function ProductSourcingOrchestrationResult({ review }: { review: CommerceProductSourcingOrchestration }) {
  return (
    <article aria-label="Commerce product sourcing orchestration result" className="mt-4 rounded-xl border p-3" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-2)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="text-xs">Product sourcing readiness · {review.state.replaceAll("_", " ")}</strong>
        <span className="text-[11px]" style={{ color: "var(--app-text-faint)" }}>Opportunity {review.opportunityId.slice(0, 8)} · trace {review.correlationId.slice(0, 8)}</span>
      </div>
      <p className="mb-0 mt-2 text-sm">{review.summary}</p>
      <ol className="mb-0 mt-3 flex list-decimal flex-col gap-2 pl-5 text-xs">
        {review.steps.map((step, index) => (
          <li key={`${step.toolRunId ?? step.toolKey}-${index}`}>
            <strong>{step.worker.replaceAll("_", " ")} · {step.status}</strong>
            <span className="ml-2" style={{ color: "var(--app-text-muted)" }}>{step.summary}</span>
            <Link href={step.screen} className="ml-2 font-bold underline">Open source</Link>
          </li>
        ))}
      </ol>
      <ul className="mb-0 mt-3 list-disc pl-5 text-[11px]" style={{ color: "var(--app-text-faint)" }}>
        {review.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
      </ul>
    </article>
  );
}

function ValidationScorecards({ review }: { review: CommerceValidationScorecardReview }) {
  return (
    <section className="mt-4 rounded-xl border p-3" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-2)" }} aria-label="Product validation scorecards">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="m-0 text-sm font-bold">Product validation evidence</h3>
          <p className="mb-0 mt-1 text-xs" style={{ color: "var(--app-text-muted)" }}>
            {review.state === "no_candidates"
              ? "No Product Radar opportunities are awaiting validation."
              : `Evidence coverage for ${review.reviewedCount} current candidate(s)${review.hasMore ? `; review is capped at ${review.maximumReviewed}.` : "."}`}
          </p>
        </div>
        <Link href="/autonomous-commerce/product-validation" className="text-xs font-bold underline">Open Product Validation</Link>
      </div>
      {review.candidates.length > 0 && (
        <div className="mt-3 space-y-3">
          {review.candidates.map((candidate) => (
            <article key={candidate.opportunityId} className="rounded-lg border p-3" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
              <p className="m-0 text-xs font-semibold">
                Candidate {candidate.opportunityId.slice(0, 8)} · {candidate.source} · {candidate.market ?? "Market not set"} · {candidate.risk} risk
              </p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {candidate.scorecard.dimensions.map((dimension) => (
                  <div key={dimension.key} className="rounded-md border p-2" style={{ borderColor: "var(--app-border)" }}>
                    <p className="m-0 text-xs font-bold">{dimension.label}</p>
                    <p className="mb-0 mt-1 text-[11px]" style={{ color: dimension.status === "not_tracked" ? "var(--app-text-faint)" : "var(--app-text-muted)" }}>
                      {validationEvidenceStatus(dimension.status)}
                      {dimension.recordedFields.length > 0 && ` · ${dimension.recordedFields.length} of ${dimension.recordedFields.length + dimension.missingFields.length} fields`}
                    </p>
                    {dimension.missingData.map((item) => (
                      <p key={item} className="mb-0 mt-1 text-[10px]" style={{ color: "var(--app-text-faint)" }}>{item}</p>
                    ))}
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
      <p className="mb-0 mt-3 text-[11px]" style={{ color: "var(--app-text-faint)" }}>
        {review.interpretation} No launch decision is made here; the canonical validation flow keeps its existing compliance gate.
      </p>
    </section>
  );
}

function SavedReconciliationReview({ review }: { review: CommerceReconciliationReview }) {
  return (
    <section className="mt-4 rounded-xl border p-3" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-2)" }} aria-label="Saved listing reconciliation review">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="m-0 text-sm font-bold">Saved listing reconciliation</h3>
          <p className="mb-0 mt-1 text-xs" style={{ color: "var(--app-text-muted)" }}>
            {review.state === "no_saved_runs"
              ? "No reconciliation check is recorded yet. This review does not contact a store."
              : `Showing up to ${review.maximumRunsReviewed} most recent saved checks; open findings are counted from current records.`}
          </p>
        </div>
        <Link href="/autonomous-commerce/reconciliation" className="text-xs font-bold underline">Open Reconciliation</Link>
      </div>
      {review.latestRuns.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-xs">
            <thead style={{ color: "var(--app-text-faint)" }}>
              <tr>{["Provider", "Status", "Checked", "Recorded discrepancies", "Started"].map((heading) => <th key={heading} className="px-2 py-1 font-semibold">{heading}</th>)}</tr>
            </thead>
            <tbody>
              {review.latestRuns.map((run, index) => (
                <tr key={`${run.provider}-${run.startedAt}-${index}`} className="border-t" style={{ borderColor: "var(--app-border)" }}>
                  <td className="px-2 py-2 font-semibold">{run.provider.replaceAll("_", " ")}</td>
                  <td className="px-2 py-2">{run.status}</td>
                  <td className="px-2 py-2">{run.listingsChecked}</td>
                  <td className="px-2 py-2">{run.discrepancies}</td>
                  <td className="px-2 py-2">{formatDate(run.startedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-3 rounded-lg border p-3" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
        <p className="m-0 text-xs font-bold">Currently open recorded findings · {review.totalOpenDiscrepancies}</p>
        {review.openDiscrepancies.length > 0 ? (
          <ul className="mb-0 mt-2 flex list-none flex-col gap-1 p-0 text-xs">
            {review.openDiscrepancies.map((group) => (
              <li key={`${group.provider}-${group.kind}`} className="flex justify-between gap-3">
                <span>{group.provider.replaceAll("_", " ")} · {group.kind.replaceAll("_", " ")}</span>
                <strong>{group.count}</strong>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-0 mt-1 text-xs" style={{ color: "var(--app-text-muted)" }}>No open discrepancy records are saved. This is not a live store-health check.</p>
        )}
      </div>
      <ul className="mb-0 mt-3 flex list-none flex-col gap-1 p-0 text-[11px]" style={{ color: "var(--app-text-faint)" }}>
        {review.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
      </ul>
    </section>
  );
}

function experimentValue(metric: string, value: number | null, currency: string | null) {
  if (value === null) return "Not available";
  const formatted = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(value);
  if (metric === "revenue") return currency ? `${currency} ${formatted}` : `${formatted} · currency not set`;
  if (metric === "gross_margin" || metric === "return_rate") return `${formatted}%`;
  return `${formatted} units`;
}

function ExperimentOutcomeReview({ review }: { review: CommerceExperimentReview }) {
  return (
    <section className="mt-4 rounded-xl border p-3" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-2)" }} aria-label="Commerce experiment evidence review">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="m-0 text-sm font-bold">Experiment outcome evidence</h3>
          <p className="mb-0 mt-1 text-xs" style={{ color: "var(--app-text-muted)" }}>
            {review.state === "no_experiments"
              ? "No running or decision-stage experiments are recorded for review. Draft experiments are not included."
              : `Review of ${review.reviewedCount} running or decision-stage record(s)${review.hasMore ? `; capped at ${review.maximumReviewed}.` : "."}`}
          </p>
        </div>
        <Link href="/autonomous-commerce/experiment-lab" className="text-xs font-bold underline">Open Experiment Lab</Link>
      </div>
      {review.experiments.length > 0 && (
        <div className="mt-3 space-y-2">
          {review.experiments.map((experiment) => (
            <article key={experiment.experimentId} className="rounded-lg border p-3" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
              <p className="m-0 text-xs font-semibold">
                Experiment {experiment.experimentId.slice(0, 8)} · {experiment.type.replaceAll("_", " ")} · merchant decision: {experiment.status.replaceAll("_", " ")}
              </p>
              <p className="mb-0 mt-2 text-xs">
                Primary metric: <strong>{experiment.primaryMetric.replaceAll("_", " ")}</strong>
                {experiment.resultsAvailable
                  ? <> · baseline {experimentValue(experiment.primaryMetric, experiment.baselineValue, review.currency)} · test {experimentValue(experiment.primaryMetric, experiment.testValue, review.currency)} · observed change {experiment.change === null ? "not available" : `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(experiment.change)} ${experiment.changeUnit === "pct" ? "% relative" : "percentage points"}`}</>
                  : " · result not available"}
              </p>
              {experiment.sufficient === false && experiment.insufficientReasons.length > 0 && (
                <p className="mb-0 mt-1 text-xs" style={{ color: "var(--app-warning-text)" }}>Canonical minimum not met: {experiment.insufficientReasons.join(" ")}</p>
              )}
              {experiment.sufficient === true && (
                <p className="mb-0 mt-1 text-xs" style={{ color: "var(--app-text-muted)" }}>The Experiment Lab minimum is met; this is not a statistical significance or causal finding.</p>
              )}
              {experiment.guardrail ? (
                <p className="mb-0 mt-1 text-xs" style={{ color: experiment.guardrail.breached ? "var(--app-warning-text)" : "var(--app-text-muted)" }}>
                  Gross-margin guardrail: {experiment.guardrail.breached ? "breached" : experiment.guardrail.testMarginPct === null ? "not measurable" : "not breached"} · minimum {experiment.guardrail.minMarginPct}% · test {experiment.guardrail.testMarginPct === null ? "not available" : `${experiment.guardrail.testMarginPct}%`}
                </p>
              ) : (
                <p className="mb-0 mt-1 text-xs" style={{ color: "var(--app-text-faint)" }}>No gross-margin guardrail recorded.</p>
              )}
            </article>
          ))}
        </div>
      )}
      <ul className="mb-0 mt-3 flex list-none flex-col gap-1 p-0 text-[11px]" style={{ color: "var(--app-text-faint)" }}>
        {review.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
      </ul>
    </section>
  );
}

function SupplierClaimEvidenceReview({ review }: { review: CommerceSupplierClaimReview }) {
  return (
    <section className="mt-4 rounded-xl border p-3" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-2)" }} aria-label="Supplier claim evidence review">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="m-0 text-sm font-bold">Supplier claim evidence</h3>
          <p className="mb-0 mt-1 text-xs" style={{ color: "var(--app-text-muted)" }}>
            {review.state === "no_claims"
              ? "No supplier claims are recorded for this business."
              : `${review.totalClaims} saved supplier claim(s); showing ${review.reviewedClaims} most recently updated${review.hasMore ? ` (capped at ${review.maximumClaimsReviewed}).` : "."}`}
          </p>
        </div>
        <Link href="/autonomous-commerce/supplier-claims" className="text-xs font-bold underline">Open Supplier Claims</Link>
      </div>
      {Object.keys(review.statusCounts).length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {Object.entries(review.statusCounts).map(([status, count]) => (
            <span key={status} className="rounded-full border px-2 py-1 text-[11px]" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
              {status.replaceAll("_", " ")} · <strong>{count}</strong>
            </span>
          ))}
        </div>
      )}
      {review.claims.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead style={{ color: "var(--app-text-faint)" }}>
              <tr>{["Status", "Currency", "Claimed loss recorded", "Settlement recorded", "Evidence", "Communications", "Updated"].map((heading) => <th key={heading} className="px-2 py-1 font-semibold">{heading}</th>)}</tr>
            </thead>
            <tbody>
              {review.claims.map((claim, index) => (
                <tr key={`${claim.updatedAt}-${index}`} className="border-t" style={{ borderColor: "var(--app-border)" }}>
                  <td className="px-2 py-2 font-semibold">{claim.status.replaceAll("_", " ")}</td>
                  <td className="px-2 py-2">{claim.currency}</td>
                  <td className="px-2 py-2">{claim.currency} {claim.recordedLossAmount}</td>
                  <td className="px-2 py-2">{claim.currency} {claim.recordedSettlementAmount}</td>
                  <td className="px-2 py-2">{claim.evidenceCount}</td>
                  <td className="px-2 py-2">{claim.communicationCount}</td>
                  <td className="px-2 py-2">{formatDate(claim.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ul className="mb-0 mt-3 flex list-none flex-col gap-1 p-0 text-[11px]" style={{ color: "var(--app-text-faint)" }}>
        {review.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
      </ul>
    </section>
  );
}

function DeliveryExceptionReview({ review }: { review: CommerceDeliveryExceptionReview }) {
  return (
    <section className="mt-4 rounded-xl border p-3" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-2)" }} aria-label="Recorded delivery exception review">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="m-0 text-sm font-bold">Recorded delivery follow-up</h3>
          <p className="mb-0 mt-1 text-xs" style={{ color: "var(--app-text-muted)" }}>
            {review.state === "no_failed_deliveries"
              ? "No failed deliveries are recorded for this business."
              : `${review.failedCount} failed delivery record(s); showing ${review.reviewedFailureCount} most recently updated${review.hasMore ? ` (capped at ${review.maximumFailuresReviewed}).` : "."}`}
          </p>
        </div>
        <Link href="/deliveries/exceptions" className="text-xs font-bold underline">Open Delivery Exceptions</Link>
      </div>
      {review.recentFailures.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead style={{ color: "var(--app-text-faint)" }}>
              <tr>
                <th className="px-2 py-1 font-semibold">Return decision</th>
                <th className="px-2 py-1 font-semibold">Delivery updated</th>
              </tr>
            </thead>
            <tbody>
              {review.recentFailures.map((failure, index) => (
                <tr key={`${failure.updatedAt}-${index}`} className="border-t" style={{ borderColor: "var(--app-border)" }}>
                  <td className="px-2 py-2 font-semibold">{failure.resolutionStatus === "resolved" ? "Resolved · approved return" : "Open · no approved return"}</td>
                  <td className="px-2 py-2">{formatDate(failure.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ul className="mb-0 mt-3 flex list-none flex-col gap-1 p-0 text-[11px]" style={{ color: "var(--app-text-faint)" }}>
        {review.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
      </ul>
    </section>
  );
}

function FulfillmentQueueReview({ review }: { review: CommerceFulfillmentReview }) {
  const stateLabel = (state: CommerceFulfillmentReview["orders"][number]["routingState"]) => {
    if (state === "operator_route_recorded") return "Operator route recorded";
    if (state === "recommendation_available") return "Candidate available · review required";
    return "No route candidate";
  };

  return (
    <section className="mt-4 rounded-xl border p-3" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-2)" }} aria-label="Commerce fulfillment queue review">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="m-0 text-sm font-bold">Fulfillment queue review</h3>
          <p className="mb-0 mt-1 text-xs" style={{ color: "var(--app-text-muted)" }}>
            {review.state === "no_open_orders"
              ? "No open online or delivery orders with physical products are in the routing queue."
              : `${review.totalOpenOrders} open routing order(s); showing ${review.reviewedOrderCount} most recently created${review.hasMore ? ` (capped at ${review.maximumOrdersReviewed}).` : "."}`}
          </p>
        </div>
        <Link href="/autonomous-commerce/fulfillment-router" className="text-xs font-bold underline">Open Fulfillment Router</Link>
      </div>
      {review.orders.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead style={{ color: "var(--app-text-faint)" }}>
              <tr>
                <th className="px-2 py-1 font-semibold">Order type</th>
                <th className="px-2 py-1 font-semibold">Current status</th>
                <th className="px-2 py-1 font-semibold">Product lines</th>
                <th className="px-2 py-1 font-semibold">Routing state</th>
              </tr>
            </thead>
            <tbody>
              {review.orders.map((order, index) => (
                <tr key={`${order.createdAt}-${index}`} className="border-t" style={{ borderColor: "var(--app-border)" }}>
                  <td className="px-2 py-2 capitalize">{order.orderType.replaceAll("_", " ")}</td>
                  <td className="px-2 py-2 capitalize">{order.status.replaceAll("_", " ")}</td>
                  <td className="px-2 py-2">{order.physicalLineCount}</td>
                  <td className="px-2 py-2 font-semibold">{stateLabel(order.routingState)}{order.routeMode ? ` · ${order.routeMode}` : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ul className="mb-0 mt-3 flex list-none flex-col gap-1 p-0 text-[11px]" style={{ color: "var(--app-text-faint)" }}>
        {review.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
      </ul>
    </section>
  );
}

function ProductionAssemblyReview({ review }: { review: CommerceProductionReview }) {
  const unit = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

  return (
    <section className="mt-4 rounded-xl border p-3" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-2)" }} aria-label="Production and assembly review">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="m-0 text-sm font-bold">Production &amp; Assembly</h3>
          <p className="mb-0 mt-1 text-xs" style={{ color: "var(--app-text-muted)" }}>
            {review.state === "no_production_records"
              ? "No bills of materials or work orders are recorded."
              : `${review.workOrders.total} recorded work order(s) across ${Object.values(review.workOrders.byStatus).reduce((sum, item) => sum + item.count, 0)} status group(s).`}
          </p>
        </div>
        <Link href="/autonomous-commerce/production" className="text-xs font-bold underline">Open Production &amp; Assembly</Link>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border p-2" style={{ borderColor: "var(--app-border)" }}>
          <p className="m-0 text-[11px]" style={{ color: "var(--app-text-faint)" }}>Active BOMs</p>
          <strong className="text-sm">{unit.format(review.activeBomCount)}</strong>
        </div>
        <div className="rounded-lg border p-2" style={{ borderColor: "var(--app-border)" }}>
          <p className="m-0 text-[11px]" style={{ color: "var(--app-text-faint)" }}>Late planned/in-progress orders</p>
          <strong className="text-sm">{unit.format(review.workOrders.lateOpenCount)}</strong>
        </div>
        <div className="rounded-lg border p-2" style={{ borderColor: "var(--app-border)" }}>
          <p className="m-0 text-[11px]" style={{ color: "var(--app-text-faint)" }}>Planned units on in-progress orders</p>
          <strong className="text-sm">{unit.format(review.workOrders.inProgressPlannedUnits)}</strong>
        </div>
        <div className="rounded-lg border p-2" style={{ borderColor: "var(--app-border)" }}>
          <p className="m-0 text-[11px]" style={{ color: "var(--app-text-faint)" }}>Completed output units</p>
          <strong className="text-sm">{review.workOrders.completedOutputUnits === null ? "Not available" : unit.format(review.workOrders.completedOutputUnits)}</strong>
        </div>
      </div>
      {Object.keys(review.workOrders.byStatus).length > 0 && (
        <ul className="mb-0 mt-3 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-xs">
          {Object.entries(review.workOrders.byStatus).map(([status, totals]) => (
            <li key={status}><strong className="capitalize">{status.replaceAll("_", " ")}</strong> · {unit.format(totals.count)} order(s) · {unit.format(totals.plannedUnits)} planned units</li>
          ))}
        </ul>
      )}
      <ul className="mb-0 mt-3 flex list-none flex-col gap-1 p-0 text-[11px]" style={{ color: "var(--app-text-faint)" }}>
        {review.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
      </ul>
    </section>
  );
}

function InternalInventoryAvailability({
  review,
}: {
  review: CommerceInventoryAvailabilityReview;
}) {
  const qty = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });
  return (
    <section className="mt-4 rounded-xl border p-3" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-2)" }} aria-label="Internal stock availability for channel products">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="m-0 text-sm font-bold">Internal stock for channel products</h3>
          <p className="mb-0 mt-1 text-xs" style={{ color: "var(--app-text-muted)" }}>
            {review.state === "no_synced_channel_products"
              ? "No active products with a saved synced channel listing were found."
              : `${review.totalSyncedProducts} active product(s) have a saved synced channel listing; ${review.reviewedAtOrBelowThresholdCount} of the ${review.reviewedProductCount} reviewed are at or below their recorded stock threshold${review.hasMore ? ` · capped at ${review.maximumProductsReviewed}` : ""}.`}
          </p>
        </div>
        <div className="flex gap-3 text-xs font-bold">
          <Link href="/inventory" className="underline">Open Inventory</Link>
          <Link href="/autonomous-commerce/channel-listings" className="underline">Open Channel Listings</Link>
        </div>
      </div>
      {review.products.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-left text-xs">
            <thead style={{ color: "var(--app-text-faint)" }}>
              <tr>
                <th className="px-2 py-1 font-semibold">Product</th>
                <th className="px-2 py-1 font-semibold">Recorded stock</th>
                <th className="px-2 py-1 font-semibold">Recorded threshold</th>
                <th className="px-2 py-1 font-semibold">Listing providers</th>
                <th className="px-2 py-1 font-semibold">Review</th>
              </tr>
            </thead>
            <tbody>
              {review.products.map((product) => (
                <tr key={product.productId} className="border-t" style={{ borderColor: "var(--app-border)" }}>
                  <td className="px-2 py-2 font-semibold">Product {product.productId.slice(0, 8)}</td>
                  <td className="px-2 py-2">{qty.format(product.stockQty)}</td>
                  <td className="px-2 py-2">{qty.format(product.lowStockThreshold)}</td>
                  <td className="px-2 py-2">{product.providers.map((provider) => provider.replaceAll("_", " ")).join(", ")}</td>
                  <td className="px-2 py-2">{product.thresholdState === "at_or_below_recorded_threshold" ? "At or below threshold" : "Above threshold"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ul className="mb-0 mt-3 flex list-none flex-col gap-1 p-0 text-[11px]" style={{ color: "var(--app-text-faint)" }}>
        {review.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
      </ul>
    </section>
  );
}

function ToolRow({ tool }: { tool: AgentTool }) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState<Record<string, string>>({});
  const [result, setResult] = useState<string | null>(null);
  const actionLabel = tool.key === "create_listing_draft"
    ? "Create review draft"
    : tool.key === "preview_b2b_quote"
      ? "Preview quote"
    : tool.key === "create_rfq"
      ? "Create RFQ draft"
      : tool.key === "create_experiment"
        ? "Create experiment draft"
        : tool.key === "create_supplier_claim_draft"
          ? "Create supplier claim draft"
      : tool.key === "award_rfq_quote"
        ? "Request approval"
        : tool.key === "submit_supplier_claim"
          ? "Request claim submission approval"
      : "Run tool";
  const run = useMutation({
    mutationFn: () => runAgentTool(tool.key, input, tool.riskClass !== "READ_ONLY"),
    onSuccess: async (response) => {
      setResult(response.pending
        ? "This exact request is already being processed. Check the run log again shortly."
        : response.pendingApproval
          ? tool.key === "submit_supplier_claim"
            ? "Approval requested. The claim is still a draft and no supplier was contacted. A different authorized user must review it in the Tool run audit below."
            : "Approval requested. No Commerce action has happened yet. A different authorized user must review it in the Tool run audit below."
        : response.run.outcome === "refused"
          ? `Refused: ${response.run.refusalReason}`
          : response.resourceMissing
            ? "The original draft is no longer available. The idempotent request was not repeated."
            : `${response.replayed
              ? tool.key === "submit_supplier_claim"
                ? "This request was already processed. Showing the current claim; no duplicate submission was created.\n\n"
                : "This request already created the draft. Showing the existing draft; no duplicate was created.\n\n"
              : ""}${JSON.stringify(response.result, null, 2)}`);
      await Promise.all([
        client.invalidateQueries({ queryKey: KEYS.runs }),
        ...(tool.key === "submit_supplier_claim"
          ? [client.invalidateQueries({ queryKey: ["commerce-supplier-claims"] })]
          : []),
      ]);
    },
    onError: async (error) => {
      toast.error(errorMessage(error, "The tool failed."));
      await client.invalidateQueries({ queryKey: KEYS.runs });
    },
  });
  return (
    <tr className="border-t align-top" style={{ borderColor: "var(--app-border)" }}>
      <td className="px-3 py-2">
        <span className="font-semibold">{tool.label}</span>
        <span className="block font-mono text-[11px]" style={{ color: "var(--app-text-faint)" }}>{tool.key}</span>
        <span className="block" style={{ color: "var(--app-text-muted)" }}>{tool.description}</span>
      </td>
      <td className="px-3 py-2 font-semibold" style={{ color: RISK_COLOR[tool.riskClass] }}>{tool.riskClass.replaceAll("_", " ").toLowerCase()}</td>
      <td className="px-3 py-2">Level {tool.minLevel}+</td>
      <td className="px-3 py-2">{tool.approvalRequired ? "Always" : "No"}</td>
      <td className="max-w-[280px] px-3 py-2">
        {tool.riskClass !== "READ_ONLY" && (
          <span className="mb-1 block font-semibold" style={{ color: tool.allowedByBusinessAllowlist ? "var(--app-success-text)" : "var(--app-danger-strong)" }}>
            {tool.allowedByBusinessAllowlist ? "On business allow-list" : "Excluded by business allow-list"}
          </span>
        )}
        {tool.blockedReason ? <span style={{ color: "var(--app-text-faint)" }}>{tool.blockedReason}</span> : <span className="font-semibold" style={{ color: "var(--app-success-text)" }}>Allowed</span>}
        {!tool.executable && (
          <Link href={tool.screen} className="block font-bold underline">Do it on its screen</Link>
        )}
      </td>
      <td className="min-w-[220px] px-3 py-2">
        {tool.executable && (
          <>
            <button type="button" onClick={() => setOpen((value) => !value)} className="font-bold underline">{open ? "Close" : actionLabel}</button>
            {open && (
              <form
                className="mt-2 flex flex-col gap-1"
                onSubmit={(event) => {
                  event.preventDefault();
                  run.mutate();
                }}
              >
                {tool.key === "create_supplier_claim_draft" && (
                  <p className="m-0 text-[11px]" style={{ color: "var(--app-text-muted)" }}>
                    One claim line only. Enter the supplier, reason and loss amounts from your own records. This saves a draft; it does not submit or contact the supplier.
                  </p>
                )}
                {tool.key === "submit_supplier_claim" && (
                  <p className="m-0 text-[11px]" style={{ color: "var(--app-text-muted)" }}>
                    This requires a different authorized user to approve. The claim version and evidence are checked again at approval. It marks the claim submitted for follow-up; it does not contact the supplier.
                  </p>
                )}
                {tool.inputs.map((name) => (
                  name === "reason" || name === "itemDescription" ? (
                    <textarea key={name} value={input[name] ?? ""} onChange={(event) => setInput({ ...input, [name]: event.target.value })} placeholder={name} aria-label={name} maxLength={name === "reason" ? 500 : 200} rows={2} className="rounded border px-2 py-1 text-xs" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }} />
                  ) : (
                    <input key={name} value={input[name] ?? ""} onChange={(event) => setInput({ ...input, [name]: event.target.value })} placeholder={tool.key === "create_experiment" && name === "type" ? "price / bundle / listing_copy / photo / shipping_offer / other" : tool.key === "create_experiment" && name === "primaryMetric" ? "units / revenue / gross_margin / return_rate" : name} aria-label={name} className="rounded border px-2 py-1 text-xs" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }} />
                  )
                ))}
                <button type="submit" disabled={run.isPending} className="self-start rounded px-2 py-1 text-xs font-bold text-white disabled:opacity-50" style={{ background: "var(--app-primary)" }}>
                  {run.isPending ? "Working…" : tool.key === "award_rfq_quote" || tool.key === "submit_supplier_claim" ? "Request second-person approval" : tool.key === "create_rfq" || tool.key === "create_experiment" || tool.key === "create_supplier_claim_draft" ? "Save draft" : tool.key === "preview_b2b_quote" ? "Preview quote" : "Run"}
                </button>
                {result && <pre className="max-h-48 overflow-auto rounded p-2 text-[10.5px]" style={{ background: "var(--app-surface-2)" }}>{result}</pre>}
              </form>
            )}
          </>
        )}
      </td>
    </tr>
  );
}

function ApprovalRunRow({ run }: { run: AgentToolRun }) {
  const client = useQueryClient();
  const isClaimSubmission = run.toolKey === "submit_supplier_claim";
  const reviewPath = isClaimSubmission ? "/autonomous-commerce/supplier-claims" : "/autonomous-commerce/rfqs";
  const actionDescription = isClaimSubmission ? "supplier claim submission" : "RFQ quote award";
  const [reason, setReason] = useState("");
  const decide = useMutation({
    mutationFn: (variables: { decision: "approve" | "reject"; reason: string }) =>
      decideAgentToolRun(run.id, variables.decision, variables.reason),
    onSuccess: async (response, variables) => {
      if (variables.decision === "approve" && response.run.outcome === "succeeded") {
        toast.success(isClaimSubmission
          ? "Approval recorded and canonical supplier claim submission confirmed."
          : "Approval recorded and canonical RFQ award confirmed.");
      } else if (variables.decision === "approve" && response.run.outcome === "refused") {
        toast.error(`Not executed: ${response.run.refusalReason ?? "current policy refused this action."}`);
      } else {
        toast.success("Request rejected; no Commerce action was taken.");
      }
      setReason("");
      await client.invalidateQueries({ queryKey: KEYS.runs });
      if (response.run.outcome === "succeeded") {
        await Promise.all([
          client.invalidateQueries({ queryKey: ["commerce-rfqs"] }),
          client.invalidateQueries({ queryKey: ["commerce-supplier-claims"] }),
        ]);
      }
    },
    onError: async (error) => {
      toast.error(errorMessage(error, "Couldn't decide this approval."));
      await client.invalidateQueries({ queryKey: KEYS.runs });
    },
  });

  return (
    <div
      className="mt-2 rounded-lg border p-3"
      style={{ borderColor: "var(--app-border)", background: "var(--app-surface-2)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong>{actionDescription} · second-person approval required</strong>
        <Link href={reviewPath} className="font-bold underline">Review canonical record</Link>
      </div>
      <pre className="mt-2 max-h-40 overflow-auto rounded p-2 text-[10px]" style={{ background: "var(--app-surface)" }}>
        {JSON.stringify(run.input, null, 2)}
      </pre>
      {run.canApprove ? (
        <form
          className="mt-2 flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
            const requestedDecision = submitter?.value === "reject" ? "reject" : "approve";
            decide.mutate({ decision: requestedDecision, reason });
          }}
        >
          <label className="text-xs font-semibold" htmlFor={`approval-reason-${run.id}`}>Decision reason</label>
          <textarea
            id={`approval-reason-${run.id}`}
            required
            minLength={3}
            maxLength={500}
            rows={2}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Explain why you approve or reject this exact request"
            className="rounded border px-2 py-1 text-xs"
            style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="submit"
              name="decision"
              value="approve"
              disabled={decide.isPending || reason.trim().length < 3}
              className="rounded px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
              style={{ background: "var(--app-primary)" }}
            >
              {decide.isPending ? "Working…" : isClaimSubmission ? "Approve submission" : "Approve and create draft PO"}
            </button>
            <button
              type="submit"
              name="decision"
              value="reject"
              disabled={decide.isPending || reason.trim().length < 3}
              className="rounded border px-3 py-1.5 text-xs font-bold disabled:opacity-50"
              style={{ borderColor: "var(--app-border)", color: "var(--app-danger-strong)" }}
            >
              {decide.isPending ? "Working…" : "Reject request"}
            </button>
          </div>
          <p className="m-0 text-[11px]" style={{ color: "var(--app-text-faint)" }}>
            {isClaimSubmission
              ? "Approval rechecks the current claim version and evidence, then marks it submitted for operator follow-up. It does not contact the supplier."
              : "Approval rechecks the current RFQ and creates a draft purchase order only. It does not contact the supplier or change stock."}
          </p>
        </form>
      ) : (
        <p className="mb-0 mt-2 text-xs" style={{ color: "var(--app-warning-text)" }}>
          Submitted by this user. A different authorized user must make the decision; no Commerce action has happened yet.
        </p>
      )}
      {decide.isError && (
        <p role="alert" className="mb-0 mt-2 text-xs" style={{ color: "var(--app-danger-strong)" }}>
          {errorMessage(decide.error, "Couldn't decide this approval.")}
        </p>
      )}
    </div>
  );
}

export function CommerceAgentToolsView() {
  useModuleHeader({ title: "Agents & Tools", subtitle: "The permissioned tools commerce agents may use, and an audit of every use." });
  const client = useQueryClient();
  const registry = useQuery({ queryKey: KEYS.registry, queryFn: fetchAgentTools });
  const runs = useQuery({ queryKey: KEYS.runs, queryFn: fetchAgentToolRuns });
  const specialistRuns = useQuery({ queryKey: KEYS.specialistRuns, queryFn: fetchCommerceAgentSpecialistRuns });
  const [question, setQuestion] = useState("");
  const [questionRun, setQuestionRun] = useState<CommerceAgentSpecialistRun | null>(null);
  const [opportunityId, setOpportunityId] = useState("");
  const [productSourcingRun, setProductSourcingRun] = useState<CommerceAgentSpecialistRun | null>(null);
  const [orderId, setOrderId] = useState("");
  const [destinationCountry, setDestinationCountry] = useState("");
  const [orderOrchestrationRun, setOrderOrchestrationRun] = useState<CommerceAgentSpecialistRun | null>(null);
  useEffect(() => {
    if (!runs.isSuccess || !window.location.hash.startsWith("#run-")) return;
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: "center" });
  }, [runs.dataUpdatedAt, runs.isSuccess]);
  const review = useMutation({
    mutationFn: runCommerceAgentReview,
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: KEYS.specialistRuns });
      toast.success("Commerce review saved with source evidence.");
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't review Commerce records.")),
  });
  const ask = useMutation({
    mutationFn: () => askCommerceAgent(question.trim()),
    onSuccess: async (response) => {
      setQuestionRun(response);
      setQuestion("");
      await Promise.all([
        client.invalidateQueries({ queryKey: KEYS.runs }),
        client.invalidateQueries({ queryKey: KEYS.specialistRuns }),
      ]);
      if (response.status === "failed") {
        toast.error(response.errorMessage ?? response.output.message ?? "The Commerce Agent could not answer.");
      }
    },
    onError: (error) => toast.error(errorMessage(error, "The Commerce Agent could not answer.")),
  });
  const orchestrateOrder = useMutation({
    mutationFn: () => runCommerceAgentOrderFulfillmentOrchestration(orderId, destinationCountry || undefined),
    onSuccess: async (response) => {
      setOrderOrchestrationRun(response);
      await Promise.all([
        client.invalidateQueries({ queryKey: KEYS.runs }),
        client.invalidateQueries({ queryKey: KEYS.specialistRuns }),
      ]);
      if (response.status === "failed") {
        toast.error(response.output.orderFulfillmentOrchestration?.summary ?? response.errorMessage ?? "The Commerce order review failed.");
      }
    },
    onError: (error) => toast.error(errorMessage(error, "The Commerce order review could not run.")),
  });
  const orchestrateProductSourcing = useMutation({
    mutationFn: () => runCommerceAgentProductSourcingOrchestration(opportunityId),
    onSuccess: async (response) => {
      setProductSourcingRun(response);
      await Promise.all([
        client.invalidateQueries({ queryKey: KEYS.runs }),
        client.invalidateQueries({ queryKey: KEYS.specialistRuns }),
      ]);
      if (response.status === "failed") {
        toast.error(response.output.productSourcingOrchestration?.summary ?? response.errorMessage ?? "The product sourcing review failed.");
      }
    },
    onError: (error) => toast.error(errorMessage(error, "The product sourcing review could not run.")),
  });
  const setLevel = useMutation({
    mutationFn: (level: number) => saveHubChanges([{ category: "automations", rowKey: "commerce-autonomy", value: level }]),
    onSuccess: async () => {
      await Promise.all([client.invalidateQueries({ queryKey: KEYS.registry }), client.invalidateQueries({ queryKey: ["settings-hub"] })]);
      toast.success("Autonomy level saved.");
    },
    onError: (error) => toast.error(errorMessage(error, "Couldn't change the autonomy level.")),
  });
  const data = registry.data;

  return (
    <main className="flex flex-col gap-5 p-5 md:p-7" style={{ color: "var(--app-text)" }}>
      <p className="m-0 max-w-4xl rounded-xl border px-4 py-3 text-xs" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-2)", color: "var(--app-text-muted)" }}>
        <strong>The review agent is read-only.</strong> It reviews status counts and bounded operational evidence from existing Commerce records, then proposes one queue for human review. The separate tool registry exposes scoped read tools and a small set of unsent, review-required drafts through canonical Commerce services; it cannot publish, sync, contact suppliers or execute a Commerce workflow. Each tool has a risk class, required autonomy level and approval rule, and every allowed, refused or failed attempt is audited.
      </p>

      <section aria-label="Product sourcing readiness" className="rounded-2xl border p-4" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
        <h2 className="m-0 text-base font-bold">Product sourcing readiness</h2>
        <p className="mb-0 mt-1 max-w-3xl text-xs" style={{ color: "var(--app-text-muted)" }}>
          The Commerce Orchestrator checks one Product Radar opportunity, its recorded validation evidence, then compares quotes only from an RFQ explicitly linked to that opportunity. If no linked RFQ exists, it stops and opens Commerce RFQs. It never creates an RFQ, awards a quote or contacts a supplier.
        </p>
        <form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); if (opportunityId.trim()) orchestrateProductSourcing.mutate(); }}>
          <label className="flex min-w-[260px] flex-1 flex-col gap-1 text-xs font-semibold">
            Canonical Product Radar opportunity ID
            <input value={opportunityId} onChange={(event) => setOpportunityId(event.target.value)} maxLength={191} required className="rounded-lg border px-3 py-2 text-sm font-normal" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }} placeholder="Paste an opportunity ID" />
          </label>
          <button type="submit" disabled={orchestrateProductSourcing.isPending || !opportunityId.trim() || registry.data?.autonomyLevel === 0} className="rounded-lg px-3 py-2 text-xs font-bold text-white disabled:opacity-50" style={{ background: "var(--app-primary)" }}>
            {orchestrateProductSourcing.isPending ? "Checking product and sourcing records…" : "Run sourcing review"}
          </button>
        </form>
        {productSourcingRun?.output.productSourcingOrchestration && <ProductSourcingOrchestrationResult review={productSourcingRun.output.productSourcingOrchestration} />}
      </section>

      <section aria-labelledby="commerce-order-orchestration-heading" className="rounded-2xl border p-4" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
        <h2 id="commerce-order-orchestration-heading" className="m-0 text-base font-bold">Order fulfillment readiness</h2>
        <p className="mb-0 mt-1 max-w-3xl text-xs" style={{ color: "var(--app-text-muted)" }}>
          The Commerce Orchestrator runs two registered read-only workers in order: it verifies the canonical order, then calculates route candidates. It stops if the order cannot be found. It never assigns a route, reserves stock, contacts a carrier or promises a delivery time.
        </p>
        <form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={(event) => { event.preventDefault(); if (orderId.trim()) orchestrateOrder.mutate(); }}>
          <label className="flex min-w-[260px] flex-1 flex-col gap-1 text-xs font-semibold">
            Canonical order ID
            <input value={orderId} onChange={(event) => setOrderId(event.target.value)} maxLength={191} required className="rounded-lg border px-3 py-2 text-sm font-normal" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }} placeholder="Paste an order ID" />
          </label>
          <label className="flex w-full flex-col gap-1 text-xs font-semibold sm:w-44">
            Destination country (optional)
            <input value={destinationCountry} onChange={(event) => setDestinationCountry(event.target.value.toUpperCase())} maxLength={2} pattern="[A-Za-z]{2}" className="rounded-lg border px-3 py-2 text-sm font-normal uppercase" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }} placeholder="US" />
          </label>
          <button type="submit" disabled={orchestrateOrder.isPending || !orderId.trim() || registry.data?.autonomyLevel === 0} className="rounded-lg px-3 py-2 text-xs font-bold text-white disabled:opacity-50" style={{ background: "var(--app-primary)" }}>
            {orchestrateOrder.isPending ? "Reviewing order…" : "Run bounded review"}
          </button>
        </form>
        {orderOrchestrationRun?.output.orderFulfillmentOrchestration && <OrderFulfillmentOrchestrationResult review={orderOrchestrationRun.output.orderFulfillmentOrchestration} />}
      </section>

      <section aria-labelledby="commerce-agent-question-heading" className="rounded-2xl border p-4" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="commerce-agent-question-heading" className="m-0 text-base font-bold">Ask the Commerce Agent</h2>
            <p className="mb-0 mt-1 max-w-3xl text-xs" style={{ color: "var(--app-text-muted)" }}>
              It can read product, inventory, order, Product Radar, validation, supplier-claim, Risk & Compliance case, channel-listing sync, Experiment Lab results, RFQ quote, B2B quote, B2B reorder timing, Store Optimizer rule-count summaries, Production & Assembly status and fulfillment-route records available to your account. B2B reorder timing is an estimate from past order dates, not a prediction or customer commitment. Store Optimizer summaries contain counts only, not product names, customer data or raw return reasons. Production & Assembly provides recorded BOM/work-order counts and output units, omits names and cost details, and does not diagnose causes or forecast capacity. Experiment results are observational before/after comparisons, not causal or statistically significant. Risk cases provide only structured counts and rule-window facts; supplier-claim evidence contents, private notes, raw risk evidence and provider error details are not sent to the AI. This question flow has read-only tools only; it cannot draft, approve, publish, contact suppliers or change stock or orders. Provider and monthly AI limits still apply.
            </p>
          </div>
        </div>
        <form
          className="mt-3 flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (question.trim().length >= 4) ask.mutate();
          }}
        >
          <label htmlFor="commerce-agent-question" className="text-xs font-semibold">Question about this business</label>
          <textarea
            id="commerce-agent-question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            maxLength={1_000}
            minLength={4}
            rows={3}
            placeholder="For example: compare the recorded quotes for this RFQ or check this order’s fulfillment options"
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}
          />
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="submit"
              disabled={ask.isPending || registry.data?.autonomyLevel === 0 || question.trim().length < 4}
              className="rounded-lg px-3 py-2 text-xs font-bold text-white disabled:opacity-50"
              style={{ background: "var(--app-primary)" }}
            >
              {ask.isPending ? "Checking canonical records…" : "Ask with read-only tools"}
            </button>
            <span className="text-[11px]" style={{ color: "var(--app-text-faint)" }}>Up to 3 registered tool calls per question</span>
          </div>
        </form>
        {questionRun && (
          <article aria-live="polite" className="mt-4 rounded-xl border p-3" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-2)" }}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong className="text-xs">Commerce Agent answer · {questionRun.status.replaceAll("_", " ")}</strong>
              <span className="text-[11px]" style={{ color: "var(--app-text-faint)" }}>Run {questionRun.id.slice(0, 8)}</span>
            </div>
            {questionRun.output.correlationId && (
              <p className="mb-0 mt-1 text-[11px]" style={{ color: "var(--app-text-faint)" }}>
                Trace ID <code>{questionRun.output.correlationId}</code>
              </p>
            )}
            {questionRun.output.answer ? (
              <p className="mb-0 mt-2 whitespace-pre-wrap text-sm">{questionRun.output.answer}</p>
            ) : (
              <p role="status" className="mb-0 mt-2 text-xs" style={{ color: "var(--app-text-muted)" }}>
                {questionRun.output.message ?? questionRun.errorMessage ?? "No answer was returned."}
              </p>
            )}
            {questionRun.output.message && questionRun.output.answer && (
              <p className="mb-0 mt-2 text-xs" style={{ color: "var(--app-text-muted)" }}>{questionRun.output.message}</p>
            )}
            {questionRun.output.tools && questionRun.output.tools.length > 0 && (
              <ul className="mb-0 mt-3 flex list-none flex-col gap-2 p-0 text-xs">
                {questionRun.output.tools.map((tool, index) => (
                  <li key={`${tool.tool}-${index}`} className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-t pt-2" style={{ borderColor: "var(--app-border)" }}>
                    <strong>{tool.tool.replaceAll("_", " ")}</strong>
                    <span style={{ color: tool.outcome === "succeeded" ? "var(--app-success-text)" : "var(--app-warning-text)" }}>{tool.outcome.replaceAll("_", " ")}</span>
                    <span style={{ color: "var(--app-text-muted)" }}>{tool.summary}</span>
                    {tool.screen && <Link href={tool.screen} className="font-bold underline">Open source</Link>}
                  </li>
                ))}
              </ul>
            )}
            <SpecialistAgentUsage calls={questionRun.aiCallLogs ?? []} />
          </article>
        )}
      </section>

      <section className="rounded-2xl border p-4" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="m-0 text-base font-bold">Autonomous Commerce review</h2>
            <p className="mb-0 mt-1 max-w-3xl text-xs" style={{ color: "var(--app-text-muted)" }}>
              Uses current status records from Product Radar, RFQs, Risk &amp; Compliance, Channel Listings, Experiment Lab and Production &amp; Assembly. Provider sales, traffic, profit and delivery outcomes are not inferred.
            </p>
          </div>
          <button type="button" onClick={() => review.mutate()} disabled={review.isPending || data?.autonomyLevel === 0} className="rounded-lg px-3 py-2 text-xs font-bold text-white disabled:opacity-50" style={{ background: "var(--app-primary)" }} title={data?.autonomyLevel === 0 ? "Set autonomy to Observe or higher to run a review." : undefined}>
            {review.isPending ? "Reviewing…" : "Run read-only review"}
          </button>
        </div>
        {specialistRuns.isLoading ? (
          <p className="mb-0 mt-4 text-xs" style={{ color: "var(--app-text-faint)" }}>Loading recent reviews…</p>
        ) : specialistRuns.isError ? (
          <div className="mt-3 flex items-center gap-3 text-xs" style={{ color: "var(--app-danger-strong)" }}>
            {errorMessage(specialistRuns.error, "Couldn't load Commerce reviews.")}
            <button type="button" onClick={() => specialistRuns.refetch()} className="font-bold underline">Retry</button>
          </div>
        ) : specialistRuns.data?.[0] ? (
          <div className="mt-4 border-t pt-4" style={{ borderColor: "var(--app-border)" }}>
            <div className="flex flex-wrap justify-between gap-2 text-xs">
              <span className="font-semibold">Latest review · {formatDate(specialistRuns.data[0].createdAt)} · {specialistRuns.data[0].status.replaceAll("_", " ")}</span>
              <span style={{ color: "var(--app-text-faint)" }}>AI: {specialistRuns.data[0].output.aiSummary?.status ?? "not available"}</span>
            </div>
            <p className="mb-0 mt-2 text-sm">{specialistRuns.data[0].recommendations[0]?.summary ?? specialistRuns.data[0].output.summary ?? "No summary was saved."}</p>
            {specialistRuns.data[0].output.reviewSteps && (
              <section className="mt-3 rounded-lg border p-3" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-2)" }} aria-label="Commerce review source status">
                <h3 className="m-0 text-xs font-bold">Review source status</h3>
                <ul className="mb-0 mt-2 grid list-none gap-2 p-0 text-xs sm:grid-cols-2">
                  {specialistRuns.data[0].output.reviewSteps.map((step) => (
                    <li key={step.key} className="flex flex-wrap items-center justify-between gap-2">
                      <span>{step.label}</span>
                      <span style={{ color: step.status === "failed" ? "var(--app-danger-strong)" : "var(--app-text-muted)" }}>
                        {step.status === "failed" ? `Not available · ${step.errorCode ?? "source error"}` : "Reviewed"}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {specialistRuns.data[0].output.orderFulfillmentOrchestration && (
              <OrderFulfillmentOrchestrationResult review={specialistRuns.data[0].output.orderFulfillmentOrchestration} />
            )}
            {specialistRuns.data[0].output.aiSummary?.message && (
              <p className="mb-0 mt-2 text-xs" style={{ color: "var(--app-text-muted)" }}>{specialistRuns.data[0].output.aiSummary.message}</p>
            )}
            {specialistRuns.data[0].output.aiSummary?.text && (
              <p className="mb-0 mt-2 rounded-lg p-3 text-xs" style={{ background: "var(--app-surface-2)" }}>{specialistRuns.data[0].output.aiSummary.text}</p>
            )}
            <SpecialistAgentUsage calls={specialistRuns.data[0].aiCallLogs} />
            {specialistRuns.data[0].output.snapshot && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {SNAPSHOT_GROUPS.map(({ key, label }) => {
                  const group = specialistRuns.data![0].output.snapshot![key];
                  const entries = Object.entries(group);
                  return (
                    <div key={key} className="rounded-xl border p-3" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-2)" }}>
                      <p className="m-0 text-xs font-bold">{label}</p>
                      {entries.length ? (
                        <ul className="mb-0 mt-2 flex list-none flex-col gap-1 p-0 text-xs">
                          {entries.map(([status, count]) => <li key={status} className="flex justify-between gap-2"><span>{status.replaceAll("_", " ")}</span><strong>{count}</strong></li>)}
                        </ul>
                      ) : <p className="mb-0 mt-2 text-xs" style={{ color: "var(--app-text-faint)" }}>No records</p>}
                    </div>
                  );
                })}
              </div>
            )}
            {specialistRuns.data[0].output.sourcingReview && (
              <section className="mt-4 rounded-xl border p-3" style={{ borderColor: "var(--app-border)", background: "var(--app-surface-2)" }} aria-label="Recorded supplier quote comparison">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="m-0 text-sm font-bold">Recorded supplier quote comparison</h3>
                    <p className="mb-0 mt-1 text-xs" style={{ color: "var(--app-text-muted)" }}>
                      {specialistRuns.data[0].output.sourcingReview.state === "no_open_rfqs"
                        ? "No open RFQs were recorded at the time of this review."
                        : `Read-only comparison across ${specialistRuns.data[0].output.sourcingReview.reviewedRfqCount} recently updated open RFQ(s).`}
                    </p>
                  </div>
                  <Link href="/autonomous-commerce/rfqs" className="text-xs font-bold underline">Open RFQs</Link>
                </div>
                {specialistRuns.data[0].output.sourcingReview.comparisons.length > 0 ? (
                  <div className="mt-3 space-y-3">
                    {specialistRuns.data[0].output.sourcingReview.comparisons.map((comparison) => (
                      <article key={comparison.rfqId} className="rounded-lg border p-3" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
                        <div className="flex flex-wrap justify-between gap-2 text-xs">
                          <strong>RFQ {comparison.rfqId.slice(0, 8)} · {comparison.currency}</strong>
                          <span>{comparison.comparableQuoteCount} comparable quote(s) · {comparison.excludedQuoteCount} excluded</span>
                        </div>
                        {comparison.lowestComparableLandedTotal !== null && (
                          <p className="mb-0 mt-2 text-xs">Lowest comparable landed total: <strong>{comparison.currency} {comparison.lowestComparableLandedTotal}</strong></p>
                        )}
                        {comparison.quotes.length > 0 ? (
                          <ul className="mb-0 mt-2 flex list-none flex-col gap-1 p-0 text-xs">
                            {comparison.quotes.map((quote) => (
                              <li key={quote.quoteId} className="flex flex-wrap justify-between gap-x-4 gap-y-1 border-t pt-2" style={{ borderColor: "var(--app-border)" }}>
                                <span>{quote.supplierName} · landed {quote.currency} {quote.landedTotal}</span>
                                <span style={{ color: "var(--app-text-muted)" }}>
                                  {quote.leadTimeDays === null ? "Lead time not recorded" : `${quote.leadTimeDays} day lead time`}
                                  {quote.paymentTerms ? ` · ${quote.paymentTerms}` : " · Payment terms not recorded"}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mb-0 mt-2 text-xs" style={{ color: "var(--app-text-muted)" }}>No current quote passed the same-currency, validity, quantity and line-coverage checks.</p>
                        )}
                        <p className="mb-0 mt-2 text-[11px]" style={{ color: "var(--app-text-faint)" }}>{comparison.conclusion}</p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="mb-0 mt-3 text-xs" style={{ color: "var(--app-text-muted)" }}>No open RFQ has quote records to review.</p>
                )}
                <p className="mb-0 mt-3 text-[11px]" style={{ color: "var(--app-text-faint)" }}>
                  Uses manually entered quote records only. Price is not an overall supplier score; quality, capacity, compliance and delivery are not assessed. No RFQ is awarded and no supplier is contacted.
                </p>
              </section>
            )}
            {specialistRuns.data[0].output.validationScorecards && (
              <ValidationScorecards review={specialistRuns.data[0].output.validationScorecards} />
            )}
            {specialistRuns.data[0].output.reconciliationReview && (
              <SavedReconciliationReview review={specialistRuns.data[0].output.reconciliationReview} />
            )}
            {specialistRuns.data[0].output.experimentReview && (
              <ExperimentOutcomeReview review={specialistRuns.data[0].output.experimentReview} />
            )}
            {specialistRuns.data[0].output.supplierClaimReview && (
              <SupplierClaimEvidenceReview review={specialistRuns.data[0].output.supplierClaimReview} />
            )}
            {specialistRuns.data[0].output.deliveryExceptionReview && (
              <DeliveryExceptionReview review={specialistRuns.data[0].output.deliveryExceptionReview} />
            )}
            {specialistRuns.data[0].output.fulfillmentReview && (
              <FulfillmentQueueReview review={specialistRuns.data[0].output.fulfillmentReview} />
            )}
            {specialistRuns.data[0].output.productionReview && (
              <ProductionAssemblyReview review={specialistRuns.data[0].output.productionReview} />
            )}
            {specialistRuns.data[0].output.inventoryAvailabilityReview && (
              <InternalInventoryAvailability review={specialistRuns.data[0].output.inventoryAvailabilityReview} />
            )}
            <p className="mb-0 mt-3 text-[11px]" style={{ color: "var(--app-text-faint)" }}>
              Any next step must be reviewed and completed in its canonical Commerce screen. A risk case is not automatically a policy hold.
            </p>
          </div>
        ) : (
          <p className="mb-0 mt-4 border-t pt-4 text-xs" style={{ borderColor: "var(--app-border)", color: "var(--app-text-faint)" }}>No review has been run yet. No Commerce workflow is started automatically.</p>
        )}
      </section>

      {data && (
        <section className="flex flex-wrap items-center gap-3 rounded-2xl border p-4" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
          <label className="flex items-center gap-2 text-sm font-bold">
            Autonomy level
            <select value={data.autonomyLevel} disabled={setLevel.isPending} onChange={(event) => setLevel.mutate(Number(event.target.value))} className="rounded-lg border px-2 py-1 text-sm" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
              {data.levels.map((level) => (
                <option key={level.level} value={level.level}>{level.level} · {level.label}</option>
              ))}
            </select>
          </label>
          <span className="text-xs" style={{ color: "var(--app-text-faint)" }}>{data.levels.find((level) => level.level === data.autonomyLevel)?.detail}</span>
          {data.paused && <span className="rounded-full px-2 py-0.5 text-xs font-bold text-white" style={{ background: "var(--app-danger-strong)" }}>Commerce actions paused — only read tools allowed</span>}
            {data.autonomyLevel === 0 && <span className="text-xs" style={{ color: "var(--app-warning-text)" }}>Autonomy is disabled. Set it to Observe to run a read-only review.</span>}
        </section>
      )}

      {data && (
        <section aria-label="Commerce Agent write-tool allow-list" className="rounded-2xl border p-4" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="m-0 text-sm font-bold">Business write-tool allow-list · {data.writeToolAllowlistValid ? "valid" : "invalid — writes fail closed"}</h2>
              <p className="mb-0 mt-1 text-xs" style={{ color: "var(--app-text-muted)" }}>
                {data.allowedWriteToolKeys.length
                  ? data.allowedWriteToolKeys.join(", ")
                  : "No write tools are allowed."}
              </p>
              {data.invalidWriteToolEntries.length > 0 && (
                <p className="mb-0 mt-1 text-xs" style={{ color: "var(--app-danger-strong)" }}>
                  Invalid entries: {data.invalidWriteToolEntries.join(", ")}
                </p>
              )}
            </div>
            <Link href="/settings/ai" className="text-xs font-bold underline">Manage in AI Settings</Link>
          </div>
        </section>
      )}

      <section className="rounded-2xl border" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
        {registry.isLoading ? (
          <p className="m-0 p-6 text-sm" style={{ color: "var(--app-text-faint)" }}>Loading…</p>
        ) : registry.isError || !data ? (
          <div className="flex items-center gap-3 p-6 text-sm" style={{ color: "var(--app-danger-strong)" }}>
            {errorMessage(registry.error, "Couldn't load the registry.")}
            <button type="button" onClick={() => registry.refetch()} className="font-bold underline">Retry</button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px] text-left text-xs">
              <thead style={{ color: "var(--app-text-faint)" }}>
                <tr>{["Tool", "Risk class", "Needs level", "Approval", "Now", ""].map((heading) => <th key={heading} className="px-3 py-2 font-semibold">{heading}</th>)}</tr>
              </thead>
              <tbody>{data.tools.map((tool) => <ToolRow key={tool.key} tool={tool} />)}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border" style={{ borderColor: "var(--app-border)", background: "var(--app-surface)" }}>
        <p className="m-0 px-4 pt-3 text-sm font-bold">Tool run audit</p>
        {(runs.data ?? []).length === 0 ? (
          <p className="m-0 p-4 text-sm" style={{ color: "var(--app-text-faint)" }}>No tool has been used yet.</p>
        ) : (
          <ul className="m-0 flex list-none flex-col p-0 text-xs">
            {(runs.data ?? []).map((run) => (
              <li key={run.id} id={run.outcome === "pending_approval" ? `run-${run.id}` : undefined} className="border-t px-4 py-2" style={{ borderColor: "var(--app-border)" }}>
                <span className="font-semibold">{run.toolKey}</span> ·{" "}
                <span style={{ color: run.outcome === "succeeded" ? "var(--app-success-text)" : run.outcome === "refused" || run.outcome === "pending_approval" ? "var(--app-warning-text)" : run.outcome === "rejected" ? "var(--app-text-muted)" : "var(--app-danger-strong)" }}>{run.outcome.replaceAll("_", " ")}</span> · level {run.autonomyLevel} · {run.actorType} · {formatDate(run.createdAt)} · {run.durationMs} ms
                <span className="block" style={{ color: "var(--app-text-faint)" }}>{run.refusalReason ?? run.resultSummary}</span>
                {run.outcome === "pending_approval" && <ApprovalRunRow run={run} />}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
