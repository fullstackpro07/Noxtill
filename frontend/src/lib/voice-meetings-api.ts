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

export interface VoiceVideoMeeting {
  id: string;
  title: string;
  scheduledAt: string;
  durationMin: number;
  timeZone: string;
  status: VoiceMeetingStatus;
  host: { id: string; name: string };
  customer: { id: string; name: string } | null;
  appointment: { id: string; bookingNo: string | null; status: string } | null;
  inviteCount: number;
  invites: VoiceMeetingInviteSummary[];
  media: "not_configured";
  recording: "not_available";
}

export interface VoiceMeetingInput {
  title: string;
  scheduledAt: string;
  durationMin: number;
  timeZone: string;
  hostBusinessUserId: string;
  appointmentId?: string | null;
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
  mediaAvailable: false;
  message: string;
}

export function fetchVoiceMeetingHosts(): Promise<VoiceMeetingHost[]> {
  return apiFetch("/voice/meetings/hosts");
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

