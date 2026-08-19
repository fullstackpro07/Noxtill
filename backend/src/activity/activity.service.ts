import { Injectable, Logger } from '@nestjs/common';
import { Observable, concat, map } from 'rxjs';
import type { MessageEvent } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { ActivityPubSubService } from './activity-pubsub.service';
import { WorkflowTriggerService } from '../marketing/automations/workflow-trigger.service';
import { OutboundWebhookDispatchService } from '../integrations/automation/outbound-webhook-dispatch.service';
import {
  activityChannel,
  ACTIVITY_HISTORY_BACKFILL,
} from './activity.constants';
import { ActivityEventType } from '@prisma/client';

export interface RecordActivityEventInput {
  type: ActivityEventType;
  description: string;
  amount?: number;
  entityType?: string;
  entityId?: string;
  actorUserId?: string;
}

interface ActivityEventPayload {
  id: string;
  type: ActivityEventType;
  description: string;
  amount: number | null;
  entityType: string | null;
  entityId: string | null;
  actorUserId: string | null;
  createdAt: string;
}

/**
 * Live Activity feed (UPD-BE-002): every real mutation point (sale/booking/review/payment/
 * complaint/stock) calls `record()`, which always persists the event (the source of truth for
 * later consumers like the Automations engine, UPD-BE-028) and best-effort broadcasts it to any
 * connected `GET /activity/stream` clients for that business.
 */
@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly pubsub: ActivityPubSubService,
    private readonly workflowTrigger?: WorkflowTriggerService,
    private readonly outboundWebhookDispatch?: OutboundWebhookDispatchService,
  ) {}

  /**
   * Never throws — a failure to log or broadcast an activity event must never break the real
   * mutation (sale, booking, payment, ...) that already succeeded by the time this is called.
   */
  async record(
    businessId: string,
    input: RecordActivityEventInput,
  ): Promise<void> {
    try {
      const event = await this.tenantPrisma.client.activityEvent.create({
        data: { businessId, ...input },
      });
      await this.pubsub.publish(
        activityChannel(businessId),
        this.toPayload(event),
      );

      // Automations engine (UPD-BE-028): deliberately fire-and-forget, never awaited — a
      // workflow's actions go through SendGateService, which can itself hang on an unreachable
      // message queue, and that must never block the real mutation that already succeeded.
      void this.workflowTrigger
        ?.dispatch(businessId, input.type, {
          description: input.description,
          entityType: input.entityType,
          entityId: input.entityId,
          amount: input.amount,
        })
        .catch((error: Error) =>
          this.logger.warn(
            `Workflow dispatch failed for activity event (${input.type}) on business ${businessId}: ${error.message}`,
          ),
        );

      // Automation Platforms (UPD-BE-074): same fire-and-forget reasoning — an unreachable
      // Zapier/Make/n8n target must never block the real mutation that already succeeded.
      void this.outboundWebhookDispatch
        ?.dispatch(businessId, input.type, {
          description: input.description,
          entityType: input.entityType,
          entityId: input.entityId,
          amount: input.amount,
        })
        .catch((error: Error) =>
          this.logger.warn(
            `Outbound webhook dispatch failed for activity event (${input.type}) on business ${businessId}: ${error.message}`,
          ),
        );
    } catch (error) {
      this.logger.warn(
        `Failed to record activity event (${input.type}) for business ${businessId}: ${(error as Error).message}`,
      );
    }
  }

  async getRecentHistory(
    businessId: string,
    limit = ACTIVITY_HISTORY_BACKFILL,
  ) {
    const events = await this.tenantPrisma.client.activityEvent.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return events.reverse().map((event) => this.toPayload(event));
  }

  /** Recent history first (oldest to newest), then live-tails new events as they're recorded. */
  stream(businessId: string): Observable<MessageEvent> {
    const history$ = new Observable<ActivityEventPayload>((subscriber) => {
      this.getRecentHistory(businessId)
        .then((events) => {
          for (const event of events) subscriber.next(event);
          subscriber.complete();
        })
        .catch((error: Error) => subscriber.error(error));
    });

    const live$ = this.pubsub.subscribe<ActivityEventPayload>(
      activityChannel(businessId),
    );

    return concat(history$, live$).pipe(
      map((event) => ({ data: event, type: event.type })),
    );
  }

  private toPayload(event: {
    id: string;
    type: ActivityEventType;
    description: string;
    amount: unknown;
    entityType: string | null;
    entityId: string | null;
    actorUserId: string | null;
    createdAt: Date;
  }): ActivityEventPayload {
    return {
      id: event.id,
      type: event.type,
      description: event.description,
      amount: event.amount === null ? null : Number(event.amount),
      entityType: event.entityType,
      entityId: event.entityId,
      actorUserId: event.actorUserId,
      createdAt: event.createdAt.toISOString(),
    };
  }
}
