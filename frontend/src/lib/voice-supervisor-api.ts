import { apiFetch } from "@/lib/api-client";

export interface VoiceSupervisorLiveCall {
  id: string;
  caller: string;
  startedAt: string;
  elapsedSeconds: number;
  handler: "none" | "human_joined" | "ai_to_human" | "ai";
  sentiment: "positive" | "neutral" | "negative" | "frustrated" | null;
  confidence: "high" | "medium" | "low" | null;
  lowConfidenceTurns: number;
  recording: "saved" | "deleted" | "not_saved_yet";
  joinedAt: string | null;
  joinedByName: string | null;
  activeHumanAgent: { name: string; attemptNumber: number } | null;
}

export interface VoiceSupervisorAgent {
  id: string;
  name: string;
  role: "owner" | "manager" | "staff";
  status: "offline" | "available" | "busy" | "away";
  active: boolean;
  skills: string[];
  languages: string[];
  liveCalls: number;
  maxConcurrentCalls: number;
  presenceExpired: boolean;
}

export interface VoiceSupervisorSnapshot {
  generatedAt: string;
  timezone: string;
  metrics: {
    activeCalls: number;
    onlineAgents: number;
    availableAgents: number;
    busyAgents: number;
    callbackBacklog: number;
    configuredCapacity: number;
    waitingCalls: null;
    longestWaitSeconds: null;
    slaAtRisk: null;
    aiErrors: null;
  };
  calls: VoiceSupervisorLiveCall[];
  agents: VoiceSupervisorAgent[];
  limitations: {
    waitingCalls: string;
    sla: string;
    aiErrors: string;
    language: string;
    whisperAndBarge: string;
    monitoring: string;
    identity: string;
  };
}

export function fetchVoiceSupervisorLive(): Promise<VoiceSupervisorSnapshot> {
  return apiFetch<VoiceSupervisorSnapshot>("/voice/supervisor/live");
}
