import { createHash } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { AppException } from '../common/filters/app.exception';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';

export const SEO_OFF_PAGE_ERRORS = {
  NOT_FOUND: 'SEO_OFF_PAGE_RECORD_NOT_FOUND',
  INVALID_URL: 'SEO_OFF_PAGE_INVALID_URL',
  INVALID_INPUT: 'SEO_OFF_PAGE_INVALID_INPUT',
  DUPLICATE: 'SEO_OFF_PAGE_DUPLICATE_RECORD',
  REASON_REQUIRED: 'SEO_OFF_PAGE_REASON_REQUIRED',
} as const;

export const OFF_PAGE_KINDS = [
  'competitor',
  'resource',
  'unlinked_mention',
  'digital_pr',
  'broken_link',
] as const;

export type OffPageKind = (typeof OFF_PAGE_KINDS)[number];
export type OffPageLinkStatus = 'active' | 'lost' | 'unverified';
export type OffPagePipeline = 'unassigned' | 'guest_posting' | 'link_building';

export interface CreateOffPageLinkInput {
  sourceUrl: string;
  targetUrl: string;
  anchorText?: string;
  linkType?: 'follow' | 'nofollow' | 'sponsored' | 'ugc' | 'unknown';
  status?: OffPageLinkStatus;
  firstSeenAt?: string;
  lastSeenAt?: string;
  evidenceNote: string;
  relevanceNote?: string;
  qualityNote?: string;
  riskNote?: string;
}

export interface UpdateOffPageLinkInput {
  status?: OffPageLinkStatus;
  tracked?: boolean;
  reason?: string;
}

export interface CreateOffPageOpportunityInput {
  kind: OffPageKind;
  title: string;
  prospectUrl: string;
  targetUrl?: string;
  evidenceNote: string;
  relevanceNote: string;
  qualityNote?: string;
  riskNote?: string;
}

export interface UpdateOffPageOpportunityInput {
  pipeline?: OffPagePipeline;
  status?: 'open' | 'dismissed';
  tracked?: boolean;
  reason?: string;
}

const clean = (value?: string | null) => value?.trim() || null;

function requireText(value: string | undefined, field: string, max: number) {
  const text = clean(value);
  if (!text || text.length > max) {
    throw new AppException(
      SEO_OFF_PAGE_ERRORS.INVALID_INPUT,
      `${field} is required and must be no longer than ${max} characters.`,
      HttpStatus.BAD_REQUEST,
    );
  }
  return text;
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
      SEO_OFF_PAGE_ERRORS.INVALID_URL,
      'Enter a valid HTTP or HTTPS URL.',
      HttpStatus.BAD_REQUEST,
    );
  }
}

function keyOf(...parts: string[]) {
  return createHash('sha256').update(parts.join('\n')).digest('hex');
}

function isUniqueViolation(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

@Injectable()
export class SeoOffPageService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private get db() {
    return this.tenantPrisma.client;
  }

  async overview(businessId: string) {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const [links, opportunities, audits, lostTransitions] = await Promise.all([
      this.db.seoOffPageLink.findMany({
        where: { businessId },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      }),
      this.db.seoOffPageOpportunity.findMany({
        where: { businessId },
        orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      }),
      this.db.seoOffPageAudit.findMany({
        where: { businessId },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
        take: 100,
      }),
      this.db.seoOffPageAudit.findMany({
        where: {
          businessId,
          entityType: 'link',
          action: 'status_lost',
          createdAt: { gte: since },
        },
        select: { entityId: true },
      }),
    ]);

    const tracked = links.filter((link) => link.tracked);
    const active = tracked.filter((link) => link.status === 'active');
    const recordedDomains = new Set(active.map((link) => link.sourceDomain));
    const lostIds = new Set(
      lostTransitions.map((transition) => transition.entityId),
    );

    return {
      generatedAt: new Date().toISOString(),
      summary: {
        referringDomains: recordedDomains.size,
        newLinks: active.filter((link) => link.createdAt >= since).length,
        lostLinks: tracked.filter(
          (link) => link.status === 'lost' && lostIds.has(link.id),
        ).length,
        openOpportunities: opportunities.filter(
          (opportunity) =>
            opportunity.tracked &&
            opportunity.status === 'open' &&
            !['won', 'lost', 'declined'].includes(opportunity.stage),
        ).length,
        linksWithRiskNotes: tracked.filter((link) => clean(link.riskNote))
          .length,
        highValueOpportunities: null,
        authorityTrend: null,
        windowSince: since.toISOString(),
      },
      links,
      opportunities,
      audits,
      disclosures: {
        provider: 'Not configured',
        backlinkData:
          'Backlink records are entered by your team. No backlink provider is connected.',
        authority:
          'Domain authority, referring-domain history and authority trends are not tracked.',
        quality:
          'Quality and risk notes are merchant-entered evidence, not a provider score or definitive classification.',
        newLost:
          'New links are records added in the selected period; lost links are records your team marked lost.',
      },
    };
  }

  async createLink(
    businessId: string,
    actorUserId: string,
    input: CreateOffPageLinkInput,
  ) {
    const sourceUrl = normalizeUrl(input.sourceUrl);
    const targetUrl = normalizeUrl(input.targetUrl);
    const sourceDomain = new URL(sourceUrl).hostname.toLowerCase();
    const evidenceNote = requireText(input.evidenceNote, 'Evidence', 10000);
    const firstSeenAt = input.firstSeenAt ? new Date(input.firstSeenAt) : null;
    const lastSeenAt = input.lastSeenAt ? new Date(input.lastSeenAt) : null;
    if (
      (firstSeenAt && Number.isNaN(firstSeenAt.getTime())) ||
      (lastSeenAt && Number.isNaN(lastSeenAt.getTime()))
    ) {
      throw new AppException(
        SEO_OFF_PAGE_ERRORS.INVALID_INPUT,
        'First seen and last seen must be valid dates.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (
      firstSeenAt &&
      lastSeenAt &&
      firstSeenAt.getTime() > lastSeenAt.getTime()
    ) {
      throw new AppException(
        SEO_OFF_PAGE_ERRORS.INVALID_INPUT,
        'First seen cannot be later than last seen.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const relationshipKey = keyOf(sourceUrl, targetUrl);

    try {
      return await this.db.$transaction(async (tx) => {
        const link = await tx.seoOffPageLink.create({
          data: {
            businessId,
            relationshipKey,
            sourceDomain,
            sourceUrl,
            targetUrl,
            anchorText: clean(input.anchorText),
            linkType: input.linkType ?? 'unknown',
            status: input.status ?? 'active',
            firstSeenAt,
            lastSeenAt,
            evidenceNote,
            relevanceNote: clean(input.relevanceNote),
            qualityNote: clean(input.qualityNote),
            riskNote: clean(input.riskNote),
            createdByUserId: actorUserId,
          },
        });
        await tx.seoOffPageAudit.create({
          data: {
            businessId,
            entityType: 'link',
            entityId: link.id,
            action: 'created',
            actorUserId,
            afterState: {
              sourceUrl,
              targetUrl,
              sourceName: 'merchant-entered',
              status: link.status,
            },
          },
        });
        return link;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppException(
          SEO_OFF_PAGE_ERRORS.DUPLICATE,
          'This source-to-target link is already recorded.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async updateLink(
    businessId: string,
    actorUserId: string,
    id: string,
    input: UpdateOffPageLinkInput,
  ) {
    return this.db.$transaction(async (tx) => {
      const before = await tx.seoOffPageLink.findFirst({
        where: { id, businessId },
      });
      if (!before) this.notFound('Backlink record');
      const reason = clean(input.reason);
      if (input.status === 'lost' && !reason) this.reasonRequired();
      if (input.status === 'active' && before.status === 'lost' && !reason) {
        this.reasonRequired();
      }
      const after = await tx.seoOffPageLink.update({
        where: { id: before.id },
        data: {
          ...(input.status ? { status: input.status } : {}),
          ...(input.tracked !== undefined ? { tracked: input.tracked } : {}),
        },
      });
      const action =
        input.status && input.status !== before.status
          ? `status_${input.status}`
          : input.tracked !== undefined && input.tracked !== before.tracked
            ? input.tracked
              ? 'tracked'
              : 'untracked'
            : 'updated';
      await tx.seoOffPageAudit.create({
        data: {
          businessId,
          entityType: 'link',
          entityId: id,
          action,
          reason,
          actorUserId,
          beforeState: {
            status: before.status,
            tracked: before.tracked,
          },
          afterState: { status: after.status, tracked: after.tracked },
        },
      });
      return after;
    });
  }

  async createOpportunity(
    businessId: string,
    actorUserId: string,
    input: CreateOffPageOpportunityInput,
  ) {
    const prospectUrl = normalizeUrl(input.prospectUrl);
    const targetUrl = input.targetUrl ? normalizeUrl(input.targetUrl) : null;
    const title = requireText(input.title, 'Title', 191);
    const evidenceNote = requireText(input.evidenceNote, 'Evidence', 10000);
    const relevanceNote = requireText(
      input.relevanceNote,
      'Relevance evidence',
      10000,
    );
    const opportunityKey = keyOf(input.kind, prospectUrl, targetUrl ?? '');

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
            createdByUserId: actorUserId,
          },
        });
        await tx.seoOffPageAudit.create({
          data: {
            businessId,
            entityType: 'opportunity',
            entityId: opportunity.id,
            action: 'created',
            actorUserId,
            afterState: {
              kind: opportunity.kind,
              prospectUrl,
              targetUrl,
              status: opportunity.status,
              pipeline: opportunity.pipeline,
            },
          },
        });
        return opportunity;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppException(
          SEO_OFF_PAGE_ERRORS.DUPLICATE,
          'This prospect is already recorded for this opportunity type and target.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  async updateOpportunity(
    businessId: string,
    actorUserId: string,
    id: string,
    input: UpdateOffPageOpportunityInput,
  ) {
    return this.db.$transaction(async (tx) => {
      const before = await tx.seoOffPageOpportunity.findFirst({
        where: { id, businessId },
      });
      if (!before) this.notFound('Link opportunity');
      const reason = clean(input.reason);
      if (input.status === 'dismissed' && !reason) this.reasonRequired();
      const after = await tx.seoOffPageOpportunity.update({
        where: { id: before.id },
        data: {
          ...(input.pipeline ? { pipeline: input.pipeline } : {}),
          ...(input.status ? { status: input.status } : {}),
          ...(input.tracked !== undefined ? { tracked: input.tracked } : {}),
          ...(input.status === 'dismissed'
            ? { dismissReason: reason }
            : input.status === 'open'
              ? { dismissReason: null }
              : {}),
        },
      });
      const action =
        input.status === 'dismissed'
          ? 'dismissed'
          : input.pipeline && input.pipeline !== before.pipeline
            ? `sent_to_${input.pipeline}`
            : input.tracked !== undefined && input.tracked !== before.tracked
              ? input.tracked
                ? 'tracked'
                : 'untracked'
              : 'updated';
      await tx.seoOffPageAudit.create({
        data: {
          businessId,
          entityType: 'opportunity',
          entityId: id,
          action,
          reason,
          actorUserId,
          beforeState: {
            status: before.status,
            pipeline: before.pipeline,
            tracked: before.tracked,
          },
          afterState: {
            status: after.status,
            pipeline: after.pipeline,
            tracked: after.tracked,
          },
        },
      });
      return after;
    });
  }

  private notFound(label: string): never {
    throw new AppException(
      SEO_OFF_PAGE_ERRORS.NOT_FOUND,
      `${label} was not found.`,
      HttpStatus.NOT_FOUND,
    );
  }

  private reasonRequired(): never {
    throw new AppException(
      SEO_OFF_PAGE_ERRORS.REASON_REQUIRED,
      'A reason is required for this decision.',
      HttpStatus.BAD_REQUEST,
    );
  }
}
