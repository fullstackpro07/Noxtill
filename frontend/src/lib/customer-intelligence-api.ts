import { apiFetch } from "@/lib/api-client";
import type { SegmentRules } from "@/lib/segments-api";
import type { SpecialistAgentAiUsageCall } from "@/lib/specialist-agent-usage";
import { postSpecialistAgentRun } from "@/lib/specialist-agent-run-idempotency";

export type CustomerFollowUpOutcome =
  | "contacted"
  | "no_answer"
  | "customer_response_recorded"
  | "follow_up_scheduled"
  | "no_contact_needed";

export const CUSTOMER_FOLLOW_UP_OUTCOME_LABELS: Record<
  CustomerFollowUpOutcome,
  string
> = {
  contacted: "Contact attempt made",
  no_answer: "No answer",
  customer_response_recorded: "Customer response recorded",
  follow_up_scheduled: "Follow-up scheduled",
  no_contact_needed: "No contact needed",
};

export interface CustomerFollowUpOutcomeSummary {
  windowDays: number;
  from: string;
  observedAt: string;
  completedCount: number;
  recordedCount: number;
  notRecordedCount: number;
  outcomes: Record<CustomerFollowUpOutcome, number>;
  note: string;
}

export function fetchCustomerFollowUpOutcomeSummary(): Promise<CustomerFollowUpOutcomeSummary> {
  return apiFetch("/customers/follow-up-outcomes");
}

export interface CustomerAgentSnapshot {
  totalCustomers: number;
  newCustomersThisCalendarMonth: number;
  returningCustomers: number;
  customersWithAtLeastOneVisit: number;
  retentionRatePercent: number;
  customerFeedback?: {
    windowDays: number;
    from: string;
    observedAt: string;
    responseCount: number;
    averageStars: number | null;
    ratingCounts: { stars: number; count: number }[];
    routedCounts: { public: number; private: number };
    source: string;
    note: string;
  };
  customerJourneyContext?:
    | {
        state: "available";
        windowDays: number;
        from: string;
        observedAt: string;
        appointmentStatusCounts: Record<string, number>;
        upcomingConfirmedAppointmentCount: number;
        supportTicketStatusCounts: Record<string, number>;
        openSupportTicketCount: number;
        note: string;
      }
    | {
        state: "not_available_for_selected_branch";
        windowDays: number;
        from: string;
        observedAt: string;
        appointmentStatusCounts: null;
        upcomingConfirmedAppointmentCount: null;
        supportTicketStatusCounts: null;
        openSupportTicketCount: null;
        note: string;
      };
  followUpOutcomes?:
    | {
        state: "available";
        windowDays: number;
        from: string;
        observedAt: string;
        completedCount: number;
        recordedCount: number;
        notRecordedCount: number;
        outcomes: Record<CustomerFollowUpOutcome, number>;
        note: string;
      }
    | {
        state: "not_available_for_selected_branch";
        note: string;
      };
  followUpMessageDelivery?:
    | {
        state: "available";
        windowDays: number;
        from: string;
        observedAt: string;
        linkedDraftCount: number;
        canonicalMessageCount: number;
        providerConfirmedDeliveredOrReadCount: number;
        providerReportedFailedCount: number;
        queuedOrSentUnconfirmedCount: number;
        noCanonicalMessageCount: number;
        otherCanonicalStatusCount: number;
        note: string;
      }
    | {
        state: "not_available_for_selected_branch";
        note: string;
      };
  proposedSegment?: {
    name: string;
    rules: {
      combinator: "AND" | "OR";
      conditions: Array<{
        field: string;
        operator: string;
        value: string | number | boolean;
      }>;
    };
    matchedCount: number | null;
    state: "draft_only";
  };
  winbackCampaignBrief?: {
    state: "available" | "not_available_for_selected_branch";
    lapsedDays: number;
    observedAt: string;
    cutoffAt: string;
    criteria: SegmentRules;
    lapsedCandidateCount: number | null;
    activeLapsedCount: number | null;
    optedOutCount: number | null;
    noMarketingConsentCount: number | null;
    consentPassCount: number | null;
    channelSpecificConsent?: {
      state: "available" | "not_available_for_selected_branch";
      eligibleProfileCount: number | null;
      byChannel: Record<
        "email" | "sms" | "whatsapp",
        {
          granted: number;
          grantedWithStoredDestination: number;
          revoked: number;
          unknown: number;
        }
      > | null;
      note: string;
    };
    missingStoredDestinationCount: number | null;
    eligibleByStoredDestinationCount: number | null;
    campaignCreated: false;
    messagesQueued: false;
  };
  dataQuality?: {
    state: "available" | "not_available_for_selected_branch";
    activeProfilesMissingEmailOrPhoneCount: number | null;
    activeProfilesWithInvalidEmailCount?: number | null;
    activeProfilesWithUnparseablePhoneCount?: number | null;
    activeProfilesWithPhoneNormalizationNeededCount?: number | null;
    exactMatchCandidatePairCount: number | null;
    sharedEmailPairCount: number | null;
    sharedPhonePairCount: number | null;
  };
}

export interface CustomerAgentRun {
  id: string;
  agentKey: string;
  agentVersion: string;
  triggerType: string;
  status: string;
  output: {
    summary?: string;
    snapshot?: CustomerAgentSnapshot;
    aiSummary?: {
      status: string;
      text: string | null;
      message: string | null;
    };
  } | null;
  recommendations: Array<{
    id: string;
    status: string;
    title: string;
    summary: string;
    assumptions: string[];
    missingData: string[];
    evidence: Array<{
      sourceType: string;
      resourceType: string;
      resourceId: string;
      fieldRefs: string[];
      observedValues: CustomerAgentSnapshot;
      calculation: string | null;
    }>;
  }>;
  aiCallLogs?: SpecialistAgentAiUsageCall[];
  createdAt: string;
  finishedAt: string | null;
}

export function fetchCustomerAgentRuns(): Promise<CustomerAgentRun[]> {
  return apiFetch<CustomerAgentRun[]>("/analytics/customers/agent-runs");
}

export function runCustomerAgent(): Promise<CustomerAgentRun> {
  return postSpecialistAgentRun("customer", {}, (idempotencyKey) =>
    apiFetch<CustomerAgentRun>("/analytics/customers/agent-runs", {
      method: "POST",
      headers: idempotencyKey
        ? { "Idempotency-Key": idempotencyKey }
        : undefined,
    }),
  );
}

export function proposeCustomerFollowUpTaskFromRecommendation(
  recommendationId: string,
): Promise<{ id: string; actionType: string; state: string; expectedVersion: number | null }> {
  return apiFetch(
    `/customers/agent-recommendations/${encodeURIComponent(recommendationId)}/follow-up-task-action`,
    { method: "POST" },
  );
}

export interface CustomerProfileIntelligence {
  customerId: string;
  observedAt: string;
  coverage: "partial";
  narrative: { state: "available"; method: "deterministic"; text: string };
  profile: {
    customerSince: string;
    updatedAt: string;
    status: string;
    recordedVisits: number;
    lastVisitAt: string | null;
  };
  windows: {
    days: number;
    currentFrom: string;
    previousFrom: string;
    to: string;
    contextFrom: string;
    minimumPreviousOrders: number;
    minimumOrderDecline: number;
    lapsedDays: number;
  };
  orders: {
    state: string;
    currentCount: number | null;
    previousCount: number | null;
    latestCreatedAt: string | null;
    allTimeCompletedCount: number | null;
  };
  rfm: {
    state: string;
    observedAt: string;
    recency: {
      state: string;
      latestCompletedOrderAt: string | null;
      daysSinceLatestCompletedOrder: number | null;
    };
    frequency: {
      state: string;
      completedNonQuotationOrderCount: number | null;
    };
    monetary: {
      state: string;
      recordedLifetimeSpend: number | null;
      currency: string | null;
    };
    score: { state: "not_configured"; value: null; message: string };
    definitions: { recency: string; frequency: string; monetary: string };
  };
  bookings: {
    state: string;
    statuses: Record<string, number> | null;
    next: { id: string; startsAt: string; status: string } | null;
  };
  messages: { state: string; statuses: Record<string, number> | null };
  support: {
    state: string;
    unresolvedCount: number | null;
    latestUpdatedAt: string | null;
  };
  loyalty: {
    recordedEnrollments: number;
    recordedStamps: number;
    latestUpdatedAt: string | null;
    membershipStatuses: Record<string, number>;
  };
  notes: {
    state: string;
    count: number | null;
    latestUpdatedAt: string | null;
  };
  feedback: {
    state: string;
    count: number | null;
    averageStars: number | null;
    statuses: Record<string, number> | null;
    latestCreatedAt: string | null;
  };
  financial: {
    state: string;
    recordedLifetimeSpend: number | null;
    currency: string | null;
  };
  marketing: {
    state: string;
    exclusions: string[];
    sendsMessages: false;
    message: string;
  };
  followUp: {
    state: string;
    reason: string;
    href: string;
    confidence: string;
    automatedAction: false;
  };
  sources: Array<{ source: string; fields: string[]; window: string }>;
  limits: string[];
}

export function fetchCustomerProfileIntelligence(
  id: string,
): Promise<CustomerProfileIntelligence> {
  return apiFetch(`/customers/${encodeURIComponent(id)}/intelligence`);
}

export interface CustomerFollowUpTask {
  id: string;
  title: string;
  reason: string;
  priority: "urgent" | "normal" | "low";
  status: string;
  dueAt: string | null;
  assigneeStaffId: string | null;
  createdByUserId: string;
  completedByUserId: string | null;
  completedAt: string | null;
  createdAt: string;
  linkedMessages: Array<{
    messageDraftId: string;
    draftStatus: string;
    messageStatus: string | null;
    createdAt: string;
    providerDeliveryConfirmed: boolean;
  }>;
}

export interface CustomerAgentMessageDraft {
  id: string;
  body: string;
  status: string;
  messageStatus: string | null;
  followUpTaskId: string | null;
  generatedByAgent: boolean;
  createdAt: string;
}

export interface CustomerAgentMessageSendPreview {
  channel: "sms" | "whatsapp" | "email";
  category: string;
  templateKey: string;
  locale: string;
  renderedText: string;
  scheduledFor: string | null;
  deliveryState: "not_queued";
  disclosure: string;
}

export interface CustomerAgentMessageQueueResult {
  draftId: string;
  messageId: string;
  messageStatus: string;
  queued: boolean;
}

export interface CustomerChannelConsent {
  channel: "email" | "sms" | "whatsapp";
  state: "unknown" | "granted" | "revoked";
  evidenceReference: string | null;
  source: string | null;
  updatedAt: string | null;
}

export interface CustomerChannelConsentHistoryItem {
  id: string;
  channel: "email" | "sms" | "whatsapp";
  state: "granted" | "revoked";
  source: string;
  evidenceReference: string;
  revision: number;
  createdAt: string;
}

export interface CustomerChannelConsentSnapshot {
  channels: CustomerChannelConsent[];
  history: CustomerChannelConsentHistoryItem[];
}

export function fetchCustomerChannelConsent(
  customerId: string,
): Promise<CustomerChannelConsentSnapshot> {
  return apiFetch(
    `/customers/${encodeURIComponent(customerId)}/channel-consent`,
  );
}

export function recordCustomerChannelConsent(
  customerId: string,
  input: {
    channel: CustomerChannelConsent["channel"];
    state: "granted" | "revoked";
    source:
      | "customer_portal"
      | "website_form"
      | "paper_form"
      | "recorded_call"
      | "in_person"
      | "other";
    evidenceReference: string;
  },
): Promise<CustomerChannelConsentHistoryItem> {
  return apiFetch(
    `/customers/${encodeURIComponent(customerId)}/channel-consent`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export type CustomerMessageDraftPurpose =
  | "booking_follow_up"
  | "order_follow_up"
  | "support_follow_up"
  | "winback_follow_up"
  | "feedback_request"
  | "general_follow_up";

export function fetchCustomerFollowUpTasks(
  customerId: string,
): Promise<CustomerFollowUpTask[]> {
  return apiFetch(
    `/customers/${encodeURIComponent(customerId)}/follow-up-tasks`,
  );
}

export function createCustomerFollowUpTask(
  customerId: string,
  input: {
    title: string;
    reason: string;
    priority: CustomerFollowUpTask["priority"];
    dueAt: string | null;
    assigneeStaffId: string | null;
    idempotencyKey: string;
  },
): Promise<CustomerFollowUpTask> {
  return apiFetch(
    `/customers/${encodeURIComponent(customerId)}/follow-up-tasks`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function fetchCustomerAgentMessageDrafts(
  customerId: string,
): Promise<CustomerAgentMessageDraft[]> {
  return apiFetch(
    `/customers/${encodeURIComponent(customerId)}/agent-message-drafts`,
  );
}

export function createCustomerAgentMessageDraft(
  customerId: string,
  input: {
    body: string;
    idempotencyKey: string;
    followUpTaskId?: string | null;
  },
): Promise<CustomerAgentMessageDraft> {
  return apiFetch(
    `/customers/${encodeURIComponent(customerId)}/agent-message-drafts`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function updateCustomerAgentMessageDraft(
  customerId: string,
  draftId: string,
  body: string,
): Promise<CustomerAgentMessageDraft> {
  return apiFetch(
    `/customers/${encodeURIComponent(customerId)}/agent-message-drafts/${encodeURIComponent(draftId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ body }),
    },
  );
}

export function previewCustomerAgentMessageDraft(
  customerId: string,
  draftId: string,
): Promise<CustomerAgentMessageSendPreview> {
  return apiFetch(
    `/customers/${encodeURIComponent(customerId)}/agent-message-drafts/${encodeURIComponent(draftId)}/preview-send`,
    {
      method: "POST",
    },
  );
}

export function queueCustomerAgentMessageDraft(
  customerId: string,
  draftId: string,
): Promise<CustomerAgentMessageQueueResult> {
  return apiFetch(
    `/customers/${encodeURIComponent(customerId)}/agent-message-drafts/${encodeURIComponent(draftId)}/queue-send`,
    {
      method: "POST",
    },
  );
}

export function generateCustomerAgentMessageDraft(
  customerId: string,
  input: {
    purpose: CustomerMessageDraftPurpose;
    idempotencyKey: string;
    followUpTaskId?: string | null;
  },
): Promise<CustomerAgentMessageDraft> {
  return apiFetch(
    `/customers/${encodeURIComponent(customerId)}/agent-message-drafts/generate`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export interface CustomerSegmentDraftCounts {
  matched: number;
  inactive: number;
  optedOut: number;
  noConsent: number;
  flagsPass: number;
  observedAt: string;
  sendAuthorized: boolean;
}
export interface CustomerSegmentDraftRevision {
  version: number;
  name: string;
  rules: SegmentRules;
  reason: string;
  payloadHash: string;
  savedAt: string;
  actorUserId: string;
  countsAtSave?: CustomerSegmentDraftCounts;
}
export interface CustomerSegmentActionEvent {
  eventType: string;
  fromState: string | null;
  toState: string | null;
  reason: string | null;
  createdAt: string;
}
export interface CustomerSegmentAgentAction {
  id: string;
  actionType: string;
  state: string;
  expectedVersion: number | null;
  correlationId: string;
  executionAttemptCount: number;
  rejectionReason: string | null;
  canonicalOperationId: string | null;
  approvedAt: string | null;
  executedAt: string | null;
  verifiedAt: string | null;
  actualResult: Record<string, unknown>;
  verificationResult: Record<string, unknown>;
  events: CustomerSegmentActionEvent[];
}
export interface CustomerSegmentDraft {
  id: string;
  state: "draft" | "submitted" | "applied" | "rejected";
  expiresAt: string;
  expired: boolean;
  current: CustomerSegmentDraftRevision;
  versions: CustomerSegmentDraftRevision[];
  counts: CustomerSegmentDraftCounts;
  countsHash: string;
  actionHistoryComplete: boolean;
  target?: { segmentId: string; version: number };
  submission?: {
    version: number;
    payloadHash: string;
    countsHash: string;
    at: string;
    by: string;
  };
  approvals?: Array<{
    version: number;
    payloadHash: string;
    countsHash: string;
    at: string;
    by: string;
    segmentId: string;
    segmentVersion: number;
  }>;
  canonicalSegment: {
    id: string;
    name: string;
    version: number;
    approvalState: "manual" | "approved" | "changed";
  } | null;
  actionHistory: CustomerSegmentAgentAction[];
  verification: "verified" | "changed" | "missing" | "not_applied";
  rejectionReason?: string;
}
const draftPath = (id: string) =>
  `/customers/agent-recommendations/${encodeURIComponent(id)}/segment-draft`;
export function fetchCustomerSegmentDrafts(): Promise<CustomerSegmentDraft[]> {
  return apiFetch("/customers/segment-drafts");
}
export function fetchCustomerSegmentDraft(
  id: string,
): Promise<CustomerSegmentDraft> {
  return apiFetch(draftPath(id));
}
export function prepareCustomerSegmentDraft(
  id: string,
): Promise<CustomerSegmentDraft> {
  return apiFetch(draftPath(id), { method: "POST" });
}
export function updateCustomerSegmentDraft(
  id: string,
  input: {
    expectedVersion: number;
    name: string;
    rules: SegmentRules;
    reason: string;
  },
): Promise<CustomerSegmentDraft> {
  return apiFetch(draftPath(id), {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}
export function rejectCustomerSegmentDraft(
  id: string,
  input: { expectedVersion: number; reason: string },
): Promise<CustomerSegmentDraft> {
  return apiFetch(`${draftPath(id)}/reject`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
export type CustomerSegmentPreview = {
  expectedVersion: number;
  expectedPayloadHash: string;
  expectedCountsHash: string;
};
export function submitCustomerSegmentDraft(
  id: string,
  input: CustomerSegmentPreview,
): Promise<CustomerSegmentDraft> {
  return apiFetch(`${draftPath(id)}/submit`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
export function approveCustomerSegmentDraft(
  id: string,
  input: CustomerSegmentPreview,
): Promise<CustomerSegmentDraft> {
  return apiFetch(
    `/actions/${encodeURIComponent(`customer_segment:${id}`)}/segment-approve`,
    { method: "POST", body: JSON.stringify(input) },
  );
}
export function withdrawCustomerSegmentDraft(
  id: string,
  input: { expectedVersion: number; reason: string },
): Promise<CustomerSegmentDraft> {
  return apiFetch(`${draftPath(id)}/withdraw`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
export function reopenCustomerSegmentDraft(
  id: string,
  input: { expectedVersion: number; reason: string },
): Promise<CustomerSegmentDraft> {
  return apiFetch(`${draftPath(id)}/reopen`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
