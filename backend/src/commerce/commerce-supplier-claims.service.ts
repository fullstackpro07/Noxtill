import { createHash, randomUUID } from 'crypto';
import { extname } from 'path';
import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ActivityEventType,
  CommerceSupplierClaimEvidenceType,
  CommerceSupplierClaimStatus,
  Prisma,
} from '@prisma/client';
import { ActivityService } from '../activity/activity.service';
import { AppException } from '../common/filters/app.exception';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { S3Service } from '../common/storage/s3.service';
import {
  AddCommerceSupplierClaimEvidenceDto,
  CommerceSupplierClaimActionDto,
  CreateCommerceSupplierClaimDto,
  RecordCommerceSupplierClaimCommunicationDto,
  RecordCommerceSupplierClaimSettlementDto,
} from './dto/commerce-supplier-claim.dto';

const CLAIM_INCLUDE = {
  supplier: { select: { id: true, name: true, phone: true, email: true } },
  purchaseOrder: { select: { id: true, status: true, createdAt: true } },
  items: {
    include: {
      product: { select: { id: true, name: true, sku: true } },
      purchaseOrderItem: {
        select: {
          id: true,
          qtyOrdered: true,
          qtyReceived: true,
          unitCost: true,
        },
      },
    },
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
  },
  evidence: {
    orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
  },
  communications: {
    orderBy: [{ occurredAt: 'desc' as const }, { id: 'desc' as const }],
  },
  settlements: {
    orderBy: [{ settledAt: 'desc' as const }, { id: 'desc' as const }],
  },
} satisfies Prisma.CommerceSupplierClaimInclude;

type ClaimRecord = Prisma.CommerceSupplierClaimGetPayload<{
  include: typeof CLAIM_INCLUDE;
}>;

const ERROR = {
  NOT_FOUND: 'COMMERCE_SUPPLIER_CLAIM_NOT_FOUND',
  SUPPLIER_NOT_FOUND: 'COMMERCE_SUPPLIER_CLAIM_SUPPLIER_NOT_FOUND',
  PURCHASE_ORDER_INVALID: 'COMMERCE_SUPPLIER_CLAIM_PURCHASE_ORDER_INVALID',
  PRODUCT_NOT_FOUND: 'COMMERCE_SUPPLIER_CLAIM_PRODUCT_NOT_FOUND',
  INVALID_STATE: 'COMMERCE_SUPPLIER_CLAIM_INVALID_STATE',
  VERSION_CONFLICT: 'COMMERCE_SUPPLIER_CLAIM_VERSION_CONFLICT',
  EVIDENCE_KEY_INVALID: 'COMMERCE_SUPPLIER_CLAIM_EVIDENCE_KEY_INVALID',
  CURRENCY_MISMATCH: 'COMMERCE_SUPPLIER_CLAIM_CURRENCY_MISMATCH',
  SETTLEMENT_EXCEEDS_CLAIM: 'COMMERCE_SUPPLIER_CLAIM_SETTLEMENT_EXCEEDS_CLAIM',
  INVALID_AMOUNT: 'COMMERCE_SUPPLIER_CLAIM_INVALID_AMOUNT',
  INVALID_FILTER: 'COMMERCE_SUPPLIER_CLAIM_INVALID_FILTER',
} as const;

const TERMINAL_STATUSES = new Set<CommerceSupplierClaimStatus>([
  CommerceSupplierClaimStatus.settled,
  CommerceSupplierClaimStatus.rejected,
  CommerceSupplierClaimStatus.closed,
]);

const ALLOWED_EVIDENCE_TYPES = new Set<CommerceSupplierClaimEvidenceType>([
  'photo',
  'invoice',
  'delivery_record',
  'inspection_report',
  'correspondence',
  'other',
]);

const ALLOWED_UPLOAD_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

function hasExpectedSignature(file: Express.Multer.File): boolean {
  const bytes = file.buffer;
  switch (file.mimetype) {
    case 'application/pdf':
      return bytes.subarray(0, 5).toString('ascii') === '%PDF-';
    case 'image/jpeg':
      return (
        bytes.length >= 3 &&
        bytes[0] === 0xff &&
        bytes[1] === 0xd8 &&
        bytes[2] === 0xff
      );
    case 'image/png':
      return bytes
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    case 'image/webp':
      return (
        bytes.length >= 12 &&
        bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
        bytes.subarray(8, 12).toString('ascii') === 'WEBP'
      );
    default:
      return false;
  }
}

function decimal(value: Prisma.Decimal.Value | undefined): Prisma.Decimal {
  return new Prisma.Decimal(value ?? 0);
}

function claimAmount(record: Pick<ClaimRecord, 'items'>): Prisma.Decimal {
  return record.items.reduce(
    (sum, item) =>
      sum
        .plus(item.productLossAmount)
        .plus(item.freightLossAmount)
        .plus(item.otherLossAmount),
    new Prisma.Decimal(0),
  );
}

function settlementAmount(
  record: Pick<ClaimRecord, 'settlements'>,
): Prisma.Decimal {
  return record.settlements.reduce(
    (sum, settlement) => sum.plus(settlement.amount),
    new Prisma.Decimal(0),
  );
}

@Injectable()
export class CommerceSupplierClaimsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly storage: S3Service,
    private readonly activity: ActivityService,
  ) {}

  async list(
    businessId: string,
    filters: { status?: CommerceSupplierClaimStatus; supplierId?: string },
  ) {
    if (
      filters.status &&
      !Object.values(CommerceSupplierClaimStatus).includes(filters.status)
    ) {
      throw this.error(
        ERROR.INVALID_FILTER,
        'Choose a valid supplier-claim status filter.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const claims =
      await this.tenantPrisma.client.commerceSupplierClaim.findMany({
        where: {
          businessId,
          ...(filters.status ? { status: filters.status } : {}),
          ...(filters.supplierId ? { supplierId: filters.supplierId } : {}),
        },
        include: CLAIM_INCLUDE,
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: 100,
      });
    return Promise.all(claims.map((claim) => this.serialize(claim)));
  }

  async getOne(businessId: string, id: string) {
    return this.serialize(await this.findOne(businessId, id));
  }

  async history(businessId: string, id: string) {
    await this.findOne(businessId, id);
    return this.tenantPrisma.client.commerceSupplierClaimAudit.findMany({
      where: { businessId, claimId: id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  async create(
    businessId: string,
    actorUserId: string,
    dto: CreateCommerceSupplierClaimDto,
  ) {
    const requestedAmount = dto.items.reduce(
      (sum, item) =>
        sum
          .plus(decimal(item.productLossAmount))
          .plus(decimal(item.freightLossAmount))
          .plus(decimal(item.otherLossAmount)),
      new Prisma.Decimal(0),
    );
    if (requestedAmount.lessThanOrEqualTo(0)) {
      throw this.error(
        ERROR.INVALID_AMOUNT,
        'A supplier claim must include a positive, operator-entered loss amount.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const supplier = await this.tenantPrisma.client.supplier.findFirst({
      where: { id: dto.supplierId, businessId },
      select: { id: true },
    });
    if (!supplier) {
      throw this.error(
        ERROR.SUPPLIER_NOT_FOUND,
        'Select a supplier that belongs to this business.',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (dto.purchaseOrderId) {
      const purchaseOrder =
        await this.tenantPrisma.client.purchaseOrder.findFirst({
          where: {
            id: dto.purchaseOrderId,
            businessId,
            supplierId: dto.supplierId,
          },
          select: { id: true },
        });
      if (!purchaseOrder) {
        throw this.error(
          ERROR.PURCHASE_ORDER_INVALID,
          'The purchase order must belong to this business and selected supplier.',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

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
          ERROR.PRODUCT_NOT_FOUND,
          'One or more claim products do not belong to this business.',
          HttpStatus.BAD_REQUEST,
        );
      }
    }

    const productIdByPurchaseOrderItem = new Map<string, string>();
    const purchaseOrderItemIds = [
      ...new Set(
        dto.items.flatMap((item) =>
          item.purchaseOrderItemId ? [item.purchaseOrderItemId] : [],
        ),
      ),
    ];
    if (purchaseOrderItemIds.length) {
      if (!dto.purchaseOrderId) {
        throw this.error(
          ERROR.PURCHASE_ORDER_INVALID,
          'A purchase order must be selected when a purchase-order line is linked.',
          HttpStatus.BAD_REQUEST,
        );
      }
      const orderItems =
        await this.tenantPrisma.client.purchaseOrderItem.findMany({
          where: {
            id: { in: purchaseOrderItemIds },
            purchaseOrderId: dto.purchaseOrderId,
          },
          select: { id: true, productId: true },
        });
      if (orderItems.length !== purchaseOrderItemIds.length) {
        throw this.error(
          ERROR.PURCHASE_ORDER_INVALID,
          'Each linked purchase-order line must belong to the selected purchase order.',
          HttpStatus.BAD_REQUEST,
        );
      }
      for (const line of orderItems) {
        productIdByPurchaseOrderItem.set(line.id, line.productId);
      }
      const lineById = new Map(orderItems.map((line) => [line.id, line]));
      for (const item of dto.items) {
        if (
          item.purchaseOrderItemId &&
          item.productId &&
          lineById.get(item.purchaseOrderItemId)?.productId !== item.productId
        ) {
          throw this.error(
            ERROR.PURCHASE_ORDER_INVALID,
            'A claim product must match its linked purchase-order line.',
            HttpStatus.BAD_REQUEST,
          );
        }
      }
    }

    const created = await this.tenantPrisma.client.$transaction(async (tx) => {
      const claim = await tx.commerceSupplierClaim.create({
        data: {
          businessId,
          supplierId: dto.supplierId,
          purchaseOrderId: dto.purchaseOrderId,
          reference: dto.reference?.trim() || null,
          reasonCode: dto.reasonCode.trim(),
          reason: dto.reason.trim(),
          currency: dto.currency,
          createdByUserId: actorUserId,
          items: {
            create: dto.items.map((item) => ({
              productId:
                item.productId ??
                (item.purchaseOrderItemId
                  ? productIdByPurchaseOrderItem.get(item.purchaseOrderItemId)
                  : undefined),
              purchaseOrderItemId: item.purchaseOrderItemId,
              description: item.description.trim(),
              quantityAffected: item.quantityAffected,
              productLossAmount: decimal(item.productLossAmount),
              freightLossAmount: decimal(item.freightLossAmount),
              otherLossAmount: decimal(item.otherLossAmount),
            })),
          },
        },
        include: CLAIM_INCLUDE,
      });
      await tx.commerceSupplierClaimAudit.create({
        data: {
          businessId,
          claimId: claim.id,
          action: 'created',
          actorUserId,
          after: this.snapshot(claim),
        },
      });
      return claim;
    });
    await this.activity.record(businessId, {
      type: ActivityEventType.commerce_supplier_claim_created,
      description: 'Supplier claim created',
      amount: requestedAmount.toNumber(),
      entityType: 'CommerceSupplierClaim',
      entityId: created.id,
      actorUserId,
    });
    return this.serialize(created);
  }

  async submit(
    businessId: string,
    actorUserId: string,
    id: string,
    dto: CommerceSupplierClaimActionDto,
  ) {
    const current = await this.findOne(businessId, id);
    this.assertVersion(current, dto.expectedVersion);
    if (current.status !== CommerceSupplierClaimStatus.draft) {
      this.invalidState('Only a draft supplier claim can be submitted.');
    }
    if (!current.evidence.length) {
      this.invalidState(
        'Add at least one evidence file before submitting this claim.',
      );
    }
    return this.transition(businessId, actorUserId, id, current, dto, {
      status: CommerceSupplierClaimStatus.submitted,
      action: 'submitted',
      submittedAt: new Date(),
    });
  }

  async acknowledge(
    businessId: string,
    actorUserId: string,
    id: string,
    dto: CommerceSupplierClaimActionDto,
  ) {
    const current = await this.findOne(businessId, id);
    this.assertVersion(current, dto.expectedVersion);
    if (current.status !== CommerceSupplierClaimStatus.submitted) {
      this.invalidState('Only a submitted supplier claim can be acknowledged.');
    }
    return this.transition(businessId, actorUserId, id, current, dto, {
      status: CommerceSupplierClaimStatus.acknowledged,
      action: 'acknowledged',
      acknowledgedAt: new Date(),
    });
  }

  async reject(
    businessId: string,
    actorUserId: string,
    id: string,
    dto: CommerceSupplierClaimActionDto,
  ) {
    const current = await this.findOne(businessId, id);
    this.assertVersion(current, dto.expectedVersion);
    if (
      current.status !== CommerceSupplierClaimStatus.submitted &&
      current.status !== CommerceSupplierClaimStatus.acknowledged
    ) {
      this.invalidState('Only an active supplier claim can be rejected.');
    }
    return this.transition(businessId, actorUserId, id, current, dto, {
      status: CommerceSupplierClaimStatus.rejected,
      action: 'rejected',
      resolvedAt: new Date(),
    });
  }

  async close(
    businessId: string,
    actorUserId: string,
    id: string,
    dto: CommerceSupplierClaimActionDto,
  ) {
    const current = await this.findOne(businessId, id);
    this.assertVersion(current, dto.expectedVersion);
    if (
      current.status === CommerceSupplierClaimStatus.settled ||
      current.status === CommerceSupplierClaimStatus.closed
    ) {
      this.invalidState(
        'A settled or already closed claim cannot be closed again.',
      );
    }
    return this.transition(businessId, actorUserId, id, current, dto, {
      status: CommerceSupplierClaimStatus.closed,
      action: 'closed',
      resolvedAt: new Date(),
    });
  }

  async uploadEvidence(
    businessId: string,
    actorUserId: string,
    id: string,
    dto: AddCommerceSupplierClaimEvidenceDto,
    file: Express.Multer.File,
  ) {
    const claim = await this.findOne(businessId, id);
    if (claim.status !== CommerceSupplierClaimStatus.draft) {
      this.invalidState(
        'Evidence can only be uploaded while the claim is a draft.',
      );
    }
    if (!ALLOWED_EVIDENCE_TYPES.has(dto.evidenceType)) {
      this.invalidState('Choose a supported supplier-claim evidence type.');
    }
    if (
      !file ||
      file.size === 0 ||
      !ALLOWED_UPLOAD_TYPES.has(file.mimetype) ||
      !hasExpectedSignature(file)
    ) {
      throw this.error(
        ERROR.EVIDENCE_KEY_INVALID,
        'Evidence must be a PDF, JPEG, PNG, or WebP file.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const extension = extname(file.originalname)
      .toLowerCase()
      .replace(/[^.a-z0-9]/g, '')
      .slice(0, 12);
    const fileKey = `commerce-claims/${businessId}/${id}/${randomUUID()}${extension}`;
    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    await this.storage.upload(fileKey, file.buffer, file.mimetype);
    let evidence: {
      id: string;
      claimId: string;
      evidenceType: CommerceSupplierClaimEvidenceType;
      note: string | null;
      sha256: string | null;
      addedByUserId: string | null;
      createdAt: Date;
    };
    try {
      evidence = await this.tenantPrisma.client.$transaction(async (tx) => {
        const row = await tx.commerceSupplierClaimEvidence.create({
          data: {
            claimId: id,
            evidenceType: dto.evidenceType,
            fileKey,
            note: dto.note?.trim() || null,
            sha256,
            addedByUserId: actorUserId,
          },
        });
        const changed = await tx.commerceSupplierClaim.updateMany({
          where: {
            id,
            businessId,
            status: CommerceSupplierClaimStatus.draft,
            version: claim.version,
          },
          data: { version: { increment: 1 } },
        });
        if (!changed.count) this.versionConflict();
        await tx.commerceSupplierClaimAudit.create({
          data: {
            businessId,
            claimId: id,
            action: 'evidence_added',
            actorUserId,
            before: { version: claim.version },
            after: {
              evidenceId: row.id,
              evidenceType: row.evidenceType,
              sha256,
              version: claim.version + 1,
            },
          },
        });
        return row;
      });
    } catch (error) {
      await this.storage.delete(fileKey).catch(() => undefined);
      throw error;
    }
    return {
      id: evidence.id,
      claimId: evidence.claimId,
      evidenceType: evidence.evidenceType,
      note: evidence.note,
      sha256: evidence.sha256,
      addedByUserId: evidence.addedByUserId,
      createdAt: evidence.createdAt,
      downloadUrl: await this.storage.getSignedDownloadUrl(fileKey),
      claimVersion: claim.version + 1,
    };
  }

  async recordCommunication(
    businessId: string,
    actorUserId: string,
    id: string,
    dto: RecordCommerceSupplierClaimCommunicationDto,
  ) {
    const claim = await this.findOne(businessId, id);
    if (
      TERMINAL_STATUSES.has(claim.status) ||
      claim.status === CommerceSupplierClaimStatus.draft
    ) {
      this.invalidState(
        'Communications can only be recorded for an active submitted claim.',
      );
    }
    const communication = await this.tenantPrisma.client.$transaction(
      async (tx) => {
        const row = await tx.commerceSupplierClaimCommunication.create({
          data: {
            claimId: id,
            channel: dto.channel,
            direction: dto.direction,
            summary: dto.summary.trim(),
            occurredAt: new Date(dto.occurredAt),
            recordedByUserId: actorUserId,
          },
        });
        const changed = await tx.commerceSupplierClaim.updateMany({
          where: {
            id,
            businessId,
            status: claim.status,
            version: claim.version,
          },
          data: { version: { increment: 1 } },
        });
        if (!changed.count) this.versionConflict();
        await tx.commerceSupplierClaimAudit.create({
          data: {
            businessId,
            claimId: id,
            action: 'communication_recorded',
            actorUserId,
            before: { version: claim.version },
            after: {
              communicationId: row.id,
              channel: row.channel,
              direction: row.direction,
              version: claim.version + 1,
            },
          },
        });
        return row;
      },
    );
    return communication;
  }

  async recordSettlement(
    businessId: string,
    actorUserId: string,
    id: string,
    dto: RecordCommerceSupplierClaimSettlementDto,
  ) {
    const current = await this.findOne(businessId, id);
    this.assertVersion(current, dto.expectedVersion);
    if (
      current.status !== CommerceSupplierClaimStatus.submitted &&
      current.status !== CommerceSupplierClaimStatus.acknowledged &&
      current.status !== CommerceSupplierClaimStatus.partially_settled
    ) {
      this.invalidState(
        'A supplier recovery can only be recorded for an active claim.',
      );
    }
    if (dto.currency !== current.currency) {
      throw this.error(
        ERROR.CURRENCY_MISMATCH,
        `Settlement currency must match the claim currency (${current.currency}).`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const requested = claimAmount(current);
    const previousSettlements = settlementAmount(current);
    const amount = decimal(dto.amount);
    if (amount.plus(previousSettlements).greaterThan(requested)) {
      throw this.error(
        ERROR.SETTLEMENT_EXCEEDS_CLAIM,
        'Recorded recoveries cannot exceed the loss amount requested in this claim.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const nextTotal = previousSettlements.plus(amount);
    const nextStatus = nextTotal.equals(requested)
      ? CommerceSupplierClaimStatus.settled
      : CommerceSupplierClaimStatus.partially_settled;

    await this.tenantPrisma.client.$transaction(async (tx) => {
      const changed = await tx.commerceSupplierClaim.updateMany({
        where: {
          id,
          businessId,
          status: current.status,
          version: current.version,
        },
        data: {
          status: nextStatus,
          version: { increment: 1 },
          resolvedAt:
            nextStatus === CommerceSupplierClaimStatus.settled
              ? new Date()
              : null,
        },
      });
      if (!changed.count) this.versionConflict();
      const settlement = await tx.commerceSupplierClaimSettlement.create({
        data: {
          claimId: id,
          settlementType: dto.settlementType,
          amount,
          currency: dto.currency,
          financialReference: dto.financialReference?.trim() || null,
          note: dto.note?.trim() || null,
          recordedByUserId: actorUserId,
          settledAt: dto.settledAt ? new Date(dto.settledAt) : new Date(),
        },
      });
      await tx.commerceSupplierClaimAudit.create({
        data: {
          businessId,
          claimId: id,
          action: 'settlement_recorded',
          actorUserId,
          before: { status: current.status, version: current.version },
          after: {
            settlementId: settlement.id,
            settlementType: settlement.settlementType,
            amount: amount.toFixed(2),
            currency: settlement.currency,
            totalRecovered: nextTotal.toFixed(2),
            status: nextStatus,
            version: current.version + 1,
          },
        },
      });
    });
    if (nextStatus === CommerceSupplierClaimStatus.settled) {
      await this.activity.record(businessId, {
        type: ActivityEventType.commerce_supplier_claim_settled,
        description: 'Supplier claim fully recovered',
        amount: amount.toNumber(),
        entityType: 'CommerceSupplierClaim',
        entityId: id,
        actorUserId,
      });
    }
    return this.getOne(businessId, id);
  }

  async lossPatterns(businessId: string) {
    const rows =
      await this.tenantPrisma.client.commerceSupplierClaimItem.findMany({
        where: {
          claim: {
            businessId,
            status: { not: CommerceSupplierClaimStatus.draft },
          },
        },
        include: {
          product: { select: { id: true, name: true, sku: true } },
          claim: {
            select: {
              id: true,
              status: true,
              supplier: { select: { id: true, name: true } },
            },
          },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
    const byKey = new Map<
      string,
      {
        supplier: { id: string; name: string };
        product: { id: string; name: string; sku: string | null } | null;
        claims: Set<string>;
        quantityAffected: number;
        lossAmount: Prisma.Decimal;
      }
    >();
    for (const row of rows) {
      const key = `${row.claim.supplier.id}:${row.product?.id ?? 'unspecified'}`;
      const current = byKey.get(key) ?? {
        supplier: row.claim.supplier,
        product: row.product,
        claims: new Set<string>(),
        quantityAffected: 0,
        lossAmount: new Prisma.Decimal(0),
      };
      current.claims.add(row.claim.id);
      current.quantityAffected += row.quantityAffected;
      current.lossAmount = current.lossAmount
        .plus(row.productLossAmount)
        .plus(row.freightLossAmount)
        .plus(row.otherLossAmount);
      byKey.set(key, current);
    }
    return [...byKey.values()]
      .map((pattern) => ({
        supplier: pattern.supplier,
        product: pattern.product,
        claimCount: pattern.claims.size,
        quantityAffected: pattern.quantityAffected,
        claimedLossAmount: pattern.lossAmount.toNumber(),
      }))
      .sort((a, b) => b.claimedLossAmount - a.claimedLossAmount);
  }

  private async transition(
    businessId: string,
    actorUserId: string,
    id: string,
    current: ClaimRecord,
    dto: CommerceSupplierClaimActionDto,
    next: {
      status: CommerceSupplierClaimStatus;
      action: string;
      submittedAt?: Date;
      acknowledgedAt?: Date;
      resolvedAt?: Date;
    },
  ) {
    await this.tenantPrisma.client.$transaction(async (tx) => {
      const changed = await tx.commerceSupplierClaim.updateMany({
        where: {
          id,
          businessId,
          status: current.status,
          version: current.version,
        },
        data: {
          status: next.status,
          version: { increment: 1 },
          submittedAt: next.submittedAt,
          acknowledgedAt: next.acknowledgedAt,
          resolvedAt: next.resolvedAt,
        },
      });
      if (!changed.count) this.versionConflict();
      await tx.commerceSupplierClaimAudit.create({
        data: {
          businessId,
          claimId: id,
          action: next.action,
          reason: dto.reason.trim(),
          actorUserId,
          before: this.snapshot(current),
          after: { status: next.status, version: current.version + 1 },
        },
      });
    });
    return this.getOne(businessId, id);
  }

  private async findOne(businessId: string, id: string): Promise<ClaimRecord> {
    const claim =
      await this.tenantPrisma.client.commerceSupplierClaim.findFirst({
        where: { id, businessId },
        include: CLAIM_INCLUDE,
      });
    if (!claim) {
      throw this.error(
        ERROR.NOT_FOUND,
        'Supplier claim was not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    return claim;
  }

  private async serialize(claim: ClaimRecord) {
    const evidence = await Promise.all(
      claim.evidence.map(async (item) => ({
        id: item.id,
        evidenceType: item.evidenceType,
        note: item.note,
        sha256: item.sha256,
        addedByUserId: item.addedByUserId,
        createdAt: item.createdAt,
        downloadUrl: await this.storage.getSignedDownloadUrl(item.fileKey),
      })),
    );
    const requested = claimAmount(claim);
    const recovered = settlementAmount(claim);
    return {
      ...claim,
      items: claim.items.map((item) => ({
        ...item,
        productLossAmount: Number(item.productLossAmount),
        freightLossAmount: Number(item.freightLossAmount),
        otherLossAmount: Number(item.otherLossAmount),
        lineLossAmount: item.productLossAmount
          .plus(item.freightLossAmount)
          .plus(item.otherLossAmount)
          .toNumber(),
        purchaseOrderItem: item.purchaseOrderItem
          ? {
              ...item.purchaseOrderItem,
              unitCost: Number(item.purchaseOrderItem.unitCost),
            }
          : null,
      })),
      evidence,
      settlements: claim.settlements.map((item) => ({
        ...item,
        amount: Number(item.amount),
      })),
      requestedAmount: requested.toNumber(),
      recoveredAmount: recovered.toNumber(),
      outstandingAmount: requested.minus(recovered).toNumber(),
    };
  }

  private snapshot(claim: ClaimRecord) {
    return {
      supplierId: claim.supplierId,
      purchaseOrderId: claim.purchaseOrderId,
      reasonCode: claim.reasonCode,
      currency: claim.currency,
      status: claim.status,
      version: claim.version,
      requestedAmount: claimAmount(claim).toFixed(2),
      recoveredAmount: settlementAmount(claim).toFixed(2),
    };
  }

  private assertVersion(claim: ClaimRecord, expected: number) {
    if (claim.version !== expected) this.versionConflict();
  }

  private versionConflict(): never {
    throw this.error(
      ERROR.VERSION_CONFLICT,
      'This supplier claim changed since you opened it. Refresh before continuing.',
      HttpStatus.CONFLICT,
    );
  }

  private invalidState(message: string): never {
    throw this.error(ERROR.INVALID_STATE, message, HttpStatus.CONFLICT);
  }

  private error(code: string, message: string, status: HttpStatus) {
    return new AppException(code, message, status);
  }
}
