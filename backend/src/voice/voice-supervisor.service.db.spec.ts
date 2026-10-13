import { ClsService } from 'nestjs-cls';
import { randomUUID } from 'crypto';
import {
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
import { VoiceSupervisorService } from './voice-supervisor.service';

class FakeClsService {
  private readonly values: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.values[key] as T;
  }
  set(key: string, value: unknown) {
    this.values[key] = value;
  }
}

describe('VoiceSupervisorService (MySQL)', () => {
  let prisma: PrismaService;
  let cls: FakeClsService;
  let service: VoiceSupervisorService;
  let businessId: string;
  let otherBusinessId: string;
  let supervisorUserId: string;
  let staffUserId: string;
  let staffBusinessUserId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    cls = new FakeClsService();
    const tenant = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    const audit = new AuditService(tenant, cls as unknown as ClsService);
    const queue = new VoiceQueueService(tenant, audit);
    const agents = new VoiceAgentsService(tenant, audit, queue);
    service = new VoiceSupervisorService(tenant, agents);

    const stamp = randomUUID();
    const [business, otherBusiness] = await Promise.all([
      prisma.business.create({
        data: { name: 'Supervisor QA', slug: `voice-supervisor-${stamp}` },
      }),
      prisma.business.create({
        data: {
          name: 'Other Supervisor QA',
          slug: `voice-supervisor-other-${stamp}`,
        },
      }),
    ]);
    businessId = business.id;
    otherBusinessId = otherBusiness.id;
    const [supervisor, staff] = await Promise.all([
      prisma.user.create({
        data: {
          email: `voice-supervisor-${stamp}@example.com`,
          passwordHash: 'x',
          name: 'Voice Supervisor',
        },
      }),
      prisma.user.create({
        data: {
          email: `voice-supervisor-staff-${stamp}@example.com`,
          passwordHash: 'x',
          name: 'Voice Agent',
          phone: '+15550000111',
        },
      }),
    ]);
    supervisorUserId = supervisor.id;
    staffUserId = staff.id;
    const member = await prisma.businessUser.create({
      data: { businessId, userId: staff.id, role: Role.staff },
    });
    staffBusinessUserId = member.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    cls.set(CLS_KEY_USER_ID, supervisorUserId);
  });

  afterAll(async () => {
    if (businessId) {
      await prisma.phoneCall.deleteMany({ where: { businessId } });
      await prisma.voiceHumanAgentProfile.deleteMany({ where: { businessId } });
      await prisma.auditLog.deleteMany({ where: { businessId } });
      await prisma.businessUser.deleteMany({ where: { businessId } });
    }
    if (otherBusinessId) {
      await prisma.phoneCall.deleteMany({
        where: { businessId: otherBusinessId },
      });
      await prisma.business.delete({ where: { id: otherBusinessId } });
    }
    if (businessId) await prisma.business.delete({ where: { id: businessId } });
    if (supervisorUserId)
      await prisma.user.delete({ where: { id: supervisorUserId } });
    if (staffUserId) await prisma.user.delete({ where: { id: staffUserId } });
    await prisma.$disconnect();
  });

  it('shows real tenant-scoped live calls, masked caller IDs and agent presence', async () => {
    await prisma.phoneCall.create({
      data: {
        businessId,
        callSid: `CA-supervisor-live-${randomUUID()}`,
        fromNumber: '+15551232222',
        status: PhoneCallStatus.in_progress,
        recordingKey: 'qa/live-call-recording',
        transcript: [
          {
            speaker: 'assistant',
            text: 'How can I help?',
            at: new Date().toISOString(),
            analysis: {
              intent: 'support',
              confidence: 'low',
              sentiment: 'frustrated',
              topic: 'other',
              answered: null,
              sources: [],
            },
          },
        ],
      },
    });
    await prisma.phoneCall.create({
      data: {
        businessId: otherBusinessId,
        callSid: `CA-supervisor-other-${randomUUID()}`,
        fromNumber: '+15559990000',
        status: PhoneCallStatus.in_progress,
      },
    });
    await prisma.phoneCall.create({
      data: {
        businessId,
        callSid: `CA-supervisor-finished-${randomUUID()}`,
        fromNumber: '+15551230000',
        status: PhoneCallStatus.completed,
      },
    });
    await prisma.voiceHumanAgentProfile.create({
      data: {
        businessId,
        staffUserId: staffBusinessUserId,
        presenceStatus: VoiceAgentPresenceStatus.available,
        lastHeartbeatAt: new Date(),
      },
    });

    const result = await service.live(businessId, supervisorUserId);

    expect(result.metrics).toMatchObject({
      activeCalls: 1,
      onlineAgents: 1,
      availableAgents: 1,
      callbackBacklog: 0,
      waitingCalls: null,
      slaAtRisk: null,
      aiErrors: null,
    });
    expect(result.calls[0]).toMatchObject({
      caller: '•••• 2222',
      sentiment: 'frustrated',
      confidence: 'low',
      recording: 'saved',
    });
    expect(result.calls[0]).not.toHaveProperty('fromNumber');
    expect(result.agents[0]).toMatchObject({
      name: 'Voice Agent',
      status: VoiceAgentPresenceStatus.available,
    });
    expect(result.limitations.whisperAndBarge).toContain('Not available');
  });
});
