import { apiFetch } from "@/lib/api-client";

export type VoiceMeetingStatus = "scheduled" | "cancelled" | "ended";

export interface VoiceMeetingHost {
  id: string;
  name: string;
  email: string;
}

export interface VoiceMeetingInviteSummary {
  id: string;
  email: string;
  guestName: string | null;
  expiresAt: string;
  /** Set only after the email provider accepted the invite email. */
  emailSentAt: string | null;
}

export interface VoiceMeetingRecordingPolicy {
  id: string;
  version: number;
  countryCode: string;
  purpose: string;
  callerType: string;
  notice: string;
  retentionDays: number;
  aiProcessingAllowed: boolean;
}

export interface VoiceMeetingRecordingConsentState {
  recordingId: string;
  status: string;
  notice: string;
}

export interface VoiceMeetingArtifacts {
  configured: boolean;
  recordings: Array<{
    id: string;
    status: string;
    regionCode: string;
    startedAt: string | null;
    endedAt: string | null;
    finalizedAt: string | null;
    durationSeconds: string | null;
    sizeBytes: string | null;
    expiresAt: string;
    failureMessage: string | null;
    downloadUrl: string | null;
    aiProcessingAllowed: boolean;
    artifactStatus: string;
    transcriptText: string | null;
    generatedSummary: string | null;
    followUpDraft: string | null;
    artifactFailureMessage: string | null;
    confidence: "not_calibrated" | null;
    customerLinked: boolean;
    followUpDraftCreated: boolean;
    consents: Array<{ role: string; decision: string; source: string; decidedAt: string | null; revokedAt: string | null; noticeHash: string }>;
  }>;
}

export interface VoiceVideoMeeting {
  id: string;
  title: string;
  scheduledAt: string;
  durationMin: number;
  timeZone: string;
  status: VoiceMeetingStatus;
  roomState: string;
  host: { id: string; name: string };
  customer: { id: string; name: string } | null;
  appointment: { id: string; bookingNo: string | null; status: string } | null;
  inviteCount: number;
  invites: VoiceMeetingInviteSummary[];
  media: "not_configured" | "configured";
  recording: string;
  recordingExpiresAt: string | null;
  recordingFinalizedAt: string | null;
  recordingSizeBytes: string | null;
}

export interface VoiceMeetingInput {
  title: string;
  scheduledAt: string;
  durationMin: number;
  timeZone: string;
  hostBusinessUserId: string;
  appointmentId?: string | null;
  recordingPolicyVersionId?: string | null;
}

export interface VoiceMeetingInviteCreated {
  id: string;
  token: string;
  sharePath: string;
  expiresAt: string;
  emailDelivery: "sent" | "failed" | "not_configured";
}

export interface PublicVoiceMeetingInvite {
  title: string;
  businessName: string;
  scheduledAt: string;
  durationMin: number;
  timeZone: string;
  expiresAt: string;
  mediaAvailable: boolean;
  message: string;
}

export interface VoiceMeetingJoinToken {
  meetingId: string;
  role: "host" | "guest";
  url: string;
  token: string;
  roomName: string;
  expiresAt: string;
  screenShare: boolean;
  recording: "consent_gated";
}

export function fetchVoiceMeetingHosts(): Promise<VoiceMeetingHost[]> {
  return apiFetch("/voice/meetings/hosts");
}

export function fetchVoiceMeetingConfiguration(): Promise<{ mediaConfigured: boolean; screenSharing: "host_only"; recording: "configured" | "not_configured"; chat: "not_available" }> {
  return apiFetch("/voice/meetings/configuration");
}

export function fetchVoiceMeetingRecordingPolicies(): Promise<VoiceMeetingRecordingPolicy[]> {
  return apiFetch("/voice/meetings/recording-policies");
}

export function prepareVoiceMeetingRecording(id: string): Promise<{ id: string; status: string; pendingConsentCount: number; message: string }> {
  return apiFetch(`/voice/meetings/${encodeURIComponent(id)}/recordings/consent`, { method: "POST", body: JSON.stringify({ accepted: true }) });
}

export function startVoiceMeetingRecording(id: string): Promise<{ id: string; status: string; message: string }> {
  return apiFetch(`/voice/meetings/${encodeURIComponent(id)}/recordings/start`, { method: "POST" });
}

export function stopVoiceMeetingRecording(id: string, reason: string): Promise<{ id: string; status: string; message?: string }> {
  return apiFetch(`/voice/meetings/${encodeURIComponent(id)}/recordings/stop`, { method: "POST", body: JSON.stringify({ reason }) });
}

export function fetchVoiceMeetingArtifacts(id: string): Promise<VoiceMeetingArtifacts> {
  return apiFetch(`/voice/meetings/${encodeURIComponent(id)}/recordings`);
}

export function requestVoiceMeetingAiArtifacts(meetingId: string, recordingId: string): Promise<{ recordingId: string; status: string; message: string }> {
  return apiFetch(`/voice/meetings/${encodeURIComponent(meetingId)}/recordings/${encodeURIComponent(recordingId)}/ai-artifacts`, { method: "POST" });
}

export function createVoiceMeetingFollowUpDraft(meetingId: string, recordingId: string): Promise<{ id: string; status: string; sent: false }> {
  return apiFetch(`/voice/meetings/${encodeURIComponent(meetingId)}/recordings/${encodeURIComponent(recordingId)}/follow-up-draft`, { method: "POST" });
}

export function fetchVoiceMeetings(): Promise<VoiceVideoMeeting[]> {
  return apiFetch("/voice/meetings");
}

export function createVoiceMeeting(input: VoiceMeetingInput): Promise<VoiceVideoMeeting> {
  return apiFetch("/voice/meetings", { method: "POST", body: JSON.stringify(input) });
}

export function rescheduleVoiceMeeting(id: string, scheduledAt: string, durationMin: number): Promise<VoiceVideoMeeting> {
  return apiFetch(`/voice/meetings/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ scheduledAt, durationMin }),
  });
}

export function cancelVoiceMeeting(id: string, reason: string): Promise<VoiceVideoMeeting> {
  return apiFetch(`/voice/meetings/${id}/cancel`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function createVoiceMeetingInvite(id: string, email: string, guestName?: string): Promise<VoiceMeetingInviteCreated> {
  return apiFetch(`/voice/meetings/${id}/invites`, {
    method: "POST",
    body: JSON.stringify({ email, guestName: guestName || undefined }),
  });
}

export function revokeVoiceMeetingInvite(meetingId: string, inviteId: string, reason: string): Promise<{ id: string; revokedAt: string }> {
  return apiFetch(`/voice/meetings/${meetingId}/invites/${inviteId}/revoke`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function fetchPublicVoiceMeetingInvite(token: string): Promise<PublicVoiceMeetingInvite> {
  return apiFetch(`/voice/meeting-invites/${encodeURIComponent(token)}`, {}, { skipAuth: true });
}

export function createVoiceMeetingHostJoinToken(id: string): Promise<VoiceMeetingJoinToken> {
  return apiFetch(`/voice/meetings/${encodeURIComponent(id)}/join-token`, { method: "POST" });
}

export type VoiceMeetingGuestAccess = VoiceMeetingJoinToken | { status: string; message: string; recordingConsent?: VoiceMeetingRecordingConsentState };

export function createVoiceMeetingGuestJoinToken(token: string): Promise<VoiceMeetingGuestAccess> {
  return apiFetch(`/voice/meeting-invites/${encodeURIComponent(token)}/join-token`, { method: "POST" }, { skipAuth: true });
}

export interface VoiceMeetingLobby {
  meetingId: string;
  roomState: string;
  endRequestedAt: string | null;
  guestLimit: number;
  tokenNotice: string;
  recording: {
    configured: boolean;
    latest: null | {
      id: string;
      status: string;
      noticeSnapshot: string;
      aiProcessingAllowed: boolean;
      regionCode: string;
      retentionExpiresAt: string;
      participants: Array<{ participantId: string | null; displayName: string; role: string; decision: string; decidedAt: string | null }>;
    };
  } | null;
  recordingPolicy: null | { version: number; countryCode: string; purpose: string; notice: string | null; allowed: boolean; aiProcessingAllowed: boolean; retentionDays: number | null };
  participants: Array<{
    id: string;
    role: string;
    name: string;
    admission: string;
    inviteValid: boolean;
    requestedAt: string;
    providerJoinedAt: string | null;
    providerLeftAt: string | null;
  }>;
}

export function fetchVoiceMeetingGuestLobby(token: string): Promise<{ status: string; message: string; recordingConsent: VoiceMeetingRecordingConsentState | null }> {
  return apiFetch(`/voice/meeting-invites/${encodeURIComponent(token)}/lobby`, {}, { skipAuth: true });
}

export function recordGuestConsent(token: string, recordingId: string, accepted: boolean): Promise<{ accepted: boolean; status: string }> {
  return apiFetch(`/voice/meeting-invites/${encodeURIComponent(token)}/recordings/${encodeURIComponent(recordingId)}/consent`, { method: "POST", body: JSON.stringify({ accepted }) }, { skipAuth: true });
}
export function fetchVoiceMeetingLobby(id: string): Promise<VoiceMeetingLobby> {
  return apiFetch(`/voice/meetings/${encodeURIComponent(id)}/lobby`);
}
export function decideVoiceMeetingGuest(id: string, participantId: string, admission: "admitted" | "denied", reason: string): Promise<{ admission: string }> {
  return apiFetch(`/voice/meetings/${encodeURIComponent(id)}/participants/${encodeURIComponent(participantId)}/admission`, { method: "POST", body: JSON.stringify({ admission, reason }) });
}
export function moderateVoiceMeetingGuest(id: string, participantId: string, action: "mute" | "remove", reason: string): Promise<{ message: string; providerRequest: "accepted" | "pending" }> {
  return apiFetch(`/voice/meetings/${encodeURIComponent(id)}/participants/${encodeURIComponent(participantId)}/moderate`, { method: "POST", body: JSON.stringify({ action, reason }) });
}
export function endVoiceMeeting(id: string, reason: string): Promise<{ status: string }> {
  return apiFetch(`/voice/meetings/${encodeURIComponent(id)}/end`, { method: "POST", body: JSON.stringify({ reason }) });
}

