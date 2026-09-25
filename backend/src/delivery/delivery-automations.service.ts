import { Injectable, Logger } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { ActivityService } from '../activity/activity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DeliverySettingsService } from './delivery-settings.service';
import { DeliveryNotifierService } from './delivery-notifier.service';
import { RidersService } from './riders.service';
import { ACTIVE_DELIVERY_STATUSES } from './delivery.constants';
import { startOfDayInZone } from './delivery-time.util';

export const AUTOMATION_RULES = {
  etaOnAssign: 'eta_on_assign',
  etaOnSlip: 'eta_on_slip',
  flagStalePhone: 'flag_stale_phone',
  warnCashLimit: 'warn_cash_limit',
  taskOnFailure: 'task_on_failure',
  proofToCustomer: 'proof_to_customer',
} as const;

/**
 * The real delivery automation engine. Each rule is off until the owner switches it on in
 * Settings; when on it does exactly one thing (message the customer, or raise an in-app alert for
 * the owner/managers) and writes a `DeliveryAutomationRun` row — that log is what "ran N times"
 * on the Automations screen counts. None of these rules ever assigns a rider, cancels a delivery
 * or moves money.
 *
 * Every method expects an active tenant context (a request, or `cls.run` in the background tick).
 */
@Injectable()
export class DeliveryAutomationsService {
  private readonly logger = new Logger(DeliveryAutomationsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly settings: DeliverySettingsService,
    private readonly notifier: DeliveryNotifierService,
    private readonly riders: RidersService,
    private readonly activity: ActivityService,
    private readonly notifications: NotificationsService,
  ) {}

  private async logRun(
    businessId: string,
    rule: string,
    detail: string,
    ids: { deliveryId?: string; riderId?: string } = {},
  ) {
    await this.tenantPrisma.client.deliveryAutomationRun.create({
      data: { businessId, rule, detail, ...ids },
    });
  }

  /** Owners and active managers — the people a delivery alert is for. */
  private async alertOwners(
    businessId: string,
    title: string,
    body: string,
    link: string,
  ) {
    const members = await this.tenantPrisma.client.businessUser.findMany({
      where: { businessId, active: true, role: { in: ['owner', 'manager'] } },
      select: { userId: true },
    });
    for (const m of members) {
      await this.notifications.create(businessId, m.userId, {
        title,
        body,
        link,
      });
    }
  }

  async onAssigned(businessId: string, deliveryId: string): Promise<void> {
    try {
      const s = await this.settings.get(businessId);
      if (!s.autoEtaOnAssign) return;
      const result = await this.notifier.notify(businessId, deliveryId, 'eta');
      await this.logRun(
        businessId,
        result.sent
          ? AUTOMATION_RULES.etaOnAssign
          : `${AUTOMATION_RULES.etaOnAssign}:failed`,
        result.sent
          ? 'ETA message queued for the customer'
          : `Not sent — ${result.reason}`,
        { deliveryId },
      );
    } catch (error) {
      this.logger.warn(`onAssigned failed: ${(error as Error).message}`);
    }
  }

  async onFailed(businessId: string, deliveryId: string): Promise<void> {
    try {
      const s = await this.settings.get(businessId);
      if (!s.autoTaskOnFailure) return;
      const d = await this.tenantPrisma.client.delivery.findUnique({
        where: { id: deliveryId },
        include: { order: true },
      });
      if (!d) return;
      const code = `DEL-${d.order.orderNo}`;
      await this.alertOwners(
        businessId,
        `${code} failed — needs a decision`,
        `${d.failureReason ?? 'No reason recorded'}. Decide whether to retry, rebook or refund.`,
        '/deliveries/exceptions',
      );
      await this.logRun(
        businessId,
        AUTOMATION_RULES.taskOnFailure,
        `Alert raised for ${code}`,
        { deliveryId },
      );
    } catch (error) {
      this.logger.warn(`onFailed failed: ${(error as Error).message}`);
    }
  }

  async onDelivered(businessId: string, deliveryId: string): Promise<void> {
    try {
      const s = await this.settings.get(businessId);
      const d = await this.tenantPrisma.client.delivery.findUnique({
        where: { id: deliveryId },
      });
      if (!d) return;
      if (s.sendProofToCustomer) {
        const result = await this.notifier.notify(
          businessId,
          deliveryId,
          'delivered',
        );
        await this.logRun(
          businessId,
          result.sent
            ? AUTOMATION_RULES.proofToCustomer
            : `${AUTOMATION_RULES.proofToCustomer}:failed`,
          result.sent
            ? 'Delivered notice with proof link queued'
            : `Not sent — ${result.reason}`,
          { deliveryId },
        );
      }
      if (s.autoWarnCashLimit && s.cashLimitAmount !== null && d.riderId) {
        await this.warnIfOverCashLimit(
          businessId,
          d.riderId,
          Number(s.cashLimitAmount),
        );
      }
    } catch (error) {
      this.logger.warn(`onDelivered failed: ${(error as Error).message}`);
    }
  }

  private async warnIfOverCashLimit(
    businessId: string,
    riderId: string,
    limit: number,
  ) {
    const held = await this.riders.cashHeld(riderId);
    if (held <= limit) return;
    const rider = await this.riders.findOne(riderId);
    const recent =
      await this.tenantPrisma.client.deliveryAutomationRun.findFirst({
        where: {
          rule: AUTOMATION_RULES.warnCashLimit,
          riderId,
          createdAt: { gt: rider.cashHandedInAt ?? new Date(0) },
        },
      });
    if (recent) return;
    const amount = `Rs. ${Math.round(held).toLocaleString('en-US')}`;
    await this.alertOwners(
      businessId,
      `${rider.name} is over the cash limit`,
      `${rider.name} is carrying ${amount} against a limit of Rs. ${Math.round(limit).toLocaleString('en-US')}.`,
      '/deliveries/riders',
    );
    await this.logRun(
      businessId,
      AUTOMATION_RULES.warnCashLimit,
      `${rider.name} at ${amount}`,
      { riderId },
    );
  }

  /** Background tick — stale-phone flags and ETA-slip messages for one business. */
  async tick(businessId: string): Promise<void> {
    const s = await this.settings.get(businessId);

    if (s.autoFlagStalePhone) {
      const active = await this.tenantPrisma.client.rider.findMany({
        where: { businessId, status: 'active', onBreakSince: null },
      });
      for (const rider of (await this.riders.enrich(active)).filter(
        (r) => r.stale,
      )) {
        const since =
          rider.lastLocationAt ?? new Date(Date.now() - 6 * 60 * 60 * 1000);
        const already =
          await this.tenantPrisma.client.deliveryAutomationRun.findFirst({
            where: {
              rule: AUTOMATION_RULES.flagStalePhone,
              riderId: rider.id,
              createdAt: { gt: since },
            },
          });
        if (already) continue;
        await this.alertOwners(
          businessId,
          `${rider.name} has stopped reporting a position`,
          `No GPS fix for more than ${s.staleLocationMinutes} minutes${rider.activeDeliveries > 0 ? `, with ${rider.activeDeliveries} active stop(s)` : ''}.`,
          '/deliveries/dispatch',
        );
        await this.activity.record(businessId, {
          type: 'delivery',
          description: `${rider.name} stopped reporting their position`,
          entityType: 'Rider',
          entityId: rider.id,
        });
        await this.logRun(
          businessId,
          AUTOMATION_RULES.flagStalePhone,
          `${rider.name} flagged`,
          { riderId: rider.id },
        );
      }
    }

    if (s.autoEtaOnSlip) {
      const cutoff = new Date(Date.now() - s.slipThresholdMinutes * 60 * 1000);
      const slipping = await this.tenantPrisma.client.delivery.findMany({
        where: {
          businessId,
          status: { in: [...ACTIVE_DELIVERY_STATUSES] },
          promisedAt: { lte: cutoff },
          slipNotifiedAt: null,
        },
        take: 25,
      });
      for (const d of slipping) {
        const result = await this.notifier.notify(businessId, d.id, 'slip');
        await this.logRun(
          businessId,
          result.sent
            ? AUTOMATION_RULES.etaOnSlip
            : `${AUTOMATION_RULES.etaOnSlip}:failed`,
          result.sent
            ? 'Delay notice queued for the customer'
            : `Not sent — ${result.reason}`,
          { deliveryId: d.id },
        );
        if (!result.sent) {
          // Stamp so a customer with no reachable channel isn't retried every tick forever.
          await this.tenantPrisma.client.delivery.update({
            where: { id: d.id },
            data: { slipNotifiedAt: new Date() },
          });
        }
      }
    }
  }

  /** Real per-rule counts (today) and the most recent detail, for the Automations screen. */
  async runSummary(businessId: string) {
    const business = await this.tenantPrisma.client.business.findUnique({
      where: { id: businessId },
      select: { timezone: true },
    });
    const startOfDay = startOfDayInZone(business?.timezone ?? 'UTC');
    const runs = await this.tenantPrisma.client.deliveryAutomationRun.findMany({
      where: { businessId, createdAt: { gte: startOfDay } },
      orderBy: { createdAt: 'desc' },
    });
    const byRule = new Map<string, { count: number; last: string | null }>();
    for (const r of runs) {
      if (r.rule.endsWith(':failed')) continue;
      const cur = byRule.get(r.rule) ?? { count: 0, last: null };
      cur.count += 1;
      cur.last ??= r.detail;
      byRule.set(r.rule, cur);
    }
    return byRule;
  }
}
