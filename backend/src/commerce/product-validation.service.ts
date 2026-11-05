import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
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
import { resolvePolicies } from '../common/policies/policies.service';
import {
  COMMERCE_VALIDATION_EVENT_JOB,
  SPECIALIST_AGENT_COMMERCE_EVENTS_QUEUE,
} from '../common/agents/specialist-agent-events.constants';

function numeric(value: unknown): number | null {
  return value === null || value === undefined ? null : Number(value);
}

type EvidenceFactor = {
  key: string;
  value: unknown;
  status: 'recorded' | 'not_recorded';
};

type ValidationDimensionStatus =
  'inputs_recorded' | 'partial_evidence' | 'not_tracked';

function validationDimension(
  key: string,
  label: string,
  fieldKeys: string[],
  factors: EvidenceFactor[],
  assumptions: string[],
  missingData: string[],
) {
  const recordedFields = fieldKeys.filter((fieldKey) =>
    factors.some(
      (factor) => factor.key === fieldKey && factor.status === 'recorded',
    ),
  );
  const missingFields = fieldKeys.filter(
    (fieldKey) => !recordedFields.includes(fieldKey),
  );
  const status: ValidationDimensionStatus =
    recordedFields.length === 0
      ? 'not_tracked'
      : missingFields.length === 0
        ? 'inputs_recorded'
        : 'partial_evidence';

  return {
    key,
    label,
    status,
    recordedFields,
    missingFields,
    assumptions,
    missingData,
  };
}

function snapshotEvidence(opportunity: ProductOpportunity) {
  const factors: EvidenceFactor[] = [
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
    scorecard: {
      status: 'evidence_only_not_scored',
      interpretation:
        'This scorecard reports which source fields are recorded. It calculates no dimension score, overall score, probability or pass/fail result.',
      dimensions: [
        validationDimension(
          'demand_and_competition',
          'Demand and competition',
          ['demand_signal', 'trend_velocity', 'competition_score'],
          factors,
          [
            'Values are stored Product Radar research inputs; this scorecard does not verify the underlying source or combine them into a score.',
          ],
          [
            'Missing demand or competition fields remain unknown; recorded values may have no freshness timestamp.',
          ],
        ),
        validationDimension(
          'economics',
          'Economics',
          [
            'observed_price',
            'estimated_landed_cost',
            'margin_estimate',
            'shipping_estimate',
          ],
          factors,
          [
            'Price, landed cost, margin and shipping are stored research inputs; no additional tax, fee or currency conversion is calculated here.',
          ],
          [
            'Missing amounts stay unavailable; a recorded estimate is not a realized cost or profitability result.',
          ],
        ),
        validationDimension(
          'supply',
          'Supply',
          ['supplier_count'],
          factors,
          [
            'Supplier count is a stored Product Radar value and does not prove a supplier is verified or able to fulfill.',
          ],
          [
            'Supplier quality, capacity, compliance, delivery performance and current terms are not assessed by this scorecard.',
          ],
        ),
        validationDimension(
          'store_fit',
          'Store fit',
          ['store_fit_score'],
          factors,
          [
            'Store-fit value is shown as recorded and is not recalculated from catalog or order data.',
          ],
          [
            'The fit method and source evidence are not independently verified here.',
          ],
        ),
        validationDimension(
          'compliance',
          'Compliance',
          [],
          factors,
          [],
          [
            'Product-level compliance evidence is not tracked by Product Radar.',
          ],
        ),
        validationDimension(
          'return_risk',
          'Return risk',
          [],
          factors,
          [],
          ['Product-level customer return-risk evidence is not tracked here.'],
        ),
      ],
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
  private readonly logger = new Logger(ProductValidationService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly activity: ActivityService,
    @InjectQueue(SPECIALIST_AGENT_COMMERCE_EVENTS_QUEUE)
    private readonly specialistAgentEvents: Queue,
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

  async specialistScorecards(businessId: string) {
    const maximumReviewed = 20;
    const opportunities =
      await this.tenantPrisma.client.productOpportunity.findMany({
        where: {
          businessId,
          status: ProductOpportunityStatus.validation_requested,
        },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: maximumReviewed + 1,
      });
    const hasMore = opportunities.length > maximumReviewed;
    const reviewed = opportunities.slice(0, maximumReviewed);

    return {
      state: reviewed.length === 0 ? 'no_candidates' : 'available',
      source: 'ProductOpportunity',
      reviewedCount: reviewed.length,
      maximumReviewed,
      hasMore,
      interpretation:
        'Evidence availability only. No dimension score, overall score, probability, launch recommendation or pass/fail result is calculated.',
      candidates: reviewed.map((opportunity) => ({
        opportunityId: opportunity.id,
        version: opportunity.version,
        source: opportunity.source,
        market: opportunity.market,
        risk: opportunity.risk,
        sourceFreshAt: opportunity.sourceFreshAt?.toISOString() ?? null,
        scorecard: snapshotEvidence(opportunity).scorecard,
      })),
      limitations: [
        'Only current validation_requested Product Radar opportunities are reviewed, most recently updated first, with a 20-candidate cap.',
        'Recorded Product Radar fields may be manual research and are not treated as provider-verified measurements.',
        'Compliance and product-level return-risk evidence are not tracked by this scorecard; the canonical validation screen continues to block launch approval while its required evidence/policy is unavailable.',
      ],
    };
  }

  async getOne(businessId: string, opportunityId: string) {
    const opportunity = await this.findOpportunity(businessId, opportunityId);
    return {
      ...serialiseOpportunity(opportunity),
      evidenceReview: snapshotEvidence(opportunity),
    };
  }

  async history(businessId: string, opportunityId: string, take?: number) {
    await this.findOpportunity(businessId, opportunityId);
    return this.tenantPrisma.client.productValidationRun.findMany({
      where: { businessId, opportunityId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...(take === undefined ? {} : { take }),
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
    await this.queueSpecialistReview(businessId, 'ProductValidationRun', result.validationRun.id);

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
    await this.queueSpecialistReview(businessId, 'Product', result.id);

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

  private async queueSpecialistReview(
    businessId: string,
    entityType: 'ProductValidationRun' | 'Product',
    entityId: string,
  ): Promise<void> {
    try {
      const business = await this.tenantPrisma.client.business.findFirst({
        where: { id: businessId },
        select: { policies: true },
      });
      const policies = resolvePolicies(business);
      if (
        !policies.bool('agents.commerceEnabled') ||
        !policies.bool('agents.commerceValidationEventReviewEnabled') ||
        (policies.num('commerce.autonomyLevel') ?? 0) <= 0
      ) {
        return;
      }

      // ActivityService intentionally swallows event-write failures; query by the unique domain
      // entity reference so only a persisted canonical event can start a review.
      const activityEvent = await this.tenantPrisma.client.activityEvent.findFirst({
        where: {
          businessId,
          type: ActivityEventType.commerce_validation,
          entityType,
          entityId,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { id: true },
      });
      if (!activityEvent) return;

      await this.specialistAgentEvents.add(
        COMMERCE_VALIDATION_EVENT_JOB,
        { businessId, activityEventId: activityEvent.id },
        {
          jobId: `commerce-validation-${businessId}-${activityEvent.id}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 1_000 },
          removeOnComplete: 200,
          removeOnFail: 500,
        },
      );
    } catch (error) {
      // An optional review must never undo or turn a successful validation mutation into a failure.
      this.logger.warn(
        `Could not queue Commerce specialist review for ${entityType} ${entityId}: ${(error as Error).message}`,
      );
    }
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
