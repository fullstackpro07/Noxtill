import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { WorkflowTriggerService } from '../workflow-trigger.service';
import { OutboundWebhookDispatchService } from '../../../integrations/automation/outbound-webhook-dispatch.service';
import { CREDIT_OVERDUE_SCAN_QUEUE } from '../workflows.constants';
import { ActivityEventType, InstallmentStatus } from '@prisma/client';

/**
 * Hourly overdue-installment scan — the real detector behind the `credit_overdue` automation
 * trigger (UPD-BE-028). Runs in the background with no CLS-bound tenant context, so — like
 * `LowStockScanProcessor` — it writes `ActivityEvent` rows directly via the raw `PrismaService`
 * rather than through `ActivityService`, and calls `WorkflowTriggerService.dispatch()` directly
 * (fire-and-forget) since there's no request-scoped `ActivityService.record()` call site for
 * this trigger to piggyback on.
 */
@Processor(CREDIT_OVERDUE_SCAN_QUEUE)
export class CreditOverdueScanProcessor extends WorkerHost {
  private readonly logger = new Logger(CreditOverdueScanProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workflowTrigger: WorkflowTriggerService,
    private readonly outboundWebhookDispatch: OutboundWebhookDispatchService,
  ) {
    super();
  }

  async process(): Promise<void> {
    const businesses = await this.prisma.business.findMany({
      select: { id: true },
    });

    for (const business of businesses) {
      await this.scanBusiness(business.id).catch((error: Error) =>
        this.logger.error(
          `Credit-overdue scan failed for business ${business.id}: ${error.message}`,
        ),
      );
    }
  }

  private async scanBusiness(businessId: string): Promise<void> {
    const now = new Date();
    const overdueInstallments = await this.prisma.installment.findMany({
      where: {
        businessId,
        status: InstallmentStatus.pending,
        dueDate: { lt: now },
      },
    });

    for (const installment of overdueInstallments) {
      if (await this.alreadyFlaggedToday(businessId, installment.id)) continue;

      const event = await this.prisma.activityEvent.create({
        data: {
          businessId,
          type: ActivityEventType.credit_overdue,
          description: `Installment #${installment.seq} overdue (${Number(installment.amount)})`,
          amount: installment.amount,
          entityType: 'Installment',
          entityId: installment.id,
        },
      });

      void this.workflowTrigger
        .dispatch(businessId, event.type, {
          description: event.description,
          entityType: event.entityType,
          entityId: event.entityId,
          amount: event.amount ? Number(event.amount) : undefined,
        })
        .catch((error: Error) =>
          this.logger.warn(
            `Workflow dispatch failed for credit_overdue event ${event.id}: ${error.message}`,
          ),
        );
      void this.outboundWebhookDispatch
        .dispatch(businessId, event.type, {
          description: event.description,
          entityType: event.entityType,
          entityId: event.entityId,
          amount: event.amount ? Number(event.amount) : undefined,
        })
        .catch((error: Error) =>
          this.logger.warn(
            `Outbound webhook dispatch failed for credit_overdue event ${event.id}: ${error.message}`,
          ),
        );
    }
  }

  private async alreadyFlaggedToday(
    businessId: string,
    installmentId: string,
  ): Promise<boolean> {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    const count = await this.prisma.activityEvent.count({
      where: {
        businessId,
        type: ActivityEventType.credit_overdue,
        entityId: installmentId,
        createdAt: { gte: startOfDay },
      },
    });
    return count > 0;
  }
}
