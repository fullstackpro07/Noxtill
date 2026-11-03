import { apiFetch } from "@/lib/api-client";

export type VoicePresenceStatus = "offline" | "available" | "busy" | "away";

export interface VoiceAgentRosterRow {
  id: string;
  staffUserId: string;
  userId: string;
  name: string;
  phone: string | null;
  role: "owner" | "manager" | "staff";
  skillTags: string[];
  languages: string[];
  maxConcurrentCalls: number;
  active: boolean;
  presenceStatus: VoicePresenceStatus;
  lastHeartbeatAt: string | null;
  presenceExpired: boolean;
  liveCalls: number;
  isSelf: boolean;
}

export interface VoiceAgentRoster {
  metrics: {
    humanAgents: number;
    markedAvailable: number;
    ongoingCalls: number;
    followUpsWaiting: number;
    configuredConcurrency: number;
    expiredPresence: number;
  };
  agents: VoiceAgentRosterRow[];
  staffOptions: Array<{
    id: string;
    userId: string;
    name: string;
    phone: string | null;
    role: "owner" | "manager" | "staff";
  }>;
  limitations: {
    browserSoftphone: "not_configured";
    queueMembership: "not_configured";
    presenceBasedAssignment: "automatic_ai_transfer_only";
    skillRouting: "classified_topic_preference_with_general_fallback";
    presenceTtlSeconds: number;
  };
}

export interface SaveVoiceAgentInput {
  skillTags: string[];
  languages: string[];
  maxConcurrentCalls: number;
  active?: boolean;
}

export function fetchVoiceAgentRoster(): Promise<VoiceAgentRoster> {
  return apiFetch("/voice/agents");
}

export function saveVoiceHumanAgent(
  staffUserId: string,
  input: SaveVoiceAgentInput,
): Promise<{ id: string; staffUserId: string; name: string; skillTags: string[]; languages: string[]; maxConcurrentCalls: number; active: boolean }> {
  return apiFetch(`/voice/agents/human/${staffUserId}`, {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export function updateMyVoicePresence(
  status: VoicePresenceStatus,
): Promise<{ status: VoicePresenceStatus; lastHeartbeatAt: string | null; expiresInSeconds: number }> {
  return apiFetch("/voice/agents/presence/heartbeat", {
    method: "POST",
    body: JSON.stringify({ status }),
  });
}
