import { Injectable, Logger } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CapabilitiesService } from '../common/capabilities/capabilities.service';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { AuthMailerService } from '../auth/auth-mailer.service';
import { EntitlementsService, EntitlementSet } from './entitlements.service';
import { ALERT_THRESHOLDS } from './usage.constants';
import { formatDateUtc } from './usage-period.util';

const PAGE_FOR: Record<string, string> = {
  users: 'team',
  locations: 'team',
  ai_credits: 'ai',
  automation_runs: 'auto',
  digitizer_pages: 'digitizer',
  seo_keywords: 'seo',
  esign_transactions: 'esign',
  storage_bytes: 'storage',
  'spend:voice': 'voice',
  'spend:messaging': 'comm',
};

/**
 * Threshold alerts (spec §12): 50% in-app; 75%+ in-app and email. Fired once per metric per
 * threshold per period (`usage_alerts` unique key). An alert is information only — it never
 * permits an overage. Recipients are the owner plus anyone holding the billing capability.
 * Suppressed while the subscription is cancelled.
 */
@Injectable()
export class UsageAlertsService {
  private readonly logger = new Logger(UsageAlertsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly capabilities: CapabilitiesService,
    private readonly mailer: AuthMailerService,
  ) {}

  async check(rootId: string): Promise<number> {
    const set = await this.entitlements.resolve(rootId, { fresh: true });
    if (set.status === 'cancelled') return 0;
    const checks: {
      metric: string;
      label: string;
      used: number;
      limit: number;
      unit: string;
    }[] = [];
    for (const m of Object.values(set.metrics)) {
      if (m.included == null || m.kind === 'passthrough') continue;
      const limit = m.included + m.purchased;
      if (limit <= 0) continue;
      checks.push({
        metric: m.code,
        label: this.label(m.code),
        used: m.used + m.reserved,
        limit,
        unit:
          m.code === 'ai_credits'
            ? 'credits'
            : this.label(m.code).toLowerCase(),
      });
    }
    for (const cap of Object.values(set.spendCaps)) {
      if (cap.capUsd > 0)
        checks.push({
          metric: `spend:${cap.group}`,
          label: `${cap.group === 'voice' ? 'Voice' : 'Messaging'} spending`,
          used: cap.spentUsd,
          limit: cap.capUsd,
          unit: 'usd',
        });
    }
    let fired = 0;
    for (const c of checks) {
      const pct = (c.used / c.limit) * 100;
      for (const threshold of ALERT_THRESHOLDS.filter((t) => t <= pct)) {
        const channels = threshold >= 75 ? ['in_app', 'email'] : ['in_app'];
        try {
          await this.prisma.usageAlert.create({
            data: {
              businessId: rootId,
              metricCode: c.metric,
              threshold,
              periodStart: new Date(set.usagePeriod.start),
              channels,
            },
          });
        } catch (error) {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === 'P2002'
          )
            continue;
          throw error;
        }
        await this.deliver(
          rootId,
          set,
          c,
          threshold,
          channels.includes('email'),
        );
        fired++;
      }
    }
    return fired;
  }

  private label(code: string): string {
    return (
      (
        {
          users: 'Users',
          locations: 'Locations',
          ai_credits: 'AI credits',
          automation_runs: 'Automation runs',
          digitizer_pages: 'Digitizer pages',
          seo_keywords: 'SEO keywords',
          esign_transactions: 'eSign transactions',
          storage_bytes: 'Storage',
          phone_numbers_local: 'Local numbers',
          phone_numbers_tollfree: 'Toll-free numbers',
          agent_seats: 'Agent seats',
        } as Record<string, string>
      )[code] ?? code
    );
  }

  private money(n: number) {
    return `$${n.toFixed(2)}`;
  }

  private async deliver(
    rootId: string,
    set: EntitlementSet,
    c: {
      metric: string;
      label: string;
      used: number;
      limit: number;
      unit: string;
    },
    threshold: number,
    email: boolean,
  ): Promise<void> {
    const reset = formatDateUtc(new Date(set.usagePeriod.end));
    const usd = c.unit === 'usd';
    const used = usd
      ? this.money(c.used)
      : Math.round(c.used).toLocaleString('en-US');
    const limit = usd
      ? this.money(c.limit)
      : Math.round(c.limit).toLocaleString('en-US');
    const left = usd
      ? this.money(Math.max(0, c.limit - c.used))
      : Math.max(0, Math.round(c.limit - c.used)).toLocaleString('en-US');
    const capacity = [
      'users',
      'locations',
      'phone_numbers_local',
      'phone_numbers_tollfree',
      'agent_seats',
    ].includes(c.metric);
    const title =
      threshold >= 100
        ? `${c.label} limit reached`
        : `${c.label} ${threshold}% used`;
    const body =
      threshold >= 100
        ? capacity
          ? `You're using all ${limit} ${c.label.toLowerCase()} on ${set.planName}. Adding more is paused until you add capacity or upgrade.`
          : `You've used ${used} of ${limit}. It's paused until ${reset}, or until you add more. Nothing is charged automatically.`
        : capacity
          ? `You're using ${used} of ${limit} ${c.label.toLowerCase()} on ${set.planName}.`
          : `You've used ${used} of ${limit} this period. ${left} left. Resets ${reset}.`;
    const path = `/settings/usage/${PAGE_FOR[c.metric] ?? 'overview'}`;

    const members = await this.prisma.businessUser.findMany({
      where: { businessId: rootId, active: true },
      include: { user: { select: { id: true, email: true } } },
    });
    for (const m of members) {
      const caps =
        m.role === Role.owner ? null : await this.capabilities.resolve(m);
      if (caps && !caps.includes(CAPABILITIES.BILLING_MANAGE)) continue;
      const pref = await this.prisma.notificationPreference.findFirst({
        where: {
          businessId: rootId,
          event: 'subscription_usage',
          channel: 'in_app',
          userId: { in: [m.userId, ''] },
        },
        orderBy: { userId: 'desc' },
      });
      if (pref?.enabled !== false) {
        await this.prisma.notification.create({
          data: {
            businessId: rootId,
            userId: m.userId,
            title,
            body,
            link: path,
            priority: threshold >= 90 ? 'high' : 'normal',
          },
        });
      }
      if (email && m.user.email) {
        await this.mailer.sendNotice(m.user.email, {
          subject: `Noxtill: ${title}`,
          heading: title,
          body: `${body}${threshold >= 90 ? ' You can upgrade or add capacity from Usage & Limits.' : ''}`,
          cta: 'Open Usage & Limits',
          path,
          footnote:
            'Noxtill sends this once per threshold each billing period. An alert never lets usage go over a limit.',
        });
      }
    }
    await this.prisma.usageOutbox.create({
      data: {
        businessId: rootId,
        type:
          threshold >= 100 ? 'usage.limit_reached' : 'usage.threshold_crossed',
        payload: { metric: c.metric, threshold },
      },
    });
    this.logger.log(`Alert ${c.metric} ${threshold}% for ${rootId}`);
  }

  /** Trial reminders (spec §15.2: day 11 = 3 days left, day 13 = tomorrow). */
  async trialReminders(now = new Date()): Promise<number> {
    const trials = await this.prisma.subscription.findMany({
      where: {
        status: 'trialing',
        trialEndsAt: { gt: now, lte: new Date(now.getTime() + 3 * 86_400_000) },
      },
      include: { scheduledPlan: true },
    });
    let sent = 0;
    for (const sub of trials) {
      const daysLeft = Math.ceil(
        (sub.trialEndsAt!.getTime() - now.getTime()) / 86_400_000,
      );
      const key = daysLeft <= 1 ? 'day13' : 'day11';
      const already = (sub.trialRemindersSent as string[] | null) ?? [];
      if (already.includes(key)) continue;
      const card = await this.prisma.platformPaymentMethod.count({
        where: { businessId: sub.businessId, isDefault: true },
      });
      const ends = formatDateUtc(sub.trialEndsAt!);
      const next =
        sub.scheduledPlan && card
          ? `${sub.scheduledPlan.name} starts on ${ends} and your card is charged then.`
          : `Add a payment method and choose a plan before ${ends} to keep your workspace running. Without one, it becomes read-only — nothing is deleted.`;
      const owner = await this.prisma.businessUser.findFirst({
        where: { businessId: sub.businessId, role: Role.owner },
        include: { user: true },
      });
      if (owner) {
        const title =
          key === 'day13'
            ? 'Your trial ends tomorrow'
            : 'Your trial ends in 3 days';
        await this.prisma.notification.create({
          data: {
            businessId: sub.businessId,
            userId: owner.userId,
            title,
            body: next,
            link: '/settings/account/plan',
            priority: 'high',
          },
        });
        if (owner.user.email) {
          await this.mailer.sendNotice(owner.user.email, {
            subject: `Noxtill: ${title}`,
            heading: title,
            body: next,
            cta: 'Review your plan',
            path: '/settings/account/plan',
            footnote:
              'Noxtill never charges a trial without a card you added and a plan you chose.',
          });
        }
      }
      await this.prisma.subscription.update({
        where: { id: sub.id },
        data: { trialRemindersSent: [...already, key] },
      });
      sent++;
    }
    return sent;
  }
}
