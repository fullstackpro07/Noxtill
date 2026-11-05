import { Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  EntitlementAudit,
  IntegrationProvider,
  IntegrationStatus,
  Prisma,
  UsageEvent,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../common/storage/s3.service';
import { EntitlementsService, isTollFree } from './entitlements.service';
import { MetersService } from './meters.service';
import { SubscriptionService } from './subscription.service';
import { UsageStripeHelper } from './usage-stripe.helper';
import { KIND_TO_OPERATION } from './usage.constants';
import { usageWindow, Window } from './usage-period.util';

const STORAGE_TTL_MS = 10 * 60 * 1000;

export type CommPeriod = 'current' | 'previous' | 'last30' | 'custom';

/**
 * Read models for the Usage & Limits and Account screens. Every number comes from a real row:
 * the entitlement set, the credit ledger, `usage_events`, `messages`, phone calls, purchases.
 */
@Injectable()
export class UsageReadService {
  private storageCache = new Map<
    string,
    {
      at: number;
      value: {
        bytes: number;
        objects: number;
        truncated: boolean;
        areas: { area: string; bytes: number; objects: number }[];
      };
    }
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly entitlements: EntitlementsService,
    private readonly meters: MetersService,
    private readonly subscriptions: SubscriptionService,
    private readonly stripeHelper: UsageStripeHelper,
    @Optional() private readonly s3?: S3Service,
  ) {}

  private async storage(rootId: string) {
    const hit = this.storageCache.get(rootId);
    if (hit && Date.now() - hit.at < STORAGE_TTL_MS) return hit.value;
    if (!this.s3) return null;
    try {
      const ids = await this.entitlements.groupIds(rootId);
      const totals = {
        bytes: 0,
        objects: 0,
        truncated: false,
        areas: [] as { area: string; bytes: number; objects: number }[],
      };
      for (const id of ids) {
        const u = await this.s3.usageForBusiness(id);
        totals.bytes += u.bytes;
        totals.objects += u.objects;
        totals.truncated = totals.truncated || u.truncated;
        for (const a of u.areas) {
          const ex = totals.areas.find((x) => x.area === a.area);
          if (ex) {
            ex.bytes += a.bytes;
            ex.objects += a.objects;
          } else totals.areas.push({ ...a });
        }
      }
      this.storageCache.set(rootId, { at: Date.now(), value: totals });
      return totals;
    } catch {
      return null;
    }
  }

  private async providers(rootId: string) {
    const wa = await this.prisma.integration.findUnique({
      where: {
        businessId_provider: {
          businessId: rootId,
          provider: IntegrationProvider.whatsapp,
        },
      },
    });
    const waMeta = (wa?.meta ?? {}) as Record<string, unknown>;
    return {
      stripe: this.stripeHelper.configured,
      email: !!(
        this.config.get<string>('EMAIL_PROVIDER_KEY') &&
        this.config.get<string>('EMAIL_FROM_ADDRESS')
      ),
      emailFrom: this.config.get<string>('EMAIL_FROM_ADDRESS') ?? null,
      sms: !!(
        this.config.get<string>('TWILIO_ACCOUNT_SID') &&
        this.config.get<string>('TWILIO_AUTH_TOKEN') &&
        this.config.get<string>('TWILIO_FROM_NUMBER')
      ),
      voice: !!(
        this.config.get<string>('TWILIO_ACCOUNT_SID') &&
        this.config.get<string>('TWILIO_AUTH_TOKEN')
      ),
      whatsapp:
        !!wa && wa.status === IntegrationStatus.connected && !wa.pausedAt,
      whatsappNumber:
        typeof waMeta.displayPhoneNumber === 'string'
          ? waMeta.displayPhoneNumber
          : typeof waMeta.phoneNumber === 'string'
            ? waMeta.phoneNumber
            : null,
    };
  }

  async overview(businessId: string) {
    const rootId = await this.entitlements.rootId(businessId);
    const set = await this.entitlements.resolve(rootId);
    const ids = await this.entitlements.groupIds(rootId);
    const [
      catalog,
      prices,
      purchases,
      members,
      locations,
      numbers,
      agents,
      storage,
      providers,
      byFeature,
      cards,
    ] = await Promise.all([
      this.subscriptions.catalog(rootId),
      this.meters.prices(),
      this.prisma.capacityPurchase.findMany({
        where: { businessId: rootId },
        orderBy: { createdAt: 'desc' },
        take: 30,
      }),
      this.prisma.businessUser.findMany({
        where: { businessId: { in: ids } },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              _count: { select: { sessions: true } },
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      }),
      this.prisma.business.findMany({
        where: { OR: [{ id: rootId }, { parentId: rootId }] },
        select: { id: true, name: true, active: true, parentId: true },
        orderBy: { createdAt: 'asc' },
      }),
      this.entitlements.numberCounts(rootId),
      this.prisma.voiceHumanAgentProfile.findMany({
        where: { businessId: { in: ids } },
        include: {
          staffUser: { include: { user: { select: { name: true } } } },
        },
      }),
      this.storage(rootId),
      this.providers(rootId),
      this.creditsByFeature(rootId, set.usagePeriod),
      this.prisma.platformPaymentMethod.count({
        where: { businessId: rootId, isDefault: true },
      }),
    ]);
    const seen = new Set<string>();
    const people = members
      .filter((m) => (seen.has(m.userId) ? false : (seen.add(m.userId), true)))
      .map((m) => ({
        id: m.id,
        userId: m.userId,
        name: m.user.name,
        email: m.user.email ?? m.user.phone ?? '',
        role: m.role,
        active: m.active,
        pending: m.active && m.user._count.sessions === 0,
      }));
    return {
      set,
      catalog,
      prices,
      purchases: purchases.map((p) => ({
        ...p,
        unitPriceUsd: Number(p.unitPriceUsd),
      })),
      people,
      locations: locations.map((l) => ({
        id: l.id,
        name: l.name,
        active: l.active,
        isRoot: !l.parentId,
      })),
      numbers: numbers.numbers,
      agentSeats: agents.map((a) => ({
        id: a.id,
        name: a.staffUser.user.name,
        active: a.active,
      })),
      storage,
      providers,
      byFeature,
      hasDefaultCard: cards > 0,
    };
  }

  async creditsByFeature(
    rootId: string,
    period: { start: string; end: string },
  ) {
    const rows = await this.prisma.creditLedger.groupBy({
      by: ['operationCode'],
      where: {
        businessId: rootId,
        state: 'committed',
        reservedAt: { gte: new Date(period.start), lt: new Date(period.end) },
      },
      _count: { _all: true },
      _sum: { actualQty: true },
    });
    const ops = new Map(
      Object.values(KIND_TO_OPERATION)
        .filter(Boolean)
        .map((o) => [o!.code, o!]),
    );
    return rows
      .map((r) => ({
        operationCode: r.operationCode,
        label: ops.get(r.operationCode)?.label ?? r.operationCode,
        module: ops.get(r.operationCode)?.module ?? 'Other',
        operations: r._count._all,
        credits: r._sum.actualQty ?? 0,
      }))
      .sort((a, b) => b.credits - a.credits);
  }

  async recentReservations(businessId: string) {
    const rootId = await this.entitlements.rootId(businessId);
    const ops = new Map(
      Object.values(KIND_TO_OPERATION)
        .filter(Boolean)
        .map((o) => [o!.code, o!]),
    );
    const rows = await this.prisma.creditLedger.findMany({
      where: { businessId: rootId },
      orderBy: { reservedAt: 'desc' },
      take: 8,
    });
    return rows.map((r) => ({
      id: r.id,
      operation: ops.get(r.operationCode)?.label ?? r.operationCode,
      module: ops.get(r.operationCode)?.module ?? 'Other',
      reserved: r.reservedQty,
      actual: r.actualQty,
      state: r.state,
      bucket: r.bucket,
      reason: r.reason,
      reservedAt: r.reservedAt,
      settledAt: r.settledAt,
    }));
  }

  private commWindow(
    sub: Parameters<typeof usageWindow>[0],
    period: CommPeriod,
    from?: string,
    to?: string,
  ): Window {
    const now = new Date();
    const cur = usageWindow(sub, now);
    if (period === 'previous') {
      const prevEnd = cur.start;
      const prev = usageWindow(
        { ...sub, status: 'active' },
        new Date(prevEnd.getTime() - 1),
      );
      return { start: prev.start, end: prevEnd };
    }
    if (period === 'last30')
      return { start: new Date(now.getTime() - 30 * 86_400_000), end: now };
    if (period === 'custom' && from && to) {
      const s = new Date(`${from}T00:00:00.000Z`);
      const e = new Date(`${to}T00:00:00.000Z`);
      if (!Number.isNaN(s.getTime()) && !Number.isNaN(e.getTime()) && e >= s)
        return { start: s, end: new Date(e.getTime() + 86_400_000) };
    }
    return cur;
  }

  async communication(
    businessId: string,
    period: CommPeriod,
    from?: string,
    to?: string,
  ) {
    const rootId = await this.entitlements.rootId(businessId);
    const sub = await this.entitlements.ensureSubscription(rootId);
    const ids = await this.entitlements.groupIds(rootId);
    const win = this.commWindow(sub, period, from, to);
    const inWindow = { gte: win.start, lt: win.end };
    const [statusRows, events, incoming, providers, caps] = await Promise.all([
      this.prisma.message.groupBy({
        by: ['channel', 'status', 'category'],
        where: { businessId: { in: ids }, createdAt: inWindow },
        _count: { _all: true },
      }),
      this.prisma.usageEvent.findMany({
        where: {
          businessId: rootId,
          metricCode: { in: ['sms_segments', 'emails', 'whatsapp_messages'] },
          occurredAt: inWindow,
        },
        orderBy: { occurredAt: 'desc' },
        take: 500,
      }),
      this.prisma.inboxMessage.groupBy({
        by: ['conversationId'],
        where: {
          businessId: { in: ids },
          kind: 'in',
          createdAt: inWindow,
          conversation: { channel: { in: ['sms', 'whatsapp'] } },
        },
        _count: { _all: true },
      }),
      this.providers(rootId),
      this.entitlements.spendCaps(rootId, usageWindow(sub, new Date())),
    ]);
    const convChannels = incoming.length
      ? await this.prisma.inboxConversation.findMany({
          where: { id: { in: incoming.map((i) => i.conversationId) } },
          select: { id: true, channel: true },
        })
      : [];
    const incomingBy = (ch: string) =>
      incoming
        .filter(
          (i) =>
            convChannels.find((c) => c.id === i.conversationId)?.channel === ch,
        )
        .reduce((a, i) => a + i._count._all, 0);
    const count = (ch: string, statuses?: string[], category?: string) =>
      statusRows
        .filter(
          (r) =>
            r.channel === ch &&
            (!statuses || statuses.includes(r.status)) &&
            (!category || r.category === category),
        )
        .reduce((a, r) => a + r._count._all, 0);
    const sum = (metric: string, field: 'quantity' | 'priceUsd') =>
      events
        .filter((e) => e.metricCode === metric && e.status === 'completed')
        .reduce((a, e) => a + Number(e[field] ?? 0), 0);
    const countries = new Map<
      string,
      { sent: number; billable: number; charge: number }
    >();
    for (const e of events.filter(
      (x) => x.metricCode === 'sms_segments' && x.status === 'completed',
    )) {
      const k = e.countryCode ?? '—';
      const c = countries.get(k) ?? { sent: 0, billable: 0, charge: 0 };
      c.sent += 1;
      c.billable += Number(e.quantity);
      c.charge += Number(e.priceUsd ?? 0);
      countries.set(k, c);
    }
    const channel = (ch: 'email' | 'sms' | 'whatsapp') => ({
      sent: count(ch, ['sent', 'delivered', 'read', 'failed']),
      queued: count(ch, ['queued']),
      delivered: count(ch, ['delivered', 'read']),
      accepted: count(ch, ['sent']),
      failed: count(ch, ['failed']),
      marketing: count(ch, undefined, 'marketing'),
      utility: count(ch, undefined, 'utility'),
    });
    return {
      window: { start: win.start.toISOString(), end: win.end.toISOString() },
      providers,
      spendCap: caps.messaging,
      email: {
        ...channel('email'),
        billable: sum('emails', 'quantity'),
        charge: sum('emails', 'priceUsd'),
      },
      sms: {
        ...channel('sms'),
        incoming: incomingBy('sms'),
        segments: sum('sms_segments', 'quantity'),
        charge: sum('sms_segments', 'priceUsd'),
        byCountry: [...countries.entries()].map(([iso, v]) => ({ iso, ...v })),
      },
      whatsapp: {
        ...channel('whatsapp'),
        incoming: incomingBy('whatsapp'),
        billable: 0,
        charge: 0,
      },
      history: events.slice(0, 200).map((e) => ({
        id: e.id,
        at: e.occurredAt,
        channel:
          e.metricCode === 'sms_segments'
            ? 'SMS'
            : e.metricCode === 'emails'
              ? 'Emails'
              : 'WhatsApp',
        countryCode: e.countryCode,
        type: (e.operationCode ?? '').replace('message.', ''),
        quantity: Number(e.quantity),
        unit: e.unit,
        priceUsd: e.priceUsd == null ? null : Number(e.priceUsd),
        status: e.status,
      })),
    };
  }

  async voice(businessId: string) {
    const rootId = await this.entitlements.rootId(businessId);
    const set = await this.entitlements.resolve(rootId);
    const ids = await this.entitlements.groupIds(rootId);
    const win = {
      start: new Date(set.usagePeriod.start),
      end: new Date(set.usagePeriod.end),
    };
    const [calls, events, numbers, agents, cap, holds, prices] =
      await Promise.all([
        this.prisma.phoneCall.findMany({
          where: {
            businessId: { in: ids },
            startedAt: { gte: win.start, lt: win.end },
          },
          orderBy: { startedAt: 'desc' },
          take: 200,
          select: {
            id: true,
            callSid: true,
            direction: true,
            fromNumber: true,
            startedAt: true,
            endedAt: true,
            joinedAt: true,
            status: true,
            voiceAgentVersionId: true,
            quotaRejectedAt: true,
            quotaRejectedReason: true,
            isTestCall: true,
            joinedByUserId: true,
          },
        }),
        this.prisma.usageEvent.findMany({
          where: {
            businessId: rootId,
            metricCode: {
              in: [
                'ai_voice_minutes',
                'voice_minutes',
                'speech_analysis_minutes',
              ],
            },
            occurredAt: { gte: win.start, lt: win.end },
          },
        }),
        this.entitlements.numberCounts(rootId),
        this.prisma.voiceHumanAgentProfile.findMany({
          where: { businessId: { in: ids } },
          include: {
            staffUser: { include: { user: { select: { name: true } } } },
          },
        }),
        this.prisma.usageSpendCap.findUnique({
          where: {
            businessId_capGroup: { businessId: rootId, capGroup: 'voice' },
          },
        }),
        this.prisma.spendHold.findMany({
          where: { businessId: rootId, capGroup: 'voice' },
          orderBy: { createdAt: 'desc' },
          take: 6,
        }),
        this.meters.prices(),
      ]);
    const auditReasons = await this.prisma.auditLog.findMany({
      where: {
        businessId: { in: ids },
        action: 'voice.agent.admission_deferred',
        createdAt: { gte: win.start },
      },
      orderBy: { createdAt: 'desc' },
      take: 6,
      select: { entityId: true, after: true, createdAt: true },
    });
    const byCall = new Map<
      string,
      { ai?: (typeof events)[number]; human?: (typeof events)[number] }
    >();
    for (const e of events) {
      const ref = e.providerRef ?? '';
      const entry = byCall.get(ref) ?? {};
      if (e.metricCode === 'ai_voice_minutes') entry.ai = e;
      if (e.metricCode === 'voice_minutes') entry.human = e;
      byCall.set(ref, entry);
    }
    const minutes = (a: Date, b: Date | null) =>
      b ? Math.max(0, (b.getTime() - a.getTime()) / 60000) : 0;
    return {
      set,
      prices: prices.filter((p) =>
        [
          'ai_voice_minutes',
          'voice_minutes',
          'speech_analysis_minutes',
          'phone_numbers_local',
          'phone_numbers_tollfree',
          'agent_seats',
        ].includes(p.metricCode),
      ),
      receptionist: set.features.ai_phone_receptionist ?? null,
      spendCap: set.spendCaps.voice,
      maxCallMinutes: cap?.maxCallMinutes ?? 10,
      numbers: numbers.numbers.map((n) => ({
        ...n,
        tollfree: isTollFree(n.number),
      })),
      agentSeats: agents.map((a) => ({
        id: a.id,
        name: a.staffUser.user.name,
        active: a.active,
      })),
      calls: calls.map((c) => {
        const ev = byCall.get(c.callSid) ?? {};
        return {
          id: c.id,
          callSid: c.callSid,
          direction: c.direction,
          from: c.fromNumber,
          startedAt: c.startedAt,
          status: c.status,
          isTestCall: c.isTestCall,
          handledBy: c.voiceAgentVersionId
            ? c.joinedAt
              ? 'AI Receptionist → human'
              : 'AI Receptionist'
            : c.joinedAt || c.joinedByUserId
              ? 'Human'
              : c.quotaRejectedAt
                ? 'Not answered'
                : 'Phone system',
          durationMin: Math.round(minutes(c.startedAt, c.endedAt) * 100) / 100,
          aiBillableMin: ev.ai ? Number(ev.ai.quantity) : 0,
          aiChargeUsd: ev.ai ? Number(ev.ai.priceUsd ?? 0) : 0,
          humanBillableMin: ev.human ? Number(ev.human.quantity) : 0,
          humanChargeUsd: ev.human ? Number(ev.human.priceUsd ?? 0) : 0,
          humanRateMissing: ev.human?.status === 'refused',
          rejectedReason: c.quotaRejectedReason,
        };
      }),
      admissions: [
        ...holds.map((h) => ({
          at: h.createdAt,
          kind: 'hold',
          state: h.state,
          amountUsd: Number(h.amountUsd),
          actualUsd: h.actualUsd == null ? null : Number(h.actualUsd),
          reason: h.reason,
        })),
        ...auditReasons.map((a) => ({
          at: a.createdAt,
          kind: 'declined',
          state: 'declined',
          amountUsd: 0,
          actualUsd: null,
          reason: (() => {
            const r = (a.after as Record<string, unknown> | null)?.reason;
            return typeof r === 'string' ? r : '';
          })(),
        })),
      ]
        .sort((a, b) => b.at.getTime() - a.at.getTime())
        .slice(0, 8),
      // Speech quality analysis has a published price but no metering source in this codebase yet.
      speechAnalysisTracked: events.some(
        (e) => e.metricCode === 'speech_analysis_minutes',
      ),
    };
  }

  async history(
    businessId: string,
    q: {
      category?: string;
      status?: string;
      search?: string;
      cursor?: string;
      limit?: number;
    },
  ) {
    const rootId = await this.entitlements.rootId(businessId);
    const limit = Math.min(200, Math.max(1, q.limit ?? 50));
    const before = q.cursor ? new Date(q.cursor) : undefined;
    const cats: Record<string, string[]> = {
      'AI credits': ['ai_credits'],
      Communication: ['emails', 'sms_segments', 'whatsapp_messages'],
      'Voice & Calling': [
        'ai_voice_minutes',
        'voice_minutes',
        'speech_analysis_minutes',
      ],
    };
    const where: Prisma.UsageEventWhereInput = {
      businessId: rootId,
      ...(before ? { occurredAt: { lt: before } } : {}),
      ...(q.category && cats[q.category]
        ? { metricCode: { in: cats[q.category] } }
        : {}),
      ...(q.status ? { status: q.status } : {}),
    };
    const [events, audits, total] = await Promise.all([
      q.category === 'Settings'
        ? Promise.resolve<UsageEvent[]>([])
        : this.prisma.usageEvent.findMany({
            where,
            orderBy: { occurredAt: 'desc' },
            take: limit,
          }),
      q.category && q.category !== 'Settings'
        ? Promise.resolve<EntitlementAudit[]>([])
        : this.prisma.entitlementAudit.findMany({
            where: {
              businessId: rootId,
              ...(before ? { createdAt: { lt: before } } : {}),
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
          }),
      this.prisma.usageEvent.count({ where: { businessId: rootId } }),
    ]);
    const ops = new Map(
      Object.values(KIND_TO_OPERATION)
        .filter(Boolean)
        .map((o) => [o!.code, o!]),
    );
    const catOf = (metric: string) =>
      Object.entries(cats).find(([, ms]) => ms.includes(metric))?.[0] ??
      'Other';
    const rows = [
      ...events.map((e) => {
        const op = e.operationCode ? ops.get(e.operationCode) : undefined;
        const feature =
          op?.label ??
          (e.operationCode === 'allowance.allocated'
            ? 'Credit allowance'
            : e.operationCode === 'purchase.credits'
              ? 'Purchased credits'
              : e.operationCode
                ? e.operationCode.replace(/[._]/g, ' ')
                : e.metricCode);
        return {
          id: e.id,
          at: e.occurredAt,
          feature,
          module:
            op?.module ??
            (e.metricCode.includes('voice') || e.metricCode.includes('speech')
              ? 'AI Phone Receptionist'
              : e.metricCode === 'ai_credits'
                ? 'Billing'
                : 'Messaging'),
          category: catOf(e.metricCode),
          metric: e.metricCode,
          quantity: Number(e.quantity),
          unit: e.unit,
          priceUsd: e.priceUsd == null ? null : Number(e.priceUsd),
          status: e.status,
        };
      }),
      ...audits.map((a) => ({
        id: a.id,
        at: a.createdAt,
        feature: a.reason ?? a.changeType.replace(/_/g, ' '),
        module: 'Settings',
        category: 'Settings',
        metric: a.changeType,
        quantity: 0,
        unit: '',
        priceUsd: null,
        status: a.actorType === 'stripe' ? 'Confirmed by Stripe' : 'Completed',
        before: a.before,
        after: a.after,
      })),
    ]
      .filter(
        (r) =>
          !q.search ||
          `${r.feature} ${r.module}`
            .toLowerCase()
            .includes(q.search.toLowerCase()),
      )
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, limit);
    return {
      rows,
      total,
      nextCursor:
        rows.length === limit ? rows[rows.length - 1].at.toISOString() : null,
    };
  }

  async historyCsv(businessId: string): Promise<string> {
    const rows: Awaited<ReturnType<UsageReadService['history']>>['rows'] = [];
    let cursor: string | undefined;
    // Page through the whole log (bounded so one export can't run away).
    for (let i = 0; i < 100; i++) {
      const page = await this.history(businessId, { limit: 200, cursor });
      rows.push(...page.rows);
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    const esc = (v: string | number | null) =>
      `"${v == null ? '' : String(v).replace(/"/g, '""')}"`;
    return [
      [
        'Date (UTC)',
        'Feature',
        'Module',
        'Category',
        'Quantity',
        'Unit',
        'Charge (USD)',
        'Status',
      ]
        .map(esc)
        .join(','),
      ...rows.map((r) =>
        [
          r.at.toISOString(),
          r.feature,
          r.module,
          r.category,
          r.quantity,
          r.unit,
          r.priceUsd ?? '',
          r.status,
        ]
          .map(esc)
          .join(','),
      ),
    ].join('\n');
  }
}
