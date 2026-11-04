import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { resolvePolicies } from '../common/policies/policies.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { resolveSpecialistAgentEventAttempt } from '../common/agents/specialist-agent-event-retry.util';
import { createSpecialistAgentTriggerRef } from '../common/agents/specialist-agent-run-options';
import {
  COMMERCE_EXPERIMENT_DECISION_EVENT_JOB,
  COMMERCE_DELIVERY_FAILED_EVENT_JOB,
  COMMERCE_RECONCILIATION_EVENT_JOB,
  COMMERCE_RFQ_QUOTE_EVENT_JOB,
  COMMERCE_VALIDATION_EVENT_JOB,
  SPECIALIST_AGENT_COMMERCE_EVENTS_QUEUE,
} from '../common/agents/specialist-agent-events.constants';
import { CommerceSpecialistAgentService } from './commerce-specialist-agent.service';
import { SpecialistAgentPolicyService } from '../common/agents/specialist-agent-policy.service';

type CommerceValidationEvent = {
  businessId: string;
  activityEventId: string;
};

@Processor(SPECIALIST_AGENT_COMMERCE_EVENTS_QUEUE)
@Injectable()
export class CommerceAgentEventProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
    private readonly agent: CommerceSpecialistAgentService,
    private readonly agentPolicy: SpecialistAgentPolicyService,
  ) {
    super();
  }

  async process(job: Job<unknown>): Promise<void> {
    const attemptsMade = job.attemptsMade ?? 0;
    if (job.name === COMMERCE_EXPERIMENT_DECISION_EVENT_JOB) {
      return this.processExperimentDecision(job.data, attemptsMade);
    }
    if (job.name === COMMERCE_RECONCILIATION_EVENT_JOB) {
      return this.processReconciliation(job.data, attemptsMade);
    }
    if (job.name === COMMERCE_RFQ_QUOTE_EVENT_JOB) {
      return this.processRecordedQuote(job.data, attemptsMade);
    }
    if (job.name === COMMERCE_DELIVERY_FAILED_EVENT_JOB) {
      return this.processFailedDelivery(job.data, attemptsMade);
    }
    if (job.name !== COMMERCE_VALIDATION_EVENT_JOB) return;
    const event = this.parseEvent(job.data);
    const business = await this.prisma.business.findUnique({
      where: { id: event.businessId },
      select: { id: true, policies: true },
    });
    if (!business) return;
    if (
      !(await this.agentPolicy.isModuleEnabledForBusiness(
        event.businessId,
        'commerce',
      ))
    ) {
      return;
    }

    const policies = resolvePolicies(business);
    if (
      !policies.bool('agents.commerceEnabled') ||
      !policies.bool('agents.commerceValidationEventReviewEnabled') ||
      (policies.num('commerce.autonomyLevel') ?? 0) <= 0
    ) {
      return;
    }

    const activityEvent = await this.prisma.activityEvent.findFirst({
      where: {
        id: event.activityEventId,
        businessId: event.businessId,
        type: 'commerce_validation',
        entityType: { in: ['ProductValidationRun', 'Product'] },
        entityId: { not: null },
      },
      select: { id: true, entityType: true, entityId: true, createdAt: true },
    });
    if (!activityEvent?.entityId || !activityEvent.entityType) return;
    const sourceEntityType = activityEvent.entityType;
    const sourceEntityId = activityEvent.entityId;

    const entity =
      sourceEntityType === 'ProductValidationRun'
        ? await this.prisma.productValidationRun.findFirst({
            where: {
              id: sourceEntityId,
              businessId: event.businessId,
            },
            select: { id: true, createdAt: true },
          })
        : await this.prisma.product.findFirst({
            where: {
              id: sourceEntityId,
              businessId: event.businessId,
            },
            select: { id: true, updatedAt: true },
          });
    if (!entity) return;

    const eventId = `commerce-validation:${activityEvent.id}`;
    const attempt = await resolveSpecialistAgentEventAttempt(this.prisma, {
      businessId: event.businessId,
      agentKey: 'autonomous_commerce',
      baseIdempotencyKey: `${eventId}:${event.businessId}`,
      attemptsMade,
    });
    if (!attempt.shouldRun) return;

    await this.cls.run(async () => {
      this.cls.set(CLS_KEY_BUSINESS_ID, event.businessId);
      await this.agent.run(event.businessId, null, attempt.idempotencyKey, {
        triggerType: 'event',
        includeAiSummary: false,
        triggerRef: createSpecialistAgentTriggerRef({
          eventId,
          sourceModule: 'autonomous_commerce',
          entityType: sourceEntityType,
          entityId: sourceEntityId,
          occurredAt: activityEvent.createdAt,
          entityVersion:
            'updatedAt' in entity
              ? entity.updatedAt.toISOString()
              : entity.createdAt.toISOString(),
        }),
      });
    });
  }

  private async processExperimentDecision(
    value: unknown,
    attemptsMade: number,
  ): Promise<void> {
    const event = this.parseExperimentDecision(value);
    const business = await this.prisma.business.findUnique({
      where: { id: event.businessId },
      select: { id: true, policies: true },
    });
    if (!business) return;
    if (
      !(await this.agentPolicy.isModuleEnabledForBusiness(
        event.businessId,
        'commerce',
      ))
    ) {
      return;
    }
    const policies = resolvePolicies(business);
    if (
      !policies.bool('agents.commerceEnabled') ||
      !policies.bool('agents.commerceExperimentDecisionEventReviewEnabled') ||
      (policies.num('commerce.autonomyLevel') ?? 0) <= 0
    ) {
      return;
    }

    const decisionUpdatedAt = new Date(event.decisionUpdatedAt);
    if (Number.isNaN(decisionUpdatedAt.getTime())) return;
    const experiment = await this.prisma.commerceExperiment.findFirst({
      where: {
        id: event.experimentId,
        businessId: event.businessId,
        status: { in: ['adopted', 'reverted', 'inconclusive'] },
        updatedAt: decisionUpdatedAt,
      },
      select: { id: true, status: true, updatedAt: true, decidedAt: true },
    });
    if (!experiment) return;

    const eventId = `commerce-experiment-decision:${experiment.id}:${experiment.updatedAt.toISOString()}`;
    const attempt = await resolveSpecialistAgentEventAttempt(this.prisma, {
      businessId: event.businessId,
      agentKey: 'autonomous_commerce',
      baseIdempotencyKey: `${eventId}:${event.businessId}`,
      attemptsMade,
    });
    if (!attempt.shouldRun) return;

    await this.cls.run(async () => {
      this.cls.set(CLS_KEY_BUSINESS_ID, event.businessId);
      await this.agent.run(event.businessId, null, attempt.idempotencyKey, {
        triggerType: 'event',
        includeAiSummary: false,
        triggerRef: createSpecialistAgentTriggerRef({
          eventId,
          sourceModule: 'autonomous_commerce',
          entityType: 'CommerceExperiment',
          entityId: experiment.id,
          occurredAt: experiment.decidedAt ?? experiment.updatedAt,
          entityVersion: `${experiment.status}:${experiment.updatedAt.toISOString()}`,
        }),
      });
    });
  }

  private async processReconciliation(
    value: unknown,
    attemptsMade: number,
  ): Promise<void> {
    const event = this.parseReconciliationEvent(value);
    const business = await this.prisma.business.findUnique({
      where: { id: event.businessId },
      select: { id: true, policies: true },
    });
    if (!business) return;
    if (
      !(await this.agentPolicy.isModuleEnabledForBusiness(
        event.businessId,
        'commerce',
      ))
    ) {
      return;
    }
    const policies = resolvePolicies(business);
    if (
      !policies.bool('agents.commerceEnabled') ||
      !policies.bool('agents.commerceReconciliationEventReviewEnabled') ||
      (policies.num('commerce.autonomyLevel') ?? 0) <= 0
    ) {
      return;
    }

    const finishedAt = new Date(event.finishedAt);
    if (Number.isNaN(finishedAt.getTime())) return;
    const run = await this.prisma.commerceReconciliationRun.findFirst({
      where: {
        id: event.reconciliationRunId,
        businessId: event.businessId,
        status: 'completed',
        discrepancies: { gt: 0 },
        finishedAt,
      },
      select: {
        id: true,
        provider: true,
        listingsChecked: true,
        discrepancies: true,
        finishedAt: true,
      },
    });
    if (!run?.finishedAt) return;

    const eventId = `commerce-reconciliation:${run.id}`;
    const attempt = await resolveSpecialistAgentEventAttempt(this.prisma, {
      businessId: event.businessId,
      agentKey: 'autonomous_commerce',
      baseIdempotencyKey: `${eventId}:${event.businessId}`,
      attemptsMade,
    });
    if (!attempt.shouldRun) return;

    await this.cls.run(async () => {
      this.cls.set(CLS_KEY_BUSINESS_ID, event.businessId);
      await this.agent.run(event.businessId, null, attempt.idempotencyKey, {
        triggerType: 'event',
        includeAiSummary: false,
        triggerRef: createSpecialistAgentTriggerRef({
          eventId,
          sourceModule: 'autonomous_commerce',
          entityType: 'CommerceReconciliationRun',
          entityId: run.id,
          occurredAt: run.finishedAt!,
          entityVersion: `${run.provider}:${run.listingsChecked}:${run.discrepancies}`,
        }),
      });
    });
  }

  private async processRecordedQuote(
    value: unknown,
    attemptsMade: number,
  ): Promise<void> {
    const event = this.parseQuoteEvent(value);
    const business = await this.prisma.business.findUnique({
      where: { id: event.businessId },
      select: { id: true, policies: true },
    });
    if (!business) return;
    if (
      !(await this.agentPolicy.isModuleEnabledForBusiness(
        event.businessId,
        'commerce',
      ))
    ) {
      return;
    }
    const policies = resolvePolicies(business);
    if (
      !policies.bool('agents.commerceEnabled') ||
      !policies.bool('agents.commerceRfqQuoteEventReviewEnabled') ||
      (policies.num('commerce.autonomyLevel') ?? 0) <= 0
    ) {
      return;
    }

    const quote = await this.prisma.commerceSupplierQuote.findFirst({
      where: {
        id: event.quoteId,
        businessId: event.businessId,
        status: { in: ['submitted', 'shortlisted'] },
      },
      select: { id: true, rfqId: true, version: true, updatedAt: true },
    });
    if (!quote) return;
    const rfq = await this.prisma.commerceRfq.findFirst({
      where: {
        id: quote.rfqId,
        businessId: event.businessId,
        status: 'open',
      },
      select: { id: true },
    });
    if (!rfq) return;

    const eventId = `commerce-rfq-quote:${quote.id}`;
    const attempt = await resolveSpecialistAgentEventAttempt(this.prisma, {
      businessId: event.businessId,
      agentKey: 'autonomous_commerce',
      baseIdempotencyKey: `${eventId}:${event.businessId}`,
      attemptsMade,
    });
    if (!attempt.shouldRun) return;

    await this.cls.run(async () => {
      this.cls.set(CLS_KEY_BUSINESS_ID, event.businessId);
      await this.agent.run(event.businessId, null, attempt.idempotencyKey, {
        triggerType: 'event',
        includeAiSummary: false,
        triggerRef: createSpecialistAgentTriggerRef({
          eventId,
          sourceModule: 'commerce_rfq',
          entityType: 'CommerceSupplierQuote',
          entityId: quote.id,
          occurredAt: quote.updatedAt,
          entityVersion: quote.version,
        }),
      });
    });
  }

  private async processFailedDelivery(
    value: unknown,
    attemptsMade: number,
  ): Promise<void> {
    const event = this.parseDeliveryFailure(value);
    const business = await this.prisma.business.findUnique({
      where: { id: event.businessId },
      select: { id: true, policies: true },
    });
    if (!business) return;
    if (
      !(await this.agentPolicy.isModuleEnabledForBusiness(
        event.businessId,
        'commerce',
      ))
    ) {
      return;
    }
    const policies = resolvePolicies(business);
    if (
      !policies.bool('agents.commerceEnabled') ||
      !policies.bool('agents.commerceDeliveryFailedEventReviewEnabled') ||
      (policies.num('commerce.autonomyLevel') ?? 0) <= 0
    ) {
      return;
    }

    const failedAt = new Date(event.failedAt);
    if (Number.isNaN(failedAt.getTime())) return;
    const delivery = await this.prisma.delivery.findFirst({
      where: {
        id: event.deliveryId,
        businessId: event.businessId,
        status: 'failed',
        updatedAt: failedAt,
      },
      select: { id: true, updatedAt: true },
    });
    if (!delivery) return;

    const eventId = `delivery-failed:${delivery.id}:${delivery.updatedAt.toISOString()}`;
    const attempt = await resolveSpecialistAgentEventAttempt(this.prisma, {
      businessId: event.businessId,
      agentKey: 'autonomous_commerce',
      baseIdempotencyKey: `${eventId}:${event.businessId}`,
      attemptsMade,
    });
    if (!attempt.shouldRun) return;

    await this.cls.run(async () => {
      this.cls.set(CLS_KEY_BUSINESS_ID, event.businessId);
      await this.agent.run(event.businessId, null, attempt.idempotencyKey, {
        triggerType: 'event',
        includeAiSummary: false,
        triggerRef: createSpecialistAgentTriggerRef({
          eventId,
          sourceModule: 'delivery',
          entityType: 'Delivery',
          entityId: delivery.id,
          occurredAt: delivery.updatedAt,
          entityVersion: delivery.updatedAt.toISOString(),
        }),
      });
    });
  }

  private parseEvent(value: unknown): CommerceValidationEvent {
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
      throw new Error('Invalid Commerce validation specialist event payload');
    }
    return {
      businessId: value.businessId,
      activityEventId: value.activityEventId,
    };
  }

  private parseDeliveryFailure(value: unknown): {
    businessId: string;
    deliveryId: string;
    failedAt: string;
  } {
    if (
      typeof value !== 'object' ||
      value === null ||
      !('businessId' in value) ||
      !('deliveryId' in value) ||
      !('failedAt' in value) ||
      typeof value.businessId !== 'string' ||
      !value.businessId.trim() ||
      typeof value.deliveryId !== 'string' ||
      !value.deliveryId.trim() ||
      typeof value.failedAt !== 'string' ||
      !value.failedAt.trim()
    ) {
      throw new Error('Invalid Commerce delivery failure event payload');
    }
    return {
      businessId: value.businessId,
      deliveryId: value.deliveryId,
      failedAt: value.failedAt,
    };
  }

  private parseQuoteEvent(value: unknown): {
    businessId: string;
    quoteId: string;
  } {
    if (
      typeof value !== 'object' ||
      value === null ||
      !('businessId' in value) ||
      !('quoteId' in value) ||
      typeof value.businessId !== 'string' ||
      !value.businessId.trim() ||
      typeof value.quoteId !== 'string' ||
      !value.quoteId.trim()
    ) {
      throw new Error('Invalid Commerce RFQ quote specialist event payload');
    }
    return { businessId: value.businessId, quoteId: value.quoteId };
  }

  private parseExperimentDecision(value: unknown): {
    businessId: string;
    experimentId: string;
    decisionUpdatedAt: string;
  } {
    if (
      typeof value !== 'object' ||
      value === null ||
      !('businessId' in value) ||
      !('experimentId' in value) ||
      !('decisionUpdatedAt' in value) ||
      typeof value.businessId !== 'string' ||
      !value.businessId.trim() ||
      typeof value.experimentId !== 'string' ||
      !value.experimentId.trim() ||
      typeof value.decisionUpdatedAt !== 'string' ||
      !value.decisionUpdatedAt.trim()
    ) {
      throw new Error('Invalid Commerce experiment decision event payload');
    }
    return {
      businessId: value.businessId,
      experimentId: value.experimentId,
      decisionUpdatedAt: value.decisionUpdatedAt,
    };
  }

  private parseReconciliationEvent(value: unknown): {
    businessId: string;
    reconciliationRunId: string;
    finishedAt: string;
  } {
    if (
      typeof value !== 'object' ||
      value === null ||
      !('businessId' in value) ||
      !('reconciliationRunId' in value) ||
      !('finishedAt' in value) ||
      typeof value.businessId !== 'string' ||
      !value.businessId.trim() ||
      typeof value.reconciliationRunId !== 'string' ||
      !value.reconciliationRunId.trim() ||
      typeof value.finishedAt !== 'string' ||
      !value.finishedAt.trim()
    ) {
      throw new Error('Invalid Commerce reconciliation event payload');
    }
    return {
      businessId: value.businessId,
      reconciliationRunId: value.reconciliationRunId,
      finishedAt: value.finishedAt,
    };
  }
}
