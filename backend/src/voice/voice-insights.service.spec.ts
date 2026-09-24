import { ClsService } from 'nestjs-cls';
import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { AppException } from '../common/filters/app.exception';
import type { AiInfraService } from '../ai/ai-infra.service';
import {
  VoiceInsightsService,
  handledBy,
  isAfterHours,
  localParts,
} from './voice-insights.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

const KARACHI = 'Asia/Karachi'; // UTC+5, no DST — keeps the expected local times stable.
const WEEK_HOURS = Object.fromEntries(
  ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [
    d,
    [['09:00', '17:00']],
  ]),
);

describe('AI Phone insights — pure helpers', () => {
  it('reads a call time on the business clock, not the server clock', () => {
    // 21:30 UTC is 02:30 the NEXT day in Karachi.
    const parts = localParts(new Date('2026-09-22T21:30:00.000Z'), KARACHI);
    expect(parts.day).toBe('2026-09-23');
    expect(parts.hour).toBe(2);
    expect(parts.weekday).toBe('wed');
  });

  it('flags after-hours only against the configured hours, and returns null when none are configured', () => {
    const noon = localParts(new Date('2026-09-23T07:00:00.000Z'), KARACHI); // 12:00
    const night = localParts(new Date('2026-09-22T21:30:00.000Z'), KARACHI); // 02:30
    expect(isAfterHours(noon, WEEK_HOURS as never)).toBe(false);
    expect(isAfterHours(night, WEEK_HOURS as never)).toBe(true);
    expect(isAfterHours(noon, {})).toBeNull();
    expect(isAfterHours(noon, null)).toBeNull();
  });

  it('derives who handled a call only from what the record proves', () => {
    const base = {
      status: 'completed',
      outcome: 'none',
      joinedAt: null,
    } as const;
    expect(handledBy({ ...base, status: 'missed' })).toBe('none');
    expect(handledBy({ ...base, joinedAt: new Date() })).toBe('human_joined');
    expect(handledBy({ ...base, outcome: 'transfer' })).toBe('ai_to_human');
    expect(handledBy({ ...base, status: 'transferred' })).toBe('ai_to_human');
    expect(handledBy(base)).toBe('ai');
  });
});

describe('VoiceInsightsService (real DB)', () => {
  let prisma: PrismaService;
  let service: VoiceInsightsService;
  let businessId: string;
  let otherBusinessId: string;
  let staffId: string;
  let otherStaffId: string;
  const userIds: string[] = [];
  let customerId: string;
  let matchedCallId: string;
  let repeatCallId: string;
  let missedCallId: string;
  const ai = { complete: jest.fn() };
  const config = { get: jest.fn() };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new VoiceInsightsService(
      tenantPrisma,
      config as never,
      ai as unknown as AiInfraService,
      new AuditService(tenantPrisma, cls as unknown as ClsService),
    );

    const stamp = Date.now();
    businessId = (
      await prisma.business.create({
        data: {
          name: 'Insights Salon',
          slug: `voice-insights-${stamp}`,
          timezone: KARACHI,
          workingHours: WEEK_HOURS,
        },
      })
    ).id;
    otherBusinessId = (
      await prisma.business.create({
        data: { name: 'Other Salon', slug: `voice-insights-other-${stamp}` },
      })
    ).id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const mkStaff = async (biz: string, name: string) => {
      const user = await prisma.user.create({
        data: {
          name,
          email: `${name.replace(/\s/g, '').toLowerCase()}-${stamp}@example.com`,
          passwordHash: 'hash',
        },
      });
      userIds.push(user.id);
      return (
        await prisma.businessUser.create({
          data: { businessId: biz, userId: user.id, role: 'staff' },
        })
      ).id;
    };
    staffId = await mkStaff(businessId, 'Sara Malik');
    otherStaffId = await mkStaff(otherBusinessId, 'Outsider Person');

    customerId = (
      await prisma.customer.create({
        data: {
          businessId,
          name: 'Ayesha Khan',
          phone: '+923001234567',
          visitCount: 6,
          lifetimeSpend: 148600,
        },
      })
    ).id;

    const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000);
    // An earlier call from the same number, so the later one is a repeat.
    await prisma.phoneCall.create({
      data: {
        businessId,
        callSid: `CA-early-${stamp}`,
        fromNumber: '+923001234567',
        status: 'completed',
        outcome: 'none',
        startedAt: hoursAgo(30),
        endedAt: hoursAgo(30),
      },
    });
    matchedCallId = (
      await prisma.phoneCall.create({
        data: {
          businessId,
          callSid: `CA-match-${stamp}`,
          fromNumber: '+923001234567',
          status: 'completed',
          outcome: 'message',
          startedAt: hoursAgo(5),
          endedAt: new Date(hoursAgo(5).getTime() + 184_000),
          transcript: [
            {
              speaker: 'caller',
              text: 'Hi, can someone call me about my colour?',
              at: hoursAgo(5).toISOString(),
            },
            {
              speaker: 'assistant',
              text: 'Of course, I will pass that on.',
              at: hoursAgo(5).toISOString(),
            },
          ],
        },
      })
    ).id;
    repeatCallId = matchedCallId;
    // 21:30 UTC yesterday === 02:30 in Karachi → after hours.
    const night = new Date();
    night.setUTCHours(21, 30, 0, 0);
    if (night.getTime() > Date.now()) night.setUTCDate(night.getUTCDate() - 1);
    missedCallId = (
      await prisma.phoneCall.create({
        data: {
          businessId,
          callSid: `CA-missed-${stamp}`,
          fromNumber: '+923055550000',
          status: 'missed',
          outcome: 'none',
          startedAt: night,
        },
      })
    ).id;
  });

  beforeEach(() => {
    ai.complete.mockReset();
    config.get.mockReset();
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { businessId } });
    await prisma.phoneCall.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.businessUser.deleteMany({
      where: { businessId: { in: [businessId, otherBusinessId] } },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.business.deleteMany({
      where: { id: { in: [businessId, otherBusinessId] } },
    });
    await prisma.$disconnect();
  });

  it('matches a caller to a customer by phone number, counts repeat calls, and reads the number as unrecorded when there is none', async () => {
    config.get.mockReturnValue(undefined);
    const result = await service.insights(businessId, 30);

    const matched = result.calls.find((c) => c.id === matchedCallId)!;
    expect(matched.customer).toEqual({ id: customerId, name: 'Ayesha Khan' });
    expect(matched.previousCalls).toBe(1); // the earlier call
    expect(matched.durationSeconds).toBe(184);
    expect(matched.handledBy).toBe('ai');

    const missed = result.calls.find((c) => c.id === missedCallId)!;
    expect(missed.customer).toBeNull();
    expect(missed.previousCalls).toBe(0);
    expect(missed.handledBy).toBe('none');
    expect(missed.afterHours).toBe(true);
    expect(missed.durationSeconds).toBeNull();

    expect(result.timezone).toBe(KARACHI);
    expect(result.workingHoursConfigured).toBe(true);
    expect(result.number).toBeNull();
    expect(result.transferConfigured).toBe(false);
  });

  it('reports the transfer number as configured only when the environment provides one', async () => {
    config.get.mockReturnValue('+15550001111');
    expect((await service.insights(businessId)).transferConfigured).toBe(true);
  });

  it('also reports the transfer number as configured when the BUSINESS has set its own (AI Phone, full)', async () => {
    config.get.mockReturnValue(undefined);
    await prisma.voiceSettings.create({
      data: { businessId, transferNumber: '+15559991111' },
    });
    try {
      expect((await service.insights(businessId)).transferConfigured).toBe(
        true,
      );
    } finally {
      await prisma.voiceSettings.deleteMany({ where: { businessId } });
    }
  });

  it('never returns another business calls', async () => {
    await prisma.phoneCall.create({
      data: {
        businessId: otherBusinessId,
        callSid: `CA-other-${Date.now()}`,
        fromNumber: '+923009990000',
        status: 'completed',
        outcome: 'none',
      },
    });
    const result = await service.insights(businessId);
    expect(result.calls.some((c) => c.fromNumber === '+923009990000')).toBe(
      false,
    );
    await prisma.phoneCall.deleteMany({
      where: { businessId: otherBusinessId },
    });
  });

  it('returns the matched customer record and earlier calls for one call', async () => {
    const ctx = await service.context(businessId, repeatCallId);
    expect(ctx.customer?.name).toBe('Ayesha Khan');
    expect(ctx.customer?.visitCount).toBe(6);
    expect(ctx.customer?.lifetimeSpend).toBe(148600);
    expect(ctx.previousCallsTotal).toBe(1);

    const missedCtx = await service.context(businessId, missedCallId);
    expect(missedCtx.customer).toBeNull();
    await expect(service.context(businessId, 'nope')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('context() returns the call notes with real author names and the real audit trail', async () => {
    const call = await prisma.phoneCall.create({
      data: {
        businessId,
        callSid: `CA-ctx-${Date.now()}`,
        fromNumber: '+923077776666',
        status: 'completed',
        outcome: 'message',
      },
    });
    try {
      const authorUserId = userIds[0]; // Sara Malik's User id
      await prisma.phoneCallNote.create({
        data: {
          businessId,
          callId: call.id,
          authorUserId,
          body: 'Rang back, left a voicemail.',
        },
      });
      await service.assign(businessId, call.id, staffId);

      const ctx = await service.context(businessId, call.id);
      expect(ctx.notes).toHaveLength(1);
      expect(ctx.notes[0].body).toBe('Rang back, left a voicemail.');
      expect(ctx.notes[0].authorName).toBe('Sara Malik');
      expect(ctx.audit.map((a) => a.action)).toContain('call.assigned');
    } finally {
      await prisma.auditLog.deleteMany({ where: { entityId: call.id } });
      await prisma.phoneCall.delete({ where: { id: call.id } });
    }
  });

  it('names whoever joined a live call from the signed-in USER id, not a follow-up owner id', async () => {
    const call = await prisma.phoneCall.create({
      data: {
        businessId,
        callSid: `CA-join-${Date.now()}`,
        fromNumber: '+923066665555',
        status: 'completed',
        outcome: 'none',
        joinedAt: new Date(),
        joinedByUserId: userIds[0],
      },
    });
    try {
      const found = (await service.insights(businessId)).calls.find(
        (c) => c.id === call.id,
      )!;
      expect(found.joinedByName).toBe('Sara Malik');
    } finally {
      await prisma.phoneCall.delete({ where: { id: call.id } });
    }
  });

  it('assigns a follow-up only to an active member of this business, and can clear it', async () => {
    const assigned = await service.assign(businessId, missedCallId, staffId);
    expect(assigned.assignedToUserId).toBe(staffId);
    const listed = (await service.insights(businessId)).calls.find(
      (c) => c.id === missedCallId,
    )!;
    expect(listed.assignedToName).toBe('Sara Malik');

    await expect(
      service.assign(businessId, missedCallId, otherStaffId),
    ).rejects.toBeInstanceOf(AppException);
    await expect(
      service.assign(businessId, missedCallId, 'not-a-user'),
    ).rejects.toBeInstanceOf(AppException);

    await service.assign(businessId, missedCallId, null);
    const cleared = (await service.insights(businessId)).calls.find(
      (c) => c.id === missedCallId,
    )!;
    expect(cleared.assignedToUserId).toBeNull();
  });

  it('writes a summary from the transcript alone, caches it, and refuses a call with nothing to summarise', async () => {
    ai.complete.mockResolvedValue(
      '  The caller asked for a callback about a colour treatment.  ',
    );
    const result = await service.generateSummary(businessId, matchedCallId);
    expect(result.summary).toBe(
      'The caller asked for a callback about a colour treatment.',
    );

    const prompt = (ai.complete.mock.calls as [string, string][])[0][1];
    expect(prompt).toContain(
      'Caller: Hi, can someone call me about my colour?',
    );
    expect(prompt).toContain('Use ONLY what is written in the transcript');

    const stored = (await service.insights(businessId)).calls.find(
      (c) => c.id === matchedCallId,
    )!;
    expect(stored.summary).toBe(
      'The caller asked for a callback about a colour treatment.',
    );

    ai.complete.mockClear();
    await expect(
      service.generateSummary(businessId, missedCallId),
    ).rejects.toBeInstanceOf(AppException);
    expect(ai.complete).not.toHaveBeenCalled();
  });

  it('leaves the call without a summary when the AI provider fails — nothing is invented', async () => {
    const fresh = await prisma.phoneCall.create({
      data: {
        businessId,
        callSid: `CA-fail-${Date.now()}`,
        fromNumber: '+923041112222',
        status: 'completed',
        outcome: 'none',
        transcript: [
          { speaker: 'caller', text: 'Hello?', at: new Date().toISOString() },
        ],
      },
    });
    ai.complete.mockRejectedValue(new Error('AI unavailable'));
    await expect(service.generateSummary(businessId, fresh.id)).rejects.toThrow(
      'AI unavailable',
    );
    const row = await prisma.phoneCall.findUniqueOrThrow({
      where: { id: fresh.id },
    });
    expect(row.summary).toBeNull();
  });

  it('surfaces the AI Phone, full fields — callerName/email, analysis summary and routing rule attribution', async () => {
    const call = await prisma.phoneCall.create({
      data: {
        businessId,
        callSid: `CA-analysis-${Date.now()}`,
        fromNumber: '+923099990000',
        status: 'completed',
        outcome: 'message',
        callerName: 'Sana',
        callerEmail: 'sana@example.com',
        routedRuleId: 'rule-1',
        routedRuleName: 'Low confidence safety net',
        transcript: [
          {
            speaker: 'caller',
            text: 'Are you open on Eid?',
            at: new Date().toISOString(),
          },
          {
            speaker: 'assistant',
            text: "I don't have that.",
            at: new Date().toISOString(),
            analysis: {
              intent: 'message',
              confidence: 'low',
              sentiment: 'neutral',
              topic: 'opening_hours',
              answered: false,
              sources: [],
            },
          },
        ],
      },
    });
    try {
      const result = await service.insights(businessId);
      const found = result.calls.find((c) => c.id === call.id)!;
      expect(found.callerName).toBe('Sana');
      expect(found.callerEmail).toBe('sana@example.com');
      expect(found.routedRuleName).toBe('Low confidence safety net');
      expect(found.analysis.confidence).toBe('low');
      expect(found.analysis.declinedCount).toBe(1);
      expect(found.providerCost).toBeNull();
    } finally {
      await prisma.phoneCall.delete({ where: { id: call.id } });
    }
  });

  it('questionClusters() groups real declined/answered questions by their fixed topic, never inventing a cluster', async () => {
    const earlier = new Date(Date.now() - 60_000).toISOString();
    const later = new Date().toISOString();
    const a = await prisma.phoneCall.create({
      data: {
        businessId,
        callSid: `CA-cluster-a-${Date.now()}`,
        fromNumber: '+923011112222',
        status: 'completed',
        outcome: 'message',
        transcript: [
          { speaker: 'caller', text: 'Are you open on Eid?', at: earlier },
          {
            speaker: 'assistant',
            text: "I don't have that.",
            at: earlier,
            analysis: {
              intent: 'message',
              confidence: 'high',
              sentiment: null,
              topic: 'opening_hours',
              answered: false,
              sources: [],
            },
          },
        ],
      },
    });
    const b = await prisma.phoneCall.create({
      data: {
        businessId,
        callSid: `CA-cluster-b-${Date.now()}`,
        fromNumber: '+923033334444',
        status: 'completed',
        outcome: 'none',
        transcript: [
          {
            speaker: 'caller',
            text: 'What time do you close today?',
            at: later,
          },
          {
            speaker: 'assistant',
            text: "I don't have that either.",
            at: later,
            analysis: {
              intent: 'continue',
              confidence: 'high',
              sentiment: null,
              topic: 'opening_hours',
              answered: false,
              sources: [],
            },
          },
        ],
      },
    });
    try {
      const clusters = await service.questionClusters(businessId, 30);
      const hours = clusters.find((c) => c.topic === 'opening_hours')!;
      expect(hours.asked).toBe(2);
      expect(hours.declined).toBe(2);
      expect(hours.answered).toBe(0);
      expect(hours.sampleQuestion).toBe('What time do you close today?'); // most recent, verbatim
      expect(hours.label).toBe('Opening hours');
    } finally {
      await prisma.phoneCall.deleteMany({
        where: { id: { in: [a.id, b.id] } },
      });
    }
  });
});
