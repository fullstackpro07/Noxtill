import { ClsService } from 'nestjs-cls';
import { Job } from 'bullmq';
import { SpecialistAgentRun } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { specialistAgentIdempotencyHash } from '../common/agents/specialist-agent-run-idempotency.util';
import type { SpecialistAgentRunOptions } from '../common/agents/specialist-agent-run-options';
import { InventoryIntelligenceService } from './inventory-intelligence.service';
import { InventoryAgentEventProcessor } from './inventory-agent-event.processor';
import { SpecialistAgentPolicyService } from '../common/agents/specialist-agent-policy.service';
import { PurchaseOrderStatus } from '@prisma/client';

class FakeClsService {
  private readonly store: Record<string, unknown> = {};

  get<T>(key: string): T {
    return this.store[key] as T;
  }

  set(key: string, value: unknown) {
    this.store[key] = value;
  }

  run<T>(callback: () => Promise<T>): Promise<T> {
    return callback();
  }
}

describe('InventoryAgentEventProcessor (MySQL)', () => {
  let prisma: PrismaService;
  let processor: InventoryAgentEventProcessor;
  const runAgent = jest.fn<
    Promise<SpecialistAgentRun>,
    [string, string | null, string, SpecialistAgentRunOptions]
  >();
  const cls = new FakeClsService();
  const businessIds: string[] = [];
  const activityEventIds: string[] = [];
  const stockCountIds: string[] = [];
  const supplierIds: string[] = [];
  const purchaseOrderIds: string[] = [];
  let appliedStockCountAt: Date;
  let purchaseOrderReceivedAt: Date;
  let purchaseOrderUpdatedAt: Date;
  let transferBranchId: string;
  let stockTransferId: string;
  let stockTransferUpdatedAt: Date;
  let wastageMovementId: string;
  let wastageMovementCreatedAt: Date;
  let optedOutWastageMovementId: string;
  let optedOutWastageMovementCreatedAt: Date;

  beforeEach(() => runAgent.mockClear());

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const stamp = `${Date.now()}-${process.pid}`;
    const optedIn = await prisma.business.create({
      data: {
        name: 'Inventory Low-Stock Event Opt-In Test',
        slug: `inventory-low-stock-event-enabled-${stamp}`,
        policies: {
          'agents.inventoryEnabled': true,
          'agents.inventoryLowStockEventReviewEnabled': true,
          'agents.inventoryStockCountEventReviewEnabled': true,
          'agents.inventoryPurchaseOrderReceivedEventReviewEnabled': true,
          'agents.inventoryStockTransferReceivedEventReviewEnabled': true,
          'agents.inventoryWastageEventReviewEnabled': true,
        },
      },
    });
    const optedOut = await prisma.business.create({
      data: {
        name: 'Inventory Low-Stock Event Opt-Out Test',
        slug: `inventory-low-stock-event-disabled-${stamp}`,
        policies: {
          'agents.inventoryEnabled': true,
          'agents.inventoryLowStockEventReviewEnabled': false,
          'agents.inventoryWastageEventReviewEnabled': false,
        },
      },
    });
    businessIds.push(optedIn.id, optedOut.id);

    for (const businessId of businessIds) {
      const event = await prisma.activityEvent.create({
        data: {
          businessId,
          type: 'low_stock',
          description: 'QA low-stock event for Inventory specialist review',
        },
      });
      activityEventIds.push(event.id);
    }

    const product = await prisma.product.create({
      data: {
        businessId: businessIds[0],
        name: 'Applied count event fixture',
        stockQty: 2,
      },
    });
    const optedOutProduct = await prisma.product.create({
      data: {
        businessId: optedOut.id,
        name: 'Wastage event opt-out fixture',
        stockQty: 5,
      },
    });
    const wastageMovement = await prisma.stockMovement.create({
      data: {
        businessId: optedIn.id,
        productId: product.id,
        kind: 'wastage',
        qty: -1,
      },
    });
    wastageMovementId = wastageMovement.id;
    wastageMovementCreatedAt = wastageMovement.createdAt;
    const optedOutWastageMovement = await prisma.stockMovement.create({
      data: {
        businessId: optedOut.id,
        productId: optedOutProduct.id,
        kind: 'wastage',
        qty: -1,
      },
    });
    optedOutWastageMovementId = optedOutWastageMovement.id;
    optedOutWastageMovementCreatedAt = optedOutWastageMovement.createdAt;
    const transferBranch = await prisma.business.create({
      data: {
        name: 'Inventory Transfer Event Branch',
        slug: `inventory-transfer-event-branch-${stamp}`,
        parentId: optedIn.id,
      },
    });
    transferBranchId = transferBranch.id;
    const stockTransfer = await prisma.stockTransfer.create({
      data: {
        sourceBusinessId: optedIn.id,
        destBusinessId: transferBranch.id,
        status: 'received',
        items: {
          create: {
            sourceProductId: product.id,
            qty: 4,
            receivedQty: 3,
          },
        },
      },
    });
    stockTransferId = stockTransfer.id;
    stockTransferUpdatedAt = stockTransfer.updatedAt;
    appliedStockCountAt = new Date();
    const stockCount = await prisma.stockCount.create({
      data: {
        businessId: businessIds[0],
        status: 'applied',
        appliedAt: appliedStockCountAt,
        lines: {
          create: {
            productId: product.id,
            expectedQty: 3,
            countedQty: 2,
            variance: -1,
          },
        },
      },
    });
    stockCountIds.push(stockCount.id);

    const supplier = await prisma.supplier.create({
      data: { businessId: optedIn.id, name: 'Received PO event supplier' },
    });
    supplierIds.push(supplier.id);
    purchaseOrderReceivedAt = new Date();
    const purchaseOrder = await prisma.purchaseOrder.create({
      data: {
        businessId: optedIn.id,
        supplierId: supplier.id,
        status: PurchaseOrderStatus.received,
        receivedAt: purchaseOrderReceivedAt,
      },
    });
    purchaseOrderReceivedAt = purchaseOrder.receivedAt!;
    purchaseOrderUpdatedAt = purchaseOrder.updatedAt;
    purchaseOrderIds.push(purchaseOrder.id);

    runAgent.mockImplementation(
      async (
        businessId: string,
        actorUserId: string | null,
        idempotencyKey: string,
        options: SpecialistAgentRunOptions,
      ) => {
        const triggerRef = options.triggerRef;
        if (!triggerRef)
          throw new Error('Expected a low-stock event reference');
        expect(cls.get<string>(CLS_KEY_BUSINESS_ID)).toBe(businessId);
        return prisma.specialistAgentRun.create({
          data: {
            businessId,
            agentKey: 'inventory_intelligence',
            agentVersion: '1.0.0',
            moduleId: '13',
            triggerType: options.triggerType,
            status: 'completed',
            initiatedByUserId: actorUserId,
            idempotencyKeyHash: specialistAgentIdempotencyHash(idempotencyKey),
            idempotencyRequestHash: specialistAgentIdempotencyHash(
              triggerRef.eventId,
            ),
            inputRefs: [triggerRef],
          },
        });
      },
    );

    processor = new InventoryAgentEventProcessor(
      prisma,
      cls as unknown as ClsService,
      { run: runAgent } as unknown as InventoryIntelligenceService,
      new SpecialistAgentPolicyService(prisma, cls as unknown as ClsService),
    );
  });

  afterAll(async () => {
    if (businessIds.length > 0) {
      await prisma.specialistAgentRun.deleteMany({
        where: {
          businessId: {
            in: transferBranchId
              ? [...businessIds, transferBranchId]
              : businessIds,
          },
          agentKey: 'inventory_intelligence',
        },
      });
      if (stockTransferId) {
        await prisma.stockTransferItem.deleteMany({
          where: { transferId: stockTransferId },
        });
        await prisma.stockTransfer.deleteMany({
          where: { id: stockTransferId },
        });
      }
      await prisma.purchaseOrder.deleteMany({
        where: {
          id: { in: purchaseOrderIds },
          businessId: { in: businessIds },
        },
      });
      await prisma.supplier.deleteMany({
        where: { id: { in: supplierIds }, businessId: { in: businessIds } },
      });
      await prisma.activityEvent.deleteMany({
        where: {
          id: { in: activityEventIds },
          businessId: { in: businessIds },
        },
      });
      await prisma.stockCountLine.deleteMany({
        where: { stockCountId: { in: stockCountIds } },
      });
      await prisma.stockCount.deleteMany({
        where: {
          id: { in: stockCountIds },
          businessId: { in: businessIds },
        },
      });
      await prisma.stockMovement.deleteMany({
        where: {
          id: { in: [wastageMovementId, optedOutWastageMovementId] },
          businessId: { in: businessIds },
        },
      });
      await prisma.product.deleteMany({
        where: { businessId: { in: businessIds } },
      });
      if (transferBranchId) {
        await prisma.business.deleteMany({ where: { id: transferBranchId } });
      }
      await prisma.business.deleteMany({
        where: { id: { in: businessIds } },
      });
    }
    await prisma.$disconnect();
  });

  it('runs once for an opted-in low-stock event and records its source', async () => {
    const businessId = businessIds[0];
    const activityEventId = activityEventIds[0];
    if (!businessId || !activityEventId) {
      throw new Error('Expected the opted-in business and event fixtures');
    }
    const job = {
      name: 'inventory-low-stock',
      data: { businessId, activityEventId },
    } as Job<unknown>;

    await processor.process(job);
    await processor.process(job);

    expect(runAgent).toHaveBeenCalledTimes(1);
    const call = runAgent.mock.calls[0];
    if (!call) throw new Error('Expected the Inventory agent to run');
    const [calledBusinessId, actorUserId, idempotencyKey, options] = call;
    expect(calledBusinessId).toBe(businessId);
    expect(actorUserId).toBeNull();
    expect(idempotencyKey).toBe(
      `inventory-low-stock:${activityEventId}:${businessId}`,
    );
    expect(options).toMatchObject({
      triggerType: 'event',
      includeAiSummary: false,
      triggerRef: {
        eventId: `inventory-low-stock:${activityEventId}`,
        sourceModule: 'inventory',
        entityType: 'ActivityEvent',
        entityId: activityEventId,
      },
    });
    const saved = await prisma.specialistAgentRun.findFirstOrThrow({
      where: {
        businessId,
        agentKey: 'inventory_intelligence',
        triggerType: 'event',
        idempotencyKeyHash: specialistAgentIdempotencyHash(idempotencyKey),
      },
    });
    expect(saved.initiatedByUserId).toBeNull();
    expect(saved.inputRefs).toEqual([options.triggerRef]);
  });

  it('retries a failed event review with a new idempotency key and keeps successful retries deduplicated', async () => {
    const businessId = businessIds[0];
    if (!businessId) throw new Error('Expected the opted-in business fixture');
    const event = await prisma.activityEvent.create({
      data: {
        businessId,
        type: 'low_stock',
        description: 'QA low-stock event for retry verification',
      },
    });
    activityEventIds.push(event.id);

    runAgent.mockImplementationOnce(
      async (calledBusinessId, actorUserId, idempotencyKey, options) => {
        const triggerRef = options.triggerRef;
        if (!triggerRef) {
          throw new Error('Expected a low-stock event reference');
        }
        await prisma.specialistAgentRun.create({
          data: {
            businessId: calledBusinessId,
            agentKey: 'inventory_intelligence',
            agentVersion: '1.0.0',
            moduleId: '13',
            triggerType: options.triggerType,
            status: 'failed',
            initiatedByUserId: actorUserId,
            idempotencyKeyHash: specialistAgentIdempotencyHash(idempotencyKey),
            idempotencyRequestHash: specialistAgentIdempotencyHash(
              triggerRef.eventId,
            ),
            inputRefs: [triggerRef],
          },
        });
        throw new Error('Simulated transient review failure');
      },
    );

    const baseKey = `inventory-low-stock:${event.id}:${businessId}`;
    await expect(
      processor.process({
        name: 'inventory-low-stock',
        data: { businessId, activityEventId: event.id },
        attemptsMade: 0,
      } as Job<unknown>),
    ).rejects.toThrow('Simulated transient review failure');

    const retryJob = {
      name: 'inventory-low-stock',
      data: { businessId, activityEventId: event.id },
      attemptsMade: 1,
    } as Job<unknown>;
    await processor.process(retryJob);
    await processor.process(retryJob);

    expect(runAgent).toHaveBeenCalledTimes(2);
    expect(runAgent.mock.calls[0]?.[2]).toBe(baseKey);
    expect(runAgent.mock.calls[1]?.[2]).toBe(`${baseKey}:retry:1`);

    const savedRuns = await prisma.specialistAgentRun.findMany({
      where: {
        businessId,
        agentKey: 'inventory_intelligence',
        triggerType: 'event',
        idempotencyKeyHash: {
          in: [
            specialistAgentIdempotencyHash(baseKey),
            specialistAgentIdempotencyHash(`${baseKey}:retry:1`),
          ],
        },
      },
      select: { idempotencyKeyHash: true, status: true },
    });
    expect(savedRuns).toHaveLength(2);
    expect(savedRuns).toEqual(
      expect.arrayContaining([
        {
          idempotencyKeyHash: specialistAgentIdempotencyHash(baseKey),
          status: 'failed',
        },
        {
          idempotencyKeyHash: specialistAgentIdempotencyHash(
            `${baseKey}:retry:1`,
          ),
          status: 'completed',
        },
      ]),
    );
  });

  it('does not run when opted out or when the event belongs to another tenant', async () => {
    const optedOutBusinessId = businessIds[1];
    const optedOutActivityEventId = activityEventIds[1];
    const enabledBusinessId = businessIds[0];
    const enabledActivityEventId = activityEventIds[0];
    if (
      !optedOutBusinessId ||
      !optedOutActivityEventId ||
      !enabledBusinessId ||
      !enabledActivityEventId
    ) {
      throw new Error('Expected business and activity-event fixtures');
    }

    await processor.process({
      name: 'inventory-low-stock',
      data: {
        businessId: optedOutBusinessId,
        activityEventId: optedOutActivityEventId,
      },
    } as Job<unknown>);
    await processor.process({
      name: 'inventory-low-stock',
      data: {
        businessId: optedOutBusinessId,
        activityEventId: enabledActivityEventId,
      },
    } as Job<unknown>);
    await processor.process({
      name: 'inventory-low-stock',
      data: {
        businessId: enabledBusinessId,
        activityEventId: optedOutActivityEventId,
      },
    } as Job<unknown>);

    expect(runAgent).not.toHaveBeenCalled();
  });

  it('runs once for a still-applied physical stock count and records its source', async () => {
    const businessId = businessIds[0];
    const stockCountId = stockCountIds[0];
    if (!businessId || !stockCountId) {
      throw new Error('Expected the opted-in business and applied stock count');
    }
    const event = {
      businessId,
      stockCountId,
      appliedAt: appliedStockCountAt.toISOString(),
    };
    const job = {
      name: 'inventory-stock-count-applied',
      data: event,
    } as Job<unknown>;

    await processor.process(job);
    await processor.process(job);

    expect(runAgent).toHaveBeenCalledTimes(1);
    const call = runAgent.mock.calls[0];
    if (!call) throw new Error('Expected the Inventory agent to run');
    const [calledBusinessId, actorUserId, idempotencyKey, options] = call;
    const eventId = `inventory-stock-count-applied:${stockCountId}:${appliedStockCountAt.getTime()}`;
    expect(calledBusinessId).toBe(businessId);
    expect(actorUserId).toBeNull();
    expect(idempotencyKey).toBe(`${eventId}:${businessId}`);
    expect(options).toMatchObject({
      triggerType: 'event',
      includeAiSummary: false,
      triggerRef: {
        eventId,
        sourceModule: 'inventory',
        entityType: 'StockCount',
        entityId: stockCountId,
      },
    });
  });

  it('ignores stock-count events when disabled, stale, or from another business', async () => {
    const businessId = businessIds[0];
    const optedOutBusinessId = businessIds[1];
    const stockCountId = stockCountIds[0];
    if (!businessId || !optedOutBusinessId || !stockCountId) {
      throw new Error('Expected business and stock-count fixtures');
    }

    await prisma.business.update({
      where: { id: businessId },
      data: {
        policies: {
          'agents.inventoryEnabled': true,
          'agents.inventoryStockCountEventReviewEnabled': false,
        },
      },
    });
    const event = {
      businessId,
      stockCountId,
      appliedAt: appliedStockCountAt.toISOString(),
    };
    await processor.process({
      name: 'inventory-stock-count-applied',
      data: event,
    } as Job<unknown>);

    await prisma.business.update({
      where: { id: businessId },
      data: {
        policies: {
          'agents.inventoryEnabled': true,
          'agents.inventoryStockCountEventReviewEnabled': true,
        },
      },
    });
    await processor.process({
      name: 'inventory-stock-count-applied',
      data: { ...event, appliedAt: new Date().toISOString() },
    } as Job<unknown>);
    await processor.process({
      name: 'inventory-stock-count-applied',
      data: { ...event, businessId: optedOutBusinessId },
    } as Job<unknown>);
    expect(runAgent).not.toHaveBeenCalled();
  });

  it('runs once for a currently fully received purchase order and records its source', async () => {
    const businessId = businessIds[0];
    const purchaseOrderId = purchaseOrderIds[0];
    if (!businessId || !purchaseOrderId) {
      throw new Error(
        'Expected the opted-in business and received purchase order',
      );
    }
    await prisma.business.update({
      where: { id: businessId },
      data: {
        policies: {
          'agents.inventoryEnabled': true,
          'agents.inventoryPurchaseOrderReceivedEventReviewEnabled': true,
        },
      },
    });
    const event = {
      businessId,
      purchaseOrderId,
      receivedAt: purchaseOrderReceivedAt.toISOString(),
    };

    await processor.process({
      name: 'inventory-purchase-order-received',
      data: event,
    } as Job<unknown>);
    await processor.process({
      name: 'inventory-purchase-order-received',
      data: event,
    } as Job<unknown>);

    expect(runAgent).toHaveBeenCalledTimes(1);
    const [calledBusinessId, actorUserId, idempotencyKey, options] =
      runAgent.mock.calls[0];
    const eventId = `inventory-purchase-order-received:${purchaseOrderId}:${purchaseOrderReceivedAt.getTime()}`;
    expect(calledBusinessId).toBe(businessId);
    expect(actorUserId).toBeNull();
    expect(idempotencyKey).toBe(`${eventId}:${businessId}`);
    expect(options).toMatchObject({
      triggerType: 'event',
      includeAiSummary: false,
      triggerRef: {
        eventId,
        sourceModule: 'inventory',
        entityType: 'PurchaseOrder',
        entityId: purchaseOrderId,
        entityVersion: purchaseOrderUpdatedAt.toISOString(),
      },
    });
  });

  it('ignores receipt events when policy is off, stale, not fully received, or cross-tenant', async () => {
    const businessId = businessIds[0];
    const optedOutBusinessId = businessIds[1];
    const purchaseOrderId = purchaseOrderIds[0];
    if (!businessId || !optedOutBusinessId || !purchaseOrderId) {
      throw new Error(
        'Expected both businesses and the received purchase order',
      );
    }
    const event = {
      businessId,
      purchaseOrderId,
      receivedAt: purchaseOrderReceivedAt.toISOString(),
    };

    await prisma.business.update({
      where: { id: businessId },
      data: {
        policies: {
          'agents.inventoryEnabled': true,
          'agents.inventoryPurchaseOrderReceivedEventReviewEnabled': false,
        },
      },
    });
    await processor.process({
      name: 'inventory-purchase-order-received',
      data: event,
    } as Job<unknown>);

    await prisma.business.update({
      where: { id: businessId },
      data: {
        policies: {
          'agents.inventoryEnabled': true,
          'agents.inventoryPurchaseOrderReceivedEventReviewEnabled': true,
        },
      },
    });
    await processor.process({
      name: 'inventory-purchase-order-received',
      data: {
        ...event,
        receivedAt: new Date(Date.now() + 60_000).toISOString(),
      },
    } as Job<unknown>);
    await processor.process({
      name: 'inventory-purchase-order-received',
      data: { ...event, businessId: optedOutBusinessId },
    } as Job<unknown>);
    await prisma.purchaseOrder.update({
      where: { id: purchaseOrderId },
      data: { status: PurchaseOrderStatus.partially_received },
    });
    await processor.process({
      name: 'inventory-purchase-order-received',
      data: event,
    } as Job<unknown>);

    expect(runAgent).not.toHaveBeenCalled();
  });

  it('reviews a confirmed stock transfer once per opted-in branch and rejects stale or unreceived events', async () => {
    if (!transferBranchId || !stockTransferId) {
      throw new Error(
        'Expected the source, destination branch and transfer fixtures',
      );
    }
    const sourceBusinessId = businessIds[0];
    if (!sourceBusinessId)
      throw new Error('Expected the source branch fixture');

    await prisma.business.update({
      where: { id: sourceBusinessId },
      data: {
        policies: {
          'agents.inventoryEnabled': true,
          'agents.inventoryStockTransferReceivedEventReviewEnabled': true,
        },
      },
    });
    await prisma.business.update({
      where: { id: transferBranchId },
      data: {
        policies: {
          'agents.inventoryEnabled': true,
          'agents.inventoryStockTransferReceivedEventReviewEnabled': false,
        },
      },
    });

    const event = {
      transferId: stockTransferId,
      sourceBusinessId,
      destBusinessId: transferBranchId,
      receivedAt: new Date(
        stockTransferUpdatedAt.getTime() + 60_000,
      ).toISOString(),
    };
    await processor.process({
      name: 'inventory-stock-transfer-received',
      data: event,
    } as Job<unknown>);
    expect(runAgent).not.toHaveBeenCalled();

    await prisma.stockTransfer.update({
      where: { id: stockTransferId },
      data: {
        status: 'shipped',
        updatedAt: new Date(stockTransferUpdatedAt.getTime() + 120_000),
      },
    });
    const shipped = await prisma.stockTransfer.findUniqueOrThrow({
      where: { id: stockTransferId },
      select: { updatedAt: true },
    });
    await processor.process({
      name: 'inventory-stock-transfer-received',
      data: { ...event, receivedAt: shipped.updatedAt.toISOString() },
    } as Job<unknown>);
    expect(runAgent).not.toHaveBeenCalled();

    const receivedAt = new Date(stockTransferUpdatedAt.getTime() + 180_000);
    const received = await prisma.stockTransfer.update({
      where: { id: stockTransferId },
      data: { status: 'received', updatedAt: receivedAt },
      select: { updatedAt: true },
    });
    const currentEvent = {
      ...event,
      receivedAt: received.updatedAt.toISOString(),
    };

    await processor.process({
      name: 'inventory-stock-transfer-received',
      data: currentEvent,
    } as Job<unknown>);
    await processor.process({
      name: 'inventory-stock-transfer-received',
      data: currentEvent,
    } as Job<unknown>);
    expect(runAgent).toHaveBeenCalledTimes(1);
    expect(runAgent.mock.calls[0]?.[0]).toBe(sourceBusinessId);

    await prisma.business.update({
      where: { id: transferBranchId },
      data: {
        policies: {
          'agents.inventoryEnabled': true,
          'agents.inventoryStockTransferReceivedEventReviewEnabled': true,
        },
      },
    });
    await processor.process({
      name: 'inventory-stock-transfer-received',
      data: currentEvent,
    } as Job<unknown>);
    await processor.process({
      name: 'inventory-stock-transfer-received',
      data: currentEvent,
    } as Job<unknown>);

    expect(runAgent).toHaveBeenCalledTimes(2);
    const eventId = `inventory-stock-transfer-received:${stockTransferId}:${received.updatedAt.getTime()}`;
    for (const [
      calledBusinessId,
      actorUserId,
      idempotencyKey,
      options,
    ] of runAgent.mock.calls) {
      expect([sourceBusinessId, transferBranchId]).toContain(calledBusinessId);
      expect(actorUserId).toBeNull();
      expect(idempotencyKey).toBe(`${eventId}:${calledBusinessId}`);
      expect(options).toMatchObject({
        triggerType: 'event',
        includeAiSummary: false,
        triggerRef: {
          eventId,
          sourceModule: 'inventory',
          entityType: 'StockTransfer',
          entityId: stockTransferId,
          entityVersion: received.updatedAt.toISOString(),
        },
      });
    }
  });

  it('reviews confirmed wastage once when opted in and ignores stale or opted-out events', async () => {
    const businessId = businessIds[0];
    const optedOutBusinessId = businessIds[1];
    if (
      !businessId ||
      !optedOutBusinessId ||
      !wastageMovementId ||
      !optedOutWastageMovementId
    ) {
      throw new Error('Expected opted-in and opted-out wastage fixtures');
    }

    await prisma.business.update({
      where: { id: businessId },
      data: {
        policies: {
          'agents.inventoryEnabled': true,
          'agents.inventoryWastageEventReviewEnabled': true,
        },
      },
    });

    const event = {
      businessId,
      stockMovementId: wastageMovementId,
      occurredAt: wastageMovementCreatedAt.toISOString(),
    };
    await processor.process({
      name: 'inventory-wastage-recorded',
      data: {
        ...event,
        occurredAt: new Date(Date.now() + 60_000).toISOString(),
      },
    } as Job<unknown>);
    expect(runAgent).not.toHaveBeenCalled();

    await processor.process({
      name: 'inventory-wastage-recorded',
      data: event,
    } as Job<unknown>);
    await processor.process({
      name: 'inventory-wastage-recorded',
      data: event,
    } as Job<unknown>);
    expect(runAgent).toHaveBeenCalledTimes(1);
    const eventId = `inventory-wastage-recorded:${wastageMovementId}`;
    expect(runAgent.mock.calls[0]).toMatchObject([
      businessId,
      null,
      `${eventId}:${businessId}`,
      {
        triggerType: 'event',
        includeAiSummary: false,
        triggerRef: {
          eventId,
          sourceModule: 'inventory',
          entityType: 'StockMovement',
          entityId: wastageMovementId,
          entityVersion: wastageMovementCreatedAt.toISOString(),
        },
      },
    ]);

    await processor.process({
      name: 'inventory-wastage-recorded',
      data: {
        businessId: optedOutBusinessId,
        stockMovementId: optedOutWastageMovementId,
        occurredAt: optedOutWastageMovementCreatedAt.toISOString(),
      },
    } as Job<unknown>);
    expect(runAgent).toHaveBeenCalledTimes(1);
  });
});
