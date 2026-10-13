import { apiFetch } from "@/lib/api-client";

export type OutboundPurpose = "service" | "callback" | "marketing";
export type OutboundCallerType = "ai_voice" | "live_agent";
export type OutboundMemberStatus = "selected" | "eligible" | "blocked";

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
  status: string;
  aiAgentId: string | null;
  humanAgentProfileId: string | null;
  scheduledAt: string | null;
  maxAttemptsPerContact: number;
  retryCooldownHours: number;
  eligibilityCheckedAt: string | null;
  selectedContactCount: number;
  eligibleCount: number;
  blockedCount: number;
  members: OutboundCampaignMember[];
  callsPlaced: false;
  callExecution: "not_configured";
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
    callProviderExecution: "not_configured";
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
