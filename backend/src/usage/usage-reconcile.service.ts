import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from '../prisma/prisma.service';

const MARGIN_FLOOR_PCT = 60;
const VARIANCE_FLAG_PCT = 2;
const COST_CHANGE_ALERT_PCT = 10;

/**
 * Nightly reconciliation (spec §17) and monthly provider-cost refresh (spec §5.2). Never adjusts a
 * customer's bill from a variance — it only flags (`provider_invoices.status = investigating`) and
 * logs for finance. Runs only where the provider credentials exist; otherwise it records nothing
 * and the screens say so.
 */
@Injectable()
export class UsageReconcileService {
  private readonly logger = new Logger(UsageReconcileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private twilio() {
    const sid = this.config.get<string>('TWILIO_ACCOUNT_SID');
    const token = this.config.get<string>('TWILIO_AUTH_TOKEN');
    return sid && token
      ? { sid, auth: { username: sid, password: token } }
      : null;
  }

  /** Spec §17.1: margin per metric this month from `usage_events` cost vs price; alert below 60%. */
  async marginReport(now = new Date()) {
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    const rows = await this.prisma.$queryRaw<
      { metric_code: string; revenue: string | null; cost: string | null }[]
    >`
      SELECT metric_code, SUM(price_usd) AS revenue, SUM(cost_usd) AS cost
        FROM usage_events
       WHERE occurred_at >= ${monthStart} AND status = 'completed' AND price_usd IS NOT NULL
       GROUP BY metric_code
       ORDER BY metric_code`;
    return rows.map((r) => {
      const revenue = Number(r.revenue ?? 0);
      const cost = r.cost == null ? null : Number(r.cost);
      const margin =
        cost == null || revenue === 0
          ? null
          : Math.round((1000 * (revenue - cost)) / revenue) / 10;
      return { metric: r.metric_code, revenue, cost, marginPct: margin };
    });
  }

  async nightly(now = new Date()): Promise<void> {
    for (const m of await this.marginReport(now)) {
      if (m.marginPct != null && m.marginPct < MARGIN_FLOOR_PCT) {
        this.logger.error(
          `MARGIN ALERT: ${m.metric} margin ${m.marginPct}% (< ${MARGIN_FLOOR_PCT}%) this month`,
        );
        await this.prisma.usageOutbox.create({
          data: { type: 'margin.low', payload: m },
        });
      }
    }
    await this.reconcileTwilioSms(now);
  }

  /** Twilio's own count of outbound SMS segments this month vs ours (all businesses share the account). */
  private async reconcileTwilioSms(now: Date): Promise<void> {
    const tw = this.twilio();
    if (!tw) return;
    const monthStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    );
    let providerQty = 0;
    let providerCost = 0;
    try {
      const res = await axios.get<{
        usage_records: { count: string; price: string }[];
      }>(
        `https://api.twilio.com/2010-04-01/Accounts/${tw.sid}/Usage/Records/ThisMonth.json`,
        {
          auth: tw.auth,
          params: { Category: 'sms-outbound' },
          timeout: 15_000,
        },
      );
      for (const r of res.data.usage_records ?? []) {
        providerQty += Number(r.count ?? 0);
        providerCost += Number(r.price ?? 0);
      }
    } catch (error) {
      this.logger.warn(
        `Twilio usage fetch failed: ${(error as Error).message}`,
      );
      return;
    }
    const ours = await this.prisma.usageEvent.aggregate({
      where: {
        metricCode: 'sms_segments',
        provider: 'twilio',
        occurredAt: { gte: monthStart },
        status: 'completed',
      },
      _sum: { quantity: true, costUsd: true },
    });
    const ourQty = Number(ours._sum.quantity ?? 0);
    const variance =
      providerQty === 0
        ? ourQty === 0
          ? 0
          : 100
        : Math.abs((providerQty - ourQty) / providerQty) * 100;
    const status = variance <= VARIANCE_FLAG_PCT ? 'matched' : 'investigating';
    await this.prisma.providerInvoice.upsert({
      where: {
        provider_lineItem_periodStart: {
          provider: 'twilio',
          lineItem: 'sms-outbound',
          periodStart: monthStart,
        },
      },
      create: {
        provider: 'twilio',
        lineItem: 'sms-outbound',
        periodStart: monthStart,
        periodEnd: now,
        providerQuantity: providerQty,
        providerCostUsd: providerCost,
        ourQuantity: ourQty,
        ourCostUsd: Number(ours._sum.costUsd ?? 0),
        variancePct: Math.round(variance * 100) / 100,
        status,
      },
      update: {
        periodEnd: now,
        providerQuantity: providerQty,
        providerCostUsd: providerCost,
        ourQuantity: ourQty,
        ourCostUsd: Number(ours._sum.costUsd ?? 0),
        variancePct: Math.round(variance * 100) / 100,
        status,
      },
    });
    if (status === 'investigating') {
      this.logger.error(
        `RECONCILIATION VARIANCE: twilio sms-outbound ours=${ourQty} provider=${providerQty} (${variance.toFixed(1)}%)`,
      );
      await this.prisma.usageOutbox.create({
        data: {
          type: 'reconciliation.variance',
          payload: {
            provider: 'twilio',
            metric: 'sms_segments',
            our_qty: ourQty,
            provider_qty: providerQty,
            pct: variance,
          },
        },
      });
    }
  }

  /** Monthly: fetch Twilio's current (negotiated) prices; alert when one moves more than 10%. */
  async refreshProviderCosts(): Promise<number> {
    const tw = this.twilio();
    if (!tw) return 0;
    const fetched: {
      metricCode: string;
      countryCode: string;
      numberType: string;
      unitCostUsd: number;
    }[] = [];
    try {
      const numbers = await axios.get<{
        phone_number_prices: { number_type: string; current_price: string }[];
      }>('https://pricing.twilio.com/v1/PhoneNumbers/Countries/US', {
        auth: tw.auth,
        timeout: 15_000,
      });
      for (const p of numbers.data.phone_number_prices ?? []) {
        const type = p.number_type === 'toll free' ? 'tollfree' : p.number_type;
        if (type === 'local' || type === 'tollfree') {
          fetched.push({
            metricCode:
              type === 'local'
                ? 'phone_numbers_local'
                : 'phone_numbers_tollfree',
            countryCode: 'US',
            numberType: type,
            unitCostUsd: Number(p.current_price),
          });
        }
      }
      const sms = await axios.get<{
        outbound_sms_prices: {
          prices: { number_type: string; current_price: string }[];
        }[];
      }>('https://pricing.twilio.com/v1/Messaging/Countries/US', {
        auth: tw.auth,
        timeout: 15_000,
      });
      const local = sms.data.outbound_sms_prices?.[0]?.prices?.find(
        (p) => p.number_type === 'local',
      );
      if (local)
        fetched.push({
          metricCode: 'sms_segments',
          countryCode: 'US',
          numberType: '',
          unitCostUsd: Number(local.current_price),
        });
    } catch (error) {
      this.logger.warn(
        `Twilio pricing fetch failed: ${(error as Error).message}`,
      );
      return 0;
    }
    for (const f of fetched) {
      const prev = await this.prisma.providerCost.findFirst({
        where: {
          provider: 'twilio',
          metricCode: f.metricCode,
          countryCode: f.countryCode,
          numberType: f.numberType,
        },
        orderBy: { fetchedAt: 'desc' },
      });
      await this.prisma.providerCost.create({
        data: { provider: 'twilio', ...f, source: 'api' },
      });
      if (prev) {
        const before = Number(prev.unitCostUsd);
        const pct =
          before === 0 ? 0 : ((f.unitCostUsd - before) / before) * 100;
        if (Math.abs(pct) > COST_CHANGE_ALERT_PCT) {
          this.logger.error(
            `PROVIDER COST CHANGE: twilio ${f.metricCode} ${before} → ${f.unitCostUsd} (${pct.toFixed(1)}%)`,
          );
          await this.prisma.usageOutbox.create({
            data: {
              type: 'provider.cost_changed',
              payload: {
                provider: 'twilio',
                metric: f.metricCode,
                country: f.countryCode,
                from: before,
                to: f.unitCostUsd,
                pct,
              },
            },
          });
        }
      }
    }
    return fetched.length;
  }

  /** Latest known provider cost per unit, for margin tracking on each event. */
  async latestCost(
    metricCode: string,
    countryCode = '',
    numberType = '',
  ): Promise<number | null> {
    const row = await this.prisma.providerCost.findFirst({
      where: { metricCode, countryCode, numberType },
      orderBy: { fetchedAt: 'desc' },
    });
    return row ? Number(row.unitCostUsd) : null;
  }
}
