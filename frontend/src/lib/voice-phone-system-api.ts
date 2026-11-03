import { apiFetch } from "@/lib/api-client";

export interface VoiceSipTrunkInfo {
  sid: string;
  verified: boolean;
  name?: string | null;
  domain?: string | null;
  originationUrls?: { sipUrl: string; enabled: boolean }[];
  phoneNumbers?: string[];
  businessLineOnTrunk?: boolean;
  detail: string;
}

export interface VoicePhoneSystem {
  testCallerNumbers: string[];
  sipTrunk: VoiceSipTrunkInfo | null;
}

export function fetchVoicePhoneSystem(): Promise<VoicePhoneSystem> {
  return apiFetch("/voice/settings/phone-system");
}

export function saveVoiceTestNumbers(numbers: string[]): Promise<{ testCallerNumbers: string[] }> {
  return apiFetch("/voice/settings/test-numbers", { method: "PUT", body: JSON.stringify({ numbers }) });
}

export function connectVoiceSipTrunk(sid: string): Promise<VoiceSipTrunkInfo> {
  return apiFetch("/voice/settings/sip-trunk", { method: "POST", body: JSON.stringify({ sid }) });
}

export function disconnectVoiceSipTrunk(): Promise<{ sipTrunk: null }> {
  return apiFetch("/voice/settings/sip-trunk/disconnect", { method: "POST" });
}
