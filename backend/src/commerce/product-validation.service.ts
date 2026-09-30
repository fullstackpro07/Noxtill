import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ActivityEventType,
  ProductOpportunity,
  ProductOpportunityRisk,
  ProductOpportunityStatus,
  ProductValidationDecision,
  Prisma,
} from '@prisma/client';
import { AppException } from '../common/filters/app.exception';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PRODUCT_VALIDATION_ERROR_CODES } from './commerce.constants';
import { ProductValidationDecisionDto } from './dto/product-validation.dto';
import { CreateValidationProductDto } from './dto/create-validation-product.dto';
import { ActivityService } from '../activity/activity.service';

function numeric(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

function snapshotEvidence(opportunity: ProductOpportunity) {
  const factors: Array<{
    key: string;
    value: unknown;
    status: 'recorded' | 'not_recorded';
  }> = [
    {
      key: 'demand_signal',
      value: opportunity.demandSignal,
      status: 'recorded',
    },
    {
      key: 'competition_score',
      value: opportunity.competitionScore,
      status: 'recorded',
    },
    {
      key: 'trend_velocity',
      value: opportunity.trendVelocity,
      status: 'recorded',
    },
    {
      key: 'store_fit_score',
      value: opportunity.storeFitScore,
      status: 'recorded',
    },
    {
      key: 'observed_price',
      value: numeric(opportunity.observedPrice),
      status: 'recorded',
    },
    {
      key: 'estimated_landed_cost',
      value: numeric(opportunity.estimatedLandedCost),
      status: 'recorded',
    },
    {
      key: 'margin_estimate',
      value: numeric(opportunity.marginEstimate),
      status: 'recorded',
    },
    {
      key: 'supplier_count',
      value: opportunity.supplierCount,
      status: 'recorded',
    },
    {
      key: 'shipping_estimate',
      value: numeric(opportunity.shippingEstimate),
      status: 'recorded',
    },
  ].map((factor) => ({
    ...factor,
    status:
      factor.value === null ? ('not_recorded' as const) : ('recorded' as const),
  }));

  return {
    opportunity: {
      id: opportunity.id,
      version: opportunity.version,
      title: opportunity.title,
      source: opportunity.source,
      sourceReference: opportunity.sourceReference,
      externalEntityId: opportunity.externalEntityId,
      category: opportunity.category,
      market: opportunity.market,
      risk: opportunity.risk,
      confidence: opportunity.confidence,
      evidence: opportunity.evidence,
      sourceFreshAt: opportunity.sourceFreshAt?.toISOString() ?? null,
      updatedAt: opportunity.updatedAt.toISOString(),
    },
    factors,
    evidenceCoverage: {
      recorded: factors.filter((factor) => factor.status === 'recorded').length,
      total: factors.length,
    },
    launchApproval: {
      available: false,
      reason: launchApprovalBlockReason(opportunity.risk),
    },
    unavailableDimensions: [
      {
        key: 'compliance_readiness',
        status: 'not_available',
        reason:
          'No product compliance evidence source is implemented or configured.',
      },
      {
        key: 'customer_return_risk',
        status: 'not_available',
        reason:
          'No product-level customer or return-risk evidence is recorded.',
      },
      {
        key: 'ad_saturation',
        status: 'not_available',
        reason:
          'Advertising saturation data is not connected to Product Radar.',
      },
    ],
  };
}

function serialiseOpportunity(opportunity: ProductOpportunity) {
  return {
    ...opportunity,
    observedPrice: numeric(opportunity.observedPrice),
    estimatedLandedCost: numeric(opportunity.estimatedLandedCost),
    marginEstimate: numeric(opportunity.marginEstimate),
    shippingEstimate: numeric(opportunity.shippingEstimate),
  };
}

function statusForDecision(
  decision: ProductValidationDecision,
): ProductOpportunityStatus {
  switch (decision) {
    case ProductValidationDecision.approve_test:
      return ProductOpportunityStatus.test_approved;
    case ProductValidationDecision.approve_launch:
      return ProductOpportunityStatus.launch_approved;
    case ProductValidationDecision.watch:
      return ProductOpportunityStatus.watching;
    case ProductValidationDecision.reject:
      return ProductOpportunityStatus.rejected;
  }
}

function launchApprovalBlockReason(risk: ProductOpportunityRisk): string {
  if (risk === ProductOpportunityRisk.blocked) {
    return 'A blocked candidate cannot be approved for launch.';
  }
  if (risk === ProductOpportunityRisk.high) {
    return 'A high-risk launch cannot be approved until compliance evidence and a risk approval policy are configured.';
  }
  return 'Launch approval is unavailable until compliance evidence and a launch approval policy are configured.';
}

@Injectable()
export class ProductValidationService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly activity: ActivityService,
  ) {}

  async list(businessId: string, search?: string) {
    const term = search?.trim();
    const opportunities =
      await this.tenantPrisma.client.productOpportunity.findMany({
        where: {
          businessId,
          status: ProductOpportunityStatus.validation_requested,
          ...(term
            ? {
                OR: [
                  { title: { contains: term } },
                  { category: { contains: term } },
                  { market: { contains: term } },
                  { source: { contains: term } },
                  { externalEntityId: { contains: term } },
                ],
              }
            : {}),
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      });

    return opportunities.map((opportunity) => ({
      ...serialiseOpportunity(opportunity),
      evidenceReview: snapshotEvidence(opportunity),
    }));
  }

  async getOne(businessId: string, opportunityId: string) {
    const opportunity = await this.findOpportunity(businessId, opportunityId);
    return {
      ...serialiseOpportunity(opportunity),
      evidenceReview: snapshotEvidence(opportunity),
    };
  }

  async history(businessId: string, opportunityId: string) {
    await this.findOpportunity(businessId, opportunityId);
    return this.tenantPrisma.client.productValidationRun.findMany({
      where: { businessId, opportunityId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  async decide(
    businessId: string,
    actorUserId: string,
    opportunityId: string,
    dto: ProductValidationDecisionDto,
  ) {
    const current = await this.findOpportunity(businessId, opportunityId);
    if (current.status !== ProductOpportunityStatus.validation_requested) {
      throw new AppException(
        PRODUCT_VALIDATION_ERROR_CODES.NOT_IN_QUEUE,
        'This candidate is not currently awaiting validation.',
        HttpStatus.CONFLICT,
      );
    }
    if (current.version !== dto.expectedVersion) this.versionConflict();
    if (dto.decision === ProductValidationDecision.approve_launch) {
      throw new AppException(
        PRODUCT_VALIDATION_ERROR_CODES.LAUNCH_BLOCKED,
        launchApprovalBlockReason(current.risk),
        HttpStatus.FORBIDDEN,
      );
    }

    const reason = dto.reason.trim();
    const evidenceSnapshot = snapshotEvidence(current);
    const nextStatus = statusForDecision(dto.decision);

    const result = await this.tenantPrisma.client.$transaction(async (tx) => {
      const changed = await tx.productOpportunity.updateMany({
        where: {
          id: opportunityId,
          businessId,
          status: ProductOpportunityStatus.validation_requested,
          version: current.version,
        },
        data: { status: nextStatus, version: { increment: 1 } },
      });
      if (changed.count !== 1) this.versionConflict();

      const opportunity = await tx.productOpportunity.findFirst({
        where: { id: opportunityId, businessId },
      });
      if (!opportunity) this.notFound();

      const validationRun = await tx.productValidationRun.create({
        data: {
          businessId,
          opportunityId,
          decision: dto.decision,
          reason,
          evidenceSnapshot: evidenceSnapshot as Prisma.InputJsonValue,
          actorUserId,
        },
      });
      await tx.productOpportunityAudit.create({
        data: {
          businessId,
          opportunityId,
          action: `validation_${dto.decision}`,
          reason,
          before: {
            status: current.status,
            version: current.version,
          } satisfies Prisma.InputJsonObject,
          after: {
            status: opportunity.status,
            version: opportunity.version,
            validationRunId: validationRun.id,
            decision: dto.decision,
          } satisfies Prisma.InputJsonObject,
          actorUserId,
        },
      });

      return { opportunity, validationRun };
    });

    await this.activity.record(businessId, {
      type: ActivityEventType.commerce_validation,
      description: `Product validation ${dto.decision.replaceAll('_', ' ')}: ${result.opportunity.title}`,
      entityType: 'ProductValidationRun',
      entityId: result.validationRun.id,
      actorUserId,
    });

    return {
      opportunity: serialiseOpportunity(result.opportunity),
      decision: result.validationRun,
      sideEffects: [],
      note: 'Decision and evidence were recorded. No Product was created and no channel was published.',
    };
  }

  async createCanonicalProduct(
    businessId: string,
    actorUserId: string,
    opportunityId: string,
    dto: CreateValidationProductDto,
  ) {
    const current = await this.findOpportunity(businessId, opportunityId);
    if (current.productId) {
      const product = await this.tenantPrisma.client.product.findFirst({
        where: { id: current.productId, businessId },
      });
      if (product)
        return {
          product: this.serialiseCatalogProduct(product),
          alreadyExists: true,
        };
    }
    if (
      current.status !== ProductOpportunityStatus.test_approved &&
      current.status !== ProductOpportunityStatus.launch_approved
    ) {
      throw new AppException(
        PRODUCT_VALIDATION_ERROR_CODES.PRODUCT_CREATION_NOT_ALLOWED,
        'Approve this candidate for a test before creating a catalog draft.',
        HttpStatus.CONFLICT,
      );
    }
    if (current.version !== dto.expectedVersion) this.versionConflict();

    const sku = dto.sku?.trim() || null;
    const result = await this.tenantPrisma.client.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          businessId,
          kind: 'product',
          name: current.title,
          category: current.category,
          sku,
          costPrice: dto.costPrice,
          sellingPrice: dto.sellingPrice,
          stockQty: 0,
          active: false,
        },
      });
      const changed = await tx.productOpportunity.updateMany({
        where: {
          id: opportunityId,
          businessId,
          productId: null,
          version: current.version,
          status: {
            in: [
              ProductOpportunityStatus.test_approved,
              ProductOpportunityStatus.launch_approved,
            ],
          },
        },
        data: {
          productId: product.id,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) this.versionConflict();

      await tx.productOpportunityAudit.create({
        data: {
          businessId,
          opportunityId,
          action: 'canonical_product_created',
          before: {
            productId: null,
            status: current.status,
            version: current.version,
          } satisfies Prisma.InputJsonObject,
          after: {
            productId: product.id,
            productName: product.name,
            sku: product.sku,
            active: product.active,
            stockQty: product.stockQty,
            version: current.version + 1,
          } satisfies Prisma.InputJsonObject,
          actorUserId,
        },
      });

      return product;
    });

    await this.activity.record(businessId, {
      type: ActivityEventType.commerce_validation,
      description: `Inactive catalog draft created from validation: ${result.name}`,
      entityType: 'Product',
      entityId: result.id,
      actorUserId,
    });

    return {
      product: this.serialiseCatalogProduct(result),
      alreadyExists: false,
    };
  }

  private serialiseCatalogProduct(product: {
    id: string;
    name: string;
    category: string | null;
    sku: string | null;
    costPrice: Prisma.Decimal;
    sellingPrice: Prisma.Decimal;
    stockQty: number;
    active: boolean;
  }) {
    return {
      ...product,
      costPrice: Number(product.costPrice),
      sellingPrice: Number(product.sellingPrice),
    };
  }

  private findOpportunity(businessId: string, opportunityId: string) {
    return this.tenantPrisma.client.productOpportunity
      .findFirst({ where: { id: opportunityId, businessId } })
      .then((opportunity) => {
        if (!opportunity) this.notFound();
        return opportunity;
      });
  }

  private versionConflict(): never {
    throw new AppException(
      PRODUCT_VALIDATION_ERROR_CODES.VERSION_CONFLICT,
      'This candidate changed. Refresh it before recording a validation decision.',
      HttpStatus.CONFLICT,
    );
  }

  private notFound(): never {
    throw new AppException(
      PRODUCT_VALIDATION_ERROR_CODES.NOT_FOUND,
      'Product validation candidate not found',
      HttpStatus.NOT_FOUND,
    );
  }
}
