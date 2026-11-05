"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchCustomers } from "@/lib/customers-api";
import { fetchDebtors } from "@/lib/credit-api";
import { fetchCustomerDuplicates } from "@/lib/customer-duplicates-api";
import {
  lifecycleOf,
  daysSince,
  HIGH_VALUE_THRESHOLD,
  MEDIUM_VALUE_THRESHOLD,
} from "@/lib/customer-lifecycle";
import { formatCurrency } from "@/lib/format";
import { useSession } from "@/lib/session";
import { ApiError } from "@/lib/api-client";
import { toast } from "@/lib/toast";
import {
  CUSTOMER_FOLLOW_UP_OUTCOME_LABELS,
  proposeCustomerFollowUpTaskFromRecommendation,
  fetchCustomerAgentRuns,
  runCustomerAgent,
  prepareCustomerSegmentDraft,
  type CustomerFollowUpOutcome,
} from "@/lib/customer-intelligence-api";
import { SpecialistAgentUsage } from "@/components/agents/specialist-agent-usage";

function CustomerIntelligenceAgentPanel() {
  const session = useSession();
  const router = useRouter();
  const queryClient = useQueryClient();
  const canRun = session.user.role !== "staff";
  const { data: runs = [], isLoading } = useQuery({
    queryKey: ["customer-agent-runs"],
    queryFn: fetchCustomerAgentRuns,
  });
  const mutation = useMutation({
    mutationFn: runCustomerAgent,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["customer-agent-runs"],
      });
      toast.success("Customer Intelligence review saved.");
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError
          ? error.message
          : "Couldn't run the customer review.",
      ),
  });
  const latest = runs[0];
  const prepareDraft = useMutation({
    mutationFn: prepareCustomerSegmentDraft,
    onSuccess: async (draft) => {
      await queryClient.invalidateQueries({
        queryKey: ["customer-agent-runs"],
      });
      await queryClient.invalidateQueries({
        queryKey: ["customer-segment-drafts"],
      });
      router.push(`/customers/segments#segment-draft-${draft.id}`);
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError
          ? error.message
          : "Could not prepare the segment draft.",
      ),
  });
  const createEventFollowUpTask = useMutation({
    mutationFn: proposeCustomerFollowUpTaskFromRecommendation,
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ["customer-agent-runs"],
      });
      await queryClient.invalidateQueries({
        queryKey: ["customer-follow-up-tasks"],
      });
      toast.success("Follow-up task proposed for owner approval. No message was sent.");
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError
          ? error.message
          : "Could not create the follow-up task.",
      ),
  });
  const snapshot = latest?.output?.snapshot;
  const recommendation = latest?.recommendations[0];
  const followUpEvidence = recommendation?.evidence.find((evidence) =>
    [
      "delivery_contact_context",
      "appointment_no_show_contact_context",
      "appointment_cancellation_contact_context",
    ].includes(evidence.resourceType),
  );
  const followUpEventLabel =
    followUpEvidence?.resourceType === "delivery_contact_context"
      ? "this failed delivery"
      : followUpEvidence?.resourceType ===
          "appointment_no_show_contact_context"
        ? "this appointment no-show"
        : "this appointment cancellation";
  const recommendationSourceLabel =
    followUpEvidence?.resourceType === "delivery_contact_context"
      ? "Delivery → Order → Customer CRM fields"
      : followUpEvidence
        ? "Appointment → Customer CRM fields"
        : "AnalyticsService customer summary";

  return (
    <section
      className="rounded-[16px] p-[17px]"
      style={{
        background: "var(--app-surface)",
        border: "1px solid var(--app-border)",
      }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2
            className="m-0 text-[15px] font-extrabold"
            style={{ color: "var(--app-text)" }}
          >
            Customer Intelligence Agent
          </h2>
          <p
            className="mb-0 mt-1 max-w-[760px] text-[12px] leading-relaxed"
            style={{ color: "var(--app-text-muted)" }}
          >
            {latest?.triggerType === "event"
              ? "Reviews qualifying CRM events using tenant-scoped source records. Any follow-up task requires a manager action; no message is sent automatically."
              : "Read-only review of the existing customer analytics summary. Only anonymized aggregate counts may be sent for an optional AI explanation; names, contacts, notes and messages are excluded."}
          </p>
        </div>
        {canRun && (
          <button
            type="button"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="rounded-[10px] px-[15px] py-[10px] text-[12px] font-extrabold text-white disabled:opacity-60"
            style={{ background: "var(--app-primary)" }}
          >
            {mutation.isPending ? "Reviewing…" : "Run review"}
          </button>
        )}
      </div>
      {isLoading ? (
        <p
          className="mb-0 mt-4 text-[12px]"
          style={{ color: "var(--app-text-muted)" }}
        >
          Loading saved reviews…
        </p>
      ) : latest ? (
        <div
          className="mt-4 rounded-[12px] p-3.5"
          style={{ background: "var(--app-surface-2)" }}
        >
          <div
            className="flex flex-wrap justify-between gap-2 text-[11px]"
            style={{ color: "var(--app-text-muted)" }}
          >
            <span>
              Latest review · {new Date(latest.createdAt).toLocaleString()}
            </span>
            <span>
              {latest.status === "completed" ? "Saved" : latest.status}
            </span>
          </div>
          {snapshot && (
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {[
                ["Customers", snapshot.totalCustomers],
                ["New this month", snapshot.newCustomersThisCalendarMonth],
                ["Returning", snapshot.returningCustomers],
                [
                  "With a recorded visit",
                  snapshot.customersWithAtLeastOneVisit,
                ],
                ["Retention", `${snapshot.retentionRatePercent}%`],
              ].map(([label, value]) => (
                <div
                  key={String(label)}
                  className="rounded-[9px] p-2.5"
                  style={{
                    background: "var(--app-surface)",
                    border: "1px solid var(--app-border)",
                  }}
                >
                  <div
                    className="text-[10px]"
                    style={{ color: "var(--app-text-disabled)" }}
                  >
                    {label}
                  </div>
                  <div
                    className="mt-1 text-[15px] font-bold"
                    style={{ color: "var(--app-text)" }}
                  >
                    {value}
                  </div>
                </div>
              ))}
            </div>
          )}
          {snapshot?.customerFeedback && (
            <div
              role="status"
              className="mt-3 rounded-[10px] p-3"
              style={{
                background: "var(--app-surface)",
                border: "1px solid var(--app-border)",
              }}
            >
              <strong
                className="text-[11px]"
                style={{ color: "var(--app-text)" }}
              >
                Customer-linked review responses · last{" "}
                {snapshot.customerFeedback.windowDays} days
              </strong>
              <p
                className="mb-0 mt-1 text-[11px]"
                style={{ color: "var(--app-text-muted)" }}
              >
                {snapshot.customerFeedback.responseCount} submitted · average{" "}
                {snapshot.customerFeedback.averageStars === null
                  ? "Not available"
                  : `${snapshot.customerFeedback.averageStars} / 5 stars`}{" "}
                · {snapshot.customerFeedback.routedCounts.public} routed public
                · {snapshot.customerFeedback.routedCounts.private} routed
                private.
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {snapshot.customerFeedback.ratingCounts.map((rating) => (
                  <span
                    key={rating.stars}
                    className="rounded-full px-2 py-1 text-[10px]"
                    style={{
                      background: "var(--app-surface-2)",
                      color: "var(--app-text-muted)",
                    }}
                  >
                    {rating.stars}★ · {rating.count}
                  </span>
                ))}
              </div>
              <p
                className="mb-0 mt-1 text-[10.5px]"
                style={{ color: "var(--app-text-disabled)" }}
              >
                {snapshot.customerFeedback.note}
              </p>
            </div>
          )}
          {snapshot?.customerJourneyContext && (
            <div
              role="status"
              className="mt-3 rounded-[10px] p-3"
              style={{
                background: "var(--app-surface)",
                border: "1px solid var(--app-border)",
              }}
            >
              <strong
                className="text-[11px]"
                style={{ color: "var(--app-text)" }}
              >
                Bookings and support context · last{" "}
                {snapshot.customerJourneyContext.windowDays} days
              </strong>
              {snapshot.customerJourneyContext.state === "available" ? (
                <>
                  <p
                    className="mb-0 mt-1 text-[11px]"
                    style={{ color: "var(--app-text-muted)" }}
                  >
                    Booking statuses by start time:{" "}
                    {Object.entries(
                      snapshot.customerJourneyContext.appointmentStatusCounts,
                    )
                      .map(([status, count]) => `${status} ${count}`)
                      .join(" · ") || "none recorded"}
                    .{" "}
                    {
                      snapshot.customerJourneyContext
                        .upcomingConfirmedAppointmentCount
                    }{" "}
                    booked or confirmed in the next 30 days. Support tickets by
                    creation date:{" "}
                    {Object.entries(
                      snapshot.customerJourneyContext.supportTicketStatusCounts,
                    )
                      .map(([status, count]) => `${status} ${count}`)
                      .join(" · ") || "none recorded"}
                    . Current unresolved backlog:{" "}
                    {snapshot.customerJourneyContext.openSupportTicketCount}.
                  </p>
                  <p
                    className="mb-0 mt-1 text-[10.5px]"
                    style={{ color: "var(--app-text-disabled)" }}
                  >
                    {snapshot.customerJourneyContext.note}
                  </p>
                </>
              ) : (
                <p
                  className="mb-0 mt-1 text-[11px]"
                  style={{ color: "var(--app-text-muted)" }}
                >
                  {snapshot.customerJourneyContext.note}
                </p>
              )}
            </div>
          )}
          {snapshot?.followUpOutcomes && (
            <div
              role="status"
              className="mt-3 rounded-[10px] p-3"
              style={{
                background: "var(--app-surface)",
                border: "1px solid var(--app-border)",
              }}
            >
              <strong
                className="text-[11px]"
                style={{ color: "var(--app-text)" }}
              >
                Staff-recorded follow-up outcomes · last{" "}
                {snapshot.followUpOutcomes.state === "available"
                  ? snapshot.followUpOutcomes.windowDays
                  : 90}{" "}
                days
              </strong>
              {snapshot.followUpOutcomes.state === "available" ? (
                <>
                  <p
                    className="mb-0 mt-1 text-[11px]"
                    style={{ color: "var(--app-text-muted)" }}
                  >
                    {snapshot.followUpOutcomes.completedCount} completed ·{" "}
                    {snapshot.followUpOutcomes.recordedCount} with an outcome ·{" "}
                    {snapshot.followUpOutcomes.notRecordedCount} without an
                    outcome.
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {(
                      Object.entries(snapshot.followUpOutcomes.outcomes) as [
                        CustomerFollowUpOutcome,
                        number,
                      ][]
                    ).map(([outcome, count]) => (
                      <span
                        key={outcome}
                        className="rounded-full px-2 py-1 text-[10px]"
                        style={{
                          background: "var(--app-surface-2)",
                          color: "var(--app-text-muted)",
                        }}
                      >
                        {CUSTOMER_FOLLOW_UP_OUTCOME_LABELS[outcome]} · {count}
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <p
                  className="mb-0 mt-1 text-[11px]"
                  style={{ color: "var(--app-text-muted)" }}
                >
                  {snapshot.followUpOutcomes.note}
                </p>
              )}
              {snapshot.followUpOutcomes.state === "available" && (
                <p
                  className="mb-0 mt-1 text-[10.5px]"
                  style={{ color: "var(--app-text-disabled)" }}
                >
                  {snapshot.followUpOutcomes.note}
                </p>
              )}
            </div>
          )}
          {snapshot?.followUpMessageDelivery && (
            <div
              role="status"
              className="mt-3 rounded-[10px] p-3"
              style={{
                background: "var(--app-surface)",
                border: "1px solid var(--app-border)",
              }}
            >
              <strong
                className="text-[11px]"
                style={{ color: "var(--app-text)" }}
              >
                Linked follow-up message delivery · last{" "}
                {snapshot.followUpMessageDelivery.state === "available"
                  ? snapshot.followUpMessageDelivery.windowDays
                  : 90}{" "}
                days
              </strong>
              {snapshot.followUpMessageDelivery.state === "available" ? (
                <p
                  className="mb-0 mt-1 text-[11px]"
                  style={{ color: "var(--app-text-muted)" }}
                >
                  {snapshot.followUpMessageDelivery.linkedDraftCount} linked
                  drafts ·{" "}
                  {
                    snapshot.followUpMessageDelivery
                      .providerConfirmedDeliveredOrReadCount
                  }{" "}
                  provider-confirmed delivered/read ·{" "}
                  {snapshot.followUpMessageDelivery.providerReportedFailedCount}{" "}
                  provider-reported failed ·{" "}
                  {
                    snapshot.followUpMessageDelivery
                      .queuedOrSentUnconfirmedCount
                  }{" "}
                  queued/sent without confirmation ·{" "}
                  {snapshot.followUpMessageDelivery.noCanonicalMessageCount}{" "}
                  without a canonical message record.
                </p>
              ) : (
                <p
                  className="mb-0 mt-1 text-[11px]"
                  style={{ color: "var(--app-text-muted)" }}
                >
                  {snapshot.followUpMessageDelivery.note}
                </p>
              )}
              {snapshot.followUpMessageDelivery.state === "available" && (
                <p
                  className="mb-0 mt-1 text-[10.5px]"
                  style={{ color: "var(--app-text-disabled)" }}
                >
                  {snapshot.followUpMessageDelivery.note}
                </p>
              )}
            </div>
          )}
          <p
            className="mb-0 mt-3 text-[12px] leading-relaxed"
            style={{ color: "var(--app-text)" }}
          >
            <strong>Saved source review · </strong>
            {recommendation?.summary ?? latest.output?.summary}
          </p>
          {snapshot?.proposedSegment && (
            <div
              className="mt-3 flex flex-wrap items-center gap-2 rounded-[10px] p-3"
              style={{
                background: "var(--app-surface)",
                border: "1px solid var(--app-border)",
              }}
            >
              <span
                className="min-w-0 flex-1 text-[11px]"
                style={{ color: "var(--app-text-muted)" }}
              >
                Source proposal:{" "}
                <strong style={{ color: "var(--app-text)" }}>
                  {snapshot.proposedSegment.name}
                </strong>{" "}
                · original rule: visit count greater than 1 ·{" "}
                {snapshot.proposedSegment.matchedCount === null
                  ? "match count not available for this branch scope"
                  : `${snapshot.proposedSegment.matchedCount} matches at source review`}
                . Review state: {recommendation?.status ?? "Not available"}.
                Open the saved proposal for current rules, counts and canonical
                verification. This review does not start a campaign.
              </span>
              <button
                type="button"
                onClick={() => router.push("/customers/segments")}
                className="rounded-[8px] px-3 py-2 text-[11px] font-bold"
                style={{
                  border: "1px solid var(--app-border)",
                  color: "var(--app-primary)",
                }}
              >
                Review segments
              </button>
              {canRun &&
                recommendation &&
                snapshot.proposedSegment.matchedCount !== null && (
                  <button
                    type="button"
                    disabled={prepareDraft.isPending}
                    onClick={() => prepareDraft.mutate(recommendation.id)}
                    className="rounded-[8px] px-3 py-2 text-[11px] font-bold disabled:opacity-60"
                    style={{
                      border: "1px solid var(--app-border)",
                      color: "var(--app-primary)",
                    }}
                  >
                    {recommendation.status.startsWith("segment_")
                      ? "Open saved rule draft"
                      : "Prepare editable segment draft"}
                  </button>
                )}
            </div>
          )}
          {snapshot?.winbackCampaignBrief && (
            <div
              className="mt-3 rounded-[10px] p-3"
              style={{
                background: "var(--app-surface)",
                border: "1px solid var(--app-border)",
              }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <strong
                  className="text-[12px]"
                  style={{ color: "var(--app-text)" }}
                >
                  Win-back campaign brief · review only
                </strong>
                <button
                  type="button"
                  onClick={() => router.push("/marketing/campaigns")}
                  className="rounded-[8px] px-3 py-2 text-[11px] font-bold"
                  style={{
                    border: "1px solid var(--app-border)",
                    color: "var(--app-primary)",
                  }}
                >
                  Open Marketing campaigns
                </button>
              </div>
              <p
                className="mb-0 mt-1 text-[11px]"
                style={{ color: "var(--app-text-muted)" }}
              >
                Criteria: at least one recorded visit, last visit on or before{" "}
                {new Date(
                  snapshot.winbackCampaignBrief.cutoffAt,
                ).toLocaleDateString()}
                , marketing consent recorded and not opted out. Lapse rule:{" "}
                {snapshot.winbackCampaignBrief.lapsedDays} days.
              </p>
              {snapshot.winbackCampaignBrief.state === "available" ? (
                <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                  {[
                    [
                      "Lapsed candidates",
                      snapshot.winbackCampaignBrief.lapsedCandidateCount,
                    ],
                    [
                      "Active profiles",
                      snapshot.winbackCampaignBrief.activeLapsedCount,
                    ],
                    [
                      "Consent flags pass",
                      snapshot.winbackCampaignBrief.consentPassCount,
                    ],
                    [
                      "Missing stored contact",
                      snapshot.winbackCampaignBrief
                        .missingStoredDestinationCount,
                    ],
                    [
                      "With stored destination",
                      snapshot.winbackCampaignBrief
                        .eligibleByStoredDestinationCount,
                    ],
                  ].map(([label, value]) => (
                    <div
                      key={String(label)}
                      className="rounded-[8px] p-2"
                      style={{ background: "var(--app-surface-2)" }}
                    >
                      <div
                        className="text-[10px]"
                        style={{ color: "var(--app-text-disabled)" }}
                      >
                        {label}
                      </div>
                      <div
                        className="mt-0.5 text-[13px] font-bold"
                        style={{ color: "var(--app-text)" }}
                      >
                        {value}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p
                  role="status"
                  className="mb-0 mt-2 text-[11px]"
                  style={{ color: "var(--app-text-muted)" }}
                >
                  Counts are not available for this selected-branch scope.
                </p>
              )}
              {snapshot.winbackCampaignBrief.channelSpecificConsent && (
                <div
                  role="status"
                  className="mt-2 rounded-[8px] p-2"
                  style={{ background: "var(--app-surface-2)" }}
                >
                  <strong
                    className="text-[10px]"
                    style={{ color: "var(--app-text)" }}
                  >
                    Latest recorded channel consent in this audience
                  </strong>
                  {snapshot.winbackCampaignBrief.channelSpecificConsent
                    .state === "available" &&
                  snapshot.winbackCampaignBrief.channelSpecificConsent
                    .byChannel ? (
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {(["email", "sms", "whatsapp"] as const).map(
                        (channel) => {
                          const consent =
                            snapshot.winbackCampaignBrief
                              ?.channelSpecificConsent?.byChannel?.[channel];
                          return consent ? (
                            <span
                              key={channel}
                              className="rounded-full px-2 py-1 text-[10px]"
                              style={{
                                background: "var(--app-surface)",
                                color: "var(--app-text-muted)",
                              }}
                            >
                              {channel}: {consent.granted} granted ·{" "}
                              {consent.grantedWithStoredDestination} granted
                              with destination on file · {consent.revoked}{" "}
                              revoked · {consent.unknown} unknown
                            </span>
                          ) : null;
                        },
                      )}
                    </div>
                  ) : (
                    <p
                      className="mb-0 mt-1 text-[10.5px]"
                      style={{ color: "var(--app-text-muted)" }}
                    >
                      {
                        snapshot.winbackCampaignBrief.channelSpecificConsent
                          .note
                      }
                    </p>
                  )}
                  {snapshot.winbackCampaignBrief.channelSpecificConsent
                    .state === "available" && (
                    <p
                      className="mb-0 mt-1 text-[10.5px]"
                      style={{ color: "var(--app-text-disabled)" }}
                    >
                      {
                        snapshot.winbackCampaignBrief.channelSpecificConsent
                          .note
                      }{" "}
                      A stored destination is not validated.
                    </p>
                  )}
                </div>
              )}
              <p
                className="mb-0 mt-2 text-[11px]"
                style={{ color: "var(--app-text-muted)" }}
              >
                Recorded channel consent is context, not send authorization.
                Marketing must recheck contact, consent, suppression, frequency,
                quota and provider status. This review creates no Campaign and
                queues no messages.
              </p>
            </div>
          )}
          {snapshot?.dataQuality && (
            <div
              className="mt-3 flex flex-wrap items-center gap-2 rounded-[10px] p-3"
              style={{
                background: "var(--app-surface)",
                border: "1px solid var(--app-border)",
              }}
            >
              <span
                className="min-w-0 flex-1 text-[11px]"
                style={{ color: "var(--app-text-muted)" }}
              >
                <strong style={{ color: "var(--app-text)" }}>
                  CRM data quality ·{" "}
                </strong>
                {snapshot.dataQuality.state === "available"
                  ? `${snapshot.dataQuality.exactMatchCandidatePairCount} exact-match duplicate pair(s) await review; ${snapshot.dataQuality.activeProfilesMissingEmailOrPhoneCount} active profile(s) have a blank email or phone field; ${snapshot.dataQuality.activeProfilesWithInvalidEmailCount ?? "not assessed in this saved review"} have an email that fails the CRM format check; ${snapshot.dataQuality.activeProfilesWithUnparseablePhoneCount ?? "not assessed in this saved review"} have a phone that cannot be parsed using the business country; ${snapshot.dataQuality.activeProfilesWithPhoneNormalizationNeededCount ?? "not assessed in this saved review"} have a valid phone that needs E.164 normalization. These are review cues only; contact deliverability is not checked.`
                  : "Not available for this branch scope; the duplicate detector is scoped to the current business."}
              </span>
              {snapshot.dataQuality.state === "available" && (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => router.push("/customers/duplicates")}
                    className="rounded-[8px] px-3 py-2 text-[11px] font-bold"
                    style={{
                      border: "1px solid var(--app-border)",
                      color: "var(--app-primary)",
                    }}
                  >
                    Review duplicate candidates
                  </button>
                  <button
                    type="button"
                    onClick={() => router.push("/customers")}
                    className="rounded-[8px] px-3 py-2 text-[11px] font-bold"
                    style={{
                      border: "1px solid var(--app-border)",
                      color: "var(--app-primary)",
                    }}
                  >
                    Review customer contact records
                  </button>
                </div>
              )}
            </div>
          )}
          {recommendation && (
            <details
              className="mt-3 text-[11px]"
              style={{ color: "var(--app-text-muted)" }}
            >
              <summary className="cursor-pointer font-semibold">
                Sources, calculation and limits
              </summary>
              <p className="mb-1 mt-2">
                Source: {recommendationSourceLabel} ·{" "}
                {recommendation.evidence[0]?.calculation ??
                  "Existing customer analytics calculation."}
              </p>
              <p className="mb-1">
                Assumptions: {recommendation.assumptions.join(" ")}
              </p>
              <p className="mb-0">
                Limits: {recommendation.missingData.join(" ")}
              </p>
            </details>
          )}
          {canRun &&
            followUpEvidence && (
              <div
                className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[10px] p-3"
                style={{
                  background: "var(--app-surface)",
                  border: "1px solid var(--app-border)",
                }}
              >
                <p
                  className="mb-0 max-w-[680px] text-[11px]"
                  style={{ color: "var(--app-text-muted)" }}
                >
                  Propose an internal task for a person to review {followUpEventLabel}.
                  An owner must approve it before the CRM task is created. No customer message is drafted or sent.
                </p>
                <button
                  type="button"
                  onClick={() => createEventFollowUpTask.mutate(recommendation.id)}
                  disabled={createEventFollowUpTask.isPending}
                  className="rounded-[8px] px-3 py-2 text-[11px] font-bold text-white disabled:opacity-60"
                  style={{ background: "var(--app-primary)" }}
                >
                  {createEventFollowUpTask.isPending
                    ? "Creating task…"
                    : "Propose follow-up task"}
                </button>
              </div>
            )}
          {latest.output?.aiSummary && (
            <div
              className="mt-3 border-t pt-3 text-[11px]"
              style={{
                borderColor: "var(--app-border)",
                color: "var(--app-text-muted)",
              }}
            >
              <span className="font-bold">
                Optional AI explanation · {latest.output.aiSummary.status}
              </span>
              <p className="mb-0 mt-1">
                {latest.output.aiSummary.text ??
                  latest.output.aiSummary.message}
              </p>
            </div>
          )}
          <SpecialistAgentUsage calls={latest.aiCallLogs} />
        </div>
      ) : (
        <p
          className="mb-0 mt-4 text-[12px]"
          style={{ color: "var(--app-text-muted)" }}
        >
          No review has been run yet. The review uses real stored customer
          summary metrics and does not send a message or change a segment.
        </p>
      )}
    </section>
  );
}

export function CustomerInsightsPanel() {
  const session = useSession();
  const currency = session.business.currency;
  const router = useRouter();
  const { data: customers = [] } = useQuery({
    queryKey: ["customers"],
    queryFn: fetchCustomers,
  });
  const { data: debtors = [] } = useQuery({
    queryKey: ["debtors", "overdue"],
    queryFn: () => fetchDebtors("overdue"),
  });
  const { data: duplicates = [] } = useQuery({
    queryKey: ["customer-duplicates"],
    queryFn: fetchCustomerDuplicates,
  });

  const stats = useMemo(() => {
    const n = customers.length;
    const avgReturnFor = (c: (typeof customers)[number]) => {
      if (c.visitCount < 2 || !c.lastVisitAt) return null;
      const span =
        new Date(c.lastVisitAt).getTime() - new Date(c.createdAt).getTime();
      return Math.max(1, span / (c.visitCount - 1) / (1000 * 60 * 60 * 24));
    };
    const returns = customers
      .map(avgReturnFor)
      .filter((v): v is number => v !== null);
    const atRisk = customers.filter((c) => {
      const lc = lifecycleOf(c);
      return lc === "At Risk" || lc === "Lapsed" || lc === "Dormant";
    });
    const visitedWithin90Days = customers.filter(
      (c) => daysSince(c.lastVisitAt) <= 90,
    ).length;
    return {
      avgLtv: n ? customers.reduce((s, c) => s + c.lifetimeSpend, 0) / n : null,
      repeatRate: n
        ? Math.round(
            (customers.filter((c) => c.visitCount > 1).length / n) * 100,
          )
        : null,
      visitedWithin90Days,
      visitedWithin90DaysRate: n
        ? Math.round((visitedWithin90Days / n) * 100)
        : null,
      avgSpend: n
        ? customers.reduce(
            (s, c) => s + (c.visitCount ? c.lifetimeSpend / c.visitCount : 0),
            0,
          ) / n
        : null,
      avgVisitGap: returns.length
        ? Math.round(returns.reduce((s, v) => s + v, 0) / returns.length)
        : null,
      atRiskCount: atRisk.length,
      oneVisit: customers.filter((c) => c.visitCount === 1).length,
      incomplete: customers.filter((c) => !c.email || c.tags.length === 0)
        .length,
    };
  }, [customers]);

  const valueBands = useMemo(() => {
    const total = customers.reduce((s, c) => s + c.lifetimeSpend, 0);
    const bands = [
      {
        label: `High value — over ${formatCurrency(HIGH_VALUE_THRESHOLD, currency)}`,
        list: customers.filter((c) => c.lifetimeSpend > HIGH_VALUE_THRESHOLD),
        color: "#12A150",
      },
      {
        label: `Medium — ${formatCurrency(MEDIUM_VALUE_THRESHOLD, currency)} to ${formatCurrency(HIGH_VALUE_THRESHOLD, currency)}`,
        list: customers.filter(
          (c) =>
            c.lifetimeSpend > MEDIUM_VALUE_THRESHOLD &&
            c.lifetimeSpend <= HIGH_VALUE_THRESHOLD,
        ),
        color: "#2563EB",
      },
      {
        label: `Low — under ${formatCurrency(MEDIUM_VALUE_THRESHOLD, currency)}`,
        list: customers.filter(
          (c) => c.lifetimeSpend <= MEDIUM_VALUE_THRESHOLD,
        ),
        color: "#98A2B3",
      },
    ];
    return bands.map((b) => {
      const amount = b.list.reduce((s, c) => s + c.lifetimeSpend, 0);
      return {
        ...b,
        amount,
        n: b.list.length,
        pct: total > 0 ? Math.round((amount / total) * 100) : null,
      };
    });
  }, [customers, currency]);

  const risks = [
    {
      t: "Lifecycle follow-up",
      ev: `${stats.atRiskCount} profiles are beyond the fixed last-visit thresholds (45, 90 or 180 days). This is a review cue, not a churn prediction or each customer's usual visit gap.`,
      href: "/customers",
    },
    {
      t: "Credit exposure",
      ev: `${debtors.length} customers carry an outstanding balance`,
      href: "/credit",
    },
    {
      t: "Duplicate records",
      ev: `${duplicates.length} pair(s) may split a customer's history`,
      href: "/customers/duplicates",
    },
  ];
  const opportunities = [
    {
      t: "Review overdue profiles",
      ev: `${stats.atRiskCount} profiles match the fixed At Risk, Lapsed or Dormant last-visit rules. Check the customer record before choosing a follow-up.`,
      href: "/customers/segments",
    },
    {
      t: "Second visit push",
      ev: `${stats.oneVisit} customers have visited only once`,
      href: "/customers/segments",
    },
    {
      t: "Complete missing contact details",
      ev: `${stats.incomplete} profiles missing email or tags`,
      href: "/customers?filter=incomplete",
    },
  ];

  return (
    <main className="flex flex-col gap-[15px] px-[22px] pb-[26px] pt-4">
      <CustomerIntelligenceAgentPanel />
      <div
        className="grid gap-3.5"
        style={{ gridTemplateColumns: "repeat(auto-fit,minmax(165px,1fr))" }}
      >
        <div
          className="rounded-[14px] p-[15px]"
          style={{
            background: "var(--app-surface)",
            border: "1px solid var(--app-border)",
          }}
        >
          <div
            className="text-[12px] font-semibold"
            style={{ color: "var(--app-text-muted)" }}
          >
            Average Lifetime Spend
          </div>
          <div
            className="mt-1.5 text-[20px] font-extrabold"
            style={{ color: "var(--app-text)" }}
          >
            {stats.avgLtv === null
              ? "Not available"
              : formatCurrency(stats.avgLtv, currency)}
          </div>
          <div
            className="mt-1 text-[10.5px]"
            style={{ color: "var(--app-text-disabled)" }}
          >
            Average recorded Customer.lifetimeSpend across CRM profiles
          </div>
        </div>
        <div
          className="rounded-[14px] p-[15px]"
          style={{
            background: "var(--app-surface)",
            border: "1px solid var(--app-border)",
          }}
        >
          <div
            className="text-[12px] font-semibold"
            style={{ color: "var(--app-text-muted)" }}
          >
            Repeat Rate
          </div>
          <div
            className="mt-1.5 text-[20px] font-extrabold"
            style={{ color: "var(--app-primary)" }}
          >
            {stats.repeatRate === null
              ? "Not available"
              : `${stats.repeatRate}%`}
          </div>
          <div
            className="mt-1 text-[10.5px]"
            style={{ color: "var(--app-text-disabled)" }}
          >
            Profiles with visitCount &gt; 1 ÷ all CRM profiles
          </div>
        </div>
        <div
          className="rounded-[14px] p-[15px]"
          style={{
            background: "var(--app-surface)",
            border: "1px solid var(--app-border)",
          }}
        >
          <div
            className="text-[12px] font-semibold"
            style={{ color: "var(--app-text-muted)" }}
          >
            Last visit within 90 days
          </div>
          <div
            className="mt-1.5 text-[20px] font-extrabold"
            style={{ color: "var(--app-text)" }}
          >
            {stats.visitedWithin90DaysRate === null
              ? "Not available"
              : `${stats.visitedWithin90DaysRate}%`}
          </div>
          <div
            className="mt-1 text-[10.5px]"
            style={{ color: "var(--app-text-disabled)" }}
          >
            {stats.visitedWithin90Days} of {customers.length} CRM profiles · not
            cohort retention
          </div>
        </div>
        <div
          className="rounded-[14px] p-[15px]"
          style={{
            background: "var(--app-surface)",
            border: "1px solid var(--app-border)",
          }}
        >
          <div
            className="text-[12px] font-semibold"
            style={{ color: "var(--app-text-muted)" }}
          >
            Recorded spend per visit
          </div>
          <div
            className="mt-1.5 text-[20px] font-extrabold"
            style={{ color: "var(--app-text)" }}
          >
            {stats.avgSpend === null
              ? "Not available"
              : formatCurrency(stats.avgSpend, currency)}
          </div>
          <div
            className="mt-1 text-[10.5px]"
            style={{ color: "var(--app-text-disabled)" }}
          >
            Customer.lifetimeSpend ÷ recorded visitCount, averaged across
            profiles
          </div>
        </div>
        <div
          className="rounded-[14px] p-[15px]"
          style={{
            background: "var(--app-surface)",
            border: "1px solid var(--app-border)",
          }}
        >
          <div
            className="text-[12px] font-semibold"
            style={{ color: "var(--app-text-muted)" }}
          >
            Estimated days between visits
          </div>
          <div
            className="mt-1.5 text-[20px] font-extrabold"
            style={{ color: "var(--app-text)" }}
          >
            {stats.avgVisitGap ? `${stats.avgVisitGap}d` : "Not available"}
          </div>
          <div
            className="mt-1 text-[10.5px]"
            style={{ color: "var(--app-text-disabled)" }}
          >
            Proxy from profile creation, lastVisitAt and visitCount; not a full
            visit ledger
          </div>
        </div>
        <div
          className="rounded-[14px] p-[15px]"
          style={{
            background: "var(--app-surface)",
            border: "1.5px solid #FDD9D6",
          }}
        >
          <div className="text-[12px] font-bold" style={{ color: "#B42318" }}>
            Past lifecycle thresholds
          </div>
          <div
            className="mt-1.5 text-[20px] font-extrabold"
            style={{ color: "var(--app-text)" }}
          >
            {stats.atRiskCount}
          </div>
        </div>
      </div>

      <div
        className="grid gap-[15px]"
        style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}
      >
        <div
          className="rounded-[16px] p-[17px]"
          style={{
            background: "var(--app-surface)",
            border: "1px solid var(--app-border)",
            minWidth: 0,
          }}
        >
          <h3
            className="m-0 mb-1 text-[14.5px] font-extrabold"
            style={{ color: "var(--app-text)" }}
          >
            Recorded customer lifetime spend
          </h3>
          <p
            className="mb-3 mt-0 text-[11px]"
            style={{ color: "var(--app-text-muted)" }}
          >
            Customer.lifetimeSpend grouped by the existing profile value bands;
            this is not sales revenue attribution.
          </p>
          {customers.length === 0 ? (
            <p
              className="mb-0 rounded-[10px] p-3 text-[11.5px]"
              style={{
                background: "var(--app-surface-2)",
                color: "var(--app-text-muted)",
              }}
            >
              No customer records are available for this business.
            </p>
          ) : (
            <div className="flex flex-col gap-3">
              {valueBands.map((b) => (
                <div key={b.label}>
                  <div className="mb-[5px] flex justify-between gap-2">
                    <span
                      className="text-[12.5px] font-semibold"
                      style={{ color: "var(--app-text-muted)" }}
                    >
                      {b.label}
                    </span>
                    <span
                      className="text-[11.5px] font-extrabold"
                      style={{ color: "var(--app-text)" }}
                    >
                      {formatCurrency(b.amount, currency)}
                    </span>
                  </div>
                  <div
                    className="h-[10px] overflow-hidden rounded-[6px]"
                    style={{ background: "var(--app-surface-2)" }}
                  >
                    <div
                      className="h-full rounded-[6px]"
                      style={{ width: `${b.pct ?? 0}%`, background: b.color }}
                    />
                  </div>
                  <div
                    className="mt-1 text-[10.5px]"
                    style={{ color: "var(--app-text-disabled)" }}
                  >
                    {b.n} customers ·{" "}
                    {b.pct === null
                      ? "share not available because recorded total spend is zero"
                      : `${b.pct}% of recorded customer lifetime spend`}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div
          className="rounded-[16px] p-[17px]"
          style={{
            background: "var(--app-surface)",
            border: "1px solid var(--app-border)",
            minWidth: 0,
          }}
        >
          <h3
            className="m-0 mb-3 text-[14.5px] font-extrabold"
            style={{ color: "var(--app-text)" }}
          >
            Top risks
          </h3>
          <div className="flex flex-col gap-[10px]">
            {risks.map((r) => (
              <div
                key={r.t}
                className="flex items-center gap-[11px] rounded-[12px] p-3"
                style={{ border: "1px solid var(--app-border)" }}
              >
                <span className="min-w-0 flex-1">
                  <span
                    className="block text-[12.5px] font-bold"
                    style={{ color: "var(--app-text)" }}
                  >
                    {r.t}
                  </span>
                  <span
                    className="mt-0.5 block text-[11.5px]"
                    style={{ color: "var(--app-text-disabled)" }}
                  >
                    {r.ev}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => router.push(r.href)}
                  className="rounded-[9px] px-3 py-2 text-[11.5px] font-bold"
                  style={{
                    border: "1px solid var(--app-border)",
                    color: "var(--app-primary)",
                  }}
                >
                  Open
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div
        className="overflow-hidden rounded-[16px]"
        style={{
          background: "var(--app-surface)",
          border: "1px solid var(--app-border)",
        }}
      >
        <div
          className="p-[13px_17px]"
          style={{ borderBottom: "1px solid var(--app-surface-2)" }}
        >
          <h3
            className="m-0 text-[14.5px] font-extrabold"
            style={{ color: "var(--app-text)" }}
          >
            Top opportunities
          </h3>
        </div>
        {opportunities.map((o) => (
          <div
            key={o.t}
            className="flex flex-wrap items-center gap-3 p-[14px_17px]"
            style={{ borderTop: "1px solid var(--app-surface-2)" }}
          >
            <span className="min-w-[220px] flex-1">
              <span
                className="block text-[13px] font-bold"
                style={{ color: "var(--app-text)" }}
              >
                {o.t}
              </span>
              <span
                className="mt-1 block text-[11.5px] leading-relaxed"
                style={{ color: "var(--app-text-muted)" }}
              >
                {o.ev}
              </span>
            </span>
            <button
              type="button"
              onClick={() => router.push(o.href)}
              className="rounded-[10px] px-[15px] py-[10px] text-[12px] font-extrabold text-white"
              style={{ background: "var(--app-primary)" }}
            >
              Act on this
            </button>
          </div>
        ))}
        <div
          className="p-[11px_17px] text-[11.5px]"
          style={{
            borderTop: "1px solid var(--app-surface-2)",
            color: "var(--app-text-disabled)",
          }}
        >
          These are real counts from your own customer data — not predictions or
          promised outcomes.
        </div>
      </div>
    </main>
  );
}
