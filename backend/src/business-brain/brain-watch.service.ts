import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { BrainWatch, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import { NotificationsService } from '../notifications/notifications.service';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { BrainMetricsService } from './brain-metrics.service';
import { BRAIN_ERRORS, WATCH_METRICS, WatchMetric } from './brain.constants';
import { Finding } from './brain.types';
import { money } from './brain-context.service';

const DAY = 86400000;

export interface WatchInput {
  metric: WatchMetric;
  subjectId?: string | null;
  op: 'lt' | 'gt' | 'outside';
  threshold: number;
  threshold2?: number | null;
  label?: string;
}

/** Watchlist: "tell me when …" rules, evaluated against live records whenever they are read and by the hourly tick. */
@Injectable()
export class BrainWatchService {
  private readonly logger = new Logger(BrainWatchService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: BrainMetricsService,
    private readonly notifications: NotificationsService,
  ) {}

  private async current(
    businessId: string,
    w: Pick<BrainWatch, 'metric' | 'subjectId'>,
  ): Promise<number | null> {
    switch (w.metric as WatchMetric) {
      case 'product_stock': {
        const p = await this.prisma.product.findFirst({
          where: { id: w.subjectId ?? '', businessId },
          select: { stockQty: true },
        });
        return p ? p.stockQty : null;
      }
      case 'overdue_credit': {
        const business = await this.prisma.business.findUniqueOrThrow({
          where: { id: businessId },
          select: { policies: true },
        });
        const days = Number(
          (business.policies as Record<string, unknown>)?.[
            'brain.overdueDays'
          ] ?? 30,
        );
        return (await this.metrics.credit([businessId], days)).overdue;
      }
      case 'customer_quiet_days': {
        const last = await this.prisma.order.findFirst({
          where: {
            businessId,
            customerId: w.subjectId ?? '',
            status: 'completed',
            isQuotation: false,
          },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        });
        if (!last) return null;
        return Math.floor((Date.now() - last.createdAt.getTime()) / DAY);
      }
      case 'revenue_week': {
        const m = await this.prisma.order.aggregate({
          where: {
            businessId,
            status: 'completed',
            isQuotation: false,
            createdAt: { gte: new Date(Date.now() - 7 * DAY) },
          },
          _sum: { total: true },
        });
        return Number(m._sum.total ?? 0);
      }
      case 'branch_margin_gap': {
        const caller = await this.prisma.business.findUniqueOrThrow({
          where: { id: businessId },
          select: { id: true, parentId: true },
        });
        const root = caller.parentId ?? caller.id;
        const group = (
          await this.prisma.business.findMany({
            where: { OR: [{ id: root }, { parentId: root }] },
            select: { id: true },
          })
        ).map((b) => b.id);
        const rows = (
          await this.metrics.branches(
            group,
            new Date(Date.now() - 30 * DAY),
            new Date(),
          )
        ).filter((r) => r.margin !== null);
        const subject = rows.find((r) => r.businessId === w.subjectId);
        if (!subject || rows.length < 2) return null;
        return Math.max(...rows.map((r) => r.margin!)) - subject.margin!;
      }
    }
    return null;
  }

  private tripped(
    w: Pick<BrainWatch, 'op' | 'threshold' | 'threshold2'>,
    v: number | null,
  ): boolean {
    if (v === null) return false;
    const t = Number(w.threshold);
    if (w.op === 'lt') return v < t;
    if (w.op === 'gt') return v > t;
    return v < t || v > Number(w.threshold2 ?? t);
  }

  rule(
    w: Pick<BrainWatch, 'metric' | 'op' | 'threshold' | 'threshold2'>,
    b: {
      currency: string;
      locale: string;
      timezone: string;
      id: string;
      name: string;
    },
  ): string {
    const unit = WATCH_METRICS[w.metric as WatchMetric]?.unit;
    const f = (v: number) =>
      unit === 'money'
        ? money(b, v)
        : unit === 'points'
          ? `${v} points`
          : `${v} ${unit}`;
    const t = Number(w.threshold);
    switch (w.metric as WatchMetric) {
      case 'product_stock':
        return w.op === 'lt'
          ? `stock falls below ${f(t)}`
          : `stock goes above ${f(t)}`;
      case 'overdue_credit':
        return w.op === 'gt'
          ? `overdue credit goes above ${f(t)}`
          : `overdue credit falls below ${f(t)}`;
      case 'customer_quiet_days':
        return `they go ${t} days without buying`;
      case 'revenue_week':
        return w.op === 'outside'
          ? `7-day revenue goes above ${f(Number(w.threshold2 ?? t))} or below ${f(t)}`
          : w.op === 'lt'
            ? `7-day revenue falls below ${f(t)}`
            : `7-day revenue goes above ${f(t)}`;
      case 'branch_margin_gap':
        return `it is more than ${f(t)} behind the best branch on margin`;
    }
    return 'it changes';
  }

  async list(user: AuthenticatedUser) {
    const b = await this.prisma.business.findUniqueOrThrow({
      where: { id: user.businessId },
      select: {
        id: true,
        name: true,
        currency: true,
        locale: true,
        timezone: true,
      },
    });
    const rows = await this.prisma.brainWatch.findMany({
      where: { businessId: user.businessId },
      orderBy: { createdAt: 'desc' },
    });
    const out: {
      id: string;
      n: string;
      metric: string;
      rule: string;
      st: string;
      now: string;
      triggeredAt: string | null;
    }[] = [];
    for (const w of rows) {
      const updated = await this.evaluate(w);
      const unit = WATCH_METRICS[w.metric as WatchMetric]?.unit;
      out.push({
        id: w.id,
        n: w.label,
        metric: w.metric,
        rule: this.rule(w, b),
        st:
          updated.status === 'triggered'
            ? 'Triggered'
            : updated.lastValue === null
              ? 'No reading'
              : 'Watching',
        now:
          updated.lastValue === null
            ? 'No record to read'
            : unit === 'money'
              ? money(b, Number(updated.lastValue))
              : `${Number(updated.lastValue).toFixed(unit === 'points' ? 1 : 0)} ${unit}`,
        triggeredAt: updated.triggeredAt?.toISOString() ?? null,
      });
    }
    return out;
  }

  /** Re-reads the watched figure and records whether the rule is tripped. */
  async evaluate(w: BrainWatch): Promise<BrainWatch> {
    const v = await this.current(w.businessId, w);
    const hit = this.tripped(w, v);
    return this.prisma.brainWatch.update({
      where: { id: w.id },
      data: {
        lastValue: v,
        status: hit ? 'triggered' : 'watching',
        triggeredAt: hit
          ? w.status === 'triggered'
            ? w.triggeredAt
            : new Date()
          : null,
        notifiedAt: hit ? w.notifiedAt : null,
      },
    });
  }

  async create(user: AuthenticatedUser, input: WatchInput) {
    const def = WATCH_METRICS[input.metric];
    if (!def)
      throw new AppException(
        BRAIN_ERRORS.BAD_WATCH,
        'Pick something to watch.',
        HttpStatus.BAD_REQUEST,
      );
    let subjectName: string | null = null;
    if (def.needsSubject === 'product')
      subjectName =
        (
          await this.prisma.product.findFirst({
            where: { id: input.subjectId ?? '', businessId: user.businessId },
            select: { name: true },
          })
        )?.name ?? null;
    if (def.needsSubject === 'customer')
      subjectName =
        (
          await this.prisma.customer.findFirst({
            where: { id: input.subjectId ?? '', businessId: user.businessId },
            select: { name: true },
          })
        )?.name ?? null;
    if (def.needsSubject === 'branch')
      subjectName =
        (
          await this.prisma.business.findUnique({
            where: { id: input.subjectId ?? '' },
            select: { name: true },
          })
        )?.name ?? null;
    if (def.needsSubject && !subjectName)
      throw new AppException(
        BRAIN_ERRORS.BAD_WATCH,
        `Pick the ${def.needsSubject} to watch.`,
        HttpStatus.BAD_REQUEST,
      );
    if (
      input.op === 'outside' &&
      (input.threshold2 === undefined ||
        input.threshold2 === null ||
        input.threshold2 <= input.threshold)
    ) {
      throw new AppException(
        BRAIN_ERRORS.BAD_WATCH,
        'For a range, the upper value must be above the lower one.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const label =
      input.label?.trim() ||
      (subjectName
        ? def.needsSubject === 'branch'
          ? `${subjectName} margin`
          : subjectName
        : def.label);
    const w = await this.prisma.brainWatch.create({
      data: {
        businessId: user.businessId,
        label: label.slice(0, 191),
        metric: input.metric,
        subjectId: input.subjectId ?? null,
        op: input.op,
        threshold: input.threshold,
        threshold2: input.threshold2 ?? null,
        createdById: user.sub,
      },
    });
    await this.evaluate(w);
    return { id: w.id };
  }

  async remove(user: AuthenticatedUser, id: string) {
    const w = await this.prisma.brainWatch.findFirst({
      where: { id, businessId: user.businessId },
    });
    if (!w)
      throw new AppException(
        BRAIN_ERRORS.NOT_FOUND,
        'Watch not found.',
        HttpStatus.NOT_FOUND,
      );
    await this.prisma.brainWatch.delete({ where: { id } });
    return { ok: true };
  }

  /** Turns a watched finding into a concrete rule when the finding maps onto one. */
  async fromFinding(user: AuthenticatedUser, f: Finding): Promise<boolean> {
    let input: WatchInput | null = null;
    if (f.key.startsWith('stock_runout:')) {
      const productId = f.key.split(':')[1];
      const p = await this.prisma.product.findFirst({
        where: { id: productId, businessId: user.businessId },
        select: { lowStockThreshold: true, stockQty: true },
      });
      if (p)
        input = {
          metric: 'product_stock',
          subjectId: productId,
          op: 'lt',
          threshold: Math.max(p.lowStockThreshold, 1),
        };
    } else if (f.key === 'credit_overdue') {
      input = {
        metric: 'overdue_credit',
        op: 'gt',
        threshold: Math.round(f.impactValue ?? 0),
      };
    } else if (f.key.startsWith('margin_gap:')) {
      input = {
        metric: 'branch_margin_gap',
        subjectId: f.key.split(':')[1],
        op: 'gt',
        threshold: 5,
      };
    }
    if (!input) return false;
    const exists = await this.prisma.brainWatch.findFirst({
      where: {
        businessId: user.businessId,
        metric: input.metric,
        subjectId: input.subjectId ?? null,
      },
    });
    if (!exists) await this.create(user, input);
    return true;
  }

  /** Hourly: evaluate every rule; tell owners and managers once when one newly trips. */
  async tick(businessId: string) {
    const rows = await this.prisma.brainWatch.findMany({
      where: { businessId },
    });
    if (!rows.length) return;
    const b = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
      select: {
        id: true,
        name: true,
        currency: true,
        locale: true,
        timezone: true,
      },
    });
    const managers = await this.prisma.businessUser.findMany({
      where: {
        businessId,
        active: true,
        role: { in: [Role.owner, Role.manager] },
      },
      select: { userId: true },
    });
    for (const w of rows) {
      const u = await this.evaluate(w);
      if (u.status === 'triggered' && !u.notifiedAt) {
        for (const m of managers) {
          await this.notifications
            .create(
              businessId,
              m.userId,
              {
                title: `${u.label}: ${this.rule(u, b)}`,
                body: 'A Business Brain watch you set has been triggered.',
                link: '/business-brain/opportunity',
              },
              'brain_watch_triggered',
            )
            .catch((e: Error) =>
              this.logger.warn(`Watch notification failed: ${e.message}`),
            );
        }
        await this.prisma.brainWatch.update({
          where: { id: u.id },
          data: { notifiedAt: new Date() },
        });
      }
    }
  }
}
