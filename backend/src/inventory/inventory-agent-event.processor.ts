import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { resolvePolicies } from '../common/policies/policies.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { createSpecialistAgentTriggerRef } from '../common/agents/specialist-agent-run-options';
import { resolveSpecialistAgentEventAttempt } from '../common/agents/specialist-agent-event-retry.util';
import {
  INVENTORY_LOW_STOCK_EVENT_JOB,
  INVENTORY_PURCHASE_ORDER_RECEIVED_EVENT_JOB,
  INVENTORY_PURCHASE_MOVEMENT_RECORDED_EVENT_JOB,
  INVENTORY_STOCK_COUNT_APPLIED_EVENT_JOB,
  INVENTORY_STOCK_TRANSFER_RECEIVED_EVENT_JOB,
  INVENTORY_WASTAGE_RECORDED_EVENT_JOB,
  SPECIALIST_AGENT_INVENTORY_EVENTS_QUEUE,
} from '../common/agents/specialist-agent-events.constants';
import { InventoryIntelligenceService } from './inventory-intelligence.service';
import { SpecialistAgentPolicyService } from '../common/agents/specialist-agent-policy.service';

type InventoryLowStockEvent = {
  businessId: string;
  activityEventId: string;
};

type InventoryStockCountEvent = {
  businessId: string;
  stockCountId: string;
  appliedAt: string;
};

type InventoryPurchaseOrderReceivedEvent = {
  businessId: string;
  purchaseOrderId: string;
  receivedAt: string;
};

type InventoryStockTransferReceivedEvent = {
  transferId: string;
  sourceBusinessId: string;
  destBusinessId: string;
  receivedAt: string;
};

type InventoryWastageRecordedEvent = {
  businessId: string;
  stockMovementId: string;
  occurredAt: string;
};

type InventoryPurchaseMovementRecordedEvent = {
  businessId: string;
  stockMovementId: string;
  occurredAt: string;
};

@Processor(SPECIALIST_AGENT_INVENTORY_EVENTS_QUEUE)
@Injectable()
export class InventoryAgentEventProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly agent: InventoryIntelligenceService,
    private readonly agentPolicy: SpecialistAgentPolicyService,
  ) {
    super();
  }

  async process(job: Job<unknown>): Promise<void> {
    const attemptsMade = job.attemptsMade ?? 0;
    if (job.name === INVENTORY_LOW_STOCK_EVENT_JOB) {
      await this.processLowStockEvent(
        this.parseLowStockEvent(job.data),
        attemptsMade,
      );
    } else if (job.name === INVENTORY_STOCK_COUNT_APPLIED_EVENT_JOB) {
      await this.processStockCountEvent(
        this.parseStockCountEvent(job.data),
        attemptsMade,
      );
    } else if (job.name === INVENTORY_PURCHASE_ORDER_RECEIVED_EVENT_JOB) {
      await this.processPurchaseOrderReceivedEvent(
        this.parsePurchaseOrderReceivedEvent(job.data),
        attemptsMade,
      );
    } else if (job.name === INVENTORY_STOCK_TRANSFER_RECEIVED_EVENT_JOB) {
      await this.processStockTransferReceivedEvent(
        this.parseStockTransferReceivedEvent(job.data),
        attemptsMade,
      );
    } else if (job.name === INVENTORY_WASTAGE_RECORDED_EVENT_JOB) {
      await this.processWastageRecordedEvent(
        this.parseWastageRecordedEvent(job.data),
        attemptsMade,
      );
    } else if (job.name === INVENTORY_PURCHASE_MOVEMENT_RECORDED_EVENT_JOB) {
      await this.processPurchaseMovementRecordedEvent(
        this.parsePurchaseMovementRecordedEvent(job.data),
        attemptsMade,
      );
    }
  }

  private async processPurchaseMovementRecordedEvent(
    event: InventoryPurchaseMovementRecordedEvent,
    attemptsMade: number,
  ): Promise<void> {
    const business = await this.prisma.business.findUnique({
      where: { id: event.businessId },
      select: { id: true, active: true, policies: true },
    });
    if (!business?.active) return;
    if (
      !(await this.agentPolicy.isModuleEnabled(event.businessId, 'inventory'))
    ) {
      return;
    }

    const policies = resolvePolicies(business);
    if (
      !policies.bool('agents.inventoryEnabled') ||
      !policies.bool('agents.inventoryPurchaseMovementEventReviewEnabled')
    ) {
      return;
    }

    const movement = await this.prisma.stockMovement.findFirst({
      where: {
        id: event.stockMovementId,
        businessId: event.businessId,
        kind: 'purchase',
        createdAt: new Date(event.occurredAt),
      },
      select: { id: true, createdAt: true },
    });
    if (!movement) return;

    await this.runOnceForEvent(
      event.businessId,
      `inventory-purchase-movement:${movement.id}`,
      'StockMovement',
      movement.id,
      movement.createdAt,
      movement.createdAt.toISOString(),
      attemptsMade,
    );
  }

  private async processLowStockEvent(
    event: InventoryLowStockEvent,
    attemptsMade: number,
  ): Promise<void> {
    const business = await this.prisma.business.findUnique({
      where: { id: event.businessId },
      select: { id: true, policies: true },
    });
    if (!business) return;
    if (
      !(await this.agentPolicy.isModuleEnabled(event.businessId, 'inventory'))
    ) {
      return;
    }

    const policies = resolvePolicies(business);
    if (
      !policies.bool('agents.inventoryEnabled') ||
      !policies.bool('agents.inventoryLowStockEventReviewEnabled')
    ) {
      return;
    }

    const activityEvent = await this.prisma.activityEvent.findFirst({
      where: {
        id: event.activityEventId,
        businessId: event.businessId,
        type: 'low_stock',
      },
      select: { id: true, createdAt: true },
    });
    if (!activityEvent) return;

    await this.runOnceForEvent(
      event.businessId,
      `inventory-low-stock:${activityEvent.id}`,
      'ActivityEvent',
      activityEvent.id,
      activityEvent.createdAt,
      activityEvent.createdAt.toISOString(),
      attemptsMade,
    );
  }

  private async processStockCountEvent(
    event: InventoryStockCountEvent,
    attemptsMade: number,
  ): Promise<void> {
    const business = await this.prisma.business.findUnique({
      where: { id: event.businessId },
      select: { id: true, policies: true },
    });
    if (!business) return;
    if (
      !(await this.agentPolicy.isModuleEnabled(event.businessId, 'inventory'))
    ) {
      return;
    }

    const policies = resolvePolicies(business);
    if (
      !policies.bool('agents.inventoryEnabled') ||
      !policies.bool('agents.inventoryStockCountEventReviewEnabled')
    ) {
      return;
    }

    const stockCount = await this.prisma.stockCount.findFirst({
      where: {
        id: event.stockCountId,
        businessId: event.businessId,
        status: 'applied',
      },
      select: { id: true, appliedAt: true, updatedAt: true },
    });
    const eventAppliedAt = new Date(event.appliedAt);
    if (
      !stockCount?.appliedAt ||
      stockCount.appliedAt.getTime() !== eventAppliedAt.getTime()
    ) {
      return;
    }

    await this.runOnceForEvent(
      event.businessId,
      `inventory-stock-count-applied:${stockCount.id}:${eventAppliedAt.getTime()}`,
      'StockCount',
      stockCount.id,
      eventAppliedAt,
      stockCount.updatedAt.toISOString(),
      attemptsMade,
    );
  }

  private async processPurchaseOrderReceivedEvent(
    event: InventoryPurchaseOrderReceivedEvent,
    attemptsMade: number,
  ): Promise<void> {
    const business = await this.prisma.business.findUnique({
      where: { id: event.businessId },
      select: { id: true, policies: true },
    });
    if (!business) return;
    if (
      !(await this.agentPolicy.isModuleEnabled(event.businessId, 'inventory'))
    ) {
      return;
    }

    const policies = resolvePolicies(business);
    if (
      !policies.bool('agents.inventoryEnabled') ||
      !policies.bool('agents.inventoryPurchaseOrderReceivedEventReviewEnabled')
    ) {
      return;
    }

    const receivedAt = new Date(event.receivedAt);
    const purchaseOrder = await this.prisma.purchaseOrder.findFirst({
      where: {
        id: event.purchaseOrderId,
        businessId: event.businessId,
        status: 'received',
        receivedAt,
      },
      select: { id: true, updatedAt: true },
    });
    if (!purchaseOrder) return;

    const eventId = `inventory-purchase-order-received:${purchaseOrder.id}:${receivedAt.getTime()}`;
    await this.runOnceForEvent(
      event.businessId,
      eventId,
      'PurchaseOrder',
      purchaseOrder.id,
      receivedAt,
      purchaseOrder.updatedAt.toISOString(),
      attemptsMade,
    );
  }

  private async processStockTransferReceivedEvent(
    event: InventoryStockTransferReceivedEvent,
    attemptsMade: number,
  ): Promise<void> {
    const receivedAt = new Date(event.receivedAt);
    const transfer = await this.prisma.stockTransfer.findUnique({
      where: { id: event.transferId },
      select: {
        id: true,
        sourceBusinessId: true,
        destBusinessId: true,
        status: true,
        updatedAt: true,
      },
    });
    if (
      !transfer ||
      transfer.status !== 'received' ||
      transfer.sourceBusinessId !== event.sourceBusinessId ||
      transfer.destBusinessId !== event.destBusinessId ||
      transfer.updatedAt.getTime() !== receivedAt.getTime()
    ) {
      return;
    }

    const eventId = `inventory-stock-transfer-received:${transfer.id}:${receivedAt.getTime()}`;
    for (const businessId of new Set([
      transfer.sourceBusinessId,
      transfer.destBusinessId,
    ])) {
      const business = await this.prisma.business.findUnique({
        where: { id: businessId },
        select: { id: true, policies: true },
      });
      if (
        !business ||
        !(await this.agentPolicy.isModuleEnabled(businessId, 'inventory'))
      ) {
        continue;
      }

      const policies = resolvePolicies(business);
      if (
        !policies.bool('agents.inventoryEnabled') ||
        !policies.bool(
          'agents.inventoryStockTransferReceivedEventReviewEnabled',
        )
      ) {
        continue;
      }

      await this.runOnceForEvent(
        businessId,
        eventId,
        'StockTransfer',
        transfer.id,
        receivedAt,
        transfer.updatedAt.toISOString(),
        attemptsMade,
      );
    }
  }

  private async processWastageRecordedEvent(
    event: InventoryWastageRecordedEvent,
    attemptsMade: number,
  ): Promise<void> {
    const business = await this.prisma.business.findUnique({
      where: { id: event.businessId },
      select: { id: true, policies: true },
    });
    if (!business) return;
    if (
      !(await this.agentPolicy.isModuleEnabled(event.businessId, 'inventory'))
    ) {
      return;
    }

    const policies = resolvePolicies(business);
    if (
      !policies.bool('agents.inventoryEnabled') ||
      !policies.bool('agents.inventoryWastageEventReviewEnabled')
    ) {
      return;
    }

    const occurredAt = new Date(event.occurredAt);
    const movement = await this.prisma.stockMovement.findFirst({
      where: {
        id: event.stockMovementId,
        businessId: event.businessId,
        kind: 'wastage',
        createdAt: occurredAt,
      },
      select: { id: true, createdAt: true },
    });
    if (!movement) return;

    const eventId = `inventory-wastage-recorded:${movement.id}`;
    await this.runOnceForEvent(
      event.businessId,
      eventId,
      'StockMovement',
      movement.id,
      movement.createdAt,
      movement.createdAt.toISOString(),
      attemptsMade,
    );
  }

  private async runOnceForEvent(
    businessId: string,
    eventId: string,
    entityType: string,
    entityId: string,
    occurredAt: Date,
    entityVersion: string,
    attemptsMade = 0,
  ): Promise<void> {
    const baseKey = `${eventId}:${businessId}`;
    const attempt = await resolveSpecialistAgentEventAttempt(this.prisma, {
      businessId,
      agentKey: 'inventory_intelligence',
      baseIdempotencyKey: baseKey,
      attemptsMade,
    });
    if (!attempt.shouldRun) return;

    await this.cls.run(async () => {
      this.cls.set(CLS_KEY_BUSINESS_ID, businessId);
      await this.agent.run(businessId, null, attempt.idempotencyKey, {
        triggerType: 'event',
        includeAiSummary: false,
        triggerRef: createSpecialistAgentTriggerRef({
          eventId,
          sourceModule: 'inventory',
          entityType,
          entityId,
          occurredAt,
          entityVersion,
        }),
      });
    });
  }

  private parseLowStockEvent(value: unknown): InventoryLowStockEvent {
    if (
      typeof value !== 'object' ||
      value === null ||
      !('businessId' in value) ||
      !('activityEventId' in value) ||
      typeof value.businessId !== 'string' ||
      !value.businessId.trim() ||
      typeof value.activityEventId !== 'string' ||
      !value.activityEventId.trim()
    ) {
      throw new Error('Invalid Inventory low-stock specialist event payload');
    }
    return {
      businessId: value.businessId,
      activityEventId: value.activityEventId,
    };
  }

  private parseStockCountEvent(value: unknown): InventoryStockCountEvent {
    if (
      typeof value !== 'object' ||
      value === null ||
      !('businessId' in value) ||
      !('stockCountId' in value) ||
      !('appliedAt' in value) ||
      typeof value.businessId !== 'string' ||
      !value.businessId.trim() ||
      typeof value.stockCountId !== 'string' ||
      !value.stockCountId.trim() ||
      typeof value.appliedAt !== 'string' ||
      !Number.isFinite(new Date(value.appliedAt).getTime())
    ) {
      throw new Error(
        'Invalid Inventory applied-stock-count specialist event payload',
      );
    }
    return {
      businessId: value.businessId,
      stockCountId: value.stockCountId,
      appliedAt: new Date(value.appliedAt).toISOString(),
    };
  }

  private parsePurchaseOrderReceivedEvent(
    value: unknown,
  ): InventoryPurchaseOrderReceivedEvent {
    if (
      typeof value !== 'object' ||
      value === null ||
      !('businessId' in value) ||
      !('purchaseOrderId' in value) ||
      !('receivedAt' in value) ||
      typeof value.businessId !== 'string' ||
      !value.businessId.trim() ||
      typeof value.purchaseOrderId !== 'string' ||
      !value.purchaseOrderId.trim() ||
      typeof value.receivedAt !== 'string' ||
      !Number.isFinite(new Date(value.receivedAt).getTime())
    ) {
      throw new Error(
        'Invalid Inventory fully-received purchase-order specialist event payload',
      );
    }
    return {
      businessId: value.businessId,
      purchaseOrderId: value.purchaseOrderId,
      receivedAt: new Date(value.receivedAt).toISOString(),
    };
  }

  private parseStockTransferReceivedEvent(
    value: unknown,
  ): InventoryStockTransferReceivedEvent {
    if (
      typeof value !== 'object' ||
      value === null ||
      !('transferId' in value) ||
      !('sourceBusinessId' in value) ||
      !('destBusinessId' in value) ||
      !('receivedAt' in value) ||
      typeof value.transferId !== 'string' ||
      !value.transferId.trim() ||
      typeof value.sourceBusinessId !== 'string' ||
      !value.sourceBusinessId.trim() ||
      typeof value.destBusinessId !== 'string' ||
      !value.destBusinessId.trim() ||
      value.sourceBusinessId === value.destBusinessId ||
      typeof value.receivedAt !== 'string' ||
      !Number.isFinite(new Date(value.receivedAt).getTime())
    ) {
      throw new Error(
        'Invalid Inventory received-stock-transfer specialist event payload',
      );
    }
    return {
      transferId: value.transferId,
      sourceBusinessId: value.sourceBusinessId,
      destBusinessId: value.destBusinessId,
      receivedAt: new Date(value.receivedAt).toISOString(),
    };
  }

  private parseWastageRecordedEvent(
    value: unknown,
  ): InventoryWastageRecordedEvent {
    if (
      typeof value !== 'object' ||
      value === null ||
      !('businessId' in value) ||
      !('stockMovementId' in value) ||
      !('occurredAt' in value) ||
      typeof value.businessId !== 'string' ||
      !value.businessId.trim() ||
      typeof value.stockMovementId !== 'string' ||
      !value.stockMovementId.trim() ||
      typeof value.occurredAt !== 'string' ||
      !Number.isFinite(new Date(value.occurredAt).getTime())
    ) {
      throw new Error(
        'Invalid Inventory wastage-recorded specialist event payload',
      );
    }
    return {
      businessId: value.businessId,
      stockMovementId: value.stockMovementId,
      occurredAt: new Date(value.occurredAt).toISOString(),
    };
  }

  private parsePurchaseMovementRecordedEvent(
    value: unknown,
  ): InventoryPurchaseMovementRecordedEvent {
    if (
      typeof value !== 'object' ||
      value === null ||
      !('businessId' in value) ||
      !('stockMovementId' in value) ||
      !('occurredAt' in value) ||
      typeof value.businessId !== 'string' ||
      !value.businessId.trim() ||
      typeof value.stockMovementId !== 'string' ||
      !value.stockMovementId.trim() ||
      typeof value.occurredAt !== 'string' ||
      !Number.isFinite(new Date(value.occurredAt).getTime())
    ) {
      throw new Error(
        'Invalid Inventory purchase-movement specialist event payload',
      );
    }
    return {
      businessId: value.businessId,
      stockMovementId: value.stockMovementId,
      occurredAt: new Date(value.occurredAt).toISOString(),
    };
  }
}
