import { apiFetch } from "@/lib/api-client";

export type OutboundPurpose = "service" | "callback" | "marketing";
export type OutboundCallerType = "ai_voice" | "live_agent";
export type OutboundMemberStatus =
  | "selected"
  | "eligible"
  | "blocked"
  | "queued"
  | "calling"
  | "answered"
  | "busy"
  | "no_answer"
  | "voicemail"
  | "retry"
  | "opted_out"
  | "skipped"
  | "completed";
export type OutboundCampaignStatus =
  | "draft"
  | "pending_approval"
  | "approved"
  | "scheduled"
  | "running"
  | "paused"
  | "stop_requested"
  | "stopped"
  | "completed";
export type DialAttemptStatus =
  | "blocked"
  | "initiating"
  | "ringing"
  | "in_progress"
  | "completed"
  | "agent_ringing"
  | "agent_no_answer"
  | "customer_ringing"
  | "answered"
  | "voicemail"
  | "busy"
  | "no_answer"
  | "failed"
  | "canceled";
export type DialDisposition =
  | "interested"
  | "not_interested"
  | "callback_requested"
  | "wrong_number"
  | "do_not_call"
  | "completed";

export interface OutboundAudienceCustomer {
  id: string;
  name: string;
  phone: string;
  optedOut: boolean;
  consentMarketing: boolean;
}

export interface OutboundAgentOptions {
  aiAgents: Array<{ id: string; name: string }>;
  humanAgents: Array<{ id: string; name: string; presenceStatus: string }>;
}

export interface OutboundCampaignMember {
  id: string;
  customerId: string;
  name: string;
  phone: string;
  optedOut: boolean;
  status: OutboundMemberStatus;
  blockReasonCode: string | null;
  eligibilityCheckedAt: string | null;
}

export interface OutboundCampaign {
  id: string;
  name: string;
  purpose: OutboundPurpose;
  callerType: OutboundCallerType;
  countryCode: string;
  timeZone: string;
  openingScript: string;
  status: OutboundCampaignStatus;
  aiAgentId: string | null;
  humanAgentProfileId: string | null;
  scheduledAt: string | null;
  maxAttemptsPerContact: number;
  retryCooldownHours: number;
  eligibilityCheckedAt: string | null;
  approvalRequestedAt: string | null;
  approvalRequestedBy: string | null;
  approvedAt: string | null;
  approvedByUserId: string | null;
  voicemailDetection: boolean;
  selectedContactCount: number;
  eligibleCount: number;
  blockedCount: number;
  members: OutboundCampaignMember[];
  callsPlaced: boolean;
  callExecution: "human_power_dialer" | "ai_agent";
  aiAgent: { id: string; name: string; status: string } | null;
  humanAgent: { id: string; name: string } | null;
}

export interface OutboundCampaignInput {
  name: string;
  purpose: OutboundPurpose;
  callerType: OutboundCallerType;
  countryCode: string;
  timeZone: string;
  openingScript: string;
  aiAgentId?: string | null;
  humanAgentProfileId?: string | null;
  scheduledAt?: string | null;
  maxAttemptsPerContact: number;
  retryCooldownHours: number;
  voicemailDetection?: boolean;
  customerIds: string[];
}

export interface OutboundEligibilityPreview {
  campaignId: string;
  checkedAt: string;
  selectedCount: number;
  eligibleCount: number;
  blockedCount: number;
  blockedReasonCounts: Record<string, number>;
  members: Array<{
    memberId: string;
    customerId: string;
    name: string;
    phone: string;
    eligible: boolean;
    reasonCode: string;
    decisionId: string | null;
  }>;
  callsPlaced: false;
  message: string;
  limitations: {
    externalDoNotCallRegistry: "not_configured";
    callProviderExecution: "human_power_dialer" | "ai_agent" | "not_available";
    providerCostEstimate: "not_available";
  };
}

export function fetchOutboundAudience(): Promise<OutboundAudienceCustomer[]> {
  return apiFetch("/voice/outbound/audience");
}

export function fetchOutboundAgents(): Promise<OutboundAgentOptions> {
  return apiFetch("/voice/outbound/agents");
}

export function fetchOutboundCampaigns(): Promise<OutboundCampaign[]> {
  return apiFetch("/voice/campaigns");
}

export function createOutboundCampaign(
  input: OutboundCampaignInput,
): Promise<OutboundCampaign> {
  return apiFetch("/voice/campaigns", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateOutboundCampaign(
  id: string,
  input: OutboundCampaignInput,
): Promise<OutboundCampaign> {
  return apiFetch(`/voice/campaigns/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function previewOutboundCampaign(
  id: string,
): Promise<OutboundEligibilityPreview> {
  return apiFetch(`/voice/campaigns/${id}/eligibility-preview`, {
    method: "POST",
  });
}

export interface DialAttempt {
  id: string;
  memberId: string;
  contactName: string;
  phone: string;
  status: DialAttemptStatus;
  blockReasonCode: string | null;
  customerDialed: boolean;
  durationSec: number | null;
  disposition: DialDisposition | null;
  createdAt: string;
  answeredAt: string | null;
  endedAt: string | null;
}

export interface CampaignRunStatus {
  campaignId: string;
  status: OutboundCampaignStatus;
  startedAt: string | null;
  pausedAt: string | null;
  stoppedAt: string | null;
  attemptCounts: Partial<Record<DialAttemptStatus, number>>;
  attempts: DialAttempt[];
}

export interface DialerNext {
  campaignId: string;
  campaignStatus: OutboundCampaignStatus;
  openingScript: string;
  agentAvailable: boolean;
  inFlight: DialAttempt | null;
  awaitingDisposition: DialAttempt | null;
  contact: {
    memberId: string;
    customerId: string;
    name: string;
    phone: string;
    status: OutboundMemberStatus;
    attemptCount: number;
    maxAttempts: number;
    lastAttemptAt: string | null;
    priorAttempts: Array<{ id: string; status: DialAttemptStatus; disposition: DialDisposition | null; createdAt: string }>;
  } | null;
}

export interface DialAttemptResult {
  attemptId: string;
  placed: boolean;
  status: DialAttemptStatus;
  reasonCode: string | null;
}

export function controlOutboundCampaign(
  id: string,
  action: "start" | "pause" | "stop",
): Promise<CampaignRunStatus> {
  return apiFetch(`/voice/campaigns/${id}/${action}`, { method: "POST" });
}

export function fetchCampaignAttempts(id: string): Promise<CampaignRunStatus> {
  return apiFetch(`/voice/campaigns/${id}/attempts`);
}

export function fetchDialerNext(id: string): Promise<DialerNext> {
  return apiFetch(`/voice/campaigns/${id}/dialer/next`);
}

export function placeDialAttempt(id: string, memberId: string): Promise<DialAttemptResult> {
  return apiFetch(`/voice/campaigns/${id}/dialer/attempt`, {
    method: "POST",
    body: JSON.stringify({ memberId }),
  });
}

export function skipDialContact(id: string, memberId: string): Promise<{ memberId: string; status: OutboundMemberStatus }> {
  return apiFetch(`/voice/campaigns/${id}/dialer/skip`, {
    method: "POST",
    body: JSON.stringify({ memberId }),
  });
}

export function saveDialDisposition(
  attemptId: string,
  disposition: DialDisposition,
  notes?: string,
): Promise<{ attemptId: string; disposition: DialDisposition }> {
  return apiFetch(`/voice/dialer/attempts/${attemptId}/disposition`, {
    method: "POST",
    body: JSON.stringify({ disposition, notes: notes || undefined }),
  });
}

export interface OutboundActivityCounts {
  attempts: number;
  blocked: number;
  customerDialed: number;
  connected: number;
  talkSeconds: number;
}

/** GET /voice/outbound/summary — power-dialer and call-back attempts since `from`. */
export function fetchOutboundSummary(from: string): Promise<{ from: string; powerDialer: OutboundActivityCounts; callbacks: OutboundActivityCounts }> {
  return apiFetch(`/voice/outbound/summary?from=${encodeURIComponent(from)}`);
}

export interface CampaignImportResult {
  matched: number;
  created: number;
  alreadyInCampaign: number;
  skipped: { row: number; reason: string }[];
  memberCount: number;
}

export interface CampaignReport {
  campaignId: string;
  status: OutboundCampaignStatus;
  contacts: number;
  memberStatus: Record<string, number>;
  attempts: number;
  attemptStatus: Record<string, number>;
  customerDialed: number;
  connected: number;
  connectRate: number | null;
  voicemails: number | "not_available";
  blockedAttempts: number;
  blockedRate: number | null;
  blockedReasons: Record<string, number>;
  dispositions: Record<string, number>;
  optOuts: number;
  averageDialsPerContactedContact: number | null;
  talkSeconds: number;
  providerCost: "not_available";
}

export function importCampaignContacts(id: string, rows: { name: string; phone: string; email?: string }[]): Promise<CampaignImportResult> {
  return apiFetch(`/voice/campaigns/${id}/import`, { method: "POST", body: JSON.stringify({ rows }) });
}

export function campaignApprovalAction(id: string, action: "request-approval" | "approve" | "send-back"): Promise<CampaignRunStatus> {
  return apiFetch(`/voice/campaigns/${id}/${action}`, { method: "POST" });
}

export function fetchCampaignReport(id: string): Promise<CampaignReport> {
  return apiFetch(`/voice/campaigns/${id}/report`);
}
