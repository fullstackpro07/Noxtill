import { apiFetch } from "@/lib/api-client";

export type VoiceQualityReviewStatus = "assigned" | "in_progress" | "submitted" | "overridden";

export interface VoiceQualityCriterion {
  key: string;
  label: string;
  weight: number;
  guidance: string;
}

export interface VoiceQualityRubricVersion {
  id: string;
  version: number;
  criteria: VoiceQualityCriterion[];
  publishedAt: string | null;
  createdAt: string;
}

export interface VoiceQualityRubric {
  id: string;
  name: string;
  active: boolean;
  createdAt: string;
  versions: VoiceQualityRubricVersion[];
}

export interface VoiceQualityScore {
  criterionKey: string;
  score: number;
  evidenceTurnIndexes: number[];
  note: string | null;
}

export interface VoiceQualityReview {
  id: string;
  status: VoiceQualityReviewStatus;
  assignedToUserId: string | null;
  reviewerUserId: string | null;
  scores: VoiceQualityScore[];
  computedScore: number | null;
  overrideScore: number | null;
  effectiveScore: number | null;
  overrideReason: string | null;
  overriddenByUserId: string | null;
  submittedAt: string | null;
  createdAt: string;
  updatedAt: string;
  rubric: {
    id: string;
    name: string;
    versionId: string;
    version: number;
    criteria: VoiceQualityCriterion[];
  } | null;
  call: {
    id: string;
    status: string;
    outcome: string;
    fromNumber: string;
    startedAt: string;
    endedAt: string | null;
    durationSeconds: number | null;
    hasRecording: boolean;
    recordingDeleted: boolean;
    voiceAgentVersionId: string | null;
    transcript: Array<{ index: number; speaker: string; text: string; at: string | null }>;
  } | null;
}

export interface VoiceQualityOverview {
  periodDays: number;
  processedCalls: number;
  sampleCount: number;
  missingRecordings: number;
  reviewBacklog: number;
  evaluatedAgentVersions: number;
  languageCoverage: null;
  languageCoverageStatus: "not_tracked";
  speechRecognitionAccuracy: null;
  speechRecognitionAccuracyStatus: "not_benchmarked";
}

export interface VoiceQualityRubricInput {
  name: string;
  criteria: VoiceQualityCriterion[];
}

export interface VoiceQualityScoresInput {
  scores: Array<{
    criterionKey: string;
    score: number;
    evidenceTurnIndexes: number[];
    note?: string;
  }>;
}

export interface VoiceQualityAiSuggestion {
  scores: VoiceQualityScore[];
  inputTokens: number;
  outputTokens: number;
  saved: false;
}

export function fetchVoiceQualityOverview(): Promise<VoiceQualityOverview> {
  return apiFetch("/voice/quality/overview");
}

export function fetchVoiceQualityRubrics(): Promise<VoiceQualityRubric[]> {
  return apiFetch("/voice/quality/rubrics");
}

export function fetchVoiceQualityReviews(): Promise<VoiceQualityReview[]> {
  return apiFetch("/voice/quality/reviews");
}

export function createVoiceQualityRubric(input: VoiceQualityRubricInput): Promise<VoiceQualityRubric> {
  return apiFetch("/voice/quality/rubrics", { method: "POST", body: JSON.stringify(input) });
}

export function createVoiceQualityDraftVersion(rubricId: string, input: VoiceQualityRubricInput): Promise<VoiceQualityRubricVersion> {
  return apiFetch(`/voice/quality/rubrics/${rubricId}/versions`, { method: "POST", body: JSON.stringify(input) });
}

export function publishVoiceQualityRubricVersion(versionId: string): Promise<VoiceQualityRubricVersion> {
  return apiFetch(`/voice/quality/rubric-versions/${versionId}/publish`, { method: "POST" });
}

export function startVoiceQualityReview(callId: string): Promise<VoiceQualityReview> {
  return apiFetch(`/voice/quality/calls/${callId}/reviews`, { method: "POST" });
}

export function suggestVoiceQualityReview(reviewId: string): Promise<VoiceQualityAiSuggestion> {
  return apiFetch(`/voice/quality/reviews/${reviewId}/ai-suggestions`, { method: "POST" });
}

export function saveVoiceQualityReview(reviewId: string, input: VoiceQualityScoresInput): Promise<VoiceQualityReview> {
  return apiFetch(`/voice/quality/reviews/${reviewId}`, { method: "PATCH", body: JSON.stringify(input) });
}

export function submitVoiceQualityReview(reviewId: string): Promise<VoiceQualityReview> {
  return apiFetch(`/voice/quality/reviews/${reviewId}/submit`, { method: "POST" });
}

export function overrideVoiceQualityReview(reviewId: string, input: { score: number; reason: string }): Promise<VoiceQualityReview> {
  return apiFetch(`/voice/quality/reviews/${reviewId}/override`, { method: "POST", body: JSON.stringify(input) });
}

export function assignVoiceQualityReview(reviewId: string, assignedToUserId: string | null): Promise<VoiceQualityReview> {
  return apiFetch(`/voice/quality/reviews/${reviewId}/assign`, { method: "POST", body: JSON.stringify({ assignedToUserId }) });
}
