import { ClsService } from 'nestjs-cls';
import {
  ActivityEventType,
  CommerceSupplierClaimCommunicationChannel,
  CommerceSupplierClaimCommunicationDirection,
  CommerceSupplierClaimEvidenceType,
  CommerceSupplierClaimSettlementType,
  CommerceSupplierClaimStatus,
  PurchaseOrderStatus,
} from '@prisma/client';
import { ActivityService } from '../activity/activity.service';
import type { ActivityPubSubService } from '../activity/activity-pubsub.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import type { S3Service } from '../common/storage/s3.service';
import { CommerceSupplierClaimsService } from './commerce-supplier-claims.service';

class FakeClsService {
  private store: Record<string, unknown> = {};

  get<T>(key: string): T {
    return this.store[key] as T;
  }

  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('CommerceSupplierClaimsService (MySQL)', () => {
  let prisma: PrismaService;
  let service: CommerceSupplierClaimsService;
  let businessId: string;
  let foreignBusinessId: string;
  let supplierId: string;
  let foreignSupplierId: string;
  let productId: string;
  let productSku: string;
  let purchaseOrderId: string;
  let purchaseOrderItemId: string;
  let cls: FakeClsService;
  let upload: jest.MockedFunction<S3Service['upload']>;
  let deleteObject: jest.MockedFunction<S3Service['delete']>;
  let getSignedDownloadUrl: jest.MockedFunction<
    S3Service['getSignedDownloadUrl']
  >;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    cls = new FakeClsService();
    upload = jest.fn().mockResolvedValue(undefined);
    deleteObject = jest.fn().mockResolvedValue(undefined);
    getSignedDownloadUrl = jest
      .fn()
      .mockImplementation((key: string) =>
        Promise.resolve(`https://files.test/${encodeURIComponent(key)}`),
      );
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    const activity = new ActivityService(tenantPrisma, {
      publish: jest.fn().mockResolvedValue(undefined),
    } as unknown as ActivityPubSubService);
    service = new CommerceSupplierClaimsService(
      tenantPrisma,
      {
        upload,
        delete: deleteObject,
        getSignedDownloadUrl,
      } as unknown as S3Service,
      activity,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Supplier Claim Test',
        slug: `supplier-claim-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const foreignBusiness = await prisma.business.create({
      data: { name: 'Foreign Claim Test', slug: `foreign-claim-${Date.now()}` },
    });
    foreignBusinessId = foreignBusiness.id;
    const supplier = await prisma.supplier.create({
      data: { businessId, name: 'Claim Test Supplier' },
    });
    supplierId = supplier.id;
    const foreignSupplier = await prisma.supplier.create({
      data: { businessId: foreignBusinessId, name: 'Foreign Claim Supplier' },
    });
    foreignSupplierId = foreignSupplier.id;
    productSku = `claim-${Date.now()}`;
    const product = await prisma.product.create({
      data: {
        businessId,
        name: 'Claim test product',
        sku: productSku,
        stockQty: 13,
        costPrice: 80,
      },
    });
    productId = product.id;
    const order = await prisma.purchaseOrder.create({
      data: { businessId, supplierId, status: PurchaseOrderStatus.received },
    });
    purchaseOrderId = order.id;
    const item = await prisma.purchaseOrderItem.create({
      data: {
        purchaseOrderId,
        productId,
        qtyOrdered: 4,
        qtyReceived: 4,
        unitCost: 20,
      },
    });
    purchaseOrderItemId = item.id;
  });

  afterEach(async () => {
    await prisma.commerceSupplierClaim.deleteMany({ where: { businessId } });
    await prisma.activityEvent.deleteMany({ where: { businessId } });
    upload.mockClear();
    deleteObject.mockClear();
    getSignedDownloadUrl.mockClear();
  });

  afterAll(async () => {
    await prisma.purchaseOrderItem.deleteMany({ where: { purchaseOrderId } });
    await prisma.purchaseOrder.deleteMany({ where: { businessId } });
    await prisma.supplier.deleteMany({ where: { businessId } });
    await prisma.supplier.deleteMany({
      where: { businessId: foreignBusinessId },
    });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: foreignBusinessId } });
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  function createClaim() {
    return service.create(businessId, 'claim-operator', {
      supplierId,
      purchaseOrderId,
      reference: 'supplier-case-44',
      reasonCode: 'damaged_goods',
      reason:
        'Four units arrived damaged; losses entered from the receiving inspection.',
      currency: 'USD',
      items: [
        {
          purchaseOrderItemId,
          description: 'Damaged units from received purchase order',
          quantityAffected: 4,
          productLossAmount: 80,
          freightLossAmount: 20,
          otherLossAmount: 0,
        },
      ],
    });
  }

  async function addPdfEvidence(claimId: string) {
    return service.uploadEvidence(
      businessId,
      'claim-operator',
      claimId,
      {
        evidenceType: CommerceSupplierClaimEvidenceType.inspection_report,
        note: 'Receiving inspection signed by staff',
      },
      {
        fieldname: 'file',
        originalname: 'inspection.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        size: 23,
        buffer: Buffer.from('%PDF-1.7 test evidence'),
      } as Express.Multer.File,
    );
  }

  it('stores a tenant-scoped claim against canonical supplier, purchase-order line and product records', async () => {
    const beforeStock = (
      await prisma.product.findUniqueOrThrow({ where: { id: productId } })
    ).stockQty;
    const claim = await createClaim();

    expect(claim).toMatchObject({
      supplier: { id: supplierId, name: 'Claim Test Supplier' },
      purchaseOrder: {
        id: purchaseOrderId,
        status: PurchaseOrderStatus.received,
      },
      status: CommerceSupplierClaimStatus.draft,
      currency: 'USD',
      requestedAmount: 100,
      recoveredAmount: 0,
      outstandingAmount: 100,
      items: [
        {
          product: { id: productId, name: 'Claim test product' },
          purchaseOrderItem: { id: purchaseOrderItemId, qtyReceived: 4 },
          lineLossAmount: 100,
        },
      ],
    });
    expect(await service.history(businessId, claim.id)).toHaveLength(1);
    expect(await prisma.return.count({ where: { businessId } })).toBe(0);
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id: productId } }))
        .stockQty,
    ).toBe(beforeStock);
    cls.set(CLS_KEY_BUSINESS_ID, foreignBusinessId);
    await expect(
      service.getOne(foreignBusinessId, claim.id),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_SUPPLIER_CLAIM_NOT_FOUND' },
    });
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  it('rejects suppliers from another business and purchase-order lines outside the selected order', async () => {
    await expect(
      service.create(businessId, 'claim-operator', {
        supplierId: foreignSupplierId,
        reasonCode: 'damaged_goods',
        reason: 'Supplier does not belong to this business.',
        currency: 'USD',
        items: [
          { description: 'Loss', quantityAffected: 1, productLossAmount: 1 },
        ],
      }),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_SUPPLIER_CLAIM_SUPPLIER_NOT_FOUND' },
    });

    await expect(
      service.create(businessId, 'claim-operator', {
        supplierId,
        purchaseOrderId,
        reasonCode: 'damaged_goods',
        reason: 'Line does not match the order.',
        currency: 'USD',
        items: [
          {
            productId,
            purchaseOrderItemId: 'not-a-line-on-this-order',
            description: 'Unlinked line',
            quantityAffected: 1,
            productLossAmount: 5,
          },
        ],
      }),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_SUPPLIER_CLAIM_PURCHASE_ORDER_INVALID' },
    });
    expect(
      await prisma.commerceSupplierClaim.count({ where: { businessId } }),
    ).toBe(0);
  });

  it('uploads append-only evidence, requires it before submission and audits the lifecycle', async () => {
    const claim = await createClaim();
    await expect(
      service.submit(businessId, 'claim-operator', claim.id, {
        expectedVersion: 1,
        reason: 'Send the claim to the supplier',
      }),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_SUPPLIER_CLAIM_INVALID_STATE' },
    });

    const evidence = await addPdfEvidence(claim.id);
    expect(evidence).toMatchObject({
      evidenceType: CommerceSupplierClaimEvidenceType.inspection_report,
      claimVersion: 2,
    });
    expect((evidence.sha256 as string).match(/^[a-f0-9]{64}$/)).not.toBeNull();
    expect(evidence.downloadUrl.startsWith('https://files.test/')).toBe(true);
    expect(evidence).not.toHaveProperty('fileKey');
    expect(upload).toHaveBeenCalledWith(
      expect.stringMatching(
        new RegExp(`^commerce-claims/${businessId}/${claim.id}/`),
      ),
      expect.any(Buffer),
      'application/pdf',
    );

    const submitted = await service.submit(
      businessId,
      'claim-operator',
      claim.id,
      {
        expectedVersion: evidence.claimVersion,
        reason: 'Inspection evidence confirms the reported loss',
      },
    );
    expect(submitted).toMatchObject({
      status: CommerceSupplierClaimStatus.submitted,
      version: 3,
    });
    const acknowledged = await service.acknowledge(
      businessId,
      'claim-operator',
      claim.id,
      {
        expectedVersion: submitted.version,
        reason: 'Supplier confirmed receipt of the case',
      },
    );
    expect(acknowledged.status).toBe(CommerceSupplierClaimStatus.acknowledged);

    const history = await service.history(businessId, claim.id);
    expect(history.map((entry) => entry.action)).toEqual([
      'created',
      'evidence_added',
      'submitted',
      'acknowledged',
    ]);
    await expect(
      service.uploadEvidence(
        businessId,
        'claim-operator',
        claim.id,
        { evidenceType: CommerceSupplierClaimEvidenceType.other },
        {
          fieldname: 'file',
          originalname: 'later.pdf',
          encoding: '7bit',
          mimetype: 'application/pdf',
          size: 23,
          buffer: Buffer.from('%PDF-1.7 later'),
        } as Express.Multer.File,
      ),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_SUPPLIER_CLAIM_INVALID_STATE' },
    });
  });

  it('emits real activity events for claim creation and full supplier recovery', async () => {
    let claim = await createClaim();
    await addPdfEvidence(claim.id);
    claim = await service.submit(businessId, 'claim-operator', claim.id, {
      expectedVersion: claim.version + 1,
      reason: 'Inspection evidence is attached and ready to submit.',
    });
    await service.recordSettlement(businessId, 'claim-operator', claim.id, {
      expectedVersion: claim.version,
      settlementType: CommerceSupplierClaimSettlementType.refund,
      amount: 100,
      currency: 'USD',
      financialReference: 'supplier-refund-100',
    });

    const events = await prisma.activityEvent.findMany({
      where: { businessId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { type: true, entityType: true, entityId: true, amount: true },
    });
    expect(events).toHaveLength(2);
    expect(events.map((event) => event.type)).toEqual([
      ActivityEventType.commerce_supplier_claim_created,
      ActivityEventType.commerce_supplier_claim_settled,
    ]);
    expect(
      events.every((event) => event.entityType === 'CommerceSupplierClaim'),
    ).toBe(true);
    expect(events.every((event) => event.entityId === claim.id)).toBe(true);
    expect(events.map((event) => Number(event.amount))).toEqual([100, 100]);
  });

  it('records partial and full supplier settlements without changing customer returns or product stock', async () => {
    const originalStock = (
      await prisma.product.findUniqueOrThrow({ where: { id: productId } })
    ).stockQty;
    const claim = await createClaim();
    const evidence = await addPdfEvidence(claim.id);
    const submitted = await service.submit(
      businessId,
      'claim-operator',
      claim.id,
      {
        expectedVersion: evidence.claimVersion,
        reason: 'Submit claim with signed inspection evidence',
      },
    );
    const acknowledged = await service.acknowledge(
      businessId,
      'claim-operator',
      claim.id,
      {
        expectedVersion: submitted.version,
        reason: 'Supplier acknowledged the claim',
      },
    );

    const partial = await service.recordSettlement(
      businessId,
      'claim-operator',
      claim.id,
      {
        expectedVersion: acknowledged.version,
        settlementType: CommerceSupplierClaimSettlementType.credit,
        amount: 60,
        currency: 'USD',
        financialReference: 'supplier-credit-note-18',
      },
    );
    expect(partial).toMatchObject({
      status: CommerceSupplierClaimStatus.partially_settled,
      requestedAmount: 100,
      recoveredAmount: 60,
      outstandingAmount: 40,
    });

    await expect(
      service.recordSettlement(businessId, 'claim-operator', claim.id, {
        expectedVersion: partial.version,
        settlementType: CommerceSupplierClaimSettlementType.refund,
        amount: 41,
        currency: 'USD',
      }),
    ).rejects.toMatchObject({
      response: { code: 'COMMERCE_SUPPLIER_CLAIM_SETTLEMENT_EXCEEDS_CLAIM' },
    });

    const settled = await service.recordSettlement(
      businessId,
      'claim-operator',
      claim.id,
      {
        expectedVersion: partial.version,
        settlementType: CommerceSupplierClaimSettlementType.refund,
        amount: 40,
        currency: 'USD',
      },
    );
    expect(settled).toMatchObject({
      status: CommerceSupplierClaimStatus.settled,
      recoveredAmount: 100,
      outstandingAmount: 0,
    });
    expect(
      await prisma.commerceSupplierClaimSettlement.count({
        where: { claimId: claim.id },
      }),
    ).toBe(2);
    expect(await prisma.return.count({ where: { businessId } })).toBe(0);
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id: productId } }))
        .stockQty,
    ).toBe(originalStock);
  });

  it('logs manually recorded supplier communication and derives loss patterns from submitted claim rows', async () => {
    const claim = await createClaim();
    const evidence = await addPdfEvidence(claim.id);
    await service.submit(businessId, 'claim-operator', claim.id, {
      expectedVersion: evidence.claimVersion,
      reason: 'Submit supported claim',
    });
    const communication = await service.recordCommunication(
      businessId,
      'claim-operator',
      claim.id,
      {
        channel: CommerceSupplierClaimCommunicationChannel.email,
        direction: CommerceSupplierClaimCommunicationDirection.outbound,
        summary: 'Operator emailed the supplier using the company mailbox.',
        occurredAt: new Date().toISOString(),
      },
    );
    expect(communication).toMatchObject({
      channel: CommerceSupplierClaimCommunicationChannel.email,
      direction: CommerceSupplierClaimCommunicationDirection.outbound,
      providerMessageId: null,
      providerState: null,
    });
    expect(await service.lossPatterns(businessId)).toEqual([
      {
        supplier: { id: supplierId, name: 'Claim Test Supplier' },
        product: {
          id: productId,
          name: 'Claim test product',
          sku: productSku,
        },
        claimCount: 1,
        quantityAffected: 4,
        claimedLossAmount: 100,
      },
    ]);
  });
});
