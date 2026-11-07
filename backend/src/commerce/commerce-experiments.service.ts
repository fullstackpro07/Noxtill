import { HttpStatus, Injectable } from '@nestjs/common';
import {
  CommerceExperimentMetric,
  CommerceExperimentStatus,
  CommerceExperimentType,
  OrderStatus,
  Prisma,
  ReturnStatus,
} from '@prisma/client';
import { AppException } from '../common/filters/app.exception';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import {
  COMMERCE_EXPERIMENT_ERROR_CODES as CODES,
  COMMERCE_EXPERIMENT_RULES as RULES,
} from './commerce.constants';
import type { CreateCommerceExperimentDto } from './dto/commerce-experiment.dto';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Orders that represent a real sale (drafts and cancellations are not). */
const SALE_STATUSES: OrderStatus[] = [
  OrderStatus.pending,
  OrderStatus.confirmed,
  OrderStatus.in_progress,
  OrderStatus.completed,
];
const DECISIONS: CommerceExperimentStatus[] = [
  CommerceExperimentStatus.adopted,
  CommerceExperimentStatus.reverted,
  CommerceExperimentStatus.inconclusive,
];

export interface WindowMetrics {
  from: string;
  to: string;
  orders: number;
  units: number;
  revenue: number;
  cost: number;
  grossMarginPct: number | null;
  returnedUnits: number;
  returnRatePct: number | null;
}

export interface ExperimentResults {
  computedAt: string;
  windowDays: number;
  baseline: WindowMetrics;
  test: WindowMetrics;
  primary: {
    metric: CommerceExperimentMetric;
    baselineValue: number | null;
    testValue: number | null;
    /** Relative change for units/revenue, percentage-point change for margin/return rate. */
    change: number | null;
    changeUnit: 'pct' | 'pts';
  };
  sufficient: boolean;
  insufficientReasons: string[];
  guardrail: {
    minMarginPct: number;
    testMarginPct: number | null;
    breached: boolean;
  } | null;
}

interface ProductSnapshot {
  name: string;
  sellingPrice: number;
  costPrice: number;
  photoKey: string | null;
  category: string | null;
  capturedAt: string;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function metricValue(
  window: WindowMetrics,
  metric: CommerceExperimentMetric,
): number | null {
  switch (metric) {
    case CommerceExperimentMetric.units:
      return window.units;
    case CommerceExperimentMetric.revenue:
      return window.revenue;
    case CommerceExperimentMetric.gross_margin:
      return window.grossMarginPct;
    case CommerceExperimentMetric.return_rate:
      return window.returnRatePct;
  }
}

/**
 * Experiment Lab (Autonomous Commerce). Noxtill has no storefront traffic and cannot split visitors
 * between variants, so an experiment here is an honest before/after comparison for one product:
 * the test window (start → stop/now) against an equal-length baseline window right before it,
 * measured on real orders and returns. Conversion is not tracked; seasonality is not controlled for;
 * a read is shown only once both windows meet a minimum sample, and it is never called significant.
 * The merchant makes the change themselves — Noxtill never edits prices or listings here.
 */
@Injectable()
export class CommerceExperimentsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private get db() {
    return this.tenantPrisma.client;
  }

  private async audit(
    businessId: string,
    experimentId: string,
    action: string,
    actorUserId: string | null,
    note?: string | null,
  ) {
    await this.db.commerceExperimentAudit.create({
      data: {
        businessId,
        experimentId,
        action,
        actorUserId,
        note: note ?? null,
      },
    });
  }

  private async snapshot(
    businessId: string,
    productId: string,
  ): Promise<ProductSnapshot> {
    const product = await this.db.product.findFirst({
      where: { id: productId, businessId },
      select: {
        name: true,
        sellingPrice: true,
        costPrice: true,
        photoKey: true,
        category: true,
      },
    });
    if (!product) {
      throw new AppException(
        CODES.PRODUCT_NOT_FOUND,
        'Product was not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    return {
      name: product.name,
      sellingPrice: Number(product.sellingPrice),
      costPrice: Number(product.costPrice),
      photoKey: product.photoKey,
      category: product.category,
      capturedAt: new Date().toISOString(),
    };
  }

  private async measureWindow(
    businessId: string,
    productId: string,
    from: Date,
    to: Date,
  ): Promise<WindowMetrics> {
    const [items, returned] = await Promise.all([
      this.db.orderItem.findMany({
        where: {
          productId,
          order: {
            businessId,
            isQuotation: false,
            status: { in: SALE_STATUSES },
            createdAt: { gte: from, lt: to },
          },
        },
        select: { orderId: true, qty: true, price: true, cost: true },
      }),
      this.db.returnItem.aggregate({
        where: {
          productId,
          return: {
            businessId,
            status: { not: ReturnStatus.rejected },
            createdAt: { gte: from, lt: to },
          },
        },
        _sum: { qty: true },
      }),
    ]);
    let units = 0;
    let revenue = 0;
    let cost = 0;
    for (const item of items) {
      units += item.qty;
      revenue += Number(item.price) * item.qty;
      cost += Number(item.cost) * item.qty;
    }
    const returnedUnits = returned._sum.qty ?? 0;
    return {
      from: from.toISOString(),
      to: to.toISOString(),
      orders: new Set(items.map((item) => item.orderId)).size,
      units,
      revenue: round2(revenue),
      cost: round2(cost),
      grossMarginPct:
        revenue > 0 ? round2(((revenue - cost) / revenue) * 100) : null,
      returnedUnits,
      returnRatePct: units > 0 ? round2((returnedUnits / units) * 100) : null,
    };
  }

  async computeResults(
    businessId: string,
    experiment: {
      productId: string;
      primaryMetric: CommerceExperimentMetric;
      minMarginPct: Prisma.Decimal | null;
      startedAt: Date;
      stoppedAt: Date | null;
    },
    now = new Date(),
  ): Promise<ExperimentResults> {
    const start = experiment.startedAt;
    const end = experiment.stoppedAt ?? now;
    const length = Math.max(0, end.getTime() - start.getTime());
    const baselineFrom = new Date(start.getTime() - length);
    const [baseline, test] = await Promise.all([
      this.measureWindow(businessId, experiment.productId, baselineFrom, start),
      this.measureWindow(businessId, experiment.productId, start, end),
    ]);
    const windowDays = round2(length / DAY_MS);

    const insufficientReasons: string[] = [];
    if (windowDays < RULES.minDays) {
      insufficientReasons.push(
        `Ran ${windowDays} of the minimum ${RULES.minDays} days.`,
      );
    }
    if (baseline.units < RULES.minUnitsPerWindow) {
      insufficientReasons.push(
        `Baseline sold ${baseline.units} units (needs ${RULES.minUnitsPerWindow}).`,
      );
    }
    if (test.units < RULES.minUnitsPerWindow) {
      insufficientReasons.push(
        `Test window sold ${test.units} units (needs ${RULES.minUnitsPerWindow}).`,
      );
    }

    const metric = experiment.primaryMetric;
    const baselineValue = metricValue(baseline, metric);
    const testValue = metricValue(test, metric);
    const relative =
      metric === CommerceExperimentMetric.units ||
      metric === CommerceExperimentMetric.revenue;
    let change: number | null = null;
    if (baselineValue !== null && testValue !== null) {
      if (!relative) change = round2(testValue - baselineValue);
      else if (baselineValue > 0)
        change = round2(((testValue - baselineValue) / baselineValue) * 100);
    }

    const minMargin =
      experiment.minMarginPct === null ? null : Number(experiment.minMarginPct);
    return {
      computedAt: now.toISOString(),
      windowDays,
      baseline,
      test,
      primary: {
        metric,
        baselineValue,
        testValue,
        change,
        changeUnit: relative ? 'pct' : 'pts',
      },
      sufficient: insufficientReasons.length === 0,
      insufficientReasons,
      guardrail:
        minMargin === null
          ? null
          : {
              minMarginPct: minMargin,
              testMarginPct: test.grossMarginPct,
              breached:
                test.grossMarginPct !== null && test.grossMarginPct < minMargin,
            },
    };
  }

  private async findOrThrow(businessId: string, id: string) {
    const experiment = await this.db.commerceExperiment.findFirst({
      where: { id, businessId },
    });
    if (!experiment) {
      throw new AppException(
        CODES.NOT_FOUND,
        'Experiment was not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    return experiment;
  }

  private invalid(message: string): never {
    throw new AppException(
      CODES.INVALID_TRANSITION,
      message,
      HttpStatus.CONFLICT,
    );
  }

  async create(
    businessId: string,
    actorUserId: string,
    dto: CreateCommerceExperimentDto,
  ) {
    await this.snapshot(businessId, dto.productId); // validates the product belongs to this business
    const experiment = await this.db.commerceExperiment.create({
      data: {
        businessId,
        productId: dto.productId,
        name: dto.name.trim(),
        type: dto.type,
        hypothesis: dto.hypothesis.trim(),
        changeDescription: dto.changeDescription.trim(),
        primaryMetric: dto.primaryMetric,
        minMarginPct: dto.minMarginPct ?? null,
        plannedDays: dto.plannedDays ?? 14,
        createdByUserId: actorUserId,
      },
    });
    await this.audit(businessId, experiment.id, 'created', actorUserId);
    return experiment;
  }

  async start(businessId: string, actorUserId: string, id: string) {
    const experiment = await this.findOrThrow(businessId, id);
    if (experiment.status !== CommerceExperimentStatus.draft) {
      this.invalid('Only a draft experiment can be started.');
    }
    const busy = await this.db.commerceExperiment.findFirst({
      where: {
        businessId,
        productId: experiment.productId,
        status: CommerceExperimentStatus.running,
      },
      select: { name: true },
    });
    if (busy) {
      throw new AppException(
        CODES.PRODUCT_BUSY,
        `"${busy.name}" is already running on this product — two at once would make both results meaningless.`,
        HttpStatus.CONFLICT,
      );
    }
    const snapshot = await this.snapshot(businessId, experiment.productId);
    const updated = await this.db.commerceExperiment.update({
      where: { id, businessId },
      data: {
        status: CommerceExperimentStatus.running,
        startedAt: new Date(),
        startSnapshot: snapshot as unknown as Prisma.InputJsonValue,
      },
    });
    await this.audit(businessId, id, 'started', actorUserId);
    return updated;
  }

  async stop(businessId: string, actorUserId: string, id: string) {
    const experiment = await this.findOrThrow(businessId, id);
    if (
      experiment.status !== CommerceExperimentStatus.running ||
      !experiment.startedAt
    ) {
      this.invalid('Only a running experiment can be stopped.');
    }
    const stoppedAt = new Date();
    const [snapshot, results] = await Promise.all([
      this.snapshot(businessId, experiment.productId),
      this.computeResults(
        businessId,
        { ...experiment, startedAt: experiment.startedAt, stoppedAt },
        stoppedAt,
      ),
    ]);
    const updated = await this.db.commerceExperiment.update({
      where: { id, businessId },
      data: {
        status: CommerceExperimentStatus.stopped,
        stoppedAt,
        stopSnapshot: snapshot as unknown as Prisma.InputJsonValue,
        frozenResults: results as unknown as Prisma.InputJsonValue,
      },
    });
    await this.audit(businessId, id, 'stopped', actorUserId);
    return updated;
  }

  async decide(
    businessId: string,
    actorUserId: string,
    id: string,
    decision: CommerceExperimentStatus,
    note: string,
  ) {
    const experiment = await this.findOrThrow(businessId, id);
    if (!DECISIONS.includes(decision)) {
      this.invalid('A decision must be adopted, reverted or inconclusive.');
    }
    if (experiment.status !== CommerceExperimentStatus.stopped) {
      this.invalid('Stop the experiment before recording a decision.');
    }
    const trimmed = note?.trim() ?? '';
    if (trimmed.length < 3) {
      throw new AppException(
        CODES.NOTE_REQUIRED,
        'Write a short note explaining the decision.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const updated = await this.db.commerceExperiment.update({
      where: { id, businessId },
      data: { status: decision, decisionNote: trimmed, decidedAt: new Date() },
    });
    await this.audit(
      businessId,
      id,
      `decided_${decision}`,
      actorUserId,
      trimmed,
    );
    return updated;
  }

  async removeDraft(businessId: string, actorUserId: string, id: string) {
    const experiment = await this.findOrThrow(businessId, id);
    if (experiment.status !== CommerceExperimentStatus.draft) {
      this.invalid('Only a draft that never ran can be deleted.');
    }
    await this.db.commerceExperiment.delete({ where: { id, businessId } });
    await this.audit(businessId, id, 'deleted_draft', actorUserId);
    return { id };
  }

  async list(businessId: string, now = new Date()) {
    const rows = await this.db.commerceExperiment.findMany({
      where: { businessId },
      include: { product: { select: { id: true, name: true } } },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 200,
    });
    return Promise.all(
      rows.map(async (row) => {
        let results: ExperimentResults | null = null;
        if (row.status === CommerceExperimentStatus.running && row.startedAt) {
          results = await this.computeResults(
            businessId,
            { ...row, startedAt: row.startedAt },
            now,
          );
        } else if (row.frozenResults) {
          results = row.frozenResults as unknown as ExperimentResults;
        }
        const start = row.startSnapshot as unknown as ProductSnapshot | null;
        const stop = row.stopSnapshot as unknown as ProductSnapshot | null;
        return {
          ...row,
          minMarginPct:
            row.minMarginPct === null ? null : Number(row.minMarginPct),
          results,
          priceAtStart: start?.sellingPrice ?? null,
          priceAtStop: stop?.sellingPrice ?? null,
          /** True only for a stopped price test whose product price never actually changed. */
          priceUnchanged:
            row.type === CommerceExperimentType.price && start && stop
              ? start.sellingPrice === stop.sellingPrice
              : null,
        };
      }),
    );
  }

  async summary(businessId: string) {
    const rows = await this.db.commerceExperiment.groupBy({
      by: ['status'],
      where: { businessId },
      _count: { _all: true },
    });
    const count = (status: CommerceExperimentStatus) =>
      rows.find((row) => row.status === status)?._count._all ?? 0;
    return {
      drafts: count(CommerceExperimentStatus.draft),
      running: count(CommerceExperimentStatus.running),
      awaitingDecision: count(CommerceExperimentStatus.stopped),
      adopted: count(CommerceExperimentStatus.adopted),
      reverted: count(CommerceExperimentStatus.reverted),
      inconclusive: count(CommerceExperimentStatus.inconclusive),
      rules: RULES,
    };
  }
}
