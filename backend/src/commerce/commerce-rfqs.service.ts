import { HttpStatus, Injectable } from '@nestjs/common';
import {
  CommerceRfqStatus,
  CommerceRfqSupplierStatus,
  CommerceSupplierQuoteStatus,
  Prisma,
  PurchaseOrderStatus,
} from '@prisma/client';
import { ActivityService } from '../activity/activity.service';
import { AppException } from '../common/filters/app.exception';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import {
  AwardCommerceRfqDto,
  CloseCommerceRfqDto,
  CommerceRfqVersionDto,
  CreateCommerceRfqDto,
  MarkRfqSuppliersSentDto,
  RecordCommerceSupplierQuoteDto,
  UpdateCommerceRfqDto,
} from './dto/commerce-rfq.dto';
import { COMMERCE_RFQ_ERROR_CODES } from './commerce.constants';

const INCLUDE = {
  items: {
    include: { product: { select: { id: true, name: true, sku: true } } },
  },
  suppliers: {
    include: {
      supplier: { select: { id: true, name: true, phone: true, email: true } },
    },
  },
  quotes: {
    include: {
      supplier: { select: { id: true, name: true } },
      items: {
        include: {
          rfqItem: {
            select: { id: true, description: true, qty: true, productId: true },
          },
        },
      },
    },
    orderBy: [
      { createdAt: 'desc' as const },
      { revisionNo: 'desc' as const },
      { id: 'desc' as const },
    ],
  },
  awardedQuote: true,
  purchaseOrder: { select: { id: true, status: true, createdAt: true } },
} satisfies Prisma.CommerceRfqInclude;

function cleanOptionalText(value?: string | null): string | null | undefined {
  if (value === undefined || value === null) return value;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

function quoteLandedTotal(quote: {
  freight: unknown;
  duties: unknown;
  items: Array<{ quotedQty: number; unitPrice: unknown }>;
}): number {
  return (
    quote.items.reduce(
      (sum, item) => sum + item.quotedQty * Number(item.unitPrice),
      0,
    ) +
    Number(quote.freight) +
    Number(quote.duties)
  );
}

function serializeRfq<T extends { quotes: Array<Record<string, unknown>> }>(
  rfq: T,
) {
  return {
    ...rfq,
    quotes: rfq.quotes.map((quote) => {
      const items = quote.items as Array<Record<string, unknown>>;
      const total = quoteLandedTotal({
        freight: quote.freight,
        duties: quote.duties,
        items: items as Array<{ quotedQty: number; unitPrice: unknown }>,
      });
      return {
        ...quote,
        freight: Number(quote.freight),
        duties: Number(quote.duties),
        landedTotal: total,
        items: items.map((item) => ({
          ...item,
          unitPrice: Number(item.unitPrice),
        })),
      };
    }),
  };
}

@Injectable()
export class CommerceRfqsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly activity: ActivityService,
  ) {}

  async create(
    businessId: string,
    actorUserId: string,
    dto: CreateCommerceRfqDto,
  ) {
    const productIds = [
      ...new Set(
        dto.items.flatMap((item) => (item.productId ? [item.productId] : [])),
      ),
    ];
    if (productIds.length) {
      const products = await this.tenantPrisma.client.product.findMany({
        where: { businessId, id: { in: productIds } },
        select: { id: true },
      });
      if (products.length !== productIds.length) {
        throw this.error(
          COMMERCE_RFQ_ERROR_CODES.PRODUCT_NOT_FOUND,
          'One or more products do not belong to this business.',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    const supplierIds = [...new Set(dto.supplierIds ?? [])];
    if (supplierIds.length) {
      const suppliers = await this.tenantPrisma.client.supplier.findMany({
        where: { businessId, id: { in: supplierIds } },
        select: { id: true },
      });
      if (suppliers.length !== supplierIds.length) {
        throw this.error(
          COMMERCE_RFQ_ERROR_CODES.SUPPLIER_NOT_FOUND,
          'One or more suppliers do not belong to this business.',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    if (dto.sourceOpportunityId) {
      const opportunity =
        await this.tenantPrisma.client.productOpportunity.findFirst({
          where: { id: dto.sourceOpportunityId, businessId },
          select: { id: true },
        });
      if (!opportunity) {
        throw this.error(
          COMMERCE_RFQ_ERROR_CODES.OPPORTUNITY_NOT_FOUND,
          'The linked Product Radar candidate was not found for this business.',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    const created = await this.tenantPrisma.client.$transaction(async (tx) => {
      const rfq = await tx.commerceRfq.create({
        data: {
          businessId,
          ownerUserId: actorUserId,
          requirement: dto.requirement.trim(),
          market: cleanOptionalText(dto.market),
          currency: dto.currency,
          destination: cleanOptionalText(dto.destination),
          terms: cleanOptionalText(dto.terms),
          dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
          sourceOpportunityId: dto.sourceOpportunityId,
          items: {
            create: dto.items.map((item) => ({
              productId: item.productId,
              description: item.description.trim(),
              qty: item.qty,
              minimumQty: item.minimumQty,
              specifications: cleanOptionalText(item.specifications),
            })),
          },
          suppliers: {
            create: supplierIds.map((supplierId) => ({ supplierId })),
          },
        },
        include: INCLUDE,
      });
      await tx.commerceRfqAudit.create({
        data: {
          businessId,
          rfqId: rfq.id,
          action: 'created',
          actorUserId,
          after: this.snapshot(rfq),
        },
      });
      return rfq;
    });
    await this.activity.record(businessId, {
      type: 'commerce_rfq_created',
      description: 'RFQ created for supplier sourcing',
      entityType: 'CommerceRfq',
      entityId: created.id,
      actorUserId,
    });
    return serializeRfq(created);
  }

  async update(
    businessId: string,
    actorUserId: string,
    id: string,
    dto: UpdateCommerceRfqDto,
  ) {
    const current = await this.findOne(businessId, id);
    this.assertVersion(current.version, dto.expectedVersion);
    if (current.status !== CommerceRfqStatus.draft) {
      this.invalidState(
        'Only a draft RFQ can be edited. Open RFQs keep their original sourcing request for auditability.',
      );
    }

    const items = dto.items;
    if (items) {
      const productIds = [
        ...new Set(
          items.flatMap((item) => (item.productId ? [item.productId] : [])),
        ),
      ];
      if (productIds.length) {
        const products = await this.tenantPrisma.client.product.findMany({
          where: { businessId, id: { in: productIds } },
          select: { id: true },
        });
        if (products.length !== productIds.length) {
          throw this.error(
            COMMERCE_RFQ_ERROR_CODES.PRODUCT_NOT_FOUND,
            'One or more products do not belong to this business.',
            HttpStatus.BAD_REQUEST,
          );
        }
      }
    }

    const supplierIds =
      dto.supplierIds === undefined ? undefined : [...new Set(dto.supplierIds)];
    if (supplierIds?.length) {
      const suppliers = await this.tenantPrisma.client.supplier.findMany({
        where: { businessId, id: { in: supplierIds } },
        select: { id: true },
      });
      if (suppliers.length !== supplierIds.length) {
        throw this.error(
          COMMERCE_RFQ_ERROR_CODES.SUPPLIER_NOT_FOUND,
          'One or more suppliers do not belong to this business.',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    if (dto.sourceOpportunityId) {
      const opportunity =
        await this.tenantPrisma.client.productOpportunity.findFirst({
          where: { id: dto.sourceOpportunityId, businessId },
          select: { id: true },
        });
      if (!opportunity) {
        throw this.error(
          COMMERCE_RFQ_ERROR_CODES.OPPORTUNITY_NOT_FOUND,
          'The linked Product Radar candidate was not found for this business.',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    const updated = await this.tenantPrisma.client.$transaction(async (tx) => {
      const claimed = await tx.commerceRfq.updateMany({
        where: {
          id,
          businessId,
          status: CommerceRfqStatus.draft,
          version: current.version,
        },
        data: { version: { increment: 1 } },
      });
      if (!claimed.count) this.versionConflict();

      const data: Prisma.CommerceRfqUncheckedUpdateInput = {};
      if (dto.requirement !== undefined)
        data.requirement = dto.requirement.trim();
      if (dto.market !== undefined) data.market = cleanOptionalText(dto.market);
      if (dto.currency !== undefined) data.currency = dto.currency;
      if (dto.destination !== undefined)
        data.destination = cleanOptionalText(dto.destination);
      if (dto.terms !== undefined) data.terms = cleanOptionalText(dto.terms);
      if (dto.dueAt !== undefined)
        data.dueAt = dto.dueAt ? new Date(dto.dueAt) : null;
      if (dto.sourceOpportunityId !== undefined)
        data.sourceOpportunityId = dto.sourceOpportunityId;
      await tx.commerceRfq.update({
        where: { id },
        data: { ...data, updatedAt: new Date() },
      });

      if (items) {
        await tx.commerceRfqItem.deleteMany({ where: { rfqId: id } });
        await tx.commerceRfqItem.createMany({
          data: items.map((item) => ({
            rfqId: id,
            productId: item.productId,
            description: item.description.trim(),
            qty: item.qty,
            minimumQty: item.minimumQty,
            specifications: cleanOptionalText(item.specifications),
          })),
        });
      }
      if (supplierIds !== undefined) {
        await tx.commerceRfqSupplier.deleteMany({ where: { rfqId: id } });
        if (supplierIds.length) {
          await tx.commerceRfqSupplier.createMany({
            data: supplierIds.map((supplierId) => ({ rfqId: id, supplierId })),
          });
        }
      }

      const result = await tx.commerceRfq.findFirstOrThrow({
        where: { id, businessId },
        include: INCLUDE,
      });
      await tx.commerceRfqAudit.create({
        data: {
          businessId,
          rfqId: id,
          action: 'updated',
          actorUserId,
          before: this.snapshot(current),
          after: this.snapshot(result),
        },
      });
      return result;
    });
    return serializeRfq(updated);
  }

  async list(
    businessId: string,
    filters: { status?: CommerceRfqStatus; search?: string },
  ) {
    const term = filters.search?.trim();
    const rfqs = await this.tenantPrisma.client.commerceRfq.findMany({
      where: {
        businessId,
        status: filters.status,
        ...(term
          ? {
              OR: [
                { requirement: { contains: term } },
                { market: { contains: term } },
                {
                  suppliers: {
                    some: { supplier: { name: { contains: term } } },
                  },
                },
                {
                  quotes: { some: { supplier: { name: { contains: term } } } },
                },
              ],
            }
          : {}),
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      include: INCLUDE,
    });
    return rfqs.map(serializeRfq);
  }

  async getOne(businessId: string, id: string) {
    return serializeRfq(await this.findOne(businessId, id));
  }

  async history(businessId: string, id: string) {
    await this.findOne(businessId, id);
    return this.tenantPrisma.client.commerceRfqAudit.findMany({
      where: { businessId, rfqId: id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
  }

  async close(
    businessId: string,
    actorUserId: string,
    id: string,
    dto: CloseCommerceRfqDto,
  ) {
    return this.finish(
      businessId,
      actorUserId,
      id,
      dto,
      CommerceRfqStatus.closed,
    );
  }

  async cancel(
    businessId: string,
    actorUserId: string,
    id: string,
    dto: CloseCommerceRfqDto,
  ) {
    return this.finish(
      businessId,
      actorUserId,
      id,
      dto,
      CommerceRfqStatus.cancelled,
    );
  }

  private async finish(
    businessId: string,
    actorUserId: string,
    id: string,
    dto: CloseCommerceRfqDto,
    nextStatus: 'closed' | 'cancelled',
  ) {
    const current = await this.findOne(businessId, id);
    this.assertVersion(current.version, dto.expectedVersion);
    if (
      (nextStatus === CommerceRfqStatus.closed &&
        current.status !== CommerceRfqStatus.open) ||
      (nextStatus === CommerceRfqStatus.cancelled &&
        current.status !== CommerceRfqStatus.draft &&
        current.status !== CommerceRfqStatus.open)
    ) {
      this.invalidState(
        'This RFQ cannot be closed or cancelled from its current state.',
      );
    }

    await this.tenantPrisma.client.$transaction(async (tx) => {
      const changed = await tx.commerceRfq.updateMany({
        where: {
          id,
          businessId,
          status: current.status,
          version: current.version,
        },
        data: { status: nextStatus, version: { increment: 1 } },
      });
      if (!changed.count) this.versionConflict();
      await tx.commerceRfqSupplier.updateMany({
        where: {
          rfqId: id,
          status: {
            in: [
              CommerceRfqSupplierStatus.pending_send,
              CommerceRfqSupplierStatus.sent,
            ],
          },
        },
        data: { status: CommerceRfqSupplierStatus.withdrawn },
      });
      await tx.commerceRfqAudit.create({
        data: {
          businessId,
          rfqId: id,
          action: nextStatus,
          reason: dto.reason.trim(),
          actorUserId,
          before: this.snapshot(current),
          after: {
            status: nextStatus,
            version: current.version + 1,
          },
        },
      });
    });
    return this.getOne(businessId, id);
  }

  async open(
    businessId: string,
    actorUserId: string,
    id: string,
    dto: CommerceRfqVersionDto,
  ) {
    const current = await this.findOne(businessId, id);
    this.assertVersion(current.version, dto.expectedVersion);
    if (current.status !== CommerceRfqStatus.draft)
      this.invalidState('Only a draft RFQ can be opened.');
    if (current.dueAt && current.dueAt.getTime() <= Date.now())
      this.invalidState(
        'The response due date has passed. Update the RFQ before opening it.',
      );

    await this.tenantPrisma.client.$transaction(async (tx) => {
      const changed = await tx.commerceRfq.updateMany({
        where: {
          id,
          businessId,
          status: CommerceRfqStatus.draft,
          version: current.version,
        },
        data: { status: CommerceRfqStatus.open, version: { increment: 1 } },
      });
      if (!changed.count) this.versionConflict();
      await tx.commerceRfqAudit.create({
        data: {
          businessId,
          rfqId: id,
          action: 'opened',
          actorUserId,
          before: this.snapshot(current),
          after: {
            status: CommerceRfqStatus.open,
            version: current.version + 1,
          },
        },
      });
    });
    return this.getOne(businessId, id);
  }

  /** Confirms an operator sent supplier invitations elsewhere; this endpoint sends no message. */
  async confirmManualSupplierSend(
    businessId: string,
    actorUserId: string,
    id: string,
    dto: MarkRfqSuppliersSentDto,
  ) {
    const current = await this.findOne(businessId, id);
    this.assertVersion(current.version, dto.expectedVersion);
    if (current.status !== CommerceRfqStatus.open)
      this.invalidState('Open the RFQ before confirming supplier outreach.');
    const currentIds = new Set(
      current.suppliers
        .filter(
          (invitation) =>
            invitation.status === CommerceRfqSupplierStatus.pending_send,
        )
        .map((invitation) => invitation.supplierId),
    );
    if (dto.supplierIds.some((supplierId) => !currentIds.has(supplierId))) {
      throw this.error(
        COMMERCE_RFQ_ERROR_CODES.INVITATION_NOT_FOUND,
        'Select suppliers on this RFQ whose invitations are still pending manual send.',
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.tenantPrisma.client.$transaction(async (tx) => {
      const sentAt = new Date();
      const sent = await tx.commerceRfqSupplier.updateMany({
        where: {
          rfqId: id,
          supplierId: { in: dto.supplierIds },
          status: CommerceRfqSupplierStatus.pending_send,
        },
        data: { status: CommerceRfqSupplierStatus.sent, invitedAt: sentAt },
      });
      if (sent.count !== dto.supplierIds.length) this.versionConflict();
      const changed = await tx.commerceRfq.updateMany({
        where: {
          id,
          businessId,
          status: CommerceRfqStatus.open,
          version: current.version,
        },
        data: { version: { increment: 1 } },
      });
      if (!changed.count) this.versionConflict();
      await tx.commerceRfqAudit.create({
        data: {
          businessId,
          rfqId: id,
          action: 'manual_supplier_send_confirmed',
          reason:
            'Operator confirmed manual outreach; no connector dispatch occurred.',
          actorUserId,
          before: { version: current.version },
          after: {
            supplierIds: dto.supplierIds,
            sentAt: sentAt.toISOString(),
            version: current.version + 1,
          },
        },
      });
    });
    return this.getOne(businessId, id);
  }

  async recordQuote(
    businessId: string,
    actorUserId: string,
    id: string,
    dto: RecordCommerceSupplierQuoteDto,
  ) {
    const rfq = await this.findOne(businessId, id);
    this.assertVersion(rfq.version, dto.expectedVersion);
    if (rfq.status !== CommerceRfqStatus.open)
      this.invalidState('Quotes can only be recorded while the RFQ is open.');
    if (dto.currency !== rfq.currency) {
      throw this.error(
        COMMERCE_RFQ_ERROR_CODES.INVALID_QUOTE,
        'Quote currency must match the RFQ currency (' + rfq.currency + ').',
        HttpStatus.BAD_REQUEST,
      );
    }

    const invitation = rfq.suppliers.find(
      (item) => item.id === dto.invitationId,
    );
    if (!invitation) {
      throw this.error(
        COMMERCE_RFQ_ERROR_CODES.INVITATION_NOT_FOUND,
        'Supplier invitation does not belong to this RFQ.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (
      invitation.status === CommerceRfqSupplierStatus.declined ||
      invitation.status === CommerceRfqSupplierStatus.withdrawn
    ) {
      this.invalidState(
        'A response cannot be recorded for a declined or withdrawn supplier invitation.',
      );
    }
    const latestQuote = rfq.quotes
      .filter((quote) => quote.invitationId === invitation.id)
      .sort((left, right) => right.revisionNo - left.revisionNo)[0];
    if (
      latestQuote &&
      (latestQuote.status === CommerceSupplierQuoteStatus.awarded ||
        latestQuote.status === CommerceSupplierQuoteStatus.withdrawn)
    ) {
      this.invalidState(
        'This supplier invitation cannot receive another quote after award or withdrawal.',
      );
    }
    if (
      dto.items.length !== rfq.items.length ||
      new Set(dto.items.map((item) => item.rfqItemId)).size !== dto.items.length
    ) {
      throw this.error(
        COMMERCE_RFQ_ERROR_CODES.INVALID_QUOTE,
        'A quote must contain exactly one line for every RFQ item.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const itemById = new Map(rfq.items.map((item) => [item.id, item]));
    for (const line of dto.items) {
      if (!itemById.has(line.rfqItemId)) {
        throw this.error(
          COMMERCE_RFQ_ERROR_CODES.INVALID_QUOTE,
          'Each quote line must reference an item on this RFQ. Record the supplier quantity basis and MOQ as quoted; the award step checks whether they fit the request.',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    await this.tenantPrisma.client.$transaction(async (tx) => {
      const quoteData = {
        currency: dto.currency,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
        paymentTerms: cleanOptionalText(dto.paymentTerms),
        freight: dto.freight,
        duties: dto.duties,
        leadTimeDays: dto.leadTimeDays,
        notes: cleanOptionalText(dto.notes),
      };
      if (
        latestQuote &&
        (latestQuote.status === CommerceSupplierQuoteStatus.submitted ||
          latestQuote.status === CommerceSupplierQuoteStatus.shortlisted)
      ) {
        const superseded = await tx.commerceSupplierQuote.updateMany({
          where: {
            id: latestQuote.id,
            businessId,
            version: latestQuote.version,
            status: latestQuote.status,
          },
          data: {
            status: CommerceSupplierQuoteStatus.superseded,
            version: { increment: 1 },
          },
        });
        if (!superseded.count) this.versionConflict();
      }
      await tx.commerceSupplierQuote.create({
        data: {
          businessId,
          rfqId: id,
          supplierId: invitation.supplierId,
          invitationId: invitation.id,
          revisionNo: (latestQuote?.revisionNo ?? 0) + 1,
          ...quoteData,
          createdByUserId: actorUserId,
          items: {
            create: dto.items.map((item) => ({
              rfqItemId: item.rfqItemId,
              quotedQty: item.quotedQty,
              minimumQty: item.minimumQty,
              unitPrice: item.unitPrice,
            })),
          },
        },
      });
      await tx.commerceRfqSupplier.update({
        where: { id: invitation.id },
        data: {
          status: CommerceRfqSupplierStatus.responded,
          respondedAt: new Date(),
        },
      });
      const changed = await tx.commerceRfq.updateMany({
        where: {
          id,
          businessId,
          status: CommerceRfqStatus.open,
          version: rfq.version,
        },
        data: { version: { increment: 1 } },
      });
      if (!changed.count) this.versionConflict();
      await tx.commerceRfqAudit.create({
        data: {
          businessId,
          rfqId: id,
          action: latestQuote
            ? 'supplier_quote_revised'
            : 'supplier_quote_recorded',
          actorUserId,
          before: latestQuote
            ? {
                quoteId: latestQuote.id,
                revisionNo: latestQuote.revisionNo,
                status: latestQuote.status,
                currency: latestQuote.currency,
                freight: Number(latestQuote.freight),
                duties: Number(latestQuote.duties),
                paymentTerms: latestQuote.paymentTerms,
                items: latestQuote.items.map((item) => ({
                  rfqItemId: item.rfqItemId,
                  quotedQty: item.quotedQty,
                  unitPrice: Number(item.unitPrice),
                })),
                landedTotal: quoteLandedTotal(latestQuote),
              }
            : undefined,
          after: {
            supplierId: invitation.supplierId,
            revisionNo: (latestQuote?.revisionNo ?? 0) + 1,
            currency: dto.currency,
            itemCount: dto.items.length,
            freight: dto.freight,
            duties: dto.duties,
            validUntil: dto.validUntil ?? null,
            source: 'operator_recorded',
          },
        },
      });
    });
    await this.activity.record(businessId, {
      type: 'commerce_rfq_response_received',
      description:
        'Supplier quote ' + (latestQuote ? 'revised' : 'recorded') + ' for RFQ',
      entityType: 'CommerceRfq',
      entityId: id,
      actorUserId,
    });
    return this.getOne(businessId, id);
  }

  async updateQuoteStatus(
    businessId: string,
    actorUserId: string,
    id: string,
    quoteId: string,
    action: 'shortlist' | 'reject',
    dto: CommerceRfqVersionDto,
  ) {
    const rfq = await this.findOne(businessId, id);
    this.assertVersion(rfq.version, dto.expectedVersion);
    if (rfq.status !== CommerceRfqStatus.open)
      this.invalidState('Quotes can only be reviewed while the RFQ is open.');
    const quote = rfq.quotes.find((item) => item.id === quoteId);
    if (!quote) this.notFound('Supplier quote not found for this RFQ.');
    const status =
      action === 'shortlist'
        ? CommerceSupplierQuoteStatus.shortlisted
        : CommerceSupplierQuoteStatus.rejected;
    const allowed =
      action === 'shortlist'
        ? quote.status === CommerceSupplierQuoteStatus.submitted
        : quote.status === CommerceSupplierQuoteStatus.submitted ||
          quote.status === CommerceSupplierQuoteStatus.shortlisted;
    if (!allowed)
      this.invalidState(
        'Quote cannot be moved to ' + status + ' from ' + quote.status + '.',
      );

    await this.tenantPrisma.client.$transaction(async (tx) => {
      const changedQuote = await tx.commerceSupplierQuote.updateMany({
        where: {
          id: quoteId,
          rfqId: id,
          businessId,
          version: quote.version,
          status: quote.status,
        },
        data: { status, version: { increment: 1 } },
      });
      if (!changedQuote.count) this.versionConflict();
      const changedRfq = await tx.commerceRfq.updateMany({
        where: {
          id,
          businessId,
          status: CommerceRfqStatus.open,
          version: rfq.version,
        },
        data: { version: { increment: 1 } },
      });
      if (!changedRfq.count) this.versionConflict();
      await tx.commerceRfqAudit.create({
        data: {
          businessId,
          rfqId: id,
          action: 'quote_' + action,
          actorUserId,
          before: { quoteId, status: quote.status },
          after: { quoteId, status },
        },
      });
    });
    return this.getOne(businessId, id);
  }

  async award(
    businessId: string,
    actorUserId: string,
    id: string,
    dto: AwardCommerceRfqDto,
  ) {
    const rfq = await this.findOne(businessId, id);
    this.assertVersion(rfq.version, dto.expectedVersion);
    if (rfq.status !== CommerceRfqStatus.open)
      this.invalidState('Only an open RFQ can be awarded.');
    const quote = rfq.quotes.find((item) => item.id === dto.quoteId);
    if (!quote) this.notFound('Supplier quote not found for this RFQ.');
    const latestSupplierQuote = rfq.quotes
      .filter((item) => item.invitationId === quote.invitationId)
      .sort((left, right) => right.revisionNo - left.revisionNo)[0];
    if (!latestSupplierQuote || latestSupplierQuote.id !== quote.id) {
      this.invalidState(
        'A superseded supplier quote revision cannot be awarded.',
      );
    }
    if (
      quote.status !== CommerceSupplierQuoteStatus.submitted &&
      quote.status !== CommerceSupplierQuoteStatus.shortlisted
    ) {
      this.invalidState(
        'Only a submitted or shortlisted quote can be awarded.',
      );
    }
    if (quote.validUntil && quote.validUntil.getTime() <= Date.now()) {
      throw this.error(
        COMMERCE_RFQ_ERROR_CODES.EXPIRED_QUOTE,
        'This supplier quote has expired and must be reconfirmed before award.',
        HttpStatus.CONFLICT,
      );
    }
    if (
      quote.currency !== rfq.currency ||
      quote.items.length !== rfq.items.length
    ) {
      throw this.error(
        COMMERCE_RFQ_ERROR_CODES.INVALID_QUOTE,
        'Quote currency or line coverage no longer matches the RFQ.',
        HttpStatus.CONFLICT,
      );
    }
    const quoteLineByItemId = new Map(
      quote.items.map((item) => [item.rfqItemId, item]),
    );
    for (const item of rfq.items) {
      const line = quoteLineByItemId.get(item.id);
      if (
        !line ||
        line.quotedQty !== item.qty ||
        (line.minimumQty !== null && line.minimumQty > item.qty)
      ) {
        throw this.error(
          COMMERCE_RFQ_ERROR_CODES.INVALID_QUOTE,
          'Award requires every quote line to match the requested quantity and MOQ.',
          HttpStatus.CONFLICT,
        );
      }
      if (!item.productId) {
        throw this.error(
          COMMERCE_RFQ_ERROR_CODES.PRODUCT_REQUIRED_FOR_AWARD,
          'Every awarded item must first be linked to a canonical Noxtill product so the draft Purchase Order does not duplicate the product catalog.',
          HttpStatus.CONFLICT,
        );
      }
    }

    await this.tenantPrisma.client.$transaction(async (tx) => {
      const claimed = await tx.commerceRfq.updateMany({
        where: {
          id,
          businessId,
          status: CommerceRfqStatus.open,
          version: rfq.version,
        },
        data: { version: { increment: 1 } },
      });
      if (!claimed.count) this.versionConflict();

      const purchaseOrder = await tx.purchaseOrder.create({
        data: {
          businessId,
          supplierId: quote.supplierId,
          note: 'Commerce RFQ ' + id + '; winning quote ' + quote.id,
          createdByUserId: actorUserId,
          status: PurchaseOrderStatus.draft,
          items: {
            create: rfq.items.map((item) => ({
              productId: item.productId!,
              qtyOrdered: item.qty,
              unitCost: quoteLineByItemId.get(item.id)!.unitPrice,
            })),
          },
        },
        select: { id: true },
      });

      const quoteUpdated = await tx.commerceSupplierQuote.updateMany({
        where: {
          id: quote.id,
          businessId,
          version: quote.version,
          status: quote.status,
        },
        data: {
          status: CommerceSupplierQuoteStatus.awarded,
          version: { increment: 1 },
        },
      });
      if (!quoteUpdated.count) this.versionConflict();
      await tx.commerceSupplierQuote.updateMany({
        where: {
          rfqId: id,
          businessId,
          id: { not: quote.id },
          status: {
            in: [
              CommerceSupplierQuoteStatus.submitted,
              CommerceSupplierQuoteStatus.shortlisted,
            ],
          },
        },
        data: {
          status: CommerceSupplierQuoteStatus.rejected,
          version: { increment: 1 },
        },
      });
      await tx.commerceRfq.update({
        where: { id },
        data: {
          status: CommerceRfqStatus.awarded,
          awardedQuoteId: quote.id,
          purchaseOrderId: purchaseOrder.id,
        },
      });
      await tx.commerceRfqAudit.create({
        data: {
          businessId,
          rfqId: id,
          action: 'awarded',
          reason: dto.reason.trim(),
          actorUserId,
          before: { status: rfq.status, quoteId: quote.id },
          after: {
            status: CommerceRfqStatus.awarded,
            quoteId: quote.id,
            purchaseOrderId: purchaseOrder.id,
            purchaseOrderStatus: PurchaseOrderStatus.draft,
            landedTotal: quoteLandedTotal(quote),
          },
        },
      });
    });

    await this.activity.record(businessId, {
      type: 'commerce_rfq_awarded',
      description:
        'Supplier quote awarded; a draft Purchase Order was created for review',
      entityType: 'CommerceRfq',
      entityId: id,
      actorUserId,
    });
    return this.getOne(businessId, id);
  }

  private async findOne(businessId: string, id: string) {
    const rfq = await this.tenantPrisma.client.commerceRfq.findFirst({
      where: { id, businessId },
      include: INCLUDE,
    });
    if (!rfq) this.notFound();
    return rfq;
  }

  private snapshot(rfq: {
    id: string;
    status: CommerceRfqStatus;
    version: number;
    requirement: string;
    currency: string;
    updatedAt: Date;
  }) {
    return {
      id: rfq.id,
      status: rfq.status,
      version: rfq.version,
      requirement: rfq.requirement,
      currency: rfq.currency,
      updatedAt: rfq.updatedAt.toISOString(),
    };
  }

  private assertVersion(current: number, expected: number) {
    if (current !== expected) this.versionConflict();
  }

  private versionConflict(): never {
    throw this.error(
      COMMERCE_RFQ_ERROR_CODES.VERSION_CONFLICT,
      'This RFQ changed in another session. Refresh it and review the latest data.',
      HttpStatus.CONFLICT,
    );
  }

  private invalidState(message: string): never {
    throw this.error(
      COMMERCE_RFQ_ERROR_CODES.INVALID_STATE,
      message,
      HttpStatus.CONFLICT,
    );
  }

  private notFound(message = 'RFQ not found.'): never {
    throw this.error(
      COMMERCE_RFQ_ERROR_CODES.NOT_FOUND,
      message,
      HttpStatus.NOT_FOUND,
    );
  }

  private error(code: string, message: string, status: HttpStatus) {
    return new AppException(code, message, status);
  }
}
