import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PhoneCallOutcome, PhoneCallStatus } from '@prisma/client';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { AiInfraService } from '../ai/ai-infra.service';
import { AuditService } from '../common/audit/audit.service';
import {
  CALL_DISCLOSURE_TEXT,
  MAX_CALL_TURNS,
  RECORDING_RETENTION_DAYS,
} from './voice.constants';
import {
  summariseCallAnalysis,
  TOPICS,
  type CallQuestion,
  type TopicKey,
  type TurnAnalysis,
} from './voice-analysis';

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_WINDOW_DAYS = 30;
const MAX_WINDOW_DAYS = 90;
const MAX_CALLS = 500;

const WEEKDAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

/**
 * Who dealt with the call, derived only from what the call record can prove:
 *  - `none`         — never answered (missed)
 *  - `human_joined` — a staff member was bridged live onto it (`joinedAt`)
 *  - `ai_to_human`  — the AI decided to transfer it to a person
 *  - `ai`           — the AI handled it start to finish
 */
export type HandledBy = 'none' | 'human_joined' | 'ai_to_human' | 'ai';

export interface CallTurn {
  speaker: 'caller' | 'assistant';
  text: string;
  at: string;
  recordingKey?: string;
  analysis?: TurnAnalysis;
}

/** `Business.workingHours` — `{ mon: [["09:00","17:00"]], … }`. An absent or empty day means closed. */
type WorkingHours = Record<string, [string, string][] | undefined>;

interface LocalParts {
  /** YYYY-MM-DD in the business's own timezone. */
  day: string;
  hour: number;
  minutes: number;
  weekday: (typeof WEEKDAY_KEYS)[number];
}

/** Pure — the date/time a call happened, as the business's own wall clock saw it. */
export function localParts(date: Date, timeZone: string): LocalParts {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      weekday: 'short',
    }).formatToParts(date);
  } catch {
    // An unrecognised timezone string falls back to UTC rather than failing the whole screen.
    return localParts(date, 'UTC');
  }
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const weekday = get('weekday').toLowerCase().slice(0, 3);
  return {
    day: `${get('year')}-${get('month')}-${get('day')}`,
    hour: Number(get('hour')) % 24,
    minutes: Number(get('minute')),
    weekday: (WEEKDAY_KEYS as readonly string[]).includes(weekday)
      ? (weekday as (typeof WEEKDAY_KEYS)[number])
      : 'mon',
  };
}

/**
 * Pure — was this moment outside the business's working hours? Returns `null` (never a guess)
 * when the business has no working hours configured at all.
 */
export function isAfterHours(
  parts: LocalParts,
  workingHours: WorkingHours | null | undefined,
): boolean | null {
  const hours = workingHours ?? {};
  const configured = Object.values(hours).some(
    (r) => Array.isArray(r) && r.length > 0,
  );
  if (!configured) return null;
  const ranges = hours[parts.weekday] ?? [];
  const at = parts.hour * 60 + parts.minutes;
  const within = ranges.some(([from, to]) => {
    const [fh, fm] = from.split(':').map(Number);
    const [th, tm] = to.split(':').map(Number);
    return at >= fh * 60 + fm && at < th * 60 + tm;
  });
  return !within;
}

export function handledBy(call: {
  status: PhoneCallStatus;
  outcome: PhoneCallOutcome;
  joinedAt: Date | null;
}): HandledBy {
  if (call.status === PhoneCallStatus.missed) return 'none';
  if (call.joinedAt) return 'human_joined';
  if (
    call.outcome === PhoneCallOutcome.transfer ||
    call.status === PhoneCallStatus.transferred
  ) {
    return 'ai_to_human';
  }
  return 'ai';
}

@Injectable()
export class VoiceInsightsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly config: ConfigService,
    private readonly aiInfra: AiInfraService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Everything the AI Phone screens need in one round trip: the last `days` days of calls, each
   * enriched with facts that can be PROVEN from your own records — the customer whose saved phone
   * number equals the caller's, how many times that number rang before, whether the call landed
   * outside your working hours — plus the number and the fixed behaviour limits.
   */
  async insights(businessId: string, days = DEFAULT_WINDOW_DAYS) {
    const windowDays = Math.min(
      Math.max(Math.floor(days) || DEFAULT_WINDOW_DAYS, 1),
      MAX_WINDOW_DAYS,
    );
    const since = new Date(Date.now() - windowDays * DAY_MS);

    const [business, number, voiceSettings, calls, noteCounts] =
      await Promise.all([
        this.tenantPrisma.client.business.findUnique({
          where: { id: businessId },
          select: { name: true, timezone: true, workingHours: true },
        }),
        this.tenantPrisma.client.phoneNumber.findUnique({
          where: { businessId },
        }),
        this.tenantPrisma.client.voiceSettings.findUnique({
          where: { businessId },
          select: { transferNumber: true },
        }),
        this.tenantPrisma.client.phoneCall.findMany({
          where: { startedAt: { gte: since } },
          orderBy: { startedAt: 'desc' },
          take: MAX_CALLS,
          include: {
            appointment: {
              include: {
                service: { select: { name: true } },
                staffUser: { select: { user: { select: { name: true } } } },
                customer: { select: { name: true } },
              },
            },
          },
        }),
        this.tenantPrisma.client.phoneCallNote.groupBy({
          by: ['callId'],
          _count: { _all: true },
        }),
      ]);
    const noteCountByCallId = new Map(
      noteCounts.map((n) => [n.callId, n._count._all]),
    );
    const timezone = business?.timezone ?? 'UTC';
    const hours = (business?.workingHours ?? {}) as WorkingHours;

    const numbers = [...new Set(calls.map((c) => c.fromNumber))];
    const [customers, history, staff, joiners] = await Promise.all([
      numbers.length
        ? this.tenantPrisma.client.customer.findMany({
            where: { phone: { in: numbers } },
            select: { id: true, name: true, phone: true },
          })
        : Promise.resolve([]),
      numbers.length
        ? this.tenantPrisma.client.phoneCall.findMany({
            where: { fromNumber: { in: numbers } },
            select: { id: true, fromNumber: true, startedAt: true },
            orderBy: { startedAt: 'asc' },
          })
        : Promise.resolve([]),
      // Two id spaces: a follow-up owner is a BusinessUser id, but whoever joined a live call is the
      // signed-in User id (the auth token's `sub`).
      this.staffNames(
        calls.map((c) => c.assignedToUserId).filter((x): x is string => !!x),
      ),
      this.staffUserNames(
        calls.map((c) => c.joinedByUserId).filter((x): x is string => !!x),
      ),
    ]);
    const customerByPhone = new Map<string, { id: string; name: string }>();
    for (const c of customers)
      customerByPhone.set(c.phone, { id: c.id, name: c.name });
    const priorCounts = new Map<string, number>();
    const earlier = new Map<string, number>(); // callId → calls from that number before it
    for (const h of history) {
      const seen = priorCounts.get(h.fromNumber) ?? 0;
      earlier.set(h.id, seen);
      priorCounts.set(h.fromNumber, seen + 1);
    }

    const enriched = calls.map((c) => {
      const parts = localParts(c.startedAt, timezone);
      const customer = customerByPhone.get(c.fromNumber);
      const transcript = (c.transcript as unknown as CallTurn[]) ?? [];
      return {
        id: c.id,
        callSid: c.callSid,
        fromNumber: c.fromNumber,
        status: c.status,
        outcome: c.outcome,
        customIntentName: c.customIntentName,
        handledBy: handledBy(c),
        startedAt: c.startedAt.toISOString(),
        endedAt: c.endedAt ? c.endedAt.toISOString() : null,
        durationSeconds: c.endedAt
          ? Math.max(
              0,
              Math.round((c.endedAt.getTime() - c.startedAt.getTime()) / 1000),
            )
          : null,
        localDay: parts.day,
        localHour: parts.hour,
        afterHours: isAfterHours(parts, hours),
        hasRecording: !!c.recordingKey,
        recordingDeletedAt: c.recordingDeletedAt
          ? c.recordingDeletedAt.toISOString()
          : null,
        transcript,
        analysis: summariseCallAnalysis(transcript),
        callerName: c.callerName,
        callerEmail: c.callerEmail,
        customer: customer ? { id: customer.id, name: customer.name } : null,
        previousCalls: earlier.get(c.id) ?? 0,
        resolvedAt: c.resolvedAt ? c.resolvedAt.toISOString() : null,
        callbackRequestedAt: c.callbackRequestedAt
          ? c.callbackRequestedAt.toISOString()
          : null,
        joinedAt: c.joinedAt ? c.joinedAt.toISOString() : null,
        joinedByUserId: c.joinedByUserId,
        joinedByName: c.joinedByUserId
          ? (joiners.get(c.joinedByUserId) ?? null)
          : null,
        assignedToUserId: c.assignedToUserId,
        assignedToName: c.assignedToUserId
          ? (staff.get(c.assignedToUserId) ?? null)
          : null,
        summary: c.summary,
        summaryGeneratedAt: c.summaryGeneratedAt
          ? c.summaryGeneratedAt.toISOString()
          : null,
        routedRuleId: c.routedRuleId,
        routedRuleName: c.routedRuleName,
        providerCost: c.providerCost != null ? Number(c.providerCost) : null,
        providerCostUnit: c.providerCostUnit,
        providerCostCheckedAt: c.providerCostCheckedAt
          ? c.providerCostCheckedAt.toISOString()
          : null,
        noteCount: noteCountByCallId.get(c.id) ?? 0,
        appointment: c.appointment
          ? {
              id: c.appointment.id,
              bookingNo: c.appointment.bookingNo,
              startsAt: c.appointment.startsAt.toISOString(),
              endsAt: c.appointment.endsAt.toISOString(),
              status: c.appointment.status,
              depositPaid: Number(c.appointment.depositPaid),
              serviceName: c.appointment.service.name,
              staffName: c.appointment.staffUser?.user?.name ?? null,
              customerName: c.appointment.customer.name,
              customerId: c.appointment.customerId,
            }
          : null,
      };
    });

    return {
      windowDays,
      timezone,
      /** Today's date on the business's own clock — every "today" figure on screen keys off this. */
      today: localParts(new Date(), timezone).day,
      workingHoursConfigured: Object.values(hours).some(
        (r) => Array.isArray(r) && r.length > 0,
      ),
      businessName: business?.name ?? null,
      number: number
        ? {
            id: number.id,
            phoneNumber: number.phoneNumber,
            provisionedAt: number.provisionedAt.toISOString(),
          }
        : null,
      /** A business transfer number, or `VOICE_TRANSFER_NUMBER` — without either, a "transfer" falls back to taking a message. */
      transferConfigured: !!(
        voiceSettings?.transferNumber ||
        this.config.get<string>('VOICE_TRANSFER_NUMBER')
      ),
      limits: {
        maxCallTurns: MAX_CALL_TURNS,
        retentionDays: RECORDING_RETENTION_DAYS,
        disclosure: CALL_DISCLOSURE_TEXT,
      },
      calls: enriched,
    };
  }

  /**
   * Knowledge/Quality screens' "question clusters" — every factual question the AI recorded a
   * topic for, grouped by that fixed topic (never by free-text similarity, which would risk
   * inventing groupings the data doesn't really support). Each row is real: `asked` counts turns
   * the AI itself tagged with that topic; `declined` counts the ones it itself said it couldn't
   * answer; `sampleQuestion` is a caller's own verbatim words, not a synthesised one.
   */
  async questionClusters(businessId: string, days = DEFAULT_WINDOW_DAYS) {
    // Tenant-scoped via CLS through TenantPrismaService — businessId kept for call-site symmetry
    // with insights()/context()/assign(), same convention as this class' other reads.
    void businessId;
    const windowDays = Math.min(
      Math.max(Math.floor(days) || DEFAULT_WINDOW_DAYS, 1),
      MAX_WINDOW_DAYS,
    );
    const since = new Date(Date.now() - windowDays * DAY_MS);
    const calls = await this.tenantPrisma.client.phoneCall.findMany({
      where: { startedAt: { gte: since } },
      select: { transcript: true },
      take: MAX_CALLS,
    });

    const byTopic = new Map<TopicKey, CallQuestion[]>();
    for (const c of calls) {
      const transcript = (c.transcript as unknown as CallTurn[]) ?? [];
      const { questions } = summariseCallAnalysis(transcript);
      for (const q of questions) {
        const list = byTopic.get(q.topic) ?? [];
        list.push(q);
        byTopic.set(q.topic, list);
      }
    }

    return [...byTopic.entries()]
      .map(([topic, questions]) => {
        const declined = questions.filter((q) => q.answered === false);
        const latest = [...questions].sort((a, b) =>
          b.at.localeCompare(a.at),
        )[0];
        return {
          topic,
          label: TOPICS[topic],
          asked: questions.length,
          answered: questions.filter((q) => q.answered === true).length,
          declined: declined.length,
          sampleQuestion: latest?.text || null,
          lastAskedAt: latest?.at ?? null,
        };
      })
      .sort((a, b) => b.asked - a.asked);
  }

  /** One call's supporting records — the matched customer, their upcoming bookings, earlier calls from the same number. */
  async context(businessId: string, id: string) {
    const call = await this.tenantPrisma.client.phoneCall.findUnique({
      where: { id },
    });
    if (!call) throw new NotFoundException('Call not found');

    const customer = await this.tenantPrisma.client.customer.findFirst({
      where: { phone: call.fromNumber },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        visitCount: true,
        lifetimeSpend: true,
        lastVisitAt: true,
      },
    });
    const [upcoming, previous] = await Promise.all([
      customer
        ? this.tenantPrisma.client.appointment.count({
            where: {
              customerId: customer.id,
              startsAt: { gte: new Date() },
              status: { in: ['requested', 'booked', 'confirmed'] },
            },
          })
        : Promise.resolve(0),
      this.tenantPrisma.client.phoneCall.findMany({
        where: {
          fromNumber: call.fromNumber,
          startedAt: { lt: call.startedAt },
        },
        orderBy: { startedAt: 'desc' },
        take: 5,
        select: { id: true, startedAt: true, status: true, outcome: true },
      }),
    ]);
    const previousTotal = await this.tenantPrisma.client.phoneCall.count({
      where: { fromNumber: call.fromNumber, startedAt: { lt: call.startedAt } },
    });
    const [notes, auditRows] = await Promise.all([
      this.tenantPrisma.client.phoneCallNote.findMany({
        where: { callId: id },
        orderBy: { createdAt: 'asc' },
      }),
      this.audit.list(businessId, {
        entity: 'PhoneCall',
        entityId: id,
        pageSize: 50,
      }),
    ]);
    const noteAuthors = await this.staffUserNames(
      notes.map((n) => n.authorUserId).filter((x): x is string => !!x),
    );

    return {
      customer: customer
        ? {
            id: customer.id,
            name: customer.name,
            email: customer.email,
            since: customer.createdAt.toISOString(),
            visitCount: customer.visitCount,
            lifetimeSpend: Number(customer.lifetimeSpend),
            lastVisitAt: customer.lastVisitAt
              ? customer.lastVisitAt.toISOString()
              : null,
            upcomingAppointments: upcoming,
          }
        : null,
      previousCalls: previous.map((p) => ({
        id: p.id,
        startedAt: p.startedAt.toISOString(),
        status: p.status,
        outcome: p.outcome,
      })),
      previousCallsTotal: previousTotal,
      notes: notes.map((n) => ({
        id: n.id,
        body: n.body,
        createdAt: n.createdAt.toISOString(),
        authorName: n.authorUserId
          ? (noteAuthors.get(n.authorUserId) ?? null)
          : null,
      })),
      audit: auditRows.rows.map((r) => ({
        id: r.id,
        action: r.action,
        actorName: r.actorName,
        at: r.createdAt.toISOString(),
      })),
    };
  }

  /** Give the follow-up for a call an owner — or clear it with `null`. Only an active member of this business can own it. */
  async assign(businessId: string, id: string, userId: string | null) {
    const call = await this.tenantPrisma.client.phoneCall.findUnique({
      where: { id },
    });
    if (!call) throw new NotFoundException('Call not found');
    if (userId) {
      const member = await this.tenantPrisma.client.businessUser.findUnique({
        where: { id: userId },
      });
      if (!member || member.businessId !== businessId || !member.active) {
        throw new AppException(
          'VOICE_ASSIGNEE_INVALID',
          'That person is not an active member of this business',
          HttpStatus.BAD_REQUEST,
        );
      }
    }
    await this.tenantPrisma.client.phoneCall.update({
      where: { id },
      data: { assignedToUserId: userId },
    });
    await this.audit.log({
      entity: 'PhoneCall',
      entityId: id,
      action: 'call.assigned',
      before: { assignedToUserId: call.assignedToUserId },
      after: { assignedToUserId: userId },
    });
    return { id, assignedToUserId: userId };
  }

  /**
   * A short summary written from the transcript alone, generated only when someone asks and cached
   * on the call. It is told to add nothing that isn't in the transcript. If the AI provider is not
   * configured the call simply has no summary — nothing is invented in its place.
   */
  async generateSummary(businessId: string, id: string) {
    const call = await this.tenantPrisma.client.phoneCall.findUnique({
      where: { id },
    });
    if (!call) throw new NotFoundException('Call not found');
    const turns = (call.transcript as unknown as CallTurn[]) ?? [];
    if (turns.length === 0) {
      throw new AppException(
        'VOICE_NO_TRANSCRIPT',
        'This call has no transcript to summarise',
        HttpStatus.BAD_REQUEST,
      );
    }

    const conversation = turns
      .map(
        (t) =>
          `${t.speaker === 'caller' ? 'Caller' : 'Receptionist'}: ${t.text}`,
      )
      .join('\n');
    const raw = await this.aiInfra.complete(
      businessId,
      [
        "Summarise this phone call between a business's automated receptionist and a caller in two or three plain sentences.",
        "Use ONLY what is written in the transcript below. Do not add names, prices, times, promises or reasons that are not stated. If the caller's request was unclear, say that it was unclear.",
        'Reply with the summary text only.',
        '',
        conversation,
      ].join('\n'),
    );
    const summary = raw.trim();
    if (!summary) {
      throw new AppException(
        'VOICE_SUMMARY_EMPTY',
        'The AI returned an empty summary',
        HttpStatus.BAD_GATEWAY,
      );
    }
    const now = new Date();
    await this.tenantPrisma.client.phoneCall.update({
      where: { id },
      data: { summary, summaryGeneratedAt: now },
    });
    await this.audit.log({
      entity: 'PhoneCall',
      entityId: id,
      action: 'call.summary_generated',
    });
    return { id, summary, summaryGeneratedAt: now.toISOString() };
  }

  /** `User.id` → name (audit/note authors are user ids, unlike assignees, which are BusinessUser ids). */
  private async staffUserNames(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const users = await this.tenantPrisma.client.user.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, name: true },
    });
    return new Map(users.map((u) => [u.id, u.name]));
  }

  private async staffNames(ids: string[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const members = await this.tenantPrisma.client.businessUser.findMany({
      where: { id: { in: [...new Set(ids)] } },
      select: { id: true, user: { select: { name: true } } },
    });
    return new Map(members.map((m) => [m.id, m.user.name]));
  }
}
