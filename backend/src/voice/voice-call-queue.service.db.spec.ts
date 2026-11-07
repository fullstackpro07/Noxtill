import { ClsService } from 'nestjs-cls';
import { randomUUID } from 'crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { VoiceCallQueueService } from './voice-call-queue.service';

class FakeClsService {
  private readonly values: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.values[key] as T;
  }
  set(key: string, value: unknown) {
    this.values[key] = value;
  }
}

const config = (values: Record<string, string>) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService;

describe('VoiceCallQueueService (real MySQL)', () => {
  let prisma: PrismaService;
  let tenant: TenantPrismaService;
  let cls: FakeClsService;
  let service: VoiceCallQueueService;
  let businessId: string;
  let callId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    cls = new FakeClsService();
    tenant = new TenantPrismaService(prisma, cls as unknown as ClsService);

    const stamp = randomUUID();
    const business = await prisma.business.create({
      data: {
        name: 'Voice Call Queue QA',
        slug: `voice-call-queue-${stamp}`,
        policies: { 'voice.holdQueueMaxWaitSeconds': 60 },
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const call = await prisma.phoneCall.create({
      data: {
        businessId,
        callSid: `CA-queue-${stamp}`,
        fromNumber: '+14155550123',
        status: 'in_progress',
      },
    });
    callId = call.id;
  });

  afterAll(async () => {
    if (businessId) {
      await prisma.voiceCallQueueEntry.deleteMany({ where: { businessId } });
      await prisma.voiceCallQueueConfig.deleteMany({ where: { businessId } });
      await prisma.phoneCall.deleteMany({ where: { businessId } });
      await prisma.business.delete({ where: { id: businessId } });
    }
    await prisma.$disconnect();
  });

  it('keeps queueing off until the Twilio hold-queue requirements are configured', async () => {
    service = new VoiceCallQueueService(tenant, config({}));

    const status = await service.providerStatus(businessId);
    expect(status).toMatchObject({
      configured: false,
      maxWaitSeconds: 60,
      holdMusic: 'not_configured',
    });
    expect(status.reason).toContain('Twilio Voice credentials');
    await expect(service.enqueue(businessId, callId)).resolves.toBeNull();
    await expect(
      prisma.voiceCallQueueEntry.count({ where: { callId } }),
    ).resolves.toBe(0);
  });

  it('enqueues with public callbacks, records Twilio waits and measures SLA risk', async () => {
    service = new VoiceCallQueueService(
      tenant,
      config({
        TWILIO_ACCOUNT_SID: 'AC-test',
        TWILIO_AUTH_TOKEN: 'test-token',
        BACKEND_URL: 'https://voice-test.example/api/v1',
        VOICE_HOLD_MUSIC_URL: 'https://assets.example/hold-music.mp3',
      }),
    );

    const enqueue = await service.enqueue(businessId, callId);
    expect(enqueue).toContain('<Enqueue');
    expect(enqueue).toContain(
      `https://voice-test.example/api/v1/voice/webhook/queue-wait?callId=${callId}`,
    );
    expect(enqueue).toContain(
      `https://voice-test.example/api/v1/voice/webhook/queue-exit?callId=${callId}`,
    );
    expect(enqueue).not.toContain('/api/v1/api/v1/');

    const queueName = service.queueNameForBusiness(businessId);
    await prisma.voiceCallQueueConfig.create({
      data: {
        businessId,
        queueName,
        slaTargetSeconds: 30,
      },
    });
    await prisma.voiceCallQueueEntry.update({
      where: { callId },
      data: { enteredAt: new Date(Date.now() - 45_000) },
    });

    const waitXml = await service.waitTwiMl(callId, 10);
    expect(waitXml).toContain(
      '<Play>https://assets.example/hold-music.mp3</Play>',
    );
    expect(await service.waitTwiMl(callId, 60)).toContain('<Leave/>');

    const beforeExit = await service.supervisorStats(businessId);
    expect(beforeExit.metrics).toMatchObject({ waitingCalls: 1 });
    expect(beforeExit.queues[0]).toMatchObject({
      slaTargetSeconds: 30,
      slaAtRisk: 1,
      estimateLabel: 'Not enough measured waits',
    });

    await service.recordExit(callId, 'QU-test', 42, 'exited');
    const entry = await prisma.voiceCallQueueEntry.findUniqueOrThrow({
      where: { callId },
    });
    expect(entry).toMatchObject({
      callId,
      queueName,
      providerQueueSid: 'QU-test',
      status: 'exited',
      waitSeconds: 42,
      overflowAction: 'exited',
    });
  });
});
