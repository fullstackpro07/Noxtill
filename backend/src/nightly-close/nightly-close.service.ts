import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LocaleService } from '../common/localization/locale.service';
import { SendGateService } from '../messaging/send-gate.service';
import { NightlyCloseVoiceCallService } from './nightly-close-voice-call.service';
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
    private readonly voiceCall: NightlyCloseVoiceCallService,
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

    const config = this.resolveConfig(business.nightlyCloseConfig);
    // `channels` overrides the single `channelPref` only for Nightly Close — every other message
    // type in the app keeps reading `channelPref` exactly as before.
    const effectiveChannels: MessageChannel[] =
      config.channels.length > 0 ? config.channels : [business.channelPref];

    let data: NightlyCloseData;
    let customBody: string;
    let variables: Record<string, string>;
    try {
      const deepLink = `/day/${date.toISOString().slice(0, 10)}`;
      data = await this.composeDayData(businessId, date);
      customBody = this.composeMessageBody(data, config, business, deepLink);
      variables = {
        businessName: data.businessName,
        dateLabel: data.dateLabel,
        ordersCount: String(data.ordersCount),
        revenue: this.locale.formatCurrency(data.revenue, business),
        grossProfit: this.locale.formatCurrency(data.grossProfit, business),
        alertsSummary: '',
        deepLink,
      };
    } catch (error) {
      // Composing the day's data itself failed — nothing was ever sent, so every configured
      // channel is logged as failed with the same underlying reason.
      await this.logDelivery(
        businessId,
        closeDate,
        effectiveChannels.map((channel) => ({
          channel,
          status: 'failed' as const,
          error: (error as Error).message,
        })),
      );
      throw error;
    }

    const results: {
      channel: MessageChannel;
      status: 'sent' | 'failed';
      error?: string;
    }[] = [];
    for (const channel of effectiveChannels) {
      try {
        await this.sendGate.send({
          businessId,
          templateKey: 'nightly_close',
          to: {
            phone: owner.user.phone ?? undefined,
            email: owner.user.email ?? undefined,
          },
          // Per-send override — this is what keeps a multi-channel Nightly Close from touching
          // `business.channelPref` at all; every other send in the app is unaffected.
          channel,
          // `variables` still populates the fixed registry copy as a fallback for a channel that
          // somehow can't render `customBody` — `message-worker.processor.ts` prefers
          // `customBody` whenever it's set, which it always is here now sections are configurable.
          variables,
          customBody,
        });
        results.push({ channel, status: 'sent' });
      } catch (error) {
        results.push({
          channel,
          status: 'failed',
          error: (error as Error).message,
        });
      }
    }

    await this.logDelivery(businessId, closeDate, results);

    // Voice note (fix-it) — a real outbound Twilio call reading the close aloud, best-effort and
    // additional to the channel sends above; it never affects `results`/the thrown error below.
    if (config.voiceNoteEnabled && owner.user.phone) {
      await this.voiceCall.callWithSummary(
        owner.user.phone,
        this.composeSpokenSummary(data, config, business),
        config.voiceId,
      );
    }

    const allFailed = results.every((r) => r.status === 'failed');
    if (allFailed) {
      throw new Error(results[0]?.error ?? 'All channels failed');
    }
  }

  private async logDelivery(
    businessId: string,
    closeDate: Date,
    results: { channel: MessageChannel; status: 'sent' | 'failed'; error?: string }[],
  ): Promise<void> {
    // Primary channel/status/error columns stay single-valued for full backward compatibility with
    // existing history rows and the Close-history table; `channelResults` carries the real
    // per-channel breakdown whenever more than one channel was attempted.
    const primary = results[0];
    const anySent = results.some((r) => r.status === 'sent');
    const combinedError = results
      .filter((r) => r.status === 'failed')
      .map((r) => `${r.channel}: ${r.error}`)
      .join('; ');

    await this.prisma.nightlyCloseLog.upsert({
      where: { businessId_closeDate: { businessId, closeDate } },
      create: {
        businessId,
        closeDate,
        channel: primary.channel,
        status: anySent ? 'sent' : 'failed',
        error: combinedError || undefined,
        channelResults:
          results.length > 1
            ? (results as unknown as Prisma.InputJsonValue)
            : undefined,
      },
      update: {
        channel: primary.channel,
        status: anySent ? 'sent' : 'failed',
        error: combinedError || null,
        channelResults:
          results.length > 1
            ? (results as unknown as Prisma.InputJsonValue)
            : Prisma.JsonNull,
      },
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
          channelResults: log.channelResults as
            | { channel: MessageChannel; status: 'sent' | 'failed'; error?: string }[]
            | null,
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
      // Voice note fix-it — lets the settings screen show an honest "not configured yet" state
      // instead of implying every enabled voice note will actually place a call.
      voiceCallConfigured: this.voiceCall.isConfigured(),
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
      channels: dto.channels ?? current.channels,
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
      channels: stored.channels ?? DEFAULT_NIGHTLY_CLOSE_CONFIG.channels,
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

  /** Voice note fix-it — a spoken-prose rendering of the same real `NightlyCloseData`/`config`
   * used by `composeMessageBody()`, for the real Twilio call `NightlyCloseVoiceCallService`
   * places. Sentences instead of the WhatsApp message's label:value lines since this is read
   * aloud by Twilio's TTS, not displayed as text. */
  private composeSpokenSummary(
    data: NightlyCloseData,
    config: NightlyCloseConfig,
    business: Parameters<LocaleService['formatCurrency']>[1],
  ): string {
    const sentences: string[] = [
      `Hi, here is your Nightly Close for ${data.businessName}, ${data.dateLabel}.`,
    ];

    const sectionSentence: Record<NightlyCloseSection, () => string> = {
      sales: () =>
        `You had ${data.ordersCount} order${data.ordersCount === 1 ? '' : 's'}, for ${this.locale.formatCurrency(data.revenue, business)} in revenue and ${this.locale.formatCurrency(data.grossProfit, business)} in profit.`,
      lowStock: () =>
        data.lowStockProducts.length > 0
          ? `${data.lowStockProducts.length} product${data.lowStockProducts.length === 1 ? ' is' : 's are'} running low on stock.`
          : 'No products are running low on stock.',
      appointmentsTomorrow: () =>
        `You have ${data.appointmentsTomorrowCount} appointment${data.appointmentsTomorrowCount === 1 ? '' : 's'} tomorrow.`,
      newReviews: () =>
        `You received ${data.newReviewsCount} new review${data.newReviewsCount === 1 ? '' : 's'}.`,
      openFeedback: () =>
        `There ${data.openFeedbackCount === 1 ? 'is' : 'are'} ${data.openFeedbackCount} open complaint${data.openFeedbackCount === 1 ? '' : 's'}.`,
      creditPayments: () =>
        `You collected ${this.locale.formatCurrency(data.creditPaymentsTodayTotal, business)} in credit payments today.`,
    };

    for (const section of config.sections) {
      sentences.push(sectionSentence[section]());
    }
    for (const custom of config.customLines) {
      sentences.push(`${custom.label}: ${custom.value}.`);
    }
    sentences.push('That is your Nightly Close. Have a good night.');

    return sentences.join(' ');
  }
}
