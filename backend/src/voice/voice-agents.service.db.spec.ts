import { ClsService } from 'nestjs-cls';
import { randomUUID } from 'crypto';
import {
  PhoneCallOutcome,
  PhoneCallStatus,
  Role,
  VoiceAgentPresenceStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AuditService } from '../common/audit/audit.service';
import {
  CLS_KEY_BUSINESS_ID,
  CLS_KEY_USER_ID,
} from '../common/tenancy/tenant.constants';
import { VoiceQueueService } from './voice-queue.service';
import { VoiceAgentsService } from './voice-agents.service';
import { AppException } from '../common/filters/app.exception';

class FakeClsService {
  private readonly values: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.values[key] as T;
  }
  set(key: string, value: unknown) {
    this.values[key] = value;
  }
}

describe('VoiceAgentsService (MySQL)', () => {
  let prisma: PrismaService;
  let service: VoiceAgentsService;
  let businessId: string;
  let otherBusinessId: string;
  let actorUserId: string;
  let staffUserId: string;
  let staffBusinessUserId: string;
  let otherBusinessUserId: string;
  let otherUserId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    const tenant = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    const audit = new AuditService(tenant, cls as unknown as ClsService);
    service = new VoiceAgentsService(
      tenant,
      audit,
      new VoiceQueueService(tenant, audit),
    );

    const stamp = randomUUID();
    const [business, otherBusiness] = await Promise.all([
      prisma.business.create({
        data: { name: 'Voice Agent Test', slug: `voice-agent-${stamp}` },
      }),
      prisma.business.create({
        data: {
          name: 'Other Voice Agent Test',
          slug: `voice-agent-other-${stamp}`,
        },
      }),
    ]);
    businessId = business.id;
    otherBusinessId = otherBusiness.id;
    const [actor, staff, otherStaff] = await Promise.all([
      prisma.user.create({
        data: {
          email: `voice-agent-owner-${stamp}@example.com`,
          passwordHash: 'x',
          name: 'Voice Agent Owner',
        },
      }),
      prisma.user.create({
        data: {
          email: `voice-agent-staff-${stamp}@example.com`,
          passwordHash: 'x',
          name: 'Voice Agent Staff',
          phone: '+15550000111',
        },
      }),
      prisma.user.create({
        data: {
          email: `voice-agent-other-${stamp}@example.com`,
          passwordHash: 'x',
          name: 'Other Business Staff',
        },
      }),
    ]);
    actorUserId = actor.id;
    staffUserId = staff.id;
    otherUserId = otherStaff.id;
    const [staffLink, otherLink] = await Promise.all([
      prisma.businessUser.create({
        data: { businessId, userId: staff.id, role: Role.staff },
      }),
      prisma.businessUser.create({
        data: {
          businessId: otherBusinessId,
          userId: otherStaff.id,
          role: Role.staff,
        },
      }),
    ]);
    staffBusinessUserId = staffLink.id;
    otherBusinessUserId = otherLink.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    cls.set(CLS_KEY_USER_ID, actorUserId);
  });

  afterAll(async () => {
    if (businessId) {
      await prisma.phoneCall.deleteMany({ where: { businessId } });
      await prisma.voiceHumanAgentProfile.deleteMany({ where: { businessId } });
      await prisma.auditLog.deleteMany({ where: { businessId } });
      await prisma.businessUser.deleteMany({ where: { businessId } });
    }
    if (otherBusinessId) {
      await prisma.businessUser.deleteMany({
        where: { businessId: otherBusinessId },
      });
      await prisma.business.delete({ where: { id: otherBusinessId } });
    }
    if (businessId) await prisma.business.delete({ where: { id: businessId } });
    if (actorUserId)
      await prisma.user.deleteMany({ where: { id: actorUserId } });
    if (staffUserId)
      await prisma.user.deleteMany({ where: { id: staffUserId } });
    if (otherUserId)
      await prisma.user.deleteMany({ where: { id: otherUserId } });
    await prisma.$disconnect();
  });

  it('links voice settings to a canonical staff row and reports live database metrics', async () => {
    await prisma.phoneCall.createMany({
      data: [
        {
          businessId,
          callSid: `CA-voice-agent-live-${Date.now()}`,
          fromNumber: '+15550000222',
          status: PhoneCallStatus.in_progress,
          joinedByUserId: staffUserId,
        },
        {
          businessId,
          callSid: `CA-voice-agent-followup-${Date.now()}`,
          fromNumber: '+15550000333',
          status: PhoneCallStatus.completed,
          outcome: PhoneCallOutcome.message,
        },
      ],
    });
    const saved = await service.saveProfile(businessId, staffBusinessUserId, {
      skillTags: ['Sales', ' sales ', 'Support'],
      languages: ['en', 'ur'],
      maxConcurrentCalls: 2,
    });
    expect(saved.skillTags).toEqual(['Sales', 'Support']);
    expect(saved.languages).toEqual(['en', 'ur']);

    const result = await service.list(businessId, actorUserId);
    expect(result.metrics).toMatchObject({
      humanAgents: 1,
      markedAvailable: 0,
      ongoingCalls: 1,
      followUpsWaiting: 1,
      configuredConcurrency: 2,
    });
    expect(result.agents[0]).toMatchObject({
      staffUserId: staffBusinessUserId,
      userId: staffUserId,
      name: 'Voice Agent Staff',
      presenceStatus: VoiceAgentPresenceStatus.offline,
      liveCalls: 1,
      isSelf: false,
    });
    expect(result.staffOptions).toEqual([]);
    expect(result.limitations.browserSoftphone).toBe('not_configured');
    expect(result.limitations.presenceBasedAssignment).toBe(
      'automatic_ai_transfer_only',
    );
    expect(result.limitations.skillRouting).toBe(
      'classified_topic_preference_with_general_fallback',
    );
  });

  it('rejects linking a staff row from another business', async () => {
    await expect(
      service.saveProfile(businessId, otherBusinessUserId, {
        skillTags: [],
        languages: [],
        maxConcurrentCalls: 1,
      }),
    ).rejects.toBeInstanceOf(AppException);
    expect(
      await prisma.voiceHumanAgentProfile.findFirst({
        where: { businessId, staffUserId: otherBusinessUserId },
      }),
    ).toBeNull();
  });

  it('allows staff to heartbeat only their own assigned profile and expires stale presence', async () => {
    await service.saveProfile(businessId, staffBusinessUserId, {
      skillTags: [],
      languages: ['en'],
      maxConcurrentCalls: 1,
    });
    await expect(
      service.heartbeat(businessId, actorUserId, {
        status: VoiceAgentPresenceStatus.available,
      }),
    ).rejects.toBeInstanceOf(AppException);

    await service.heartbeat(businessId, staffUserId, {
      status: VoiceAgentPresenceStatus.available,
    });
    const current = await service.list(businessId, actorUserId);
    expect(current.agents[0].presenceStatus).toBe(
      VoiceAgentPresenceStatus.available,
    );
    expect(current.metrics.markedAvailable).toBe(1);

    await prisma.voiceHumanAgentProfile.update({
      where: {
        businessId_staffUserId: {
          businessId,
          staffUserId: staffBusinessUserId,
        },
      },
      data: { lastHeartbeatAt: new Date(Date.now() - 60_000) },
    });
    const expired = await service.list(businessId, actorUserId);
    expect(expired.agents[0].presenceStatus).toBe(
      VoiceAgentPresenceStatus.offline,
    );
    expect(expired.agents[0].presenceExpired).toBe(true);
    expect(expired.metrics.expiredPresence).toBe(1);
  });
});
