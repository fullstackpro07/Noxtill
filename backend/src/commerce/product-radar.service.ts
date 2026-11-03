import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ProductOpportunityRisk,
  ProductOpportunityStatus,
} from '@prisma/client';
import { AppException } from '../common/filters/app.exception';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import {
  PRODUCT_OPPORTUNITY_ACTIONS,
  PRODUCT_OPPORTUNITY_ERROR_CODES,
  type ProductOpportunityAction,
} from './commerce.constants';
import {
  CreateProductOpportunityDto,
  ProductOpportunityActionDto,
  UpdateProductOpportunityDto,
} from './dto/product-opportunity.dto';

type OpportunityRecord = {
  id: string;
  title: string;
  source: string;
  sourceReference: string | null;
  externalEntityId: string | null;
  category: string | null;
  market: string | null;
  observedPrice: unknown;
  estimatedLandedCost: unknown;
  demandSignal: number | null;
  competitionScore: number | null;
  trendVelocity: number | null;
  storeFitScore: number | null;
  marginEstimate: unknown;
  supplierCount: number | null;
  shippingEstimate: unknown;
  risk: ProductOpportunityRisk;
  status: ProductOpportunityStatus;
  evidence: string | null;
  confidence: number | null;
  sourceFreshAt: Date | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

type OpportunityAuditRecord = {
  id: string;
  action: string;
  reason: string | null;
  before: unknown;
  after: unknown;
  actorUserId: string | null;
  createdAt: Date;
};

function optionalText(
  value: string | null | undefined,
): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function serialiseOpportunity(record: OpportunityRecord) {
  return {
    ...record,
    observedPrice:
      record.observedPrice === null ? null : Number(record.observedPrice),
    estimatedLandedCost:
      record.estimatedLandedCost === null
        ? null
        : Number(record.estimatedLandedCost),
    marginEstimate:
      record.marginEstimate === null ? null : Number(record.marginEstimate),
    shippingEstimate:
      record.shippingEstimate === null ? null : Number(record.shippingEstimate),
  };
}

function snapshotOpportunity(record: OpportunityRecord) {
  return {
    title: record.title,
    source: record.source,
    sourceReference: record.sourceReference,
    externalEntityId: record.externalEntityId,
    category: record.category,
    market: record.market,
    observedPrice:
      record.observedPrice === null ? null : Number(record.observedPrice),
    estimatedLandedCost:
      record.estimatedLandedCost === null
        ? null
        : Number(record.estimatedLandedCost),
    demandSignal: record.demandSignal,
    competitionScore: record.competitionScore,
    trendVelocity: record.trendVelocity,
    storeFitScore: record.storeFitScore,
    marginEstimate:
      record.marginEstimate === null ? null : Number(record.marginEstimate),
    supplierCount: record.supplierCount,
    shippingEstimate:
      record.shippingEstimate === null ? null : Number(record.shippingEstimate),
    risk: record.risk,
    status: record.status,
    evidence: record.evidence,
    confidence: record.confidence,
    sourceFreshAt: record.sourceFreshAt?.toISOString() ?? null,
    version: record.version,
  };
}

/**
 * Screen 1 of Autonomous Commerce. Product Radar stores research candidates only; it does not
 * create Products, touch stock or publish listings. External provider ingestion is intentionally
 * absent until a configured Integration can provide a traceable source and freshness timestamp.
 */
@Injectable()
export class ProductRadarService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async list(
    businessId: string,
    filters: { status?: ProductOpportunityStatus; search?: string },
  ) {
    const search = filters.search?.trim();
    const records = await this.tenantPrisma.client.productOpportunity.findMany({
      where: {
        businessId,
        status: filters.status,
        ...(search
          ? {
              OR: [
                { title: { contains: search } },
                { source: { contains: search } },
                { category: { contains: search } },
                { market: { contains: search } },
                { externalEntityId: { contains: search } },
              ],
            }
          : {}),
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    });
    return records.map(serialiseOpportunity);
  }

  async findOne(businessId: string, id: string) {
    const record = await this.tenantPrisma.client.productOpportunity.findFirst({
      where: { id, businessId },
    });
    if (!record) this.notFound();
    return record;
  }

  async getOne(businessId: string, id: string) {
    return serialiseOpportunity(await this.findOne(businessId, id));
  }

  async create(
    businessId: string,
    actorUserId: string,
    dto: CreateProductOpportunityDto,
  ) {
    const data = this.toCreateData(dto);
    const result = await this.tenantPrisma.client.$transaction(async (tx) => {
      const created = await tx.productOpportunity.create({
        data: { businessId, ...data },
      });
      await tx.productOpportunityAudit.create({
        data: {
          businessId,
          opportunityId: created.id,
          action: 'created',
          after: snapshotOpportunity(created),
          actorUserId,
        },
      });
      return created;
    });
    return serialiseOpportunity(result);
  }

  async update(
    businessId: string,
    actorUserId: string,
    id: string,
    dto: UpdateProductOpportunityDto,
  ) {
    const current = await this.findOne(businessId, id);
    this.assertExpectedVersion(current.version, dto.expectedVersion);
    const data = this.toUpdateData(dto);
    const updated = await this.tenantPrisma.client.$transaction(async (tx) => {
      const changed = await tx.productOpportunity.updateMany({
        where: { id, businessId, version: current.version },
        data: { ...data, version: { increment: 1 } },
      });
      if (changed.count !== 1) throw this.versionConflict();
      const next = await tx.productOpportunity.findFirst({
        where: { id, businessId },
      });
      if (!next) this.notFound();
      await tx.productOpportunityAudit.create({
        data: {
          businessId,
          opportunityId: id,
          action: 'updated',
          before: snapshotOpportunity(current),
          after: snapshotOpportunity(next),
          actorUserId,
        },
      });
      return next;
    });
    return serialiseOpportunity(updated);
  }

  async action(
    businessId: string,
    actorUserId: string,
    id: string,
    action: string,
    dto: ProductOpportunityActionDto,
  ) {
    if (
      !PRODUCT_OPPORTUNITY_ACTIONS.includes(action as ProductOpportunityAction)
    ) {
      throw new AppException(
        PRODUCT_OPPORTUNITY_ERROR_CODES.INVALID_ACTION,
        'Unsupported Product Radar action',
        HttpStatus.BAD_REQUEST,
      );
    }
    const current = await this.findOne(businessId, id);
    this.assertExpectedVersion(current.version, dto.expectedVersion);
    const status = this.statusForAction(action as ProductOpportunityAction);
    const updated = await this.tenantPrisma.client.$transaction(async (tx) => {
      const changed = await tx.productOpportunity.updateMany({
        where: { id, businessId, version: current.version },
        data: { status, version: { increment: 1 } },
      });
      if (changed.count !== 1) throw this.versionConflict();
      const next = await tx.productOpportunity.findFirst({
        where: { id, businessId },
      });
      if (!next) this.notFound();
      await tx.productOpportunityAudit.create({
        data: {
          businessId,
          opportunityId: id,
          action,
          reason: optionalText(dto.reason),
          before: snapshotOpportunity(current),
          after: snapshotOpportunity(next),
          actorUserId,
        },
      });
      return next;
    });
    return serialiseOpportunity(updated);
  }

  async listAudit(businessId: string, id: string) {
    await this.findOne(businessId, id);
    const audits =
      await this.tenantPrisma.client.productOpportunityAudit.findMany({
        where: { businessId, opportunityId: id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
    return audits.map((audit) => this.serialiseAudit(audit));
  }

  private toCreateData(dto: CreateProductOpportunityDto) {
    return {
      title: dto.title.trim(),
      source: dto.source.trim(),
      sourceReference: optionalText(dto.sourceReference),
      externalEntityId: optionalText(dto.externalEntityId),
      category: optionalText(dto.category),
      market: optionalText(dto.market),
      observedPrice: dto.observedPrice,
      estimatedLandedCost: dto.estimatedLandedCost,
      demandSignal: dto.demandSignal,
      competitionScore: dto.competitionScore,
      trendVelocity: dto.trendVelocity,
      storeFitScore: dto.storeFitScore,
      marginEstimate: dto.marginEstimate,
      supplierCount: dto.supplierCount,
      shippingEstimate: dto.shippingEstimate,
      risk: dto.risk,
      evidence: optionalText(dto.evidence),
      confidence: dto.confidence,
      sourceFreshAt:
        dto.sourceFreshAt == null
          ? dto.sourceFreshAt
          : new Date(dto.sourceFreshAt),
    };
  }

  private toUpdateData(dto: UpdateProductOpportunityDto) {
    const { expectedVersion: _, ...fields } = dto;
    const sourceFreshAt =
      fields.sourceFreshAt == null
        ? fields.sourceFreshAt
        : new Date(fields.sourceFreshAt);
    return {
      ...(fields.title === undefined ? {} : { title: fields.title.trim() }),
      ...(fields.source === undefined ? {} : { source: fields.source.trim() }),
      sourceReference: optionalText(fields.sourceReference),
      externalEntityId: optionalText(fields.externalEntityId),
      category: optionalText(fields.category),
      market: optionalText(fields.market),
      observedPrice: fields.observedPrice,
      estimatedLandedCost: fields.estimatedLandedCost,
      demandSignal: fields.demandSignal,
      competitionScore: fields.competitionScore,
      trendVelocity: fields.trendVelocity,
      storeFitScore: fields.storeFitScore,
      marginEstimate: fields.marginEstimate,
      supplierCount: fields.supplierCount,
      shippingEstimate: fields.shippingEstimate,
      risk: fields.risk,
      evidence: optionalText(fields.evidence),
      confidence: fields.confidence,
      sourceFreshAt,
    };
  }

  private statusForAction(
    action: ProductOpportunityAction,
  ): ProductOpportunityStatus {
    switch (action) {
      case 'save':
        return ProductOpportunityStatus.saved;
      case 'watch':
        return ProductOpportunityStatus.watching;
      case 'dismiss':
        return ProductOpportunityStatus.dismissed;
      case 'send_to_validation':
        return ProductOpportunityStatus.validation_requested;
    }
  }

  private assertExpectedVersion(current: number, expected?: number) {
    if (expected !== undefined && expected !== current) {
      throw this.versionConflict();
    }
  }

  private versionConflict() {
    return new AppException(
      PRODUCT_OPPORTUNITY_ERROR_CODES.VERSION_CONFLICT,
      'This opportunity changed. Refresh it before saving your changes.',
      HttpStatus.CONFLICT,
    );
  }

  private notFound(): never {
    throw new AppException(
      PRODUCT_OPPORTUNITY_ERROR_CODES.NOT_FOUND,
      'Product opportunity not found',
      HttpStatus.NOT_FOUND,
    );
  }

  private serialiseAudit(audit: OpportunityAuditRecord) {
    return audit;
  }
}
