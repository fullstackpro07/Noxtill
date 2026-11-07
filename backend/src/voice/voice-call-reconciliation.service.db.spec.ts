import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { VoiceAiOutboundService } from './voice-ai-outbound.service';
import { VoiceCallService } from './voice-call.service';
import { VoiceCallReconciliationService } from './voice-call-reconciliation.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('VoiceCallReconciliationService (real MySQL)', () => {
  let prisma: PrismaService;
  let service: VoiceCallReconciliationService;
  let businessId: string;
  const calls = { handleStatus: jest.fn() };
  const aiOutbound = { providerStatus: jest.fn() };
  const configValues: Record<string, string | undefined> = {
    TWILIO_ACCOUNT_SID: 'AC_reconciliation_test',
    TWILIO_AUTH_TOKEN: 'test-token',
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const business = await prisma.business.create({
      data: {
        name: 'Voice Reconciliation Test',
        slug: `voice-reconciliation-${Date.now()}`,
      },
    });
    businessId = business.id;
    service = new VoiceCallReconciliationService(
      prisma,
      { get: (key: string) => configValues[key] } as unknown as ConfigService,
      calls as unknown as VoiceCallService,
      aiOutbound as unknown as VoiceAiOutboundService,
    );
  });

  beforeEach(() => {
    mockedAxios.get.mockReset();
    calls.handleStatus.mockReset();
    aiOutbound.providerStatus.mockReset();
  });

  afterAll(async () => {
    await prisma.phoneCall.deleteMany({ where: { businessId } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  async function createStaleCall(callSid: string, direction = 'inbound') {
    return prisma.phoneCall.create({
      data: {
        businessId,
        callSid,
        direction,
        fromNumber: '+14155550201',
        status: 'in_progress',
        startedAt: new Date(Date.now() - 10 * 60 * 1000),
      },
    });
  }

  it('reads the provider terminal state and dispatches it through the normal lifecycle handler', async () => {
    const callSid = `CA-reconcile-completed-${Date.now()}`;
    await createStaleCall(callSid);
    mockedAxios.get.mockResolvedValue({
      data: { status: 'completed', duration: '17' },
    });

    const result = await service.reconcileStaleCalls(new Date(), businessId);

    expect(result).toMatchObject({ checked: 1, reconciled: 1, failed: 0 });
    expect(mockedAxios.get.mock.calls).toHaveLength(1);
    expect(mockedAxios.get.mock.calls[0]?.[0]).toContain(
      `/Calls/${callSid}.json`,
    );
    expect(mockedAxios.get.mock.calls[0]?.[1]).toMatchObject({ timeout: 8000 });
    expect(calls.handleStatus.mock.calls).toEqual([[callSid, 'completed']]);
    const row = await prisma.phoneCall.findUniqueOrThrow({
      where: { callSid },
    });
    expect(row.providerStatusCheckedAt).not.toBeNull();
    await prisma.phoneCall.delete({ where: { callSid } });
  });

  it('leaves a provider-active call untouched and respects the retry cooldown', async () => {
    const callSid = `CA-reconcile-active-${Date.now()}`;
    await createStaleCall(callSid);
    mockedAxios.get.mockResolvedValue({ data: { status: 'in-progress' } });
    const now = new Date();

    const first = await service.reconcileStaleCalls(now, businessId);
    const second = await service.reconcileStaleCalls(
      new Date(now.getTime() + 4 * 60 * 1000),
      businessId,
    );

    expect(first).toMatchObject({ checked: 1, reconciled: 0 });
    expect(second.checked).toBe(0);
    expect(calls.handleStatus.mock.calls).toHaveLength(0);
    expect(mockedAxios.get.mock.calls).toHaveLength(1);
    const row = await prisma.phoneCall.findUniqueOrThrow({
      where: { callSid },
    });
    expect(row.status).toBe('in_progress');
    await prisma.phoneCall.delete({ where: { callSid } });
  });

  it('atomically claims a stale call so overlapping workers do not duplicate provider reads', async () => {
    const callSid = `CA-reconcile-race-${Date.now()}`;
    await createStaleCall(callSid);
    mockedAxios.get.mockResolvedValue({ data: { status: 'ringing' } });
    const now = new Date();

    const results = await Promise.all([
      service.reconcileStaleCalls(now, businessId),
      service.reconcileStaleCalls(now, businessId),
    ]);

    expect(results.reduce((sum, result) => sum + result.checked, 0)).toBe(1);
    expect(mockedAxios.get.mock.calls).toHaveLength(1);
    await prisma.phoneCall.delete({ where: { callSid } });
  });

  it('does not call or modify Twilio when provider credentials are missing', async () => {
    const original = configValues.TWILIO_ACCOUNT_SID;
    delete configValues.TWILIO_ACCOUNT_SID;
    try {
      await expect(service.reconcileStaleCalls()).resolves.toMatchObject({
        notConfigured: true,
        checked: 0,
      });
      expect(mockedAxios.get.mock.calls).toHaveLength(0);
    } finally {
      configValues.TWILIO_ACCOUNT_SID = original;
    }
  });
});
