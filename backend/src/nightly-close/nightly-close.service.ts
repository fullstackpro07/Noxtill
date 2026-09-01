import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LocaleService } from '../common/localization/locale.service';
import { SendGateService } from '../messaging/send-gate.service';
import { MessageChannel, Prisma, Role } from '@prisma/client';
import {
  DailyCloseRow,
  LowStockRow,
  NightlyCloseData,
} from './nightly-close.types';
import {
  DEFAULT_NIGHTLY_CLOSE_CONFIG,
  NightlyCloseConfig,
  NightlyCloseSection,
} from './nightly-close-sections.constants';
import { UpdateNightlyCloseDto } from './dto/update-nightly-close.dto';

function dayBounds(date: Date): { start: Date; end: Date } {
  const start = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

/**
 * Builds the Nightly Close payload (spec §3.2): today's v_daily_close row +
 * new reviews/feedback + tomorrow's appointments + today's credit payments +
 * a low-stock scan, then sends it through the send gate as a `nightly_close`
 * Utility message to the business owner.
 */
@Injectable()
export class NightlyCloseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly locale: LocaleService,
    private readonly sendGate: SendGateService,
  ) {}

  async composeDayData(
    businessId: string,
    date: Date,
  ): Promise<NightlyCloseData> {
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
    });
    const dateStr = date.toISOString().slice(0, 10);
    const { start: dayStart, end: dayEnd } = dayBounds(date);
    const { start: tomorrowStart, end: tomorrowEnd } = dayBounds(
      new Date(dayEnd),
    );

    const [
      dailyRows,
      appointmentsTomorrowCount,
      newReviewsCount,
      openFeedbackCount,
      creditPayments,
      lowStockRows,
    ] = await Promise.all([
      this.prisma.$queryRaw<
        DailyCloseRow[]
      >`SELECT * FROM v_daily_close WHERE business_id = ${businessId} AND close_date = DATE(${dateStr})`,
      this.prisma.appointment.count({
        where: {
          businessId,
          startsAt: { gte: tomorrowStart, lt: tomorrowEnd },
        },
      }),
      this.prisma.externalReview.count({
        where: { businessId, createdAt: { gte: dayStart, lt: dayEnd } },
      }),
      this.prisma.privateFeedback.count({
        where: { businessId, status: 'open' },
      }),
      this.prisma.creditEntry.findMany({
        where: {
          businessId,
          kind: 'payment',
          createdAt: { gte: dayStart, lt: dayEnd },
        },
      }),
      this.prisma.$queryRaw<
        LowStockRow[]
      >`SELECT id, name, stock_qty, low_stock_threshold FROM products WHERE business_id = ${businessId} AND active = true AND stock_qty <= low_stock_threshold LIMIT 5`,
    ]);

    const daily = dailyRows[0];
    const creditPaymentsTodayTotal = creditPayments.reduce(
      (sum, entry) => sum + Number(entry.amount),
      0,
    );

    return {
      businessId,
      businessName: business.name,
      dateLabel: this.locale.formatDate(date, business),
      ordersCount: Number(daily?.orders_count ?? 0),
      revenue: Number(daily?.revenue ?? 0),
      grossProfit: Number(daily?.gross_profit ?? 0),
      appointmentsTomorrowCount,
      newReviewsCount,
      openFeedbackCount,
      creditPaymentsTodayTotal,
      lowStockProducts: lowStockRows,
    };
  }

  /** UPD-BE-083: every attempt is logged (upserted per business+date), success or failure, so a failed delivery is visible rather than silently absent from history. */
  async composeAndSend(
    businessId: string,
    date: Date = new Date(),
  ): Promise<void> {
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
    });
    const closeDate = new Date(date.toISOString().slice(0, 10));

    const owner = await this.prisma.businessUser.findFirst({
      where: { businessId, role: Role.owner },
      include: { user: true },
    });
    if (!owner) return;

    try {
      const data = await this.composeDayData(businessId, date);
      const config = this.resolveConfig(business.nightlyCloseConfig);
      const deepLink = `/day/${date.toISOString().slice(0, 10)}`;
      const customBody = this.composeMessageBody(
        data,
        config,
        business,
        deepLink,
      );

      await this.sendGate.send({
        businessId,
        templateKey: 'nightly_close',
        to: {
          phone: owner.user.phone ?? undefined,
          email: owner.user.email ?? undefined,
        },
        // `variables` still populates the fixed registry copy as a fallback for a channel that
        // somehow can't render `customBody` — `message-worker.processor.ts` prefers `customBody`
        // whenever it's set, which it always is here now that sections are configurable.
        variables: {
          businessName: data.businessName,
          dateLabel: data.dateLabel,
          ordersCount: String(data.ordersCount),
          revenue: this.locale.formatCurrency(data.revenue, business),
          grossProfit: this.locale.formatCurrency(data.grossProfit, business),
          alertsSummary: '',
          deepLink,
        },
        customBody,
      });

      await this.logDelivery(
        businessId,
        closeDate,
        business.channelPref,
        'sent',
      );
    } catch (error) {
      await this.logDelivery(
        businessId,
        closeDate,
        business.channelPref,
        'failed',
        (error as Error).message,
      );
      throw error;
    }
  }

  private async logDelivery(
    businessId: string,
    closeDate: Date,
    channel: MessageChannel,
    status: 'sent' | 'failed',
    error?: string,
  ): Promise<void> {
    await this.prisma.nightlyCloseLog.upsert({
      where: { businessId_closeDate: { businessId, closeDate } },
      create: { businessId, closeDate, channel, status, error },
      update: { channel, status, error: error ?? null },
    });
  }

  /** UPD-BE-083: real preview — composes tonight's close without sending it. */
  preview(businessId: string): Promise<NightlyCloseData> {
    return this.composeDayData(businessId, new Date());
  }

  /** UPD-BE-083: "Send test now" — bypasses the schedule and sends immediately. */
  testSend(businessId: string): Promise<void> {
    return this.composeAndSend(businessId, new Date());
  }

  /** UPD-BE-083: history table — real per-day sales/profit joined with the real delivery log. */
  async getHistory(
    businessId: string,
    filters: { from?: Date; to?: Date; status?: 'sent' | 'failed' } = {},
  ) {
    const logs = await this.prisma.nightlyCloseLog.findMany({
      where: {
        businessId,
        ...(filters.from || filters.to
          ? {
              closeDate: {
                ...(filters.from ? { gte: filters.from } : {}),
                ...(filters.to ? { lte: filters.to } : {}),
              },
            }
          : {}),
        ...(filters.status ? { status: filters.status } : {}),
      },
      orderBy: { closeDate: 'desc' },
      take: 90,
    });

    return Promise.all(
      logs.map(async (log) => {
        const data = await this.composeDayData(businessId, log.closeDate);
        return {
          date: log.closeDate,
          sales: data.ordersCount,
          revenue: data.revenue,
          profit: data.grossProfit,
          newReviews: data.newReviewsCount,
          bookingsTomorrow: data.appointmentsTomorrowCount,
          creditRecovered: data.creditPaymentsTodayTotal,
          deliveryStatus: log.status,
          deliveryError: log.error,
          channel: log.channel,
        };
      }),
    );
  }

  /** UPD-BE-119 — the real, currently-effective config for the settings screen (an untouched `{}` resolves to the same defaults `composeAndSend` itself falls back to). */
  async getSettings(businessId: string) {
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
    });
    return {
      time: business.nightlyCloseTime,
      channel: business.channelPref,
      config: this.resolveConfig(business.nightlyCloseConfig),
    };
  }

  /** UPD-BE-119: extends the original `time`/`channel` update with section reorder, voice-note toggle+selection, and custom line items — merged over whatever config already existed, so a partial PATCH never silently resets the rest. */
  async updateSettings(businessId: string, dto: UpdateNightlyCloseDto) {
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
    });
    const current = this.resolveConfig(business.nightlyCloseConfig);
    const nextConfig: NightlyCloseConfig = {
      sections: dto.sections ?? current.sections,
      voiceNoteEnabled: dto.voiceNoteEnabled ?? current.voiceNoteEnabled,
      voiceId: dto.voiceId !== undefined ? dto.voiceId : current.voiceId,
      customLines: dto.customLines ?? current.customLines,
    };

    await this.prisma.business.update({
      where: { id: businessId },
      data: {
        nightlyCloseTime: dto.time,
        channelPref: dto.channel,
        nightlyCloseConfig: nextConfig as unknown as Prisma.InputJsonValue,
      },
    });
    return this.getSettings(businessId);
  }

  private resolveConfig(raw: unknown): NightlyCloseConfig {
    const stored = (raw ?? {}) as Partial<NightlyCloseConfig>;
    return {
      sections:
        stored.sections && stored.sections.length > 0
          ? stored.sections
          : DEFAULT_NIGHTLY_CLOSE_CONFIG.sections,
      voiceNoteEnabled:
        stored.voiceNoteEnabled ??
        DEFAULT_NIGHTLY_CLOSE_CONFIG.voiceNoteEnabled,
      voiceId: stored.voiceId ?? DEFAULT_NIGHTLY_CLOSE_CONFIG.voiceId,
      customLines:
        stored.customLines ?? DEFAULT_NIGHTLY_CLOSE_CONFIG.customLines,
    };
  }

  /** The real, section-aware message body — every line reflects genuinely computed data from
   * `composeDayData()`; a section is skipped only if the caller removed it from `config.sections`,
   * never because it happened to be zero (a real "0 orders" night is still real information). */
  private composeMessageBody(
    data: NightlyCloseData,
    config: NightlyCloseConfig,
    business: Parameters<LocaleService['formatCurrency']>[1],
    deepLink: string,
  ): string {
    const lines: string[] = [`${data.businessName} — ${data.dateLabel}`];

    const sectionLine: Record<NightlyCloseSection, () => string> = {
      sales: () =>
        `Sales: ${data.ordersCount} orders, ${this.locale.formatCurrency(data.revenue, business)} revenue, ${this.locale.formatCurrency(data.grossProfit, business)} profit`,
      lowStock: () =>
        data.lowStockProducts.length > 0
          ? `Low stock: ${data.lowStockProducts.length} item(s) — ${data.lowStockProducts.map((p) => p.name).join(', ')}`
          : 'Low stock: none',
      appointmentsTomorrow: () =>
        `Tomorrow: ${data.appointmentsTomorrowCount} appointment(s)`,
      newReviews: () => `Reviews: ${data.newReviewsCount} new`,
      openFeedback: () => `Open complaints: ${data.openFeedbackCount}`,
      creditPayments: () =>
        `Credit payments today: ${this.locale.formatCurrency(data.creditPaymentsTodayTotal, business)}`,
    };

    for (const section of config.sections) {
      lines.push(sectionLine[section]());
    }
    for (const custom of config.customLines) {
      lines.push(`${custom.label}: ${custom.value}`);
    }
    lines.push(`View details: ${deepLink}`);

    return lines.join('\n');
  }
}
