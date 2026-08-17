import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LocaleService } from '../common/localization/locale.service';
import { SendGateService } from '../messaging/send-gate.service';
import { Role } from '../../generated/prisma';
import {
  DailyCloseRow,
  LowStockRow,
  NightlyCloseData,
} from './nightly-close.types';

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

  async composeAndSend(
    businessId: string,
    date: Date = new Date(),
  ): Promise<void> {
    const business = await this.prisma.business.findUniqueOrThrow({
      where: { id: businessId },
    });
    const data = await this.composeDayData(businessId, date);

    const owner = await this.prisma.businessUser.findFirst({
      where: { businessId, role: Role.owner },
      include: { user: true },
    });
    if (!owner) return;

    const alerts: string[] = [];
    if (data.lowStockProducts.length > 0)
      alerts.push(`${data.lowStockProducts.length} low-stock item(s)`);
    if (data.openFeedbackCount > 0)
      alerts.push(`${data.openFeedbackCount} open complaint(s)`);
    if (data.appointmentsTomorrowCount > 0)
      alerts.push(`${data.appointmentsTomorrowCount} booking(s) tomorrow`);

    await this.sendGate.send({
      businessId,
      templateKey: 'nightly_close',
      to: {
        phone: owner.user.phone ?? undefined,
        email: owner.user.email ?? undefined,
      },
      variables: {
        businessName: data.businessName,
        dateLabel: data.dateLabel,
        ordersCount: String(data.ordersCount),
        revenue: this.locale.formatCurrency(data.revenue, business),
        grossProfit: this.locale.formatCurrency(data.grossProfit, business),
        alertsSummary: alerts.length ? `${alerts.join(', ')}. ` : '',
        deepLink: `/day/${date.toISOString().slice(0, 10)}`,
      },
    });
  }

  async updateSettings(
    businessId: string,
    time?: string,
    channel?: 'whatsapp' | 'sms' | 'email',
  ) {
    return this.prisma.business.update({
      where: { id: businessId },
      data: {
        nightlyCloseTime: time,
        channelPref: channel,
      },
    });
  }
}
