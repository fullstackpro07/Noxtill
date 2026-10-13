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
    leads: null;
    qualifiedConversions: null;
    unknownSourceRate: null;
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
