import { apiFetch } from "@/lib/api-client";

export interface VoiceTrackingCharge {
  unit: string | null;
  amount: string;
  checkedCallCount: number;
}

export interface VoiceTrackingCampaignOption {
  id: string;
  provider: string;
  goal: string;
  status: string;
}

export interface VoiceCallAttributionCorrection {
  source: string;
  channel: string | null;
  campaignId: string | null;
  campaignLabel: string | null;
  evidence: string | null;
  reason: string | null;
  updatedAt: string | null;
  /** Set when the call came in on a tracking number. */
  trackingNumber: { phoneNumber: string; label: string } | null;
  confidence: string;
}

export interface OverrideVoiceCallAttributionInput {
  source: string;
  channel: string;
  campaignId?: string;
  evidence: string;
  reason: string;
}

export interface VoiceTrackingOverview {
  windowDays: number;
  since: string;
  generatedAt: string;
  line: {
    phoneNumber: string;
    provider: "Twilio";
    provisionedAt: string;
    scope: string;
  } | null;
  metrics: {
    inboundCalls: number;
    callLinkedBookings: number;
    completedCallBookings: number;
    manualAttributedCalls: number;
    trackingNumberCalls: number;
    activeTrackingNumbers: number;
    leads: null;
    qualifiedConversions: null;
    /** 0–1 share of calls with no dialed-number or merchant-entered source; null when no calls. */
    unknownSourceRate: number | null;
    campaignRevenue: null;
    providerCharges: VoiceTrackingCharge[];
  };
  calls: Array<{
    id: string;
    caller: string;
    status: string;
    outcome: string;
    startedAt: string;
    durationSeconds: number | null;
    routingRule: string | null;
    marketingAttribution: VoiceCallAttributionCorrection | null;
    booking: {
      bookingNo: number | null;
      status: string;
      source: string;
    } | null;
    providerCharge: {
      amount: string;
      unit: string | null;
      checkedAt: string;
    } | null;
  }>;
  campaignOptions: VoiceTrackingCampaignOption[];
  limitations: {
    marketingAttribution: string;
    campaignRevenue: string;
    leads: string;
    trackingNumbers: string;
    providerCharges: string;
  };
}

export function fetchVoiceTrackingOverview(days: number) {
  return apiFetch<VoiceTrackingOverview>(
    `/voice/tracking/overview?days=${days}`,
  );
}

export function overrideVoiceCallAttribution(
  callId: string,
  input: OverrideVoiceCallAttributionInput,
) {
  return apiFetch<{ callId: string; attribution: Record<string, unknown> }>(
    `/voice/tracking/calls/${callId}/override`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export interface VoiceTrackingNumber {
  id: string;
  phoneNumber: string;
  label: string;
  provider: "Twilio";
  provisionedVia: "purchased" | "connected";
  source: string;
  channel: string;
  campaign: { id: string; label: string } | null;
  active: boolean;
  deactivatedAt: string | null;
  callsLast30Days: number;
  lastCallAt: string | null;
  assignments: Array<{
    id: string;
    source: string;
    channel: string;
    campaignId: string | null;
    validFrom: string;
    validTo: string | null;
    reason: string;
  }>;
}

export interface AddVoiceTrackingNumberInput {
  mode: "purchase" | "connect";
  label: string;
  source: string;
  channel: string;
  campaignId?: string;
  phoneNumber?: string;
  countryCode?: string;
  areaCode?: string;
}

export function fetchVoiceTrackingNumbers() {
  return apiFetch<VoiceTrackingNumber[]>("/voice/tracking/numbers");
}

export function addVoiceTrackingNumber(input: AddVoiceTrackingNumberInput) {
  return apiFetch<{ id: string; phoneNumber: string; provisionedVia: string }>(
    "/voice/tracking/numbers",
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function assignVoiceTrackingNumber(
  id: string,
  input: { source: string; channel: string; campaignId?: string; reason: string },
) {
  return apiFetch<{ id: string }>(`/voice/tracking/numbers/${id}/assign`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function deactivateVoiceTrackingNumber(id: string, reason: string) {
  return apiFetch<{ id: string; active: false }>(
    `/voice/tracking/numbers/${id}/deactivate`,
    { method: "POST", body: JSON.stringify({ reason }) },
  );
}
