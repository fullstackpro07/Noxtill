import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SendGateService } from '../messaging/send-gate.service';
import { WorkflowTriggerService } from '../marketing/automations/workflow-trigger.service';
import { LOW_STOCK_SCAN_QUEUE } from './low-stock-scan.constants';
import { ActivityEventType, Role } from '@prisma/client';

interface LowStockProductRow {
  id: string;
  name: string;
  stock_qty: number;
  low_stock_threshold: number;
}

const ALERT_TEMPLATE_KEY = 'owner_alert';

/**
 * Hourly low-stock scan (BE-039, spec §6 jobs list): sends the owner a
 * single owner_alert per business per day the first time a scan finds
 * low-stock items — never more than once daily, so an hourly tick can't
 * spam the owner. Nightly Close (BE-022) already queries low stock directly
 * for its own summary, independent of this job.
 */
@Processor(LOW_STOCK_SCAN_QUEUE)
export class LowStockScanProcessor extends WorkerHost {
  private readonly logger = new Logger(LowStockScanProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sendGate: SendGateService,
    private readonly workflowTrigger: WorkflowTriggerService,
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
          `Low-stock scan failed for business ${business.id}: ${error.message}`,
        ),
      );
    }
  }

  private async scanBusiness(businessId: string): Promise<void> {
    const lowStockProducts = await this.prisma.$queryRaw<LowStockProductRow[]>`
      SELECT id, name, stock_qty, low_stock_threshold FROM products
      WHERE business_id = ${businessId} AND active = true AND stock_qty <= low_stock_threshold
    `;
    if (lowStockProducts.length === 0) return;

    if (await this.alreadyAlertedToday(businessId)) return;

    const owner = await this.prisma.businessUser.findFirst({
      where: { businessId, role: Role.owner },
      include: { user: true },
    });
    if (!owner) return;

    const itemList = lowStockProducts
      .slice(0, 3)
      .map((p) => `${p.name} (${p.stock_qty} left)`)
      .join(', ');
    const more =
      lowStockProducts.length > 3
        ? ` and ${lowStockProducts.length - 3} more`
        : '';

    // This send itself creates the Message row that alreadyAlertedToday checks for on the next tick.
    await this.sendGate.send({
      businessId,
      templateKey: ALERT_TEMPLATE_KEY,
      to: {
        phone: owner.user.phone ?? undefined,
        email: owner.user.email ?? undefined,
      },
      variables: {
        alertTitle: 'Low stock alert',
        alertBody: `${lowStockProducts.length} item(s) running low: ${itemList}${more}.`,
      },
    });

    // Automations engine (UPD-BE-028) low_stock trigger — this is a background job with no
    // CLS-bound tenant context, so it writes the ActivityEvent directly (not via ActivityService)
    // and dispatches fire-and-forget, same pattern as CreditOverdueScanProcessor.
    const description = `${lowStockProducts.length} item(s) running low: ${itemList}${more}.`;
    const event = await this.prisma.activityEvent.create({
      data: {
        businessId,
        type: ActivityEventType.low_stock,
        description,
      },
    });
    void this.workflowTrigger
      .dispatch(businessId, event.type, { description })
      .catch((error: Error) =>
        this.logger.warn(
          `Workflow dispatch failed for low_stock event ${event.id}: ${error.message}`,
        ),
      );
  }

  private async alreadyAlertedToday(businessId: string): Promise<boolean> {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);

    const count = await this.prisma.message.count({
      where: {
        businessId,
        templateKey: ALERT_TEMPLATE_KEY,
        createdAt: { gte: startOfDay },
      },
    });
    return count > 0;
  }
}
