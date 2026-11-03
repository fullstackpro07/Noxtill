import { HttpStatus, Injectable } from '@nestjs/common';
import {
  CommerceMarketEligibilityStatus,
  CommerceRiskCaseStatus,
  CommerceRiskRuleKey,
  CommerceRiskSeverity,
  OrderStatus,
  Prisma,
  ReturnStatus,
} from '@prisma/client';
import { AppException } from '../common/filters/app.exception';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import {
  COMMERCE_COMPLIANCE_EXPIRY_WARNING_DAYS,
  COMMERCE_RISK_ERROR_CODES as CODES,
  COMMERCE_RISK_RULE_DEFAULTS,
} from './commerce.constants';
import type {
  CommerceComplianceDocumentFieldsDto,
  CreateCommerceComplianceDocumentDto,
  SetCommerceMarketEligibilityDto,
  UpdateCommerceRiskRuleDto,
} from './dto/commerce-risk.dto';

const DAY_MS = 24 * 60 * 60 * 1000;
const CLOSED: CommerceRiskCaseStatus[] = [
  CommerceRiskCaseStatus.resolved,
  CommerceRiskCaseStatus.dismissed,
];
const TRANSITIONS: Record<CommerceRiskCaseStatus, CommerceRiskCaseStatus[]> = {
  open: [
    CommerceRiskCaseStatus.investigating,
    CommerceRiskCaseStatus.resolved,
    CommerceRiskCaseStatus.dismissed,
  ],
  investigating: [
    CommerceRiskCaseStatus.open,
    CommerceRiskCaseStatus.resolved,
    CommerceRiskCaseStatus.dismissed,
  ],
  resolved: [CommerceRiskCaseStatus.open],
  dismissed: [CommerceRiskCaseStatus.open],
};

export interface RiskFinding {
  ruleKey: CommerceRiskRuleKey;
  entityType: 'customer' | 'order';
  entityId: string;
  entityLabel: string;
  severity: CommerceRiskSeverity;
  signalCount: number;
  exposureAmount: number;
  evidence: Record<string, unknown>;
}

export type DocumentStatus = 'expired' | 'expiring' | 'valid' | 'no_expiry';

export function documentStatus(
  expiresAt: Date | null,
  now = new Date(),
): DocumentStatus {
  if (!expiresAt) return 'no_expiry';
  if (expiresAt.getTime() < now.getTime()) return 'expired';
  return expiresAt.getTime() - now.getTime() <=
    COMMERCE_COMPLIANCE_EXPIRY_WARNING_DAYS * DAY_MS
    ? 'expiring'
    : 'valid';
}

function money(value: Prisma.Decimal | null | undefined): number {
  return value ? Number(value) : 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function countryList(value: Prisma.JsonValue): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

/**
 * Commerce Risk & Compliance (screen 12). Risk checks are explicit, explainable rules over real
 * orders, returns and coupon use — no opaque scores — and a case never blocks an order by itself.
 * Compliance stores the merchant's documents and human eligibility decisions; a `blocked` market
 * is enforced by the channel listing sync.
 */
@Injectable()
export class CommerceRiskService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private audit(
    businessId: string,
    entityType: string,
    entityId: string,
    action: string,
    actorUserId: string | null,
    extra: { reason?: string | null; before?: unknown; after?: unknown } = {},
  ) {
    return this.tenantPrisma.client.commerceRiskAudit.create({
      data: {
        businessId,
        entityType,
        entityId,
        action,
        actorUserId,
        reason: extra.reason ?? null,
        before: (extra.before ?? undefined) as Prisma.InputJsonValue,
        after: (extra.after ?? undefined) as Prisma.InputJsonValue,
      },
    });
  }

  async rules(businessId: string) {
    await this.tenantPrisma.client.commerceRiskRule.createMany({
      data: Object.entries(COMMERCE_RISK_RULE_DEFAULTS).map(([key, value]) => ({
        businessId,
        key: key as CommerceRiskRuleKey,
        threshold: value.threshold,
        windowDays: value.windowDays,
      })),
      skipDuplicates: true,
    });
    return this.tenantPrisma.client.commerceRiskRule.findMany({
      where: { businessId },
      orderBy: { key: 'asc' },
    });
  }

  async updateRule(
    businessId: string,
    actorUserId: string,
    key: CommerceRiskRuleKey,
    dto: UpdateCommerceRiskRuleDto,
  ) {
    const rules = await this.rules(businessId);
    const before = rules.find((rule) => rule.key === key);
    if (!before) {
      throw new AppException(
        CODES.CASE_NOT_FOUND,
        'Unknown risk rule.',
        HttpStatus.NOT_FOUND,
      );
    }
    const updated = await this.tenantPrisma.client.commerceRiskRule.update({
      where: { id: before.id, businessId },
      data: {
        enabled: dto.enabled ?? before.enabled,
        threshold: dto.threshold ?? before.threshold,
        windowDays: dto.windowDays ?? before.windowDays,
      },
    });
    await this.audit(
      businessId,
      'rule',
      before.id,
      'rule_updated',
      actorUserId,
      {
        before: {
          enabled: before.enabled,
          threshold: before.threshold,
          windowDays: before.windowDays,
        },
        after: {
          enabled: updated.enabled,
          threshold: updated.threshold,
          windowDays: updated.windowDays,
        },
      },
    );
    return updated;
  }

  /** Evaluates every enabled rule against real records; pure detection, no writes. */
  async detect(businessId: string, now = new Date()): Promise<RiskFinding[]> {
    const rules = await this.rules(businessId);
    const findings: RiskFinding[] = [];
    for (const rule of rules.filter((item) => item.enabled)) {
      const since = new Date(now.getTime() - rule.windowDays * DAY_MS);
      if (rule.key === CommerceRiskRuleKey.repeat_returns) {
        const returns = await this.tenantPrisma.client.return.findMany({
          where: {
            businessId,
            status: { not: ReturnStatus.rejected },
            createdAt: { gte: since },
            customerId: { not: null },
          },
          select: {
            id: true,
            orderId: true,
            refundAmount: true,
            customer: { select: { id: true, name: true } },
          },
        });
        const byCustomer = new Map<string, typeof returns>();
        for (const row of returns) {
          const list = byCustomer.get(row.customer!.id) ?? [];
          list.push(row);
          byCustomer.set(row.customer!.id, list);
        }
        for (const [customerId, rows] of byCustomer) {
          if (rows.length < rule.threshold) continue;
          findings.push({
            ruleKey: rule.key,
            entityType: 'customer',
            entityId: customerId,
            entityLabel: rows[0].customer!.name,
            severity:
              rows.length >= rule.threshold * 2
                ? CommerceRiskSeverity.high
                : CommerceRiskSeverity.medium,
            signalCount: rows.length,
            exposureAmount: round2(
              rows.reduce((sum, row) => sum + money(row.refundAmount), 0),
            ),
            evidence: {
              explanation: `${rows.length} returns in the last ${rule.windowDays} days (threshold ${rule.threshold}).`,
              returnIds: rows.map((row) => row.id),
              orderIds: [...new Set(rows.map((row) => row.orderId))],
            },
          });
        }
      }
      if (rule.key === CommerceRiskRuleKey.over_returned_order) {
        const returns = await this.tenantPrisma.client.return.findMany({
          where: {
            businessId,
            status: { not: ReturnStatus.rejected },
            createdAt: { gte: since },
          },
          select: {
            id: true,
            orderId: true,
            refundAmount: true,
            items: { select: { productId: true, qty: true } },
            order: {
              select: {
                orderNo: true,
                items: { select: { productId: true, qty: true } },
              },
            },
          },
        });
        const byOrder = new Map<string, typeof returns>();
        for (const row of returns) {
          const list = byOrder.get(row.orderId) ?? [];
          list.push(row);
          byOrder.set(row.orderId, list);
        }
        for (const [orderId, rows] of byOrder) {
          const ordered = new Map<string, number>();
          for (const item of rows[0].order.items) {
            if (!item.productId) continue;
            ordered.set(
              item.productId,
              (ordered.get(item.productId) ?? 0) + item.qty,
            );
          }
          const returned = new Map<string, number>();
          for (const row of rows) {
            for (const item of row.items) {
              returned.set(
                item.productId,
                (returned.get(item.productId) ?? 0) + item.qty,
              );
            }
          }
          const excess = [...returned.entries()]
            .map(([productId, qty]) => ({
              productId,
              ordered: ordered.get(productId) ?? 0,
              returned: qty,
            }))
            .filter((row) => row.returned > row.ordered);
          if (!excess.length) continue;
          findings.push({
            ruleKey: rule.key,
            entityType: 'order',
            entityId: orderId,
            entityLabel: `Order #${rows[0].order.orderNo}`,
            severity: CommerceRiskSeverity.high,
            signalCount: excess.reduce(
              (sum, row) => sum + row.returned - row.ordered,
              0,
            ),
            exposureAmount: round2(
              rows.reduce((sum, row) => sum + money(row.refundAmount), 0),
            ),
            evidence: {
              explanation:
                'More units were returned than this order contained — a possible duplicate refund.',
              products: excess,
              returnIds: rows.map((row) => row.id),
            },
          });
        }
      }
      if (rule.key === CommerceRiskRuleKey.coupon_repeat_use) {
        const orders = await this.tenantPrisma.client.order.findMany({
          where: {
            businessId,
            couponId: { not: null },
            customerId: { not: null },
            isQuotation: false,
            status: { not: OrderStatus.cancelled },
            createdAt: { gte: since },
          },
          select: {
            id: true,
            couponDiscountAmount: true,
            coupon: { select: { code: true } },
            customer: { select: { id: true, name: true } },
          },
        });
        const byCustomer = new Map<string, typeof orders>();
        for (const row of orders) {
          const list = byCustomer.get(row.customer!.id) ?? [];
          list.push(row);
          byCustomer.set(row.customer!.id, list);
        }
        for (const [customerId, rows] of byCustomer) {
          if (rows.length < rule.threshold) continue;
          findings.push({
            ruleKey: rule.key,
            entityType: 'customer',
            entityId: customerId,
            entityLabel: rows[0].customer!.name,
            severity:
              rows.length >= rule.threshold * 2
                ? CommerceRiskSeverity.high
                : CommerceRiskSeverity.medium,
            signalCount: rows.length,
            exposureAmount: round2(
              rows.reduce(
                (sum, row) => sum + money(row.couponDiscountAmount),
                0,
              ),
            ),
            evidence: {
              explanation: `${rows.length} coupon orders in the last ${rule.windowDays} days (threshold ${rule.threshold}).`,
              orderIds: rows.map((row) => row.id),
              couponCodes: [...new Set(rows.map((row) => row.coupon?.code))],
            },
          });
        }
      }
    }
    return findings;
  }

  /**
   * Runs the checks and records cases idempotently: open cases are refreshed, closed cases stay
   * closed unless the pattern has grown since they were closed.
   */
  async runChecks(businessId: string, actorUserId: string) {
    const findings = await this.detect(businessId);
    let created = 0;
    let refreshed = 0;
    let reopened = 0;
    for (const finding of findings) {
      const dedupeKey = `${finding.ruleKey}:${finding.entityType}:${finding.entityId}`;
      const existing =
        await this.tenantPrisma.client.commerceRiskCase.findUnique({
          where: { businessId_dedupeKey: { businessId, dedupeKey } },
        });
      const data = {
        severity: finding.severity,
        signalCount: finding.signalCount,
        exposureAmount: finding.exposureAmount,
        evidence: finding.evidence as Prisma.InputJsonValue,
        entityLabel: finding.entityLabel,
        lastDetectedAt: new Date(),
      };
      if (!existing) {
        const created_ = await this.tenantPrisma.client.commerceRiskCase.create(
          {
            data: {
              businessId,
              dedupeKey,
              ruleKey: finding.ruleKey,
              entityType: finding.entityType,
              entityId: finding.entityId,
              ...data,
            },
          },
        );
        await this.audit(
          businessId,
          'case',
          created_.id,
          'case_detected',
          actorUserId,
          {
            after: finding.evidence,
          },
        );
        created += 1;
      } else if (!CLOSED.includes(existing.status)) {
        await this.tenantPrisma.client.commerceRiskCase.update({
          where: { id: existing.id, businessId },
          data,
        });
        refreshed += 1;
      } else if (finding.signalCount > existing.signalCount) {
        await this.tenantPrisma.client.commerceRiskCase.update({
          where: { id: existing.id, businessId },
          data: {
            ...data,
            status: CommerceRiskCaseStatus.open,
            resolution: null,
          },
        });
        await this.audit(
          businessId,
          'case',
          existing.id,
          'case_reopened',
          actorUserId,
          {
            reason: `Pattern grew from ${existing.signalCount} to ${finding.signalCount} since it was closed.`,
          },
        );
        reopened += 1;
      }
    }
    return { findings: findings.length, created, refreshed, reopened };
  }

  async listCases(businessId: string, status?: CommerceRiskCaseStatus) {
    const rows = await this.tenantPrisma.client.commerceRiskCase.findMany({
      where: { businessId, ...(status ? { status } : {}) },
      orderBy: [{ lastDetectedAt: 'desc' }, { id: 'desc' }],
      take: 300,
    });
    return rows.map((row) => ({
      ...row,
      exposureAmount: Number(row.exposureAmount),
    }));
  }

  async setCaseStatus(
    businessId: string,
    actorUserId: string,
    id: string,
    status: CommerceRiskCaseStatus,
    reason?: string,
  ) {
    const existing = await this.tenantPrisma.client.commerceRiskCase.findFirst({
      where: { id, businessId },
    });
    if (!existing) {
      throw new AppException(
        CODES.CASE_NOT_FOUND,
        'Risk case was not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    if (!TRANSITIONS[existing.status].includes(status)) {
      throw new AppException(
        CODES.INVALID_TRANSITION,
        `A ${existing.status} case can't move to ${status}.`,
        HttpStatus.CONFLICT,
      );
    }
    const trimmed = reason?.trim() || null;
    if (CLOSED.includes(status) && (!trimmed || trimmed.length < 3)) {
      throw new AppException(
        CODES.REASON_REQUIRED,
        'Give a reason when resolving or dismissing a case.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const updated = await this.tenantPrisma.client.commerceRiskCase.update({
      where: { id, businessId },
      data: {
        status,
        resolution: CLOSED.includes(status) ? trimmed : existing.resolution,
      },
    });
    await this.audit(businessId, 'case', id, `case_${status}`, actorUserId, {
      reason: trimmed,
      before: { status: existing.status },
      after: { status },
    });
    return { ...updated, exposureAmount: Number(updated.exposureAmount) };
  }

  private async assertProduct(businessId: string, productId: string) {
    const product = await this.tenantPrisma.client.product.findFirst({
      where: { id: productId, businessId },
      select: { id: true },
    });
    if (!product) {
      throw new AppException(
        CODES.PRODUCT_NOT_FOUND,
        'Product was not found in Products.',
        HttpStatus.NOT_FOUND,
      );
    }
  }

  async listDocuments(businessId: string, includeArchived = false) {
    const now = new Date();
    const rows =
      await this.tenantPrisma.client.commerceComplianceDocument.findMany({
        where: { businessId, ...(includeArchived ? {} : { archivedAt: null }) },
        include: { product: { select: { id: true, name: true } } },
        orderBy: [{ expiresAt: 'asc' }, { title: 'asc' }],
      });
    return rows.map((row) => ({
      ...row,
      markets: countryList(row.markets),
      status: documentStatus(row.expiresAt, now),
    }));
  }

  private documentData(dto: CommerceComplianceDocumentFieldsDto) {
    const data: Prisma.CommerceComplianceDocumentUncheckedUpdateInput = {};
    if (dto.productId !== undefined) data.productId = dto.productId || null;
    if (dto.docType !== undefined) data.docType = dto.docType;
    if (dto.title !== undefined) data.title = dto.title.trim();
    if (dto.reference !== undefined)
      data.reference = dto.reference?.trim() || null;
    if (dto.issuer !== undefined) data.issuer = dto.issuer?.trim() || null;
    if (dto.markets !== undefined)
      data.markets = [
        ...new Set(dto.markets.map((code) => code.toUpperCase())),
      ];
    if (dto.issuedAt !== undefined)
      data.issuedAt = dto.issuedAt ? new Date(dto.issuedAt) : null;
    if (dto.expiresAt !== undefined)
      data.expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (dto.notes !== undefined) data.notes = dto.notes?.trim() || null;
    return data;
  }

  async createDocument(
    businessId: string,
    actorUserId: string,
    dto: CreateCommerceComplianceDocumentDto,
  ) {
    if (dto.productId) await this.assertProduct(businessId, dto.productId);
    const document =
      await this.tenantPrisma.client.commerceComplianceDocument.create({
        data: {
          ...(this.documentData(
            dto,
          ) as Prisma.CommerceComplianceDocumentUncheckedCreateInput),
          businessId,
          docType: dto.docType,
          title: dto.title.trim(),
        },
      });
    await this.audit(
      businessId,
      'document',
      document.id,
      'document_created',
      actorUserId,
      {
        after: { title: document.title, expiresAt: document.expiresAt },
      },
    );
    return document;
  }

  async updateDocument(
    businessId: string,
    actorUserId: string,
    id: string,
    dto: CommerceComplianceDocumentFieldsDto,
  ) {
    const existing =
      await this.tenantPrisma.client.commerceComplianceDocument.findFirst({
        where: { id, businessId },
      });
    if (!existing) {
      throw new AppException(
        CODES.DOCUMENT_NOT_FOUND,
        'Compliance document was not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    if (dto.productId) await this.assertProduct(businessId, dto.productId);
    const updated =
      await this.tenantPrisma.client.commerceComplianceDocument.update({
        where: { id, businessId },
        data: this.documentData(dto),
      });
    await this.audit(
      businessId,
      'document',
      id,
      'document_updated',
      actorUserId,
      {
        before: { title: existing.title, expiresAt: existing.expiresAt },
        after: { title: updated.title, expiresAt: updated.expiresAt },
      },
    );
    return updated;
  }

  async archiveDocument(businessId: string, actorUserId: string, id: string) {
    const existing =
      await this.tenantPrisma.client.commerceComplianceDocument.findFirst({
        where: { id, businessId },
      });
    if (!existing) {
      throw new AppException(
        CODES.DOCUMENT_NOT_FOUND,
        'Compliance document was not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    const updated =
      await this.tenantPrisma.client.commerceComplianceDocument.update({
        where: { id, businessId },
        data: { archivedAt: new Date() },
      });
    await this.audit(
      businessId,
      'document',
      id,
      'document_archived',
      actorUserId,
    );
    return updated;
  }

  async listEligibility(businessId: string) {
    return this.tenantPrisma.client.commerceMarketEligibility.findMany({
      where: { businessId },
      include: { product: { select: { id: true, name: true, sku: true } } },
      orderBy: [{ status: 'asc' }, { market: 'asc' }],
    });
  }

  async setEligibility(
    businessId: string,
    actorUserId: string,
    dto: SetCommerceMarketEligibilityDto,
  ) {
    await this.assertProduct(businessId, dto.productId);
    const market = dto.market.toUpperCase();
    const reason = dto.reason?.trim() || null;
    if (
      dto.status !== CommerceMarketEligibilityStatus.eligible &&
      (!reason || reason.length < 3)
    ) {
      throw new AppException(
        CODES.REASON_REQUIRED,
        'Give a reason when blocking a market or marking it for review.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const before =
      await this.tenantPrisma.client.commerceMarketEligibility.findUnique({
        where: {
          businessId_productId_market: {
            businessId,
            productId: dto.productId,
            market,
          },
        },
      });
    const saved =
      await this.tenantPrisma.client.commerceMarketEligibility.upsert({
        where: {
          businessId_productId_market: {
            businessId,
            productId: dto.productId,
            market,
          },
        },
        create: {
          businessId,
          productId: dto.productId,
          market,
          status: dto.status,
          reason,
          decidedByUserId: actorUserId,
        },
        update: { status: dto.status, reason, decidedByUserId: actorUserId },
      });
    await this.audit(
      businessId,
      'eligibility',
      saved.id,
      'eligibility_set',
      actorUserId,
      {
        reason,
        before: before ? { status: before.status } : null,
        after: { productId: dto.productId, market, status: dto.status },
      },
    );
    return saved;
  }

  async removeEligibility(businessId: string, actorUserId: string, id: string) {
    const existing =
      await this.tenantPrisma.client.commerceMarketEligibility.findFirst({
        where: { id, businessId },
      });
    if (!existing) {
      throw new AppException(
        CODES.ELIGIBILITY_NOT_FOUND,
        'Eligibility decision was not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    await this.tenantPrisma.client.commerceMarketEligibility.delete({
      where: { id, businessId },
    });
    await this.audit(
      businessId,
      'eligibility',
      id,
      'eligibility_removed',
      actorUserId,
      {
        before: {
          productId: existing.productId,
          market: existing.market,
          status: existing.status,
        },
      },
    );
    return { removed: true };
  }

  async summary(businessId: string) {
    const [cases, documents, eligibility] = await Promise.all([
      this.tenantPrisma.client.commerceRiskCase.findMany({
        where: {
          businessId,
          status: {
            in: [
              CommerceRiskCaseStatus.open,
              CommerceRiskCaseStatus.investigating,
            ],
          },
        },
        select: { severity: true, exposureAmount: true },
      }),
      this.listDocuments(businessId),
      this.tenantPrisma.client.commerceMarketEligibility.groupBy({
        by: ['status'],
        where: { businessId },
        _count: { _all: true },
      }),
    ]);
    const eligibilityCount = (status: CommerceMarketEligibilityStatus) =>
      eligibility.find((row) => row.status === status)?._count._all ?? 0;
    return {
      openCases: cases.length,
      highSeverityOpen: cases.filter(
        (row) => row.severity === CommerceRiskSeverity.high,
      ).length,
      openExposure: round2(
        cases.reduce((sum, row) => sum + Number(row.exposureAmount), 0),
      ),
      documentsExpiring: documents.filter((doc) => doc.status === 'expiring')
        .length,
      documentsExpired: documents.filter((doc) => doc.status === 'expired')
        .length,
      blockedMarkets: eligibilityCount(CommerceMarketEligibilityStatus.blocked),
      marketsInReview: eligibilityCount(
        CommerceMarketEligibilityStatus.review_required,
      ),
    };
  }

  async auditLog(businessId: string, entityType: string, entityId: string) {
    return this.tenantPrisma.client.commerceRiskAudit.findMany({
      where: { businessId, entityType, entityId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }
}
