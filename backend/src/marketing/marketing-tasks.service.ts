import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';

export type MarketingTaskKind = 'automation_failing' | 'offer_expiring' | 'quota_low';

export interface MarketingTask {
  kind: MarketingTaskKind;
  key: string;
  title: string;
  why: string;
  priority: 'Urgent' | 'High' | 'Normal';
  source: string;
  /** Real id of the thing this task is about, so the client can link straight to it. */
  entityId: string;
  /** Real deadline when one genuinely exists (an offer's `expiresAt`) — null for ongoing issues
   * (a failing automation, a quota approaching its cap) that have no real due date. */
  dueDate: string | null;
}

const EXPIRY_WINDOW_DAYS = 7;
const QUOTA_WARNING_PERCENT = 90;

/**
 * Marketing Tasks (Marketing module v2) — every row here is derived live from something that
 * already exists and already matters; there is no separate "task" table to fall out of sync with
 * the real record. A task disappears on its own once the real thing it points at is fixed
 * (automation stops failing, offer is deactivated/renewed, quota resets) — there is nothing to
 * "complete" beyond acting on the real thing, so this never invents a persisted-dismissal concept.
 */
@Injectable()
export class MarketingTasksService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async list(businessId: string): Promise<MarketingTask[]> {
    const [failingAutomations, expiringCoupons, expiringVouchers, business] =
      await Promise.all([
        this.findFailingAutomations(),
        this.findExpiringCoupons(),
        this.findExpiringVouchers(),
        this.tenantPrisma.client.business.findUniqueOrThrow({
          where: { id: businessId },
          select: { msgQuota: true, msgUsed: true },
        }),
      ]);

    const tasks: MarketingTask[] = [
      ...failingAutomations,
      ...expiringCoupons,
      ...expiringVouchers,
    ];

    if (business.msgQuota > 0) {
      const percentUsed = (business.msgUsed / business.msgQuota) * 100;
      if (percentUsed >= QUOTA_WARNING_PERCENT) {
        tasks.push({
          kind: 'quota_low',
          key: 'quota_low',
          title: 'Your monthly message quota is almost used up',
          why: `${business.msgUsed} of ${business.msgQuota} messages used this month — new campaigns may be blocked once it runs out.`,
          priority: percentUsed >= 100 ? 'Urgent' : 'High',
          source: 'Settings',
          entityId: businessId,
          dueDate: null,
        });
      }
    }

    return tasks;
  }

  private async findFailingAutomations(): Promise<MarketingTask[]> {
    const activeWorkflows = await this.tenantPrisma.client.workflow.findMany({
      where: { active: true },
      select: { id: true, name: true },
    });
    if (activeWorkflows.length === 0) return [];

    const tasks: MarketingTask[] = [];
    for (const workflow of activeWorkflows) {
      const lastRun = await this.tenantPrisma.client.workflowRun.findFirst({
        where: { workflowId: workflow.id },
        orderBy: { createdAt: 'desc' },
      });
      if (lastRun?.status === 'failed') {
        tasks.push({
          kind: 'automation_failing',
          key: `automation:${workflow.id}`,
          title: `Fix the "${workflow.name}" automation`,
          why: lastRun.error
            ? `Its last run failed: ${lastRun.error}`
            : 'Its most recent run failed.',
          priority: 'High',
          source: 'Automations',
          entityId: workflow.id,
          dueDate: null,
        });
      }
    }
    return tasks;
  }

  private async findExpiringCoupons(): Promise<MarketingTask[]> {
    const soon = new Date(Date.now() + EXPIRY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const coupons = await this.tenantPrisma.client.coupon.findMany({
      where: { active: true, expiresAt: { not: null, lte: soon, gt: new Date() } },
    });
    return coupons.map((c) => ({
      kind: 'offer_expiring' as const,
      key: `coupon:${c.id}`,
      title: `Coupon "${c.code}" expires soon`,
      why: `Expires ${c.expiresAt!.toDateString()} — used ${c.usedCount}${c.usageLimit ? ` of ${c.usageLimit}` : ''} time(s).`,
      priority: 'Normal' as const,
      source: 'Offers & Promotions',
      entityId: c.id,
      dueDate: c.expiresAt!.toISOString(),
    }));
  }

  private async findExpiringVouchers(): Promise<MarketingTask[]> {
    const soon = new Date(Date.now() + EXPIRY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const vouchers = await this.tenantPrisma.client.voucher.findMany({
      where: {
        status: 'active',
        expiresAt: { not: null, lte: soon, gt: new Date() },
      },
    });
    return vouchers.map((v) => ({
      kind: 'offer_expiring' as const,
      key: `voucher:${v.id}`,
      title: `Voucher "${v.code}" expires soon`,
      why: `Expires ${v.expiresAt!.toDateString()} — Rs. ${Number(v.balance).toLocaleString('en-US')} balance still outstanding.`,
      priority: 'Normal' as const,
      source: 'Offers & Promotions',
      entityId: v.id,
      dueDate: v.expiresAt!.toISOString(),
    }));
  }
}
