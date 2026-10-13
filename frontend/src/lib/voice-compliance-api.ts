import { apiFetch } from "@/lib/api-client";

export type VoicePolicyCallerType = "ai_voice" | "live_agent" | "prerecorded";
export type VoiceCompliancePolicyStatus = "draft" | "published" | "superseded" | "disabled" | "unapproved";

export interface VoiceCompliancePolicyVersion {
  id: string;
  version: number;
  status: Exclude<VoiceCompliancePolicyStatus, "disabled" | "unapproved">;
  aiDisclosureText: string;
  recordingAllowed: boolean;
  recordingNoticeText: string | null;
  recordingRetentionDays: number | null;
  allowedWindowStart: string | null;
  allowedWindowEnd: string | null;
  timeZone: string | null;
  legalReviewReference: string | null;
  publishedAt: string | null;
  createdAt: string;
}

export interface VoiceCompliancePolicyPack {
  id: string;
  countryCode: string;
  purpose: string;
  callerType: VoicePolicyCallerType;
  disabledAt: string | null;
  disabledReason: string | null;
  latestVersion: number | null;
  effectiveVersion: number | null;
  status: VoiceCompliancePolicyStatus;
  versions: VoiceCompliancePolicyVersion[];
}

export interface VoiceComplianceOverview {
  policyPacks: number;
  policiesPublished: number;
  unapprovedPolicyPacks: number;
  verifiedActiveConsents: number;
  activeFirstPartySuppressions: number;
  blockedChecksLast30Days: number;
  externalSuppressionRegistry: "not_configured";
  numberOwnershipProof: "not_tracked";
  retentionJobStatus: "see_phone_settings";
}

export interface VoiceConsentEvidence {
  id: string;
  phone: string;
  purpose: string;
  callerType: VoicePolicyCallerType | null;
  source: string;
  legalBasis: string;
  evidenceReference: string;
  noticeText: string;
  verifiedAt: string;
  grantedAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  revocationReason: string | null;
}

export interface VoiceSuppressionEntry {
  id: string;
  phone: string;
  purpose: string | null;
  source: string;
  reason: string;
  effectiveAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  revocationReason: string | null;
}

export interface VoiceEligibilityDecision {
  id: string;
  phone: string;
  countryCode: string;
  purpose: string;
  callerType: VoicePolicyCallerType;
  allowed: boolean;
  reasonCode: string;
  policyVersion: number | null;
  evaluatedAt: string;
}

export interface VoiceEligibilityResult {
  id: string;
  phone: string;
  allowed: boolean;
  reasonCode: string;
  message: string;
  policyVersion: number | null;
  evaluatedAt: string;
  callPlaced: false;
}

export interface VoiceCompliancePolicyInput {
  countryCode: string;
  purpose: string;
  callerType: VoicePolicyCallerType;
  aiDisclosureText: string;
  recordingAllowed: boolean;
  recordingNoticeText?: string | null;
  recordingRetentionDays?: number | null;
  allowedWindowStart?: string | null;
  allowedWindowEnd?: string | null;
  timeZone?: string | null;
}

export interface VoiceCompliancePolicyVersionInput {
  aiDisclosureText: string;
  recordingAllowed: boolean;
  recordingNoticeText?: string | null;
  recordingRetentionDays?: number | null;
  allowedWindowStart?: string | null;
  allowedWindowEnd?: string | null;
  timeZone?: string | null;
}

export function fetchVoiceComplianceOverview(): Promise<VoiceComplianceOverview> {
  return apiFetch("/voice/compliance/overview");
}

export function fetchVoiceCompliancePolicies(): Promise<VoiceCompliancePolicyPack[]> {
  return apiFetch("/voice/compliance/policy-packs");
}

export function createVoiceCompliancePolicy(input: VoiceCompliancePolicyInput): Promise<VoiceCompliancePolicyPack> {
  return apiFetch("/voice/compliance/policy-packs", { method: "POST", body: JSON.stringify(input) });
}

export function createVoiceCompliancePolicyVersion(packId: string, input: VoiceCompliancePolicyVersionInput): Promise<{ id: string; version: number; status: "draft" }> {
  return apiFetch(`/voice/compliance/policy-packs/${packId}/versions`, { method: "POST", body: JSON.stringify(input) });
}

export function publishVoiceCompliancePolicy(versionId: string, legalReviewReference: string): Promise<{ id: string; version: number; status: "published" }> {
  return apiFetch(`/voice/compliance/policy-versions/${versionId}/publish`, { method: "POST", body: JSON.stringify({ legalReviewReference, confirmLegalReview: true }) });
}

export function disableVoiceCompliancePolicy(packId: string, reason: string): Promise<{ id: string; status: "disabled" }> {
  return apiFetch(`/voice/compliance/policy-packs/${packId}/disable`, { method: "POST", body: JSON.stringify({ reason }) });
}

export function fetchVoiceConsents(): Promise<VoiceConsentEvidence[]> {
  return apiFetch("/voice/compliance/consents");
}

export function createVoiceConsent(input: {
  phoneE164: string;
  purpose: string;
  callerType?: VoicePolicyCallerType;
  source: string;
  noticeText: string;
  evidenceReference: string;
  legalBasis: string;
  grantedAt: string;
  expiresAt?: string | null;
  evidenceReviewed: true;
}): Promise<{ id: string; phone: string; verified: true }> {
  return apiFetch("/voice/compliance/consents", { method: "POST", body: JSON.stringify(input) });
}

export function revokeVoiceConsent(id: string, reason: string): Promise<{ id: string; revokedAt: string }> {
  return apiFetch(`/voice/compliance/consents/${id}/revoke`, { method: "POST", body: JSON.stringify({ reason }) });
}

export function fetchVoiceSuppressions(): Promise<VoiceSuppressionEntry[]> {
  return apiFetch("/voice/compliance/suppressions");
}

export function createVoiceSuppression(input: {
  phoneE164: string;
  purpose?: string | null;
  source: string;
  reason: string;
  effectiveAt: string;
  expiresAt?: string | null;
}): Promise<{ id: string; phone: string; active: true }> {
  return apiFetch("/voice/compliance/suppressions", { method: "POST", body: JSON.stringify(input) });
}

export function revokeVoiceSuppression(id: string, reason: string): Promise<{ id: string; revokedAt: string }> {
  return apiFetch(`/voice/compliance/suppressions/${id}/revoke`, { method: "POST", body: JSON.stringify({ reason }) });
}

export function checkVoiceEligibility(input: {
  phoneE164: string;
  countryCode: string;
  purpose: string;
  callerType: VoicePolicyCallerType;
}): Promise<VoiceEligibilityResult> {
  return apiFetch("/voice/compliance/eligibility/check", { method: "POST", body: JSON.stringify(input) });
}

export function fetchVoiceComplianceAudit(): Promise<VoiceEligibilityDecision[]> {
  return apiFetch("/voice/compliance/audit");
}
