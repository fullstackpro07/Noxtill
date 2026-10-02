import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ActivityEventType,
  CommerceListingDraftStatus,
  Prisma,
} from '@prisma/client';
import { AiInfraService } from '../ai/ai-infra.service';
import { ActivityService } from '../activity/activity.service';
import { AppException } from '../common/filters/app.exception';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { COMMERCE_LISTING_ERROR_CODES } from './commerce.constants';
import {
  ApproveCommerceListingDraftDto,
  EditCommerceListingDraftDto,
  GenerateCommerceListingDraftDto,
  ListingMerchantEvidenceDto,
  RegenerateCommerceListingDraftDto,
} from './dto/commerce-listing-builder.dto';
import { assertCommerceNotPaused } from './commerce-pause.util';

export interface ListingSource {
  id: string;
  label: string;
  value: string;
  origin: 'canonical_product' | 'merchant_evidence';
  reference?: string;
}

export interface SourcedText {
  text: string;
  sourceIds: string[];
}

export interface ListingContent {
  title: SourcedText;
  bullets: SourcedText[];
  description: SourcedText;
  faq: Array<{ question: string; answer: SourcedText }>;
  seo: {
    metaTitle: SourcedText;
    metaDescription: SourcedText;
    keywords: SourcedText[];
  };
}

const STATUS_VALUES = Object.values(CommerceListingDraftStatus);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidContent(): never {
  throw new AppException(
    COMMERCE_LISTING_ERROR_CODES.INVALID_CONTENT,
    'Listing content must be valid and every factual text block must cite a recorded source.',
    HttpStatus.BAD_REQUEST,
  );
}

function sourcedText(value: unknown, validSourceIds: Set<string>): SourcedText {
  if (!isRecord(value) || typeof value.text !== 'string')
    return invalidContent();
  const text = value.text.trim();
  if (!text || text.length > 5000 || !Array.isArray(value.sourceIds))
    return invalidContent();
  const sourceIds = value.sourceIds.filter(
    (id): id is string => typeof id === 'string',
  );
  if (
    sourceIds.length === 0 ||
    sourceIds.length !== value.sourceIds.length ||
    sourceIds.some((id) => !validSourceIds.has(id))
  ) {
    return invalidContent();
  }
  return { text, sourceIds: [...new Set(sourceIds)] };
}

function parseContent(
  value: unknown,
  sources: ListingSource[],
): ListingContent {
  if (!isRecord(value) || !isRecord(value.seo) || !Array.isArray(value.bullets))
    return invalidContent();
  const validSourceIds = new Set(sources.map((source) => source.id));
  if (!Array.isArray(value.faq) || !Array.isArray(value.seo.keywords))
    return invalidContent();

  const bullets = value.bullets.map((bullet) =>
    sourcedText(bullet, validSourceIds),
  );
  const faq = value.faq.map((item) => {
    if (
      !isRecord(item) ||
      typeof item.question !== 'string' ||
      !item.question.trim() ||
      item.question.length > 300
    ) {
      return invalidContent();
    }
    return {
      question: item.question.trim(),
      answer: sourcedText(item.answer, validSourceIds),
    };
  });

  if (bullets.length > 12 || faq.length > 12 || value.seo.keywords.length > 30)
    return invalidContent();

  return {
    title: sourcedText(value.title, validSourceIds),
    bullets,
    description: sourcedText(value.description, validSourceIds),
    faq,
    seo: {
      metaTitle: sourcedText(value.seo.metaTitle, validSourceIds),
      metaDescription: sourcedText(value.seo.metaDescription, validSourceIds),
      keywords: value.seo.keywords.map((keyword) =>
        sourcedText(keyword, validSourceIds),
      ),
    },
  };
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function readSources(value: Prisma.JsonValue): ListingSource[] {
  if (!Array.isArray(value)) return [];
  const sources: ListingSource[] = [];
  for (const item of value) {
    if (
      !isRecord(item) ||
      typeof item.id !== 'string' ||
      typeof item.label !== 'string' ||
      typeof item.value !== 'string' ||
      (item.origin !== 'canonical_product' &&
        item.origin !== 'merchant_evidence')
    ) {
      continue;
    }
    sources.push({
      id: item.id,
      label: item.label,
      value: item.value,
      origin: item.origin,
      ...(typeof item.reference === 'string'
        ? { reference: item.reference }
        : {}),
    });
  }
  return sources;
}

function readContent(value: Prisma.JsonValue): ListingContent {
  const record = isRecord(value) ? value : {};
  const seo = isRecord(record.seo) ? record.seo : {};
  const text = (input: unknown): SourcedText =>
    isRecord(input) &&
    typeof input.text === 'string' &&
    Array.isArray(input.sourceIds)
      ? {
          text: input.text,
          sourceIds: input.sourceIds.filter(
            (sourceId): sourceId is string => typeof sourceId === 'string',
          ),
        }
      : { text: '', sourceIds: [] };
  return {
    title: text(record.title),
    bullets: Array.isArray(record.bullets) ? record.bullets.map(text) : [],
    description: text(record.description),
    faq: Array.isArray(record.faq)
      ? record.faq.flatMap((item) =>
          isRecord(item)
            ? [
                {
                  question:
                    typeof item.question === 'string' ? item.question : '',
                  answer: text(item.answer),
                },
              ]
            : [],
        )
      : [],
    seo: {
      metaTitle: text(seo.metaTitle),
      metaDescription: text(seo.metaDescription),
      keywords: Array.isArray(seo.keywords) ? seo.keywords.map(text) : [],
    },
  };
}

function appendMerchantEvidence(
  existing: ListingSource[],
  evidence: ListingMerchantEvidenceDto[] = [],
): ListingSource[] {
  const next = [...existing];
  let index =
    next.reduce((max, source) => {
      const match = /^merchant_(\d+)$/.exec(source.id);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0) + 1;
  for (const fact of evidence) {
    next.push({
      id: `merchant_${index}`,
      label: `Merchant evidence ${index}`,
      value: fact.statement.trim(),
      reference: fact.reference.trim(),
      origin: 'merchant_evidence',
    });
    index += 1;
  }
  return next;
}

@Injectable()
export class CommerceListingBuilderService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly ai: AiInfraService,
    private readonly activity: ActivityService,
  ) {}

  async list(
    businessId: string,
    filters: {
      search?: string;
      channel?: string;
      market?: string;
      productId?: string;
      status?: string;
    } = {},
  ) {
    const status = STATUS_VALUES.includes(
      filters.status as CommerceListingDraftStatus,
    )
      ? (filters.status as CommerceListingDraftStatus)
      : undefined;
    const term = filters.search?.trim();
    const drafts = await this.tenantPrisma.client.commerceListingDraft.findMany(
      {
        where: {
          businessId,
          ...(status ? { status } : {}),
          ...(filters.channel ? { channel: filters.channel } : {}),
          ...(filters.market ? { market: filters.market } : {}),
          ...(filters.productId ? { productId: filters.productId } : {}),
          ...(term
            ? {
                OR: [
                  { channel: { contains: term } },
                  { market: { contains: term } },
                  { product: { name: { contains: term } } },
                ],
              }
            : {}),
        },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              category: true,
              sellingPrice: true,
              active: true,
            },
          },
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: 200,
      },
    );
    const versions = drafts.length
      ? await this.tenantPrisma.client.commerceListingDraftVersion.findMany({
          where: {
            businessId,
            OR: drafts.map((draft) => ({
              draftId: draft.id,
              version: draft.currentVersion,
            })),
          },
        })
      : [];
    const versionByDraftId = new Map(
      versions.map((version) => [version.draftId, version]),
    );

    return drafts.map((draft) =>
      this.serialise(draft, versionByDraftId.get(draft.id)),
    );
  }

  async getOne(businessId: string, draftId: string) {
    const draft = await this.findDraft(businessId, draftId);
    const version =
      await this.tenantPrisma.client.commerceListingDraftVersion.findFirst({
        where: {
          businessId,
          draftId,
          version: draft.currentVersion,
        },
      });
    if (!version) this.notFound();
    return this.serialise(draft, version);
  }

  async history(businessId: string, draftId: string) {
    await this.findDraft(businessId, draftId);
    const [versions, audits] = await Promise.all([
      this.tenantPrisma.client.commerceListingDraftVersion.findMany({
        where: { businessId, draftId },
        orderBy: [{ version: 'desc' }, { createdAt: 'desc' }],
      }),
      this.tenantPrisma.client.commerceListingDraftAudit.findMany({
        where: { businessId, draftId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    ]);
    return {
      versions: versions.map((version) => ({
        ...version,
        content: readContent(version.content),
        sources: readSources(version.sources),
      })),
      audits,
    };
  }

  async generate(
    businessId: string,
    actorUserId: string,
    dto: GenerateCommerceListingDraftDto,
  ) {
    await assertCommerceNotPaused(this.tenantPrisma, businessId);
    const product = await this.tenantPrisma.client.product.findFirst({
      where: { id: dto.productId, businessId },
      select: {
        id: true,
        name: true,
        category: true,
        sellingPrice: true,
      },
    });
    if (!product) {
      throw new AppException(
        COMMERCE_LISTING_ERROR_CODES.PRODUCT_NOT_FOUND,
        'Choose a product from this business catalog.',
        HttpStatus.NOT_FOUND,
      );
    }

    const sources = appendMerchantEvidence(
      this.productSources(product),
      dto.merchantEvidence,
    );
    const content = await this.generateContent(
      businessId,
      dto.channel,
      dto.market ?? null,
      dto.language ?? 'en',
      dto.brandVoice?.trim() || null,
      sources,
    );
    const draft = await this.tenantPrisma.client.$transaction(async (tx) => {
      const created = await tx.commerceListingDraft.create({
        data: {
          businessId,
          productId: product.id,
          channel: dto.channel,
          market: dto.market?.trim() || null,
          language: dto.language ?? 'en',
          brandVoice: dto.brandVoice?.trim() || null,
          status: CommerceListingDraftStatus.review_required,
          currentVersion: 1,
          createdByUserId: actorUserId,
          versions: {
            create: {
              businessId,
              version: 1,
              content: toJson(content),
              sources: toJson(sources),
              generationMethod: 'ai',
              createdByUserId: actorUserId,
            },
          },
          audits: {
            create: {
              businessId,
              action: 'draft_generated',
              after: toJson({ version: 1, status: 'review_required' }),
              actorUserId,
            },
          },
        },
      });
      return created;
    });
    const result = await this.getOne(businessId, draft.id);
    await this.activity.record(businessId, {
      type: ActivityEventType.commerce_listing_draft,
      description: `Listing draft generated for ${product.name} on ${dto.channel}`,
      entityType: 'CommerceListingDraft',
      entityId: draft.id,
      actorUserId,
    });
    return result;
  }

  async regenerate(
    businessId: string,
    actorUserId: string,
    draftId: string,
    dto: RegenerateCommerceListingDraftDto,
  ) {
    const current = await this.findDraft(businessId, draftId);
    if (current.currentVersion !== dto.expectedVersion) this.versionConflict();
    const currentVersion = await this.currentVersion(businessId, current);
    const sources = appendMerchantEvidence(
      readSources(currentVersion.sources),
      dto.merchantEvidence,
    );
    const content = await this.generateContent(
      businessId,
      current.channel,
      current.market,
      current.language,
      current.brandVoice,
      sources,
    );
    await this.createVersion({
      businessId,
      actorUserId,
      draft: current,
      version: dto.expectedVersion + 1,
      content,
      sources,
      generationMethod: 'ai',
      reason:
        dto.reason?.trim() || 'Regenerated AI draft from recorded sources.',
      action: 'draft_regenerated',
    });
    return this.getOne(businessId, draftId);
  }

  async edit(
    businessId: string,
    actorUserId: string,
    draftId: string,
    dto: EditCommerceListingDraftDto,
  ) {
    const current = await this.findDraft(businessId, draftId);
    if (current.currentVersion !== dto.expectedVersion) this.versionConflict();
    const currentVersion = await this.currentVersion(businessId, current);
    const sources = appendMerchantEvidence(
      readSources(currentVersion.sources),
      dto.merchantEvidence,
    );
    const content = parseContent(dto.content, sources);
    await this.createVersion({
      businessId,
      actorUserId,
      draft: current,
      version: dto.expectedVersion + 1,
      content,
      sources,
      generationMethod: 'manual',
      reason: dto.reason.trim(),
      action: 'draft_edited',
    });
    return this.getOne(businessId, draftId);
  }

  async approve(
    businessId: string,
    actorUserId: string,
    draftId: string,
    dto: ApproveCommerceListingDraftDto,
  ) {
    const current = await this.findDraft(businessId, draftId);
    if (current.currentVersion !== dto.expectedVersion) this.versionConflict();
    if (current.status === CommerceListingDraftStatus.approved) {
      return this.getOne(businessId, draftId);
    }
    if (current.status !== CommerceListingDraftStatus.review_required) {
      throw new AppException(
        COMMERCE_LISTING_ERROR_CODES.INVALID_STATE,
        'Only a draft awaiting review can be approved.',
        HttpStatus.CONFLICT,
      );
    }
    if (!dto.confirmedSourceAccuracy) {
      throw new AppException(
        COMMERCE_LISTING_ERROR_CODES.SOURCE_CONFIRMATION_REQUIRED,
        'Confirm that every listing claim matches its cited source before approval.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const version = await this.currentVersion(businessId, current);
    parseContent(version.content, readSources(version.sources));

    await this.tenantPrisma.client.$transaction(async (tx) => {
      const changed = await tx.commerceListingDraft.updateMany({
        where: {
          id: draftId,
          businessId,
          currentVersion: dto.expectedVersion,
          status: CommerceListingDraftStatus.review_required,
        },
        data: { status: CommerceListingDraftStatus.approved },
      });
      if (changed.count !== 1) this.versionConflict();

      const versionChanged = await tx.commerceListingDraftVersion.updateMany({
        where: {
          businessId,
          draftId,
          version: dto.expectedVersion,
          approvedAt: null,
        },
        data: {
          approvedAt: new Date(),
          approvedByUserId: actorUserId,
          approvalReason: dto.reason.trim(),
        },
      });
      if (versionChanged.count !== 1) this.versionConflict();

      await tx.commerceListingDraftAudit.create({
        data: {
          businessId,
          draftId,
          action: 'content_approved',
          reason: dto.reason.trim(),
          before: toJson({
            status: current.status,
            version: current.currentVersion,
          }),
          after: toJson({
            status: CommerceListingDraftStatus.approved,
            version: current.currentVersion,
          }),
          actorUserId,
        },
      });
    });
    const result = await this.getOne(businessId, draftId);
    await this.activity.record(businessId, {
      type: ActivityEventType.commerce_listing_draft,
      description: `Listing content approved for ${current.product.name} on ${current.channel}`,
      entityType: 'CommerceListingDraft',
      entityId: draftId,
      actorUserId,
    });
    return result;
  }

  private async generateContent(
    businessId: string,
    channel: string,
    market: string | null,
    language: string,
    brandVoice: string | null,
    sources: ListingSource[],
  ): Promise<ListingContent> {
    const prompt = [
      'Create a channel listing content draft using only the supplied source records.',
      'Do not add product details, benefits, specifications, certifications, guarantees, performance claims, shipping promises, or return terms that are not stated in those sources.',
      'Every factual text block must cite one or more exact source IDs from the input.',
      'If the sources are sparse, keep the wording sparse. Do not fill gaps by guessing.',
      'Return only valid JSON with this exact shape:',
      '{"title":{"text":"...","sourceIds":["..."]},"bullets":[{"text":"...","sourceIds":["..."]}],"description":{"text":"...","sourceIds":["..."]},"faq":[{"question":"...","answer":{"text":"...","sourceIds":["..."]}}],"seo":{"metaTitle":{"text":"...","sourceIds":["..."]},"metaDescription":{"text":"...","sourceIds":["..."]},"keywords":[{"text":"...","sourceIds":["..."]}]}}',
      `Target channel: ${channel}`,
      `Market: ${market ?? 'not supplied'}`,
      `Language: ${language}`,
      `Brand voice direction (style only; not a product fact): ${brandVoice ?? 'not supplied'}`,
      `Available sources: ${JSON.stringify(sources)}`,
    ].join('\n\n');
    const raw = await this.ai.complete(businessId, prompt, 0.1, 'complete');
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.replace(/^```(?:json)?\s*|\s*```$/g, '').trim());
    } catch {
      throw new AppException(
        COMMERCE_LISTING_ERROR_CODES.INVALID_CONTENT,
        'The AI provider returned a response that could not be validated. Please try again.',
        HttpStatus.BAD_GATEWAY,
      );
    }
    return parseContent(parsed, sources);
  }

  private async createVersion(input: {
    businessId: string;
    actorUserId: string;
    draft: {
      id: string;
      currentVersion: number;
      status: CommerceListingDraftStatus;
      channel: string;
      product: { name: string };
    };
    version: number;
    content: ListingContent;
    sources: ListingSource[];
    generationMethod: 'ai' | 'manual';
    reason: string;
    action: string;
  }) {
    await this.tenantPrisma.client.$transaction(async (tx) => {
      const changed = await tx.commerceListingDraft.updateMany({
        where: {
          id: input.draft.id,
          businessId: input.businessId,
          currentVersion: input.draft.currentVersion,
        },
        data: {
          currentVersion: input.version,
          status: CommerceListingDraftStatus.review_required,
        },
      });
      if (changed.count !== 1) this.versionConflict();

      await tx.commerceListingDraftVersion.create({
        data: {
          businessId: input.businessId,
          draftId: input.draft.id,
          version: input.version,
          content: toJson(input.content),
          sources: toJson(input.sources),
          generationMethod: input.generationMethod,
          changeReason: input.reason,
          createdByUserId: input.actorUserId,
        },
      });
      await tx.commerceListingDraftAudit.create({
        data: {
          businessId: input.businessId,
          draftId: input.draft.id,
          action: input.action,
          reason: input.reason,
          before: toJson({
            version: input.draft.currentVersion,
            status: input.draft.status,
          }),
          after: toJson({
            version: input.version,
            status: CommerceListingDraftStatus.review_required,
          }),
          actorUserId: input.actorUserId,
        },
      });
    });
    await this.activity.record(input.businessId, {
      type: ActivityEventType.commerce_listing_draft,
      description: `Listing draft ${input.action.replaceAll('_', ' ')} for ${input.draft.product.name} on ${input.draft.channel}`,
      entityType: 'CommerceListingDraft',
      entityId: input.draft.id,
      actorUserId: input.actorUserId,
    });
  }

  private async findDraft(businessId: string, draftId: string) {
    const draft = await this.tenantPrisma.client.commerceListingDraft.findFirst(
      {
        where: { id: draftId, businessId },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              category: true,
              sellingPrice: true,
              active: true,
            },
          },
        },
      },
    );
    if (!draft) this.notFound();
    return draft;
  }

  private async currentVersion(
    businessId: string,
    draft: { id: string; currentVersion: number },
  ) {
    const version =
      await this.tenantPrisma.client.commerceListingDraftVersion.findFirst({
        where: {
          businessId,
          draftId: draft.id,
          version: draft.currentVersion,
        },
      });
    if (!version) this.notFound();
    return version;
  }

  private productSources(product: {
    name: string;
    category: string | null;
    sellingPrice: Prisma.Decimal;
  }): ListingSource[] {
    const sources: ListingSource[] = [
      {
        id: 'product_name',
        label: 'Canonical product name',
        value: product.name,
        origin: 'canonical_product',
      },
    ];
    if (product.category) {
      sources.push({
        id: 'product_category',
        label: 'Canonical product category',
        value: product.category,
        origin: 'canonical_product',
      });
    }
    if (Number(product.sellingPrice) > 0) {
      sources.push({
        id: 'product_selling_price',
        label: 'Canonical current selling price',
        value: String(Number(product.sellingPrice)),
        origin: 'canonical_product',
      });
    }
    return sources;
  }

  private serialise(
    draft: {
      id: string;
      businessId: string;
      productId: string;
      channel: string;
      market: string | null;
      language: string;
      brandVoice: string | null;
      status: CommerceListingDraftStatus;
      currentVersion: number;
      createdByUserId: string | null;
      createdAt: Date;
      updatedAt: Date;
      product: {
        id: string;
        name: string;
        category: string | null;
        sellingPrice: Prisma.Decimal;
        active: boolean;
      };
    },
    version:
      | {
          version: number;
          content: Prisma.JsonValue;
          sources: Prisma.JsonValue;
          generationMethod: string;
          createdByUserId: string | null;
          approvedByUserId: string | null;
          approvedAt: Date | null;
          approvalReason: string | null;
          createdAt: Date;
        }
      | undefined,
  ) {
    return {
      id: draft.id,
      productId: draft.productId,
      product: {
        ...draft.product,
        sellingPrice: Number(draft.product.sellingPrice),
      },
      channel: draft.channel,
      market: draft.market,
      language: draft.language,
      brandVoice: draft.brandVoice,
      status: draft.status,
      currentVersion: draft.currentVersion,
      createdByUserId: draft.createdByUserId,
      createdAt: draft.createdAt,
      updatedAt: draft.updatedAt,
      latestVersion: version
        ? {
            version: version.version,
            content: readContent(version.content),
            sources: readSources(version.sources),
            generationMethod: version.generationMethod,
            createdByUserId: version.createdByUserId,
            approvedByUserId: version.approvedByUserId,
            approvedAt: version.approvedAt,
            approvalReason: version.approvalReason,
            createdAt: version.createdAt,
          }
        : null,
      publishStatus:
        draft.status === CommerceListingDraftStatus.approved
          ? 'channel_sync_available'
          : 'approval_required',
      note: 'After human approval, a connected Shopify or WooCommerce store can receive this content. A new product is created as a draft; later syncs preserve the provider product publication status. Other channels are not supported yet.',
    };
  }

  private notFound(): never {
    throw new AppException(
      COMMERCE_LISTING_ERROR_CODES.NOT_FOUND,
      'Listing draft was not found.',
      HttpStatus.NOT_FOUND,
    );
  }

  private versionConflict(): never {
    throw new AppException(
      COMMERCE_LISTING_ERROR_CODES.VERSION_CONFLICT,
      'This listing changed since it was opened. Refresh and try again.',
      HttpStatus.CONFLICT,
    );
  }
}
