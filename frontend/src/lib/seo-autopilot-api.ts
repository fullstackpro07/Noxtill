import { apiFetch } from "@/lib/api-client";

export type SeoAutopilotDataStatus =
  "no_data" | "stale" | "partial" | "available";

export interface SeoAutopilotOverview {
  checkedAt: string;
  dataStatus: SeoAutopilotDataStatus;
  trackedKeywords: number;
  rankedKeywords: number;
  topTen: number;
  improving: number;
  declining: number;
  needsFreshCheck: number;
  openAuditIssues: number;
  lastCheckedAt: string | null;
  unsupported: { key: string; reason: string }[];
}

export interface SeoAuditPage {
  url: string;
  finalUrl: string;
  statusCode: number;
  contentType: string;
  title: string | null;
  description: string | null;
  h1Count: number | null;
  imagesMissingAlt: number | null;
  canonicalUrl: string | null;
  noindex: boolean;
}

export interface SeoAuditIssue {
  type: string;
  severity: "critical" | "high" | "medium" | "low";
  url: string;
  evidence: string;
  recommendation: string;
}

export interface SeoAuditRun {
  id: string;
  status: "running" | "completed" | "partial" | "failed";
  triggeredBy: "manual" | "schedule";
  siteUrl: string;
  finalUrl: string | null;
  pagesDiscovered: number;
  pagesCrawled: number;
  issuesFound: number;
  pages: SeoAuditPage[];
  issues: SeoAuditIssue[];
  warnings: string[];
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

export type SeoAuditIntervalHours = 24 | 168 | 720;

export interface SeoAuditSchedule {
  id: string | null;
  enabled: boolean;
  intervalHours: SeoAuditIntervalHours;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastRunId: string | null;
  lastStatus: "running" | "completed" | "partial" | "failed" | null;
  lastError: string | null;
  configured: boolean;
  updatedAt?: string;
}

export function fetchSeoAuditSchedule(): Promise<SeoAuditSchedule> {
  return apiFetch<SeoAuditSchedule>("/seo-autopilot/audit-schedule");
}

export function saveSeoAuditSchedule(input: {
  enabled: boolean;
  intervalHours: SeoAuditIntervalHours;
}): Promise<SeoAuditSchedule> {
  return apiFetch<SeoAuditSchedule>("/seo-autopilot/audit-schedule", {
    method: "PUT",
    body: JSON.stringify(input),
  });
}

export interface SeoAuditChanges {
  currentRunId: string;
  previousRunId: string | null;
  status: "compared" | "no_previous_audit" | "not_comparable";
  comparedPageCount: number;
  skippedCurrentPageCount: number;
  skippedPreviousPageCount: number;
  newIssues: SeoAuditIssue[];
  resolvedIssues: SeoAuditIssue[];
  reason: string | null;
}

export type SeoAuditIssueStatus = "open" | "resolved" | "ignored";

export interface SeoAuditIssueHistoryEvent {
  id: string;
  action: string;
  reason: string | null;
  createdAt: string;
}

export interface SeoAuditTrackedIssue {
  id: string;
  type: string;
  severity: SeoAuditIssue["severity"];
  pageUrl: string;
  evidence: string;
  recommendation: string;
  status: SeoAuditIssueStatus;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
  ignoredAt: string | null;
  ignoreReason: string | null;
  auditEvents: SeoAuditIssueHistoryEvent[];
}

export function fetchSeoAutopilotOverview(): Promise<SeoAutopilotOverview> {
  return apiFetch<SeoAutopilotOverview>("/seo-autopilot/overview");
}

export function fetchSeoAuditRuns(): Promise<SeoAuditRun[]> {
  return apiFetch<SeoAuditRun[]>("/seo-autopilot/audits");
}

export function fetchSeoAuditChanges(id: string): Promise<SeoAuditChanges> {
  return apiFetch<SeoAuditChanges>(`/seo-autopilot/audits/${id}/changes`);
}

export function fetchSeoAuditIssues(
  status: SeoAuditIssueStatus,
): Promise<SeoAuditTrackedIssue[]> {
  return apiFetch<SeoAuditTrackedIssue[]>(
    `/seo-autopilot/issues?status=${encodeURIComponent(status)}`,
  );
}

export function ignoreSeoAuditIssue(
  id: string,
  reason: string,
): Promise<SeoAuditTrackedIssue> {
  return apiFetch<SeoAuditTrackedIssue>(`/seo-autopilot/issues/${id}/ignore`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function reopenSeoAuditIssue(
  id: string,
  reason: string,
): Promise<SeoAuditTrackedIssue> {
  return apiFetch<SeoAuditTrackedIssue>(`/seo-autopilot/issues/${id}/reopen`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
}

export function runSeoSiteAudit(): Promise<SeoAuditRun> {
  return apiFetch<SeoAuditRun>("/seo-autopilot/audits", { method: "POST" });
}

export type SeoLocalKeywordMovement =
  | "improving"
  | "declining"
  | "unchanged"
  | "newly_found"
  | "not_found"
  | "not_comparable";

export interface SeoLocalLocation {
  businessId: string;
  locationName: string;
  listingName: string | null;
  city: string | null;
  address: string | null;
  listing: {
    configured: boolean;
    missingFields: string[];
    missingHours: boolean;
    missingCategories: boolean;
    categories: string[];
    listingUrl: string;
    issues: number;
  };
  citations: {
    total: number;
    stale: number;
    mismatchCount: number;
    records: {
      provider: string;
      syncedAt: string;
      ageDays: number;
      mismatchedFields: string[];
      status: "stale" | "matches_snapshot";
    }[];
    sourceNote: string;
  };
  reviews90Days: { since: string; count: number; averageStars: number | null };
  localKeywords: {
    tracked: number;
    improving: number;
    declining: number;
    unchanged: number;
    records: {
      id: string;
      keyword: string;
      currentRank: number | null;
      previousRank: number | null;
      positionsGained: number | null;
      movement: SeoLocalKeywordMovement;
      checkedAt: string | null;
      comparedAt: string | null;
    }[];
  };
  localPack: {
    scanId: string;
    keyword: string;
    scannedAt: string;
    visiblePoints: number;
    totalPoints: number;
    sharePercent: number | null;
  } | null;
  cityMentions: {
    crawlStartedAt: string | null;
    pageCount: number | null;
    pages: { url: string; title: string | null; mentionFields: string[] }[];
    checkedFields: string[];
  };
}

export interface SeoLocalOverview {
  generatedAt: string;
  summary: {
    locations: number;
    locationsWithListingIssues: number;
    missingListingFields: number;
    staleCitations: number;
    citationSnapshots: number;
    reviewCount90Days: number;
    averageReviewStars90Days: number | null;
    localKeywords: number;
    improvingLocalKeywords: number;
    decliningLocalKeywords: number;
    localPack: {
      visiblePoints: number;
      totalPoints: number;
      sharePercent: number | null;
      locationsWithScan: number;
    };
  };
  locations: SeoLocalLocation[];
  disclosures: {
    localSchema: "Not tracked";
    listingChanges: string;
    reviews: string;
    citations: string;
    localPack: string;
    cityMentions: string;
  };
}

export function fetchSeoLocalOverview(): Promise<SeoLocalOverview> {
  return apiFetch<SeoLocalOverview>("/seo-autopilot/local/overview");
}

export function createSeoLocalPageBrief(
  locationId: string,
): Promise<{ id: string; topic: string }> {
  return apiFetch<{ id: string; topic: string }>(
    `/seo-autopilot/local/locations/${encodeURIComponent(locationId)}/local-page-brief`,
    { method: "POST" },
  );
}

export type SeoOffPageKind =
  "competitor" | "resource" | "unlinked_mention" | "digital_pr" | "broken_link";
export type SeoOffPageLinkStatus = "active" | "lost" | "unverified";
export type SeoOffPagePipeline =
  "unassigned" | "guest_posting" | "link_building";

export interface SeoOffPageLink {
  id: string;
  sourceDomain: string;
  sourceUrl: string;
  targetUrl: string;
  anchorText: string | null;
  linkType: string;
  status: SeoOffPageLinkStatus;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  evidenceNote: string;
  relevanceNote: string | null;
  qualityNote: string | null;
  riskNote: string | null;
  sourceName: string;
  tracked: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SeoOffPageOpportunity {
  id: string;
  kind: SeoOffPageKind;
  title: string;
  prospectUrl: string;
  targetUrl: string | null;
  evidenceNote: string;
  relevanceNote: string;
  qualityNote: string | null;
  riskNote: string | null;
  status: "open" | "dismissed";
  pipeline: SeoOffPagePipeline;
  tracked: boolean;
  dismissReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SeoOffPageAudit {
  id: string;
  entityType: "link" | "opportunity";
  entityId: string;
  action: string;
  reason: string | null;
  actorUserId: string | null;
  createdAt: string;
}

export interface SeoOffPageOverview {
  generatedAt: string;
  summary: {
    referringDomains: number;
    newLinks: number;
    lostLinks: number;
    openOpportunities: number;
    linksWithRiskNotes: number;
    highValueOpportunities: null;
    authorityTrend: null;
    windowSince: string;
  };
  links: SeoOffPageLink[];
  opportunities: SeoOffPageOpportunity[];
  audits: SeoOffPageAudit[];
  disclosures: {
    provider: "Not configured";
    backlinkData: string;
    authority: string;
    quality: string;
    newLost: string;
  };
}

export function fetchSeoOffPageOverview(): Promise<SeoOffPageOverview> {
  return apiFetch<SeoOffPageOverview>("/seo-autopilot/off-page");
}

export function createSeoOffPageLink(
  input: Partial<
    Omit<
      SeoOffPageLink,
      | "id"
      | "sourceDomain"
      | "sourceName"
      | "tracked"
      | "createdAt"
      | "updatedAt"
    >
  > &
    Pick<SeoOffPageLink, "sourceUrl" | "targetUrl" | "evidenceNote">,
): Promise<SeoOffPageLink> {
  return apiFetch<SeoOffPageLink>("/seo-autopilot/off-page/links", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateSeoOffPageLink(
  id: string,
  input: { status?: SeoOffPageLinkStatus; tracked?: boolean; reason?: string },
): Promise<SeoOffPageLink> {
  return apiFetch<SeoOffPageLink>(
    `/seo-autopilot/off-page/links/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
}

export function createSeoOffPageOpportunity(
  input: Pick<
    SeoOffPageOpportunity,
    "kind" | "title" | "prospectUrl" | "evidenceNote" | "relevanceNote"
  > &
    Partial<
      Pick<SeoOffPageOpportunity, "targetUrl" | "qualityNote" | "riskNote">
    >,
): Promise<SeoOffPageOpportunity> {
  return apiFetch<SeoOffPageOpportunity>(
    "/seo-autopilot/off-page/opportunities",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function updateSeoOffPageOpportunity(
  id: string,
  input: {
    pipeline?: SeoOffPagePipeline;
    status?: "open" | "dismissed";
    tracked?: boolean;
    reason?: string;
  },
): Promise<SeoOffPageOpportunity> {
  return apiFetch<SeoOffPageOpportunity>(
    `/seo-autopilot/off-page/opportunities/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify(input),
    },
  );
}

export type SeoGuestPublicationStatus =
  "prospect" | "qualified" | "disqualified";
export type SeoGuestPitchStage =
  | "topic_idea"
  | "pitch_draft"
  | "approval_required"
  | "approved"
  | "sent"
  | "response_received"
  | "accepted"
  | "declined"
  | "article_draft"
  | "article_approval_required"
  | "article_approved"
  | "published"
  | "verified";

export interface SeoGuestPublication {
  id: string;
  name: string;
  websiteUrl: string;
  topicNiches: string[];
  market: string | null;
  relevanceEvidence: string;
  qualityEvidence: string;
  guestPolicyUrl: string | null;
  guestPolicyStatus: "accepting" | "not_accepting" | "unknown";
  contactName: string | null;
  contactEmail: string | null;
  contactSource: string | null;
  status: SeoGuestPublicationStatus;
  sourceName: string;
  lastReviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SeoGuestPitch {
  id: string;
  publicationId: string;
  topicIdea: string;
  pitchSubject: string | null;
  pitchBody: string | null;
  sourceNotes: string | null;
  draftSource: string;
  articleTitle: string | null;
  articleBody: string | null;
  stage: SeoGuestPitchStage;
  submittedAt: string | null;
  decidedAt: string | null;
  decidedByUserId: string | null;
  decisionNote: string | null;
  outreachSentAt: string | null;
  outreachSendMode: string | null;
  responseAt: string | null;
  responseStatus: "accepted" | "declined" | "revision_requested" | null;
  responseNote: string | null;
  publishedUrl: string | null;
  publishedAt: string | null;
  placementAnchor: string | null;
  placementTargetUrl: string | null;
  placementEvidence: string | null;
  placementVerifiedAt: string | null;
  placementVerifiedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
  publication: {
    id: string;
    name: string;
    websiteUrl: string;
    market: string | null;
  };
}

export interface SeoGuestPostingAudit {
  id: string;
  entityType: "publication" | "pitch";
  entityId: string;
  action: string;
  reason: string | null;
  actorUserId: string | null;
  createdAt: string;
}

export interface SeoGuestPostingOverview {
  generatedAt: string;
  summary: {
    qualifiedPublications: number;
    pitchesDrafted: number;
    waitingApproval: number;
    responses: number;
    accepted: number;
    publishedVerified: number;
    publicationProspects: number;
  };
  publications: SeoGuestPublication[];
  pitches: SeoGuestPitch[];
  audits: SeoGuestPostingAudit[];
  disclosures: {
    discovery: string;
    outreach: string;
    responses: string;
    placements: string;
  };
}

export function fetchSeoGuestPostingOverview(): Promise<SeoGuestPostingOverview> {
  return apiFetch<SeoGuestPostingOverview>("/seo-autopilot/guest-posting");
}

export function createSeoGuestPublication(input: {
  name: string;
  websiteUrl: string;
  topicNiches: string[];
  market?: string;
  relevanceEvidence: string;
  qualityEvidence: string;
  guestPolicyUrl?: string;
  guestPolicyStatus?: "accepting" | "not_accepting" | "unknown";
  contactName?: string;
  contactEmail?: string;
  contactSource?: string;
}): Promise<SeoGuestPublication> {
  return apiFetch<SeoGuestPublication>(
    "/seo-autopilot/guest-posting/publications",
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );
}

export function updateSeoGuestPublication(
  id: string,
  input: Partial<{
    name: string;
    websiteUrl: string;
    topicNiches: string[];
    market: string | null;
    relevanceEvidence: string;
    qualityEvidence: string;
    guestPolicyUrl: string | null;
    guestPolicyStatus: "accepting" | "not_accepting" | "unknown";
    contactName: string | null;
    contactEmail: string | null;
    contactSource: string | null;
  }>,
): Promise<SeoGuestPublication> {
  return apiFetch<SeoGuestPublication>(
    `/seo-autopilot/guest-posting/publications/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export function qualifySeoGuestPublication(
  id: string,
  input: { status: "qualified" | "disqualified"; reason?: string },
): Promise<SeoGuestPublication> {
  return apiFetch<SeoGuestPublication>(
    `/seo-autopilot/guest-posting/publications/${encodeURIComponent(id)}/qualification`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function createSeoGuestTopicIdea(
  publicationId: string,
  input: { topicIdea: string; sourceNotes?: string },
): Promise<SeoGuestPitch> {
  return apiFetch<SeoGuestPitch>(
    `/seo-autopilot/guest-posting/publications/${encodeURIComponent(publicationId)}/topic-ideas`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function generateSeoGuestTopicIdeas(
  publicationId: string,
  sourceNotes: string,
): Promise<SeoGuestPitch[]> {
  return apiFetch<SeoGuestPitch[]>(
    `/seo-autopilot/guest-posting/publications/${encodeURIComponent(publicationId)}/generate-topic-ideas`,
    { method: "POST", body: JSON.stringify({ sourceNotes }) },
  );
}

export function updateSeoGuestPitch(
  id: string,
  input: Partial<{
    topicIdea: string;
    pitchSubject: string | null;
    pitchBody: string | null;
    sourceNotes: string | null;
  }>,
): Promise<SeoGuestPitch> {
  return apiFetch<SeoGuestPitch>(
    `/seo-autopilot/guest-posting/pitches/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export function generateSeoGuestPitch(
  id: string,
  sourceNotes?: string,
): Promise<SeoGuestPitch> {
  return apiFetch<SeoGuestPitch>(
    `/seo-autopilot/guest-posting/pitches/${encodeURIComponent(id)}/generate-pitch`,
    { method: "POST", body: JSON.stringify({ sourceNotes }) },
  );
}

export function submitSeoGuestPitch(id: string): Promise<SeoGuestPitch> {
  return apiFetch<SeoGuestPitch>(
    `/seo-autopilot/guest-posting/pitches/${encodeURIComponent(id)}/submit`,
    { method: "POST" },
  );
}

export function decideSeoGuestPitch(
  id: string,
  input: { decision: "approve" | "reject"; reason?: string },
): Promise<SeoGuestPitch> {
  return apiFetch<SeoGuestPitch>(
    `/seo-autopilot/guest-posting/pitches/${encodeURIComponent(id)}/decision`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function recordSeoGuestOutreachSent(
  id: string,
  note: string,
): Promise<SeoGuestPitch> {
  return apiFetch<SeoGuestPitch>(
    `/seo-autopilot/guest-posting/pitches/${encodeURIComponent(id)}/record-sent`,
    { method: "POST", body: JSON.stringify({ note }) },
  );
}

export function recordSeoGuestResponse(
  id: string,
  input: {
    status: "accepted" | "declined" | "revision_requested";
    note: string;
  },
): Promise<SeoGuestPitch> {
  return apiFetch<SeoGuestPitch>(
    `/seo-autopilot/guest-posting/pitches/${encodeURIComponent(id)}/response`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function createSeoGuestArticleDraft(
  id: string,
  input: { articleTitle: string; articleBody: string; sourceNotes?: string },
): Promise<SeoGuestPitch> {
  return apiFetch<SeoGuestPitch>(
    `/seo-autopilot/guest-posting/pitches/${encodeURIComponent(id)}/article`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function generateSeoGuestArticle(
  id: string,
  sourceNotes?: string,
): Promise<SeoGuestPitch> {
  return apiFetch<SeoGuestPitch>(
    `/seo-autopilot/guest-posting/pitches/${encodeURIComponent(id)}/generate-article`,
    { method: "POST", body: JSON.stringify({ sourceNotes }) },
  );
}

export function submitSeoGuestArticle(id: string): Promise<SeoGuestPitch> {
  return apiFetch<SeoGuestPitch>(
    `/seo-autopilot/guest-posting/pitches/${encodeURIComponent(id)}/article/submit`,
    { method: "POST" },
  );
}

export function decideSeoGuestArticle(
  id: string,
  input: { decision: "approve" | "reject"; reason?: string },
): Promise<SeoGuestPitch> {
  return apiFetch<SeoGuestPitch>(
    `/seo-autopilot/guest-posting/pitches/${encodeURIComponent(id)}/article/decision`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function recordSeoGuestPublished(
  id: string,
  input: {
    publishedUrl: string;
    placementTargetUrl?: string;
    placementAnchor?: string;
    placementEvidence: string;
  },
): Promise<SeoGuestPitch> {
  return apiFetch<SeoGuestPitch>(
    `/seo-autopilot/guest-posting/pitches/${encodeURIComponent(id)}/published`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function verifySeoGuestPlacement(
  id: string,
  confirmation: string,
): Promise<SeoGuestPitch> {
  return apiFetch<SeoGuestPitch>(
    `/seo-autopilot/guest-posting/pitches/${encodeURIComponent(id)}/verify`,
    { method: "POST", body: JSON.stringify({ confirmation }) },
  );
}

export type SeoLinkBuildingStage =
  | "identified"
  | "qualified"
  | "drafted"
  | "approval_required"
  | "approved"
  | "sent"
  | "response_received"
  | "accepted"
  | "declined"
  | "won"
  | "lost";

export interface SeoLinkBuildingOpportunity extends SeoOffPageOpportunity {
  stage: SeoLinkBuildingStage;
  ownerUserId: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactSource: string | null;
  outreachAngle: string | null;
  outreachDraft: string | null;
  approvalRequestedAt: string | null;
  approvedAt: string | null;
  approvedByUserId: string | null;
  sentAt: string | null;
  responseAt: string | null;
  responseNote: string | null;
  outcomeReason: string | null;
  wonLinkId: string | null;
}

export interface SeoLinkBuildingOverview {
  generatedAt: string;
  summary: {
    openOpportunities: number;
    qualified: number;
    contacted: number;
    responses: number;
    won: number;
    lost: number;
    lostLinkAlerts: number;
  };
  opportunities: SeoLinkBuildingOpportunity[];
  lostLinks: SeoOffPageLink[];
  audits: SeoOffPageAudit[];
  targetPages: { url: string; title: string | null }[];
  targetPagesFromAuditRun: string | null;
  targetPagesCheckedAt: string | null;
  team: { userId: string; name: string; email: string | null; role: string }[];
  disclosures: {
    discovery: string;
    outreach: string;
    verification: string;
    targetPages: string;
    authority: string;
  };
}

export function fetchSeoLinkBuildingOverview(): Promise<SeoLinkBuildingOverview> {
  return apiFetch<SeoLinkBuildingOverview>("/seo-autopilot/link-building");
}

export function createSeoLinkBuildingOpportunity(
  input: Pick<SeoOffPageOpportunity, "kind" | "title" | "prospectUrl" | "targetUrl" | "evidenceNote" | "relevanceNote"> &
    Partial<Pick<SeoOffPageOpportunity, "qualityNote" | "riskNote">> & {
      ownerUserId?: string;
      contactName?: string;
      contactEmail?: string;
      contactSource?: string;
    },
): Promise<SeoLinkBuildingOpportunity> {
  return apiFetch<SeoLinkBuildingOpportunity>("/seo-autopilot/link-building/opportunities", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function updateSeoLinkBuildingOpportunity(
  id: string,
  input: {
    targetUrl?: string;
    evidenceNote?: string;
    relevanceNote?: string;
    qualityNote?: string | null;
    riskNote?: string | null;
    ownerUserId?: string | null;
    contactName?: string | null;
    contactEmail?: string | null;
    contactSource?: string | null;
  },
): Promise<SeoLinkBuildingOpportunity> {
  return apiFetch<SeoLinkBuildingOpportunity>(
    `/seo-autopilot/link-building/opportunities/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export function qualifySeoLinkBuildingOpportunity(id: string): Promise<SeoLinkBuildingOpportunity> {
  return apiFetch<SeoLinkBuildingOpportunity>(
    `/seo-autopilot/link-building/opportunities/${encodeURIComponent(id)}/qualify`,
    { method: "POST" },
  );
}

export function draftSeoLinkBuildingWithAi(id: string): Promise<SeoLinkBuildingOpportunity> {
  return apiFetch<SeoLinkBuildingOpportunity>(
    `/seo-autopilot/link-building/opportunities/${encodeURIComponent(id)}/draft-ai`,
    { method: "POST" },
  );
}

export function saveSeoLinkBuildingDraft(
  id: string,
  input: { outreachAngle: string; outreachDraft: string },
): Promise<SeoLinkBuildingOpportunity> {
  return apiFetch<SeoLinkBuildingOpportunity>(
    `/seo-autopilot/link-building/opportunities/${encodeURIComponent(id)}/draft`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export function requestSeoLinkBuildingApproval(id: string): Promise<SeoLinkBuildingOpportunity> {
  return apiFetch<SeoLinkBuildingOpportunity>(
    `/seo-autopilot/link-building/opportunities/${encodeURIComponent(id)}/request-approval`,
    { method: "POST" },
  );
}

export function decideSeoLinkBuildingApproval(
  id: string,
  input: { approved: boolean; reason?: string },
): Promise<SeoLinkBuildingOpportunity> {
  return apiFetch<SeoLinkBuildingOpportunity>(
    `/seo-autopilot/link-building/opportunities/${encodeURIComponent(id)}/approval`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function markSeoLinkBuildingSent(id: string): Promise<SeoLinkBuildingOpportunity> {
  return apiFetch<SeoLinkBuildingOpportunity>(
    `/seo-autopilot/link-building/opportunities/${encodeURIComponent(id)}/sent`,
    { method: "POST" },
  );
}

export function recordSeoLinkBuildingResponse(
  id: string,
  input: { disposition: "accepted" | "declined" | "other"; responseNote: string },
): Promise<SeoLinkBuildingOpportunity> {
  return apiFetch<SeoLinkBuildingOpportunity>(
    `/seo-autopilot/link-building/opportunities/${encodeURIComponent(id)}/response`,
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function markSeoLinkBuildingWon(
  id: string,
  input: {
    sourceUrl: string;
    targetUrl: string;
    anchorText?: string;
    linkType?: "follow" | "nofollow" | "sponsored" | "ugc" | "unknown";
    evidenceNote: string;
  },
): Promise<{ opportunity: SeoLinkBuildingOpportunity; link: SeoOffPageLink }> {
  return apiFetch(`/seo-autopilot/link-building/opportunities/${encodeURIComponent(id)}/won`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function markSeoLinkBuildingLost(id: string, reason: string): Promise<SeoLinkBuildingOpportunity> {
  return apiFetch<SeoLinkBuildingOpportunity>(
    `/seo-autopilot/link-building/opportunities/${encodeURIComponent(id)}/lost`,
    { method: "POST", body: JSON.stringify({ reason }) },
  );
}

export function recoverSeoLostLink(id: string, evidence: string): Promise<SeoOffPageLink> {
  return apiFetch<SeoOffPageLink>(
    `/seo-autopilot/link-building/links/${encodeURIComponent(id)}/recover`,
    { method: "POST", body: JSON.stringify({ evidence }) },
  );
}

export type SeoCompetitorKind =
  | "keyword"
  | "content"
  | "backlink"
  | "ranking"
  | "page"
  | "serp_feature";
export type SeoCompetitorStatus = "open" | "actioned" | "resolved" | "dismissed";
export type SeoCompetitorAction = "keyword" | "content" | "link";

export interface SeoCompetitorGap {
  id: string;
  competitorId: string;
  competitorName: string;
  kind: SeoCompetitorKind;
  title: string;
  keyword: string | null;
  intent: string | null;
  competitorUrl: string | null;
  ownedPageUrl: string | null;
  sourceUrl: string;
  sourceLabel: string;
  evidenceNote: string;
  competitorRank: number | null;
  ownedRank: number | null;
  ownedRankCheckedAt: string | null;
  positionComparison: "not_comparable" | "competitor_ahead" | "business_ahead" | "same_position";
  observedAt: string;
  status: SeoCompetitorStatus;
  actionType: SeoCompetitorAction | null;
  actionEntityId: string | null;
  createdAt: string;
  updatedAt: string;
  audits: {
    id: string;
    action: string;
    reason: string | null;
    beforeState: unknown;
    afterState: unknown;
    actorUserId: string | null;
    createdAt: string;
  }[];
}

export interface SeoCompetitorOverview {
  checkedAt: string;
  competitors: { id: string; name: string; priority: string }[];
  trackedCompetitors: number;
  counts: {
    keywordGaps: number;
    contentGaps: number;
    backlinkGaps: number;
    serpGaps: number;
    recordedEvidence: number;
  };
  gaps: SeoCompetitorGap[];
  disclosures: {
    evidence: string;
    keywordData: string;
    contentData: string;
    backlinkData: string;
    serpFeatures: string;
  };
}

export function fetchSeoCompetitorOverview(): Promise<SeoCompetitorOverview> {
  return apiFetch<SeoCompetitorOverview>("/seo-autopilot/competitor");
}

export function createSeoCompetitorGap(input: {
  competitorId: string;
  kind: SeoCompetitorKind;
  title: string;
  keyword?: string;
  intent?: string;
  competitorUrl?: string;
  ownedPageUrl?: string;
  sourceUrl: string;
  sourceLabel?: string;
  evidenceNote: string;
  competitorRank?: number;
  observedAt?: string;
}): Promise<SeoCompetitorGap> {
  return apiFetch<SeoCompetitorGap>("/seo-autopilot/competitor/gaps", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function createSeoCompetitorAction(
  id: string,
  action: SeoCompetitorAction,
): Promise<{
  id: string;
  actionType: SeoCompetitorAction;
  actionEntityId: string;
  actionUrl: string;
  status: "actioned";
}> {
  return apiFetch(`/seo-autopilot/competitor/gaps/${encodeURIComponent(id)}/actions`, {
    method: "POST",
    body: JSON.stringify({ action }),
  });
}

export function transitionSeoCompetitorGap(
  id: string,
  input: { status: "open" | "resolved" | "dismissed"; reason: string },
): Promise<SeoCompetitorGap> {
  return apiFetch<SeoCompetitorGap>(
    `/seo-autopilot/competitor/gaps/${encodeURIComponent(id)}/transition`,
    { method: "POST", body: JSON.stringify(input) },
  );
}
