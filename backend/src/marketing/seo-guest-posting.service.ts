import { createHash } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, type SeoGuestPublication } from '@prisma/client';
import { AiInfraService } from '../ai/ai-infra.service';
import { AppException } from '../common/filters/app.exception';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';

export const SEO_GUEST_POSTING_ERRORS = {
  NOT_FOUND: 'SEO_GUEST_POSTING_RECORD_NOT_FOUND',
  INVALID_INPUT: 'SEO_GUEST_POSTING_INVALID_INPUT',
  INVALID_URL: 'SEO_GUEST_POSTING_INVALID_URL',
  DUPLICATE: 'SEO_GUEST_POSTING_DUPLICATE_PUBLICATION',
  INVALID_TRANSITION: 'SEO_GUEST_POSTING_INVALID_TRANSITION',
  EVIDENCE_REQUIRED: 'SEO_GUEST_POSTING_EVIDENCE_REQUIRED',
  REASON_REQUIRED: 'SEO_GUEST_POSTING_REASON_REQUIRED',
  AI_INVALID: 'SEO_GUEST_POSTING_AI_INVALID',
} as const;

export const GUEST_PUBLICATION_STATUSES = [
  'prospect',
  'qualified',
  'disqualified',
] as const;
export type GuestPublicationStatus =
  (typeof GUEST_PUBLICATION_STATUSES)[number];

export const GUEST_PITCH_STAGES = [
  'topic_idea',
  'pitch_draft',
  'approval_required',
  'approved',
  'sent',
  'response_received',
  'accepted',
  'declined',
  'article_draft',
  'article_approval_required',
  'article_approved',
  'published',
  'verified',
] as const;
export type GuestPitchStage = (typeof GUEST_PITCH_STAGES)[number];

export interface CreateGuestPublicationInput {
  name: string;
  websiteUrl: string;
  topicNiches: string[];
  market?: string;
  relevanceEvidence: string;
  qualityEvidence: string;
  guestPolicyUrl?: string;
  guestPolicyStatus?: 'accepting' | 'not_accepting' | 'unknown';
  contactName?: string;
  contactEmail?: string;
  contactSource?: string;
}

export interface UpdateGuestPublicationInput {
  name?: string;
  websiteUrl?: string;
  topicNiches?: string[];
  market?: string | null;
  relevanceEvidence?: string;
  qualityEvidence?: string;
  guestPolicyUrl?: string | null;
  guestPolicyStatus?: 'accepting' | 'not_accepting' | 'unknown';
  contactName?: string | null;
  contactEmail?: string | null;
  contactSource?: string | null;
}

export interface CreateGuestTopicInput {
  topicIdea: string;
  sourceNotes?: string;
}

export interface UpdateGuestPitchInput {
  topicIdea?: string;
  pitchSubject?: string | null;
  pitchBody?: string | null;
  sourceNotes?: string | null;
}

function clean(value?: string | null): string | null {
  return value?.trim() || null;
}

function requiredText(value: string | undefined, field: string, max: number) {
  const text = clean(value);
  if (!text || text.length > max) {
    throw new AppException(
      SEO_GUEST_POSTING_ERRORS.INVALID_INPUT,
      `${field} is required and must be no longer than ${max} characters.`,
      HttpStatus.BAD_REQUEST,
    );
  }
  return text;
}

function normalizeUrl(value: string) {
  try {
    const url = new URL(value.trim());
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      !url.hostname ||
      url.username ||
      url.password
    ) {
      throw new Error('unsupported url');
    }
    url.hash = '';
    if (url.pathname.length > 1)
      url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString();
  } catch {
    throw new AppException(
      SEO_GUEST_POSTING_ERRORS.INVALID_URL,
      'Enter a valid HTTP or HTTPS URL.',
      HttpStatus.BAD_REQUEST,
    );
  }
}

function publicationDomain(value: string) {
  const host = new URL(value).hostname.toLowerCase();
  return host.startsWith('www.') ? host.slice(4) : host;
}

function digest(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function isUniqueViolation(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

function jsonState(value: Record<string, unknown>): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

@Injectable()
export class SeoGuestPostingService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly ai: AiInfraService,
  ) {}

  private get db() {
    return this.tenantPrisma.client;
  }

  private async publicationOrThrow(businessId: string, id: string) {
    const publication = await this.db.seoGuestPublication.findFirst({
      where: { id, businessId },
    });
    if (!publication) {
      throw new AppException(
        SEO_GUEST_POSTING_ERRORS.NOT_FOUND,
        'The publication was not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    return publication;
  }

  private async pitchOrThrow(businessId: string, id: string) {
    const pitch = await this.db.seoGuestPitch.findFirst({
      where: { id, businessId },
    });
    if (!pitch) {
      throw new AppException(
        SEO_GUEST_POSTING_ERRORS.NOT_FOUND,
        'The pitch was not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    return pitch;
  }

  private async audit(
    businessId: string,
    actorUserId: string,
    entityType: 'publication' | 'pitch',
    entityId: string,
    action: string,
    beforeState?: Record<string, unknown>,
    afterState?: Record<string, unknown>,
    reason?: string | null,
  ) {
    await this.db.seoGuestPostingAudit.create({
      data: {
        businessId,
        entityType,
        entityId,
        action,
        actorUserId,
        reason: clean(reason),
        beforeState: beforeState ? jsonState(beforeState) : Prisma.JsonNull,
        afterState: afterState ? jsonState(afterState) : Prisma.JsonNull,
      },
    });
  }

  async overview(businessId: string) {
    const [publications, pitches, audits] = await Promise.all([
      this.db.seoGuestPublication.findMany({
        where: { businessId },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      }),
      this.db.seoGuestPitch.findMany({
        where: { businessId },
        include: {
          publication: {
            select: { id: true, name: true, websiteUrl: true, market: true },
          },
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      }),
      this.db.seoGuestPostingAudit.findMany({
        where: { businessId },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: 150,
      }),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      summary: {
        qualifiedPublications: publications.filter(
          (publication) => publication.status === 'qualified',
        ).length,
        pitchesDrafted: pitches.filter((pitch) =>
          [
            'pitch_draft',
            'approval_required',
            'approved',
            'sent',
            'response_received',
            'accepted',
            'declined',
            'article_draft',
            'article_approval_required',
            'article_approved',
            'published',
            'verified',
          ].includes(pitch.stage),
        ).length,
        waitingApproval: pitches.filter((pitch) =>
          ['approval_required', 'article_approval_required'].includes(
            pitch.stage,
          ),
        ).length,
        responses: pitches.filter((pitch) => pitch.responseAt !== null).length,
        accepted: pitches.filter((pitch) =>
          [
            'accepted',
            'article_draft',
            'article_approval_required',
            'article_approved',
            'published',
            'verified',
          ].includes(pitch.stage),
        ).length,
        publishedVerified: pitches.filter((pitch) => pitch.stage === 'verified')
          .length,
        publicationProspects: publications.filter(
          (publication) => publication.status === 'prospect',
        ).length,
      },
      publications,
      pitches,
      audits,
      disclosures: {
        discovery:
          'Publication prospects are researched and entered by your team; no publication-discovery provider is connected.',
        outreach:
          'No merchant-owned outreach identity is configured. Approved copy must be sent outside Noxtill; sending is never automatic.',
        responses:
          'Replies are recorded by your team. No publication-reply inbox is connected.',
        placements:
          'Placement URLs and link evidence are merchant-confirmed; Noxtill does not automatically crawl third-party publications.',
      },
    };
  }

  async createPublication(
    businessId: string,
    actorUserId: string,
    input: CreateGuestPublicationInput,
  ) {
    const websiteUrl = normalizeUrl(
      requiredText(input.websiteUrl, 'Publication website', 2048),
    );
    const data = {
      businessId,
      publicationKey: digest(`${businessId}\n${publicationDomain(websiteUrl)}`),
      name: requiredText(input.name, 'Publication name', 191),
      websiteUrl,
      topicNiches: input.topicNiches
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 30),
      market: clean(input.market)?.slice(0, 96) ?? null,
      relevanceEvidence: requiredText(
        input.relevanceEvidence,
        'Relevance evidence',
        10000,
      ),
      qualityEvidence: requiredText(
        input.qualityEvidence,
        'Quality evidence',
        10000,
      ),
      guestPolicyUrl: input.guestPolicyUrl
        ? normalizeUrl(input.guestPolicyUrl)
        : null,
      guestPolicyStatus: input.guestPolicyStatus ?? 'unknown',
      contactName: clean(input.contactName)?.slice(0, 191) ?? null,
      contactEmail: clean(input.contactEmail)?.slice(0, 191) ?? null,
      contactSource: clean(input.contactSource),
      createdByUserId: actorUserId,
    };
    try {
      const publication = await this.db.seoGuestPublication.create({ data });
      await this.audit(
        businessId,
        actorUserId,
        'publication',
        publication.id,
        'publication_added',
        undefined,
        { status: publication.status, websiteUrl: publication.websiteUrl },
      );
      return publication;
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppException(
          SEO_GUEST_POSTING_ERRORS.DUPLICATE,
          'A publication for this domain is already recorded.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async updatePublication(
    businessId: string,
    actorUserId: string,
    id: string,
    input: UpdateGuestPublicationInput,
  ) {
    const existing = await this.publicationOrThrow(businessId, id);
    if (existing.status !== 'prospect') {
      throw new AppException(
        SEO_GUEST_POSTING_ERRORS.INVALID_TRANSITION,
        'Publication details can only be edited while the record is a prospect.',
        HttpStatus.CONFLICT,
      );
    }
    let updated: SeoGuestPublication;
    try {
      updated = await this.db.seoGuestPublication.update({
        where: { id, businessId },
        data: {
          ...(input.name !== undefined
            ? { name: requiredText(input.name, 'Publication name', 191) }
            : {}),
          ...(input.websiteUrl !== undefined
            ? {
                websiteUrl: normalizeUrl(
                  requiredText(input.websiteUrl, 'Publication website', 2048),
                ),
                publicationKey: digest(
                  `${businessId}\n${publicationDomain(normalizeUrl(input.websiteUrl))}`,
                ),
              }
            : {}),
          ...(input.topicNiches !== undefined
            ? {
                topicNiches: input.topicNiches
                  .map((item) => item.trim())
                  .filter(Boolean)
                  .slice(0, 30),
              }
            : {}),
          ...(input.market !== undefined
            ? { market: clean(input.market)?.slice(0, 96) ?? null }
            : {}),
          ...(input.relevanceEvidence !== undefined
            ? {
                relevanceEvidence: requiredText(
                  input.relevanceEvidence,
                  'Relevance evidence',
                  10000,
                ),
              }
            : {}),
          ...(input.qualityEvidence !== undefined
            ? {
                qualityEvidence: requiredText(
                  input.qualityEvidence,
                  'Quality evidence',
                  10000,
                ),
              }
            : {}),
          ...(input.guestPolicyUrl !== undefined
            ? {
                guestPolicyUrl: input.guestPolicyUrl
                  ? normalizeUrl(input.guestPolicyUrl)
                  : null,
              }
            : {}),
          ...(input.guestPolicyStatus !== undefined
            ? { guestPolicyStatus: input.guestPolicyStatus }
            : {}),
          ...(input.contactName !== undefined
            ? { contactName: clean(input.contactName)?.slice(0, 191) ?? null }
            : {}),
          ...(input.contactEmail !== undefined
            ? { contactEmail: clean(input.contactEmail)?.slice(0, 191) ?? null }
            : {}),
          ...(input.contactSource !== undefined
            ? { contactSource: clean(input.contactSource) }
            : {}),
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppException(
          SEO_GUEST_POSTING_ERRORS.DUPLICATE,
          'A publication for this domain is already recorded.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
    await this.audit(
      businessId,
      actorUserId,
      'publication',
      id,
      'publication_edited',
      {
        name: existing.name,
        websiteUrl: existing.websiteUrl,
        status: existing.status,
        guestPolicyStatus: existing.guestPolicyStatus,
      },
      {
        name: updated.name,
        websiteUrl: updated.websiteUrl,
        status: updated.status,
        guestPolicyStatus: updated.guestPolicyStatus,
      },
    );
    return updated;
  }

  async qualifyPublication(
    businessId: string,
    actorUserId: string,
    id: string,
    status: 'qualified' | 'disqualified',
    reason?: string,
  ) {
    const publication = await this.publicationOrThrow(businessId, id);
    if (publication.status !== 'prospect') {
      throw new AppException(
        SEO_GUEST_POSTING_ERRORS.INVALID_TRANSITION,
        'Only a prospect can be qualified or disqualified.',
        HttpStatus.CONFLICT,
      );
    }
    const note = clean(reason);
    if (status === 'disqualified' && !note) {
      throw new AppException(
        SEO_GUEST_POSTING_ERRORS.REASON_REQUIRED,
        'Give a reason before disqualifying a publication.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (status === 'qualified') {
      if (
        !clean(publication.relevanceEvidence) ||
        !clean(publication.qualityEvidence)
      ) {
        throw new AppException(
          SEO_GUEST_POSTING_ERRORS.EVIDENCE_REQUIRED,
          'Record relevance and quality evidence before qualifying a publication.',
          HttpStatus.BAD_REQUEST,
        );
      }
      if (publication.guestPolicyStatus === 'not_accepting') {
        throw new AppException(
          SEO_GUEST_POSTING_ERRORS.INVALID_TRANSITION,
          'This publication is marked as not accepting guest contributions.',
          HttpStatus.CONFLICT,
        );
      }
    }
    const updated = await this.db.seoGuestPublication.update({
      where: { id, businessId },
      data: { status, lastReviewedAt: new Date() },
    });
    await this.audit(
      businessId,
      actorUserId,
      'publication',
      id,
      status === 'qualified'
        ? 'publication_qualified'
        : 'publication_disqualified',
      { status: publication.status },
      { status: updated.status },
      note,
    );
    return updated;
  }

  async createTopicIdea(
    businessId: string,
    actorUserId: string,
    publicationId: string,
    input: CreateGuestTopicInput,
    source: 'manual' | 'ai' = 'manual',
  ) {
    const publication = await this.publicationOrThrow(
      businessId,
      publicationId,
    );
    if (publication.status !== 'qualified') {
      throw new AppException(
        SEO_GUEST_POSTING_ERRORS.INVALID_TRANSITION,
        'Qualify the publication before creating topic ideas.',
        HttpStatus.CONFLICT,
      );
    }
    const pitch = await this.db.seoGuestPitch.create({
      data: {
        businessId,
        publicationId,
        topicIdea: requiredText(input.topicIdea, 'Topic idea', 300),
        sourceNotes: clean(input.sourceNotes),
        draftSource: source,
        createdByUserId: actorUserId,
      },
    });
    await this.audit(
      businessId,
      actorUserId,
      'pitch',
      pitch.id,
      source === 'ai' ? 'topic_idea_generated_ai' : 'topic_idea_created',
      undefined,
      { stage: pitch.stage, topicIdea: pitch.topicIdea },
    );
    return pitch;
  }

  async generateTopicIdeas(
    businessId: string,
    actorUserId: string,
    publicationId: string,
    sourceNotes: string,
  ) {
    const publication = await this.publicationOrThrow(
      businessId,
      publicationId,
    );
    if (publication.status !== 'qualified') {
      throw new AppException(
        SEO_GUEST_POSTING_ERRORS.INVALID_TRANSITION,
        'Qualify the publication before generating topic ideas.',
        HttpStatus.CONFLICT,
      );
    }
    const notes = requiredText(sourceNotes, 'Merchant source notes', 10000);
    const prompt = [
      'Suggest up to five guest article topic ideas for a publication prospect.',
      'Use only the merchant source notes to describe the merchant or its expertise.',
      'Do not claim prior contact, an existing relationship, an audience size, a publication policy, credentials, results, or statistics.',
      'Topic ideas are suggestions only and require merchant review.',
      'Return only JSON: {"ideas":["..."]}.',
      `Publication name: ${publication.name}`,
      `Publication topics entered by merchant: ${JSON.stringify(publication.topicNiches)}`,
      `Publication relevance evidence entered by merchant: ${publication.relevanceEvidence}`,
      `Merchant source notes: ${notes}`,
    ].join('\n');
    const parsed = this.parseObject(
      await this.ai.complete(businessId, prompt, 0.35, 'seo_guest_topics'),
    );
    const ideas = Array.isArray(parsed.ideas)
      ? [
          ...new Set(
            parsed.ideas
              .filter((item): item is string => typeof item === 'string')
              .map((item) => item.trim())
              .filter(Boolean),
          ),
        ].slice(0, 5)
      : [];
    if (ideas.length === 0) {
      throw new AppException(
        SEO_GUEST_POSTING_ERRORS.AI_INVALID,
        'The AI provider returned no readable topic ideas. Please try again.',
        HttpStatus.BAD_GATEWAY,
      );
    }
    return Promise.all(
      ideas.map((topicIdea) =>
        this.createTopicIdea(
          businessId,
          actorUserId,
          publicationId,
          { topicIdea, sourceNotes: notes },
          'ai',
        ),
      ),
    );
  }

  async updatePitch(
    businessId: string,
    actorUserId: string,
    id: string,
    input: UpdateGuestPitchInput,
  ) {
    const pitch = await this.pitchOrThrow(businessId, id);
    if (!['topic_idea', 'pitch_draft'].includes(pitch.stage)) {
      throw new AppException(
        SEO_GUEST_POSTING_ERRORS.INVALID_TRANSITION,
        'This pitch is no longer editable at its current stage.',
        HttpStatus.CONFLICT,
      );
    }
    const updated = await this.db.seoGuestPitch.update({
      where: { id, businessId },
      data: {
        ...(input.topicIdea !== undefined
          ? { topicIdea: requiredText(input.topicIdea, 'Topic idea', 300) }
          : {}),
        ...(input.pitchSubject !== undefined
          ? { pitchSubject: clean(input.pitchSubject)?.slice(0, 300) ?? null }
          : {}),
        ...(input.pitchBody !== undefined
          ? { pitchBody: clean(input.pitchBody) }
          : {}),
        ...(input.sourceNotes !== undefined
          ? { sourceNotes: clean(input.sourceNotes) }
          : {}),
        stage: input.pitchBody !== undefined ? 'pitch_draft' : pitch.stage,
        ...(input.pitchBody !== undefined && pitch.draftSource === 'ai'
          ? { draftSource: 'ai_edited' }
          : {}),
      },
    });
    await this.audit(
      businessId,
      actorUserId,
      'pitch',
      id,
      'pitch_edited',
      { stage: pitch.stage },
      { stage: updated.stage },
    );
    return updated;
  }

  async generatePitch(
    businessId: string,
    actorUserId: string,
    id: string,
    sourceNotes?: string,
  ) {
    const pitch = await this.pitchOrThrow(businessId, id);
    if (!['topic_idea', 'pitch_draft'].includes(pitch.stage)) {
      throw new AppException(
        SEO_GUEST_POSTING_ERRORS.INVALID_TRANSITION,
        'A pitch can only be drafted before approval.',
        HttpStatus.CONFLICT,
      );
    }
    const notes = requiredText(
      sourceNotes ?? pitch.sourceNotes ?? undefined,
      'Merchant source notes',
      10000,
    );
    const publication = await this.publicationOrThrow(
      businessId,
      pitch.publicationId,
    );
    const prompt = [
      'Draft a concise, respectful guest article pitch for a publication.',
      'Use only the merchant source notes for claims about the business or its expertise.',
      'Never claim prior contact, a relationship, a publication audience size, acceptance, credentials, results, statistics, awards, or a guest-post policy unless explicitly present in source notes.',
      'Do not say the article is already written or promise a link unless source notes explicitly support that.',
      'Return only JSON: {"subject":"...","body":"..."}. The body must be editable and should ask whether the proposed topic is suitable.',
      `Publication: ${publication.name}`,
      `Publication topics entered by merchant: ${JSON.stringify(publication.topicNiches)}`,
      `Topic idea: ${pitch.topicIdea}`,
      `Merchant source notes: ${notes}`,
    ].join('\n');
    const parsed = this.parseObject(
      await this.ai.complete(businessId, prompt, 0.35, 'seo_guest_pitch'),
    );
    const subject =
      typeof parsed.subject === 'string' ? clean(parsed.subject) : null;
    const body = typeof parsed.body === 'string' ? clean(parsed.body) : null;
    if (!subject || !body) {
      throw new AppException(
        SEO_GUEST_POSTING_ERRORS.AI_INVALID,
        'The AI provider returned an incomplete pitch. Please try again.',
        HttpStatus.BAD_GATEWAY,
      );
    }
    const updated = await this.db.seoGuestPitch.update({
      where: { id, businessId },
      data: {
        pitchSubject: subject.slice(0, 300),
        pitchBody: body,
        sourceNotes: notes,
        draftSource: 'ai',
        stage: 'pitch_draft',
      },
    });
    await this.audit(
      businessId,
      actorUserId,
      'pitch',
      id,
      'pitch_drafted_ai',
      { stage: pitch.stage },
      { stage: updated.stage, draftSource: updated.draftSource },
    );
    return updated;
  }

  async submitPitchForApproval(
    businessId: string,
    actorUserId: string,
    id: string,
  ) {
    const pitch = await this.pitchOrThrow(businessId, id);
    if (
      pitch.stage !== 'pitch_draft' ||
      !clean(pitch.pitchSubject) ||
      !clean(pitch.pitchBody)
    ) {
      throw new AppException(
        SEO_GUEST_POSTING_ERRORS.EVIDENCE_REQUIRED,
        'Add a subject and pitch body before submitting for approval.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const updated = await this.db.seoGuestPitch.update({
      where: { id, businessId },
      data: { stage: 'approval_required', submittedAt: new Date() },
    });
    await this.audit(
      businessId,
      actorUserId,
      'pitch',
      id,
      'outreach_submitted_for_approval',
      { stage: pitch.stage },
      { stage: updated.stage },
    );
    return updated;
  }

  async decidePitch(
    businessId: string,
    actorUserId: string,
    id: string,
    decision: 'approve' | 'reject',
    reason?: string,
  ) {
    const pitch = await this.pitchOrThrow(businessId, id);
    if (pitch.stage !== 'approval_required') {
      throw new AppException(
        SEO_GUEST_POSTING_ERRORS.INVALID_TRANSITION,
        'Only outreach waiting for approval can be decided.',
        HttpStatus.CONFLICT,
      );
    }
    const note = clean(reason);
    if (decision === 'reject' && !note) {
      throw new AppException(
        SEO_GUEST_POSTING_ERRORS.REASON_REQUIRED,
        'Give a reason before sending this pitch back for changes.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const stage = decision === 'approve' ? 'approved' : 'pitch_draft';
    const updated = await this.db.seoGuestPitch.update({
      where: { id, businessId },
      data: {
        stage,
        decidedAt: new Date(),
        decidedByUserId: actorUserId,
        decisionNote: note,
      },
    });
    await this.audit(
      businessId,
      actorUserId,
      'pitch',
      id,
      decision === 'approve' ? 'outreach_approved' : 'outreach_sent_back',
      { stage: pitch.stage },
      { stage: updated.stage },
      note,
    );
    return updated;
  }

  async markOutreachSent(
    businessId: string,
    actorUserId: string,
    id: string,
    note: string,
  ) {
    const pitch = await this.pitchOrThrow(businessId, id);
    if (pitch.stage !== 'approved') {
      throw new AppException(
        SEO_GUEST_POSTING_ERRORS.INVALID_TRANSITION,
        'Approve the pitch before recording external outreach.',
        HttpStatus.CONFLICT,
      );
    }
    const publication = await this.publicationOrThrow(
      businessId,
      pitch.publicationId,
    );
    if (!clean(publication.contactEmail)) {
      throw new AppException(
        SEO_GUEST_POSTING_ERRORS.EVIDENCE_REQUIRED,
        'Record a public editorial contact email before confirming external outreach.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const evidence = requiredText(note, 'External send confirmation', 2000);
    const updated = await this.db.seoGuestPitch.update({
      where: { id, businessId },
      data: {
        stage: 'sent',
        outreachSentAt: new Date(),
        outreachSendMode: 'manual_external',
      },
    });
    await this.audit(
      businessId,
      actorUserId,
      'pitch',
      id,
      'outreach_sent_external',
      { stage: pitch.stage },
      { stage: updated.stage, outreachSendMode: updated.outreachSendMode },
      evidence,
    );
    return updated;
  }

  async recordResponse(
    businessId: string,
    actorUserId: string,
    id: string,
    status: 'accepted' | 'declined' | 'revision_requested',
    note: string,
  ) {
    const pitch = await this.pitchOrThrow(businessId, id);
    if (!['sent', 'response_received'].includes(pitch.stage)) {
      throw new AppException(
        SEO_GUEST_POSTING_ERRORS.INVALID_TRANSITION,
        'Record a response only after outreach has been sent.',
        HttpStatus.CONFLICT,
      );
    }
    const responseNote = requiredText(note, 'Response notes', 10000);
    const stage =
      status === 'accepted'
        ? 'accepted'
        : status === 'declined'
          ? 'declined'
          : 'response_received';
    const updated = await this.db.seoGuestPitch.update({
      where: { id, businessId },
      data: {
        stage,
        responseAt: new Date(),
        responseStatus: status,
        responseNote,
      },
    });
    await this.audit(
      businessId,
      actorUserId,
      'pitch',
      id,
      status === 'accepted'
        ? 'guest_post_accepted'
        : status === 'declined'
          ? 'guest_post_declined'
          : 'guest_post_response_received',
      { stage: pitch.stage, responseStatus: pitch.responseStatus },
      { stage: updated.stage, responseStatus: updated.responseStatus },
      responseNote,
    );
    return updated;
  }

  async createArticleDraft(
    businessId: string,
    actorUserId: string,
    id: string,
    input: { articleTitle: string; articleBody: string; sourceNotes?: string },
    source: 'manual' | 'ai' = 'manual',
  ) {
    const pitch = await this.pitchOrThrow(businessId, id);
    if (!['accepted', 'article_draft'].includes(pitch.stage)) {
      throw new AppException(
        SEO_GUEST_POSTING_ERRORS.INVALID_TRANSITION,
        'The publication must accept this pitch before the article can be drafted.',
        HttpStatus.CONFLICT,
      );
    }
    const title = requiredText(input.articleTitle, 'Article title', 300);
    const body = requiredText(input.articleBody, 'Article draft', 200000);
    const updated = await this.db.seoGuestPitch.update({
      where: { id, businessId },
      data: {
        articleTitle: title,
        articleBody: body,
        sourceNotes: clean(input.sourceNotes) ?? pitch.sourceNotes,
        draftSource: source,
        stage: 'article_draft',
      },
    });
    await this.audit(
      businessId,
      actorUserId,
      'pitch',
      id,
      source === 'ai' ? 'article_drafted_ai' : 'article_drafted_manual',
      { stage: pitch.stage },
      { stage: updated.stage, draftSource: updated.draftSource },
    );
    return updated;
  }

  async generateArticleDraft(
    businessId: string,
    actorUserId: string,
    id: string,
    sourceNotes?: string,
  ) {
    const pitch = await this.pitchOrThrow(businessId, id);
    if (!['accepted', 'article_draft'].includes(pitch.stage)) {
      throw new AppException(
        SEO_GUEST_POSTING_ERRORS.INVALID_TRANSITION,
        'The publication must accept this pitch before the article can be drafted.',
        HttpStatus.CONFLICT,
      );
    }
    const notes = requiredText(
      sourceNotes ?? pitch.sourceNotes ?? undefined,
      'Merchant source notes',
      10000,
    );
    const publication = await this.publicationOrThrow(
      businessId,
      pitch.publicationId,
    );
    const prompt = [
      'Draft an editable guest article in Markdown for a publication.',
      'Use only the merchant source notes for claims about products, experience, policies, prices, credentials, and results.',
      'Do not invent testimonials, statistics, certifications, awards, quotes, or a prior relationship with the publication.',
      'Do not insert links unless a target URL is in merchant source notes. The human editor will review and approve before submission.',
      'Return only JSON: {"title":"...","body":"..."}.',
      `Publication: ${publication.name}`,
      `Accepted topic: ${pitch.topicIdea}`,
      `Merchant source notes: ${notes}`,
    ].join('\n');
    const parsed = this.parseObject(
      await this.ai.complete(businessId, prompt, 0.4, 'seo_guest_article'),
    );
    if (typeof parsed.body !== 'string' || !clean(parsed.body)) {
      throw new AppException(
        SEO_GUEST_POSTING_ERRORS.AI_INVALID,
        'The AI provider returned an empty article draft. Please try again.',
        HttpStatus.BAD_GATEWAY,
      );
    }
    return this.createArticleDraft(
      businessId,
      actorUserId,
      id,
      {
        articleTitle:
          typeof parsed.title === 'string' && clean(parsed.title)
            ? parsed.title.slice(0, 300)
            : pitch.topicIdea,
        articleBody: parsed.body,
        sourceNotes: notes,
      },
      'ai',
    );
  }

  async submitArticleForApproval(
    businessId: string,
    actorUserId: string,
    id: string,
  ) {
    const pitch = await this.pitchOrThrow(businessId, id);
    if (
      pitch.stage !== 'article_draft' ||
      !clean(pitch.articleTitle) ||
      !clean(pitch.articleBody)
    ) {
      throw new AppException(
        SEO_GUEST_POSTING_ERRORS.EVIDENCE_REQUIRED,
        'Write or generate the article before submitting it for approval.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const updated = await this.db.seoGuestPitch.update({
      where: { id, businessId },
      data: { stage: 'article_approval_required', submittedAt: new Date() },
    });
    await this.audit(
      businessId,
      actorUserId,
      'pitch',
      id,
      'article_submitted_for_approval',
      { stage: pitch.stage },
      { stage: updated.stage },
    );
    return updated;
  }

  async decideArticle(
    businessId: string,
    actorUserId: string,
    id: string,
    decision: 'approve' | 'reject',
    reason?: string,
  ) {
    const pitch = await this.pitchOrThrow(businessId, id);
    if (pitch.stage !== 'article_approval_required') {
      throw new AppException(
        SEO_GUEST_POSTING_ERRORS.INVALID_TRANSITION,
        'Only an article waiting for approval can be decided.',
        HttpStatus.CONFLICT,
      );
    }
    const note = clean(reason);
    if (decision === 'reject' && !note) {
      throw new AppException(
        SEO_GUEST_POSTING_ERRORS.REASON_REQUIRED,
        'Give a reason before sending this article back for changes.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const stage = decision === 'approve' ? 'article_approved' : 'article_draft';
    const updated = await this.db.seoGuestPitch.update({
      where: { id, businessId },
      data: {
        stage,
        decidedAt: new Date(),
        decidedByUserId: actorUserId,
        decisionNote: note,
      },
    });
    await this.audit(
      businessId,
      actorUserId,
      'pitch',
      id,
      decision === 'approve' ? 'article_approved' : 'article_sent_back',
      { stage: pitch.stage },
      { stage: updated.stage },
      note,
    );
    return updated;
  }

  async recordPublished(
    businessId: string,
    actorUserId: string,
    id: string,
    input: {
      publishedUrl: string;
      placementTargetUrl?: string;
      placementAnchor?: string;
      placementEvidence: string;
    },
  ) {
    const pitch = await this.pitchOrThrow(businessId, id);
    if (pitch.stage !== 'article_approved') {
      throw new AppException(
        SEO_GUEST_POSTING_ERRORS.INVALID_TRANSITION,
        'Approve the article before recording an external placement.',
        HttpStatus.CONFLICT,
      );
    }
    const publishedUrl = normalizeUrl(
      requiredText(input.publishedUrl, 'Published URL', 2048),
    );
    const placementEvidence = requiredText(
      input.placementEvidence,
      'Placement evidence',
      10000,
    );
    const updated = await this.db.seoGuestPitch.update({
      where: { id, businessId },
      data: {
        stage: 'published',
        publishedUrl,
        publishedAt: new Date(),
        placementTargetUrl: input.placementTargetUrl
          ? normalizeUrl(input.placementTargetUrl)
          : null,
        placementAnchor: clean(input.placementAnchor)?.slice(0, 1000) ?? null,
        placementEvidence,
      },
    });
    await this.audit(
      businessId,
      actorUserId,
      'pitch',
      id,
      'guest_post_published_recorded',
      { stage: pitch.stage },
      { stage: updated.stage, publishedUrl: updated.publishedUrl },
      placementEvidence,
    );
    return updated;
  }

  async verifyPlacement(
    businessId: string,
    actorUserId: string,
    id: string,
    confirmation: string,
  ) {
    const pitch = await this.pitchOrThrow(businessId, id);
    if (pitch.stage !== 'published' || !pitch.publishedUrl) {
      throw new AppException(
        SEO_GUEST_POSTING_ERRORS.INVALID_TRANSITION,
        'Record the published URL and evidence before confirming a placement.',
        HttpStatus.CONFLICT,
      );
    }
    const note = requiredText(
      confirmation,
      'Merchant placement confirmation',
      2000,
    );
    const updated = await this.db.seoGuestPitch.update({
      where: { id, businessId },
      data: {
        stage: 'verified',
        placementVerifiedAt: new Date(),
        placementVerifiedByUserId: actorUserId,
        placementEvidence: [pitch.placementEvidence, note]
          .filter(Boolean)
          .join('\n\n'),
      },
    });
    await this.audit(
      businessId,
      actorUserId,
      'pitch',
      id,
      'guest_post_placement_merchant_verified',
      { stage: pitch.stage },
      {
        stage: updated.stage,
        placementVerifiedAt: updated.placementVerifiedAt?.toISOString() ?? null,
      },
      note,
    );
    return updated;
  }

  private parseObject(raw: string): Record<string, unknown> {
    try {
      const parsed = JSON.parse(
        raw.replace(/^```(?:json)?\s*|\s*```$/g, '').trim(),
      ) as unknown;
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        Array.isArray(parsed)
      ) {
        throw new Error('not an object');
      }
      return parsed as Record<string, unknown>;
    } catch {
      throw new AppException(
        SEO_GUEST_POSTING_ERRORS.AI_INVALID,
        'The AI provider returned a response that could not be read. Please try again.',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
