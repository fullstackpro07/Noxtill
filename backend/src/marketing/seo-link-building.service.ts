import { createHash } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { AiInfraService } from '../ai/ai-infra.service';
import { AppException } from '../common/filters/app.exception';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import type { CreateOffPageOpportunityInput } from './seo-off-page.service';

export const SEO_LINK_BUILDING_ERRORS = {
  NOT_FOUND: 'SEO_LINK_BUILDING_RECORD_NOT_FOUND',
  INVALID_INPUT: 'SEO_LINK_BUILDING_INVALID_INPUT',
  INVALID_TRANSITION: 'SEO_LINK_BUILDING_INVALID_TRANSITION',
  REASON_REQUIRED: 'SEO_LINK_BUILDING_REASON_REQUIRED',
  TARGET_PAGE_REQUIRED: 'SEO_LINK_BUILDING_TARGET_PAGE_REQUIRED',
  DUPLICATE: 'SEO_LINK_BUILDING_DUPLICATE_RECORD',
  AI_INVALID: 'SEO_LINK_BUILDING_AI_RESPONSE_INVALID',
} as const;

export type LinkBuildingStage =
  | 'identified'
  | 'qualified'
  | 'drafted'
  | 'approval_required'
  | 'approved'
  | 'sent'
  | 'response_received'
  | 'accepted'
  | 'declined'
  | 'won'
  | 'lost';

export interface LinkBuildingOpportunityInput extends CreateOffPageOpportunityInput {
  targetUrl: string;
  ownerUserId?: string;
  contactName?: string;
  contactEmail?: string;
  contactSource?: string;
}

const TERMINAL_STAGES = new Set<LinkBuildingStage>(['won', 'lost', 'declined']);

function clean(value?: string | null) {
  return value?.trim() || null;
}

function requiredText(value: string | undefined, label: string, max: number) {
  const result = clean(value);
  if (!result || result.length > max) {
    throw new AppException(
      SEO_LINK_BUILDING_ERRORS.INVALID_INPUT,
      `${label} is required and must be no longer than ${max} characters.`,
      HttpStatus.BAD_REQUEST,
    );
  }
  return result;
}

function normalizeUrl(value: string) {
  try {
    const url = new URL(value.trim());
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('scheme');
    url.hash = '';
    if (url.pathname.length > 1)
      url.pathname = url.pathname.replace(/\/+$/, '');
    return url.toString();
  } catch {
    throw new AppException(
      SEO_LINK_BUILDING_ERRORS.INVALID_INPUT,
      'Enter a valid HTTP or HTTPS URL.',
      HttpStatus.BAD_REQUEST,
    );
  }
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

function objectValue(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return objectValue(parsed);
    } catch {
      return null;
    }
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function safeState(opportunity: {
  stage: string;
  status: string;
  pipeline: string;
  targetUrl: string | null;
  ownerUserId: string | null;
  outreachAngle: string | null;
  sentAt: Date | null;
  responseAt: Date | null;
  wonLinkId: string | null;
}) {
  return {
    stage: opportunity.stage,
    status: opportunity.status,
    pipeline: opportunity.pipeline,
    targetUrl: opportunity.targetUrl,
    ownerUserId: opportunity.ownerUserId,
    outreachAngle: opportunity.outreachAngle,
    sentAt: opportunity.sentAt?.toISOString() ?? null,
    responseAt: opportunity.responseAt?.toISOString() ?? null,
    wonLinkId: opportunity.wonLinkId,
  };
}

@Injectable()
export class SeoLinkBuildingService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly ai: AiInfraService,
  ) {}

  private get db() {
    return this.tenantPrisma.client;
  }

  async overview(businessId: string) {
    const [opportunities, links, audits, latestCrawl, members] =
      await Promise.all([
        this.db.seoOffPageOpportunity.findMany({
          where: { businessId, pipeline: 'link_building' },
          orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        }),
        this.db.seoOffPageLink.findMany({
          where: { businessId, tracked: true, status: 'lost' },
          orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
        }),
        this.db.seoOffPageAudit.findMany({
          where: { businessId },
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          take: 150,
        }),
        this.db.seoAuditRun.findFirst({
          where: { businessId, status: { in: ['completed', 'partial'] } },
          orderBy: [{ startedAt: 'desc' }, { id: 'asc' }],
          select: { id: true, startedAt: true, pages: true },
        }),
        this.db.businessUser.findMany({
          where: { businessId, active: true },
          select: {
            userId: true,
            role: true,
            user: { select: { name: true, email: true } },
          },
          orderBy: [
            { role: 'asc' },
            { user: { name: 'asc' } },
            { userId: 'asc' },
          ],
        }),
      ]);

    const active = opportunities.filter(
      (opportunity) =>
        opportunity.tracked &&
        opportunity.status === 'open' &&
        !TERMINAL_STAGES.has(opportunity.stage as LinkBuildingStage),
    );
    const responded = opportunities.filter(
      (item) => item.tracked && item.responseAt !== null,
    );
    const pages = this.readTargetPages(latestCrawl?.pages);
    return {
      generatedAt: new Date().toISOString(),
      summary: {
        openOpportunities: active.length,
        qualified: opportunities.filter(
          (item) =>
            item.tracked &&
            [
              'qualified',
              'drafted',
              'approval_required',
              'approved',
              'sent',
              'response_received',
              'accepted',
              'won',
            ].includes(item.stage),
        ).length,
        contacted: opportunities.filter(
          (item) => item.tracked && item.sentAt !== null,
        ).length,
        responses: responded.length,
        won: opportunities.filter(
          (item) => item.tracked && item.stage === 'won',
        ).length,
        lost: opportunities.filter(
          (item) => item.tracked && item.stage === 'lost',
        ).length,
        lostLinkAlerts: links.length,
      },
      opportunities,
      lostLinks: links,
      audits,
      targetPages: pages,
      targetPagesFromAuditRun: latestCrawl?.id ?? null,
      targetPagesCheckedAt: latestCrawl?.startedAt.toISOString() ?? null,
      team: members.map((member) => ({
        userId: member.userId,
        name: member.user.name,
        email: member.user.email,
        role: member.role,
      })),
      disclosures: {
        discovery:
          'Link prospects and competitor gaps are researched and entered by your team; no backlink discovery provider is connected.',
        outreach:
          'Outreach copy requires approval. Sending is recorded manually after you send it outside Noxtill; no merchant-owned sender is configured.',
        verification:
          'Won placements and lost-link recoveries require merchant-entered URL and evidence; Noxtill does not crawl external backlink pages.',
        targetPages:
          pages.length > 0
            ? 'Target-page suggestions come only from your latest saved site audit.'
            : latestCrawl
              ? 'The latest saved site audit has no eligible same-site target pages; manually entered target URLs are not crawl-verified.'
              : 'No completed site audit is available for target-page suggestions; manually entered target URLs are not crawl-verified.',
        authority:
          'Authority, traffic, and domain-quality scores are not available without a connected backlink data provider.',
      },
    };
  }

  async createOpportunity(
    businessId: string,
    actorUserId: string,
    input: LinkBuildingOpportunityInput,
  ) {
    const prospectUrl = normalizeUrl(input.prospectUrl);
    const targetUrl = await this.validatedTargetUrl(
      businessId,
      input.targetUrl,
    );
    const title = requiredText(input.title, 'Prospect name', 191);
    const evidenceNote = requiredText(
      input.evidenceNote,
      'Discovery evidence',
      10000,
    );
    const relevanceNote = requiredText(
      input.relevanceNote,
      'Relevance evidence',
      10000,
    );
    const ownerUserId = input.ownerUserId ?? actorUserId;
    await this.requireActiveMember(businessId, ownerUserId);
    const opportunityKey = digest(
      `${input.kind}\n${prospectUrl}\n${targetUrl}`,
    );
    try {
      return await this.db.$transaction(async (tx) => {
        const opportunity = await tx.seoOffPageOpportunity.create({
          data: {
            businessId,
            opportunityKey,
            kind: input.kind,
            title,
            prospectUrl,
            targetUrl,
            evidenceNote,
            relevanceNote,
            qualityNote: clean(input.qualityNote),
            riskNote: clean(input.riskNote),
            status: 'open',
            pipeline: 'link_building',
            stage: 'identified',
            ownerUserId,
            contactName: clean(input.contactName),
            contactEmail: clean(input.contactEmail)?.toLowerCase() ?? null,
            contactSource: clean(input.contactSource),
            createdByUserId: actorUserId,
          },
        });
        await tx.seoOffPageAudit.create({
          data: {
            businessId,
            entityType: 'opportunity',
            entityId: opportunity.id,
            action: 'link_building_opportunity_created',
            actorUserId,
            afterState: safeState(opportunity),
          },
        });
        return opportunity;
      });
    } catch (error) {
      if (isUniqueViolation(error)) this.duplicate();
      throw error;
    }
  }

  async updateOpportunity(
    businessId: string,
    actorUserId: string,
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
  ) {
    const before = await this.opportunityOrThrow(businessId, id);
    if (!['identified', 'qualified', 'drafted'].includes(before.stage)) {
      this.invalidTransition(
        'Prospect details cannot be edited after approval is requested.',
      );
    }
    if (input.ownerUserId)
      await this.requireActiveMember(businessId, input.ownerUserId);
    const targetUrl =
      input.targetUrl !== undefined
        ? await this.validatedTargetUrl(businessId, input.targetUrl)
        : undefined;
    const data = {
      ...(input.targetUrl !== undefined ? { targetUrl } : {}),
      ...(input.evidenceNote !== undefined
        ? {
            evidenceNote: requiredText(
              input.evidenceNote,
              'Discovery evidence',
              10000,
            ),
          }
        : {}),
      ...(input.relevanceNote !== undefined
        ? {
            relevanceNote: requiredText(
              input.relevanceNote,
              'Relevance evidence',
              10000,
            ),
          }
        : {}),
      ...(input.qualityNote !== undefined
        ? { qualityNote: clean(input.qualityNote) }
        : {}),
      ...(input.riskNote !== undefined
        ? { riskNote: clean(input.riskNote) }
        : {}),
      ...(input.ownerUserId !== undefined
        ? { ownerUserId: input.ownerUserId }
        : {}),
      ...(input.contactName !== undefined
        ? { contactName: clean(input.contactName) }
        : {}),
      ...(input.contactEmail !== undefined
        ? { contactEmail: clean(input.contactEmail)?.toLowerCase() ?? null }
        : {}),
      ...(input.contactSource !== undefined
        ? { contactSource: clean(input.contactSource) }
        : {}),
    };
    const updated = await this.db.$transaction(async (tx) => {
      const after = await tx.seoOffPageOpportunity.update({
        where: { id, businessId },
        data,
      });
      await tx.seoOffPageAudit.create({
        data: {
          businessId,
          entityType: 'opportunity',
          entityId: id,
          action: 'link_building_details_updated',
          actorUserId,
          beforeState: safeState(before),
          afterState: safeState(after),
        },
      });
      return after;
    });
    return updated;
  }

  async qualify(businessId: string, actorUserId: string, id: string) {
    const before = await this.opportunityOrThrow(businessId, id);
    if (before.stage !== 'identified') {
      this.invalidTransition('Only an identified prospect can be qualified.');
    }
    if (
      !before.targetUrl ||
      !clean(before.qualityNote) ||
      !clean(before.riskNote)
    ) {
      throw new AppException(
        SEO_LINK_BUILDING_ERRORS.INVALID_INPUT,
        'Choose a target page and record quality and risk evidence before qualifying.',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.validatedTargetUrl(businessId, before.targetUrl);
    return this.transition(
      businessId,
      actorUserId,
      before,
      'qualified',
      'prospect_qualified',
    );
  }

  async saveDraft(
    businessId: string,
    actorUserId: string,
    id: string,
    input: { outreachAngle: string; outreachDraft: string },
  ) {
    const before = await this.opportunityOrThrow(businessId, id);
    if (!['qualified', 'drafted'].includes(before.stage)) {
      this.invalidTransition('Qualify this prospect before drafting outreach.');
    }
    const angle = requiredText(input.outreachAngle, 'Outreach angle', 5000);
    const draft = requiredText(input.outreachDraft, 'Outreach draft', 15000);
    return this.updateWithAudit(
      businessId,
      actorUserId,
      before,
      { stage: 'drafted', outreachAngle: angle, outreachDraft: draft },
      'outreach_drafted',
    );
  }

  async draftWithAi(businessId: string, actorUserId: string, id: string) {
    const opportunity = await this.opportunityOrThrow(businessId, id);
    if (!['qualified', 'drafted'].includes(opportunity.stage)) {
      this.invalidTransition('Qualify this prospect before drafting outreach.');
    }
    if (
      !opportunity.targetUrl ||
      !opportunity.qualityNote ||
      !opportunity.riskNote
    ) {
      throw new AppException(
        SEO_LINK_BUILDING_ERRORS.INVALID_INPUT,
        'Target-page, quality, and risk evidence are required before AI drafting.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const targetPages = await this.targetPages(businessId);
    const allowedTargets = targetPages.length
      ? targetPages.map((page) => page.url)
      : [opportunity.targetUrl];
    const prompt = [
      'Draft a respectful link-acquisition outreach note and one relevant outreach angle.',
      'Use only the supplied merchant-entered evidence. Do not invent relationships, credentials, traffic, authority, audience size, prior contact, successful placement, or facts about the recipient.',
      'Do not promise payment or a link exchange. Do not claim the recipient has a broken link unless the supplied evidence says so.',
      'Select targetUrl only from the exact supplied target page URLs. If none is clearly relevant, return an empty string.',
      'Return only JSON: {"angle":"...","draft":"...","targetUrl":"..."}.',
      `Opportunity type: ${opportunity.kind}`,
      `Prospect title: ${opportunity.title}`,
      `Prospect URL: ${opportunity.prospectUrl}`,
      `Target page URLs: ${JSON.stringify(allowedTargets)}`,
      `Discovery evidence: ${opportunity.evidenceNote}`,
      `Relevance evidence: ${opportunity.relevanceNote}`,
      `Quality evidence: ${opportunity.qualityNote}`,
      `Risk evidence: ${opportunity.riskNote}`,
    ].join('\n');
    const parsed = objectValue(
      await this.ai.complete(
        businessId,
        prompt,
        0.35,
        'seo_link_building_outreach',
      ),
    );
    const angle =
      typeof parsed?.angle === 'string' ? clean(parsed.angle) : null;
    const draft =
      typeof parsed?.draft === 'string' ? clean(parsed.draft) : null;
    const suggestedTarget =
      typeof parsed?.targetUrl === 'string' ? clean(parsed.targetUrl) : null;
    if (!angle || !draft || !suggestedTarget) {
      throw new AppException(
        SEO_LINK_BUILDING_ERRORS.AI_INVALID,
        'The AI provider returned an incomplete draft. Try again or write one manually.',
        HttpStatus.BAD_GATEWAY,
      );
    }
    const normalizedSuggestion = normalizeUrl(suggestedTarget);
    if (!allowedTargets.map(normalizeUrl).includes(normalizedSuggestion)) {
      throw new AppException(
        SEO_LINK_BUILDING_ERRORS.AI_INVALID,
        'The AI provider selected a target page that was not supplied. Try again or select a page manually.',
        HttpStatus.BAD_GATEWAY,
      );
    }
    const before = await this.opportunityOrThrow(businessId, id);
    const result = await this.updateWithAudit(
      businessId,
      actorUserId,
      before,
      {
        stage: 'drafted',
        outreachAngle: angle.slice(0, 5000),
        outreachDraft: draft.slice(0, 15000),
        targetUrl: normalizedSuggestion,
      },
      'outreach_drafted_ai',
    );
    return { ...result, aiTargetPageSuggestion: normalizedSuggestion };
  }

  async submitForApproval(businessId: string, actorUserId: string, id: string) {
    const before = await this.opportunityOrThrow(businessId, id);
    if (
      before.stage !== 'drafted' ||
      !before.outreachDraft ||
      !before.outreachAngle
    ) {
      this.invalidTransition(
        'Save a complete outreach draft before requesting approval.',
      );
    }
    return this.updateWithAudit(
      businessId,
      actorUserId,
      before,
      { stage: 'approval_required', approvalRequestedAt: new Date() },
      'approval_requested',
    );
  }

  async decideApproval(
    businessId: string,
    actorUserId: string,
    id: string,
    approved: boolean,
    reason?: string,
  ) {
    const before = await this.opportunityOrThrow(businessId, id);
    if (before.stage !== 'approval_required') {
      this.invalidTransition(
        'Only an outreach draft waiting for approval can be decided.',
      );
    }
    const note = clean(reason);
    if (!approved && !note)
      this.reasonRequired('Give a reason when sending a draft back.');
    return this.updateWithAudit(
      businessId,
      actorUserId,
      before,
      approved
        ? {
            stage: 'approved',
            approvedAt: new Date(),
            approvedByUserId: actorUserId,
          }
        : {
            stage: 'drafted',
            approvalRequestedAt: null,
            approvedAt: null,
            approvedByUserId: null,
          },
      approved ? 'outreach_approved' : 'outreach_sent_back',
      note ?? undefined,
    );
  }

  async markSent(businessId: string, actorUserId: string, id: string) {
    const before = await this.opportunityOrThrow(businessId, id);
    if (before.stage !== 'approved') {
      this.invalidTransition(
        'Approve this draft before recording an external send.',
      );
    }
    if (!before.contactEmail && !before.contactSource) {
      throw new AppException(
        SEO_LINK_BUILDING_ERRORS.INVALID_INPUT,
        'Record the contact email or external contact method before marking this as sent.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return this.updateWithAudit(
      businessId,
      actorUserId,
      before,
      { stage: 'sent', sentAt: new Date() },
      'outreach_marked_sent_external',
    );
  }

  async recordResponse(
    businessId: string,
    actorUserId: string,
    id: string,
    input: {
      disposition: 'accepted' | 'declined' | 'other';
      responseNote: string;
    },
  ) {
    const before = await this.opportunityOrThrow(businessId, id);
    if (!['sent', 'response_received'].includes(before.stage)) {
      this.invalidTransition(
        'Record or update a response only after outreach is marked as sent.',
      );
    }
    const note = requiredText(input.responseNote, 'Response notes', 10000);
    const stage =
      input.disposition === 'other' ? 'response_received' : input.disposition;
    return this.updateWithAudit(
      businessId,
      actorUserId,
      before,
      { stage, responseAt: new Date(), responseNote: note },
      'response_recorded',
    );
  }

  async markWon(
    businessId: string,
    actorUserId: string,
    id: string,
    input: {
      sourceUrl: string;
      targetUrl: string;
      anchorText?: string;
      linkType?: 'follow' | 'nofollow' | 'sponsored' | 'ugc' | 'unknown';
      evidenceNote: string;
    },
  ) {
    const before = await this.opportunityOrThrow(businessId, id);
    if (before.stage !== 'accepted') {
      this.invalidTransition(
        'A link can be marked won only after the prospect records acceptance.',
      );
    }
    const sourceUrl = normalizeUrl(input.sourceUrl);
    const targetUrl = normalizeUrl(input.targetUrl);
    if (
      new URL(sourceUrl).hostname.toLowerCase() !==
      new URL(before.prospectUrl).hostname.toLowerCase()
    ) {
      throw new AppException(
        SEO_LINK_BUILDING_ERRORS.INVALID_INPUT,
        'The verified link must be on the researched prospect domain.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!before.targetUrl || targetUrl !== normalizeUrl(before.targetUrl)) {
      throw new AppException(
        SEO_LINK_BUILDING_ERRORS.TARGET_PAGE_REQUIRED,
        'Verify the link against the target page selected for this opportunity.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const evidenceNote = requiredText(
      input.evidenceNote,
      'Published link evidence',
      10000,
    );
    const relationshipKey = digest(`${sourceUrl}\n${targetUrl}`);
    try {
      return await this.db.$transaction(async (tx) => {
        const link = await tx.seoOffPageLink.create({
          data: {
            businessId,
            relationshipKey,
            sourceDomain: new URL(sourceUrl).hostname.toLowerCase(),
            sourceUrl,
            targetUrl,
            anchorText: clean(input.anchorText),
            linkType: input.linkType ?? 'unknown',
            status: 'active',
            firstSeenAt: new Date(),
            lastSeenAt: new Date(),
            evidenceNote,
            relevanceNote: before.relevanceNote,
            qualityNote: before.qualityNote,
            riskNote: before.riskNote,
            sourceName: 'merchant-entered',
            createdByUserId: actorUserId,
          },
        });
        const after = await tx.seoOffPageOpportunity.update({
          where: { id, businessId },
          data: {
            stage: 'won',
            wonLinkId: link.id,
            outcomeReason: evidenceNote,
          },
        });
        await tx.seoOffPageAudit.createMany({
          data: [
            {
              businessId,
              entityType: 'opportunity',
              entityId: id,
              action: 'link_won_merchant_verified',
              actorUserId,
              beforeState: safeState(before),
              afterState: safeState(after),
              reason: evidenceNote,
            },
            {
              businessId,
              entityType: 'link',
              entityId: link.id,
              action: 'created_from_link_building_win',
              actorUserId,
              afterState: {
                sourceUrl,
                targetUrl,
                sourceName: 'merchant-entered',
                status: link.status,
              },
              reason: evidenceNote,
            },
          ],
        });
        return { opportunity: after, link };
      });
    } catch (error) {
      if (isUniqueViolation(error)) this.duplicate();
      throw error;
    }
  }

  async markLost(
    businessId: string,
    actorUserId: string,
    id: string,
    reason: string,
  ) {
    const before = await this.opportunityOrThrow(businessId, id);
    if (TERMINAL_STAGES.has(before.stage as LinkBuildingStage)) {
      this.invalidTransition(
        'This opportunity is already in a terminal stage.',
      );
    }
    const note = requiredText(reason, 'Loss reason', 10000);
    return this.updateWithAudit(
      businessId,
      actorUserId,
      before,
      { stage: 'lost', outcomeReason: note },
      'link_building_marked_lost',
      note,
    );
  }

  async recoverLink(
    businessId: string,
    actorUserId: string,
    id: string,
    evidence: string,
  ) {
    const reason = requiredText(evidence, 'Recovery evidence', 10000);
    return this.db.$transaction(async (tx) => {
      const before = await tx.seoOffPageLink.findFirst({
        where: { id, businessId, status: 'lost', tracked: true },
      });
      if (!before) this.notFound('Lost-link alert');
      const after = await tx.seoOffPageLink.update({
        where: { id, businessId },
        data: {
          status: 'active',
          lastSeenAt: new Date(),
          evidenceNote: `${before.evidenceNote}\n\nRecovery evidence: ${reason}`,
        },
      });
      await tx.seoOffPageAudit.create({
        data: {
          businessId,
          entityType: 'link',
          entityId: id,
          action: 'status_recovered_merchant_verified',
          actorUserId,
          reason,
          beforeState: {
            status: before.status,
            lastSeenAt: before.lastSeenAt?.toISOString() ?? null,
          },
          afterState: {
            status: after.status,
            lastSeenAt: after.lastSeenAt?.toISOString() ?? null,
          },
        },
      });
      return after;
    });
  }

  private async targetPages(businessId: string) {
    const audit = await this.db.seoAuditRun.findFirst({
      where: { businessId, status: { in: ['completed', 'partial'] } },
      orderBy: [{ startedAt: 'desc' }, { id: 'asc' }],
      select: { pages: true },
    });
    return this.readTargetPages(audit?.pages);
  }

  private async validatedTargetUrl(businessId: string, value: string) {
    const normalized = normalizeUrl(value);
    const pages = await this.targetPages(businessId);
    if (pages.length > 0 && !pages.some((page) => page.url === normalized)) {
      throw new AppException(
        SEO_LINK_BUILDING_ERRORS.TARGET_PAGE_REQUIRED,
        'Choose a target page from the latest saved site audit.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return normalized;
  }

  private readTargetPages(value: unknown) {
    if (!Array.isArray(value))
      return [] as { url: string; title: string | null }[];
    const result: { url: string; title: string | null }[] = [];
    const seen = new Set<string>();
    for (const raw of value) {
      const page = objectValue(raw);
      if (
        !page ||
        typeof page.url !== 'string' ||
        typeof page.statusCode !== 'number'
      )
        continue;
      if (page.statusCode >= 400 || page.noindex === true) continue;
      const candidate =
        typeof page.canonicalUrl === 'string' && page.canonicalUrl.trim()
          ? page.canonicalUrl
          : page.url;
      let url: string;
      try {
        const pageUrl = normalizeUrl(page.url);
        url = normalizeUrl(candidate);
        if (
          new URL(pageUrl).hostname.toLowerCase() !==
          new URL(url).hostname.toLowerCase()
        ) {
          continue;
        }
      } catch {
        continue;
      }
      if (seen.has(url)) continue;
      seen.add(url);
      result.push({
        url,
        title: typeof page.title === 'string' ? page.title : null,
      });
    }
    return result;
  }

  private async requireActiveMember(businessId: string, userId: string) {
    const member = await this.db.businessUser.findFirst({
      where: { businessId, userId, active: true },
      select: { userId: true },
    });
    if (!member) {
      throw new AppException(
        SEO_LINK_BUILDING_ERRORS.INVALID_INPUT,
        'The opportunity owner must be an active member of this business.',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private async opportunityOrThrow(businessId: string, id: string) {
    const opportunity = await this.db.seoOffPageOpportunity.findFirst({
      where: { id, businessId, pipeline: 'link_building' },
    });
    if (!opportunity) this.notFound('Link-building opportunity');
    return opportunity;
  }

  private async transition(
    businessId: string,
    actorUserId: string,
    before: Awaited<ReturnType<SeoLinkBuildingService['opportunityOrThrow']>>,
    stage: LinkBuildingStage,
    action: string,
  ) {
    return this.updateWithAudit(
      businessId,
      actorUserId,
      before,
      { stage },
      action,
    );
  }

  private async updateWithAudit(
    businessId: string,
    actorUserId: string,
    before: Awaited<ReturnType<SeoLinkBuildingService['opportunityOrThrow']>>,
    data: Record<string, unknown>,
    action: string,
    reason?: string,
  ) {
    return this.db.$transaction(async (tx) => {
      const after = await tx.seoOffPageOpportunity.update({
        where: { id: before.id, businessId },
        data,
      });
      await tx.seoOffPageAudit.create({
        data: {
          businessId,
          entityType: 'opportunity',
          entityId: before.id,
          action,
          actorUserId,
          reason: clean(reason),
          beforeState: safeState(before),
          afterState: safeState(after),
        },
      });
      return after;
    });
  }

  private notFound(label: string): never {
    throw new AppException(
      SEO_LINK_BUILDING_ERRORS.NOT_FOUND,
      `${label} was not found.`,
      HttpStatus.NOT_FOUND,
    );
  }

  private duplicate(): never {
    throw new AppException(
      SEO_LINK_BUILDING_ERRORS.DUPLICATE,
      'This source-to-target relationship or opportunity is already recorded.',
      HttpStatus.CONFLICT,
    );
  }

  private invalidTransition(message: string): never {
    throw new AppException(
      SEO_LINK_BUILDING_ERRORS.INVALID_TRANSITION,
      message,
      HttpStatus.CONFLICT,
    );
  }

  private reasonRequired(message: string): never {
    throw new AppException(
      SEO_LINK_BUILDING_ERRORS.REASON_REQUIRED,
      message,
      HttpStatus.BAD_REQUEST,
    );
  }
}
