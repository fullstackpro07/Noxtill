import axios from 'axios';
import { ClsService } from 'nestjs-cls';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { VoiceProviderHealthService } from './voice-provider-health.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

class FakeClsService {
  private readonly store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('VoiceProviderHealthService (real MySQL)', () => {
  let prisma: PrismaService;
  let service: VoiceProviderHealthService;
  let businessId: string;
  const config: Record<string, string | undefined> = {
    TWILIO_ACCOUNT_SID: 'AC_test',
    TWILIO_AUTH_TOKEN: 'token',
    BACKEND_URL: 'https://api.example.com/api/v1',
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    service = new VoiceProviderHealthService(
      new TenantPrismaService(prisma, cls as unknown as ClsService),
      { get: (key: string) => config[key] } as unknown as ConfigService,
    );
    const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    businessId = (
      await prisma.business.create({
        data: { name: 'Health Test', slug: `voice-health-${suffix}` },
      })
    ).id;
    await prisma.phoneNumber.create({
      data: {
        businessId,
        twilioSid: 'PN_health',
        phoneNumber: `+1415204${String(Date.now()).slice(-4)}`,
      },
    });
    const start = new Date();
    await prisma.phoneCall.createMany({
      data: [
        {
          businessId,
          callSid: `CA-h1-${suffix}`,
          fromNumber: '+14155550181',
          status: 'completed',
          startedAt: start,
          endedAt: new Date(start.getTime() + 120_000),
          transcript: [],
          providerCost: '0.0250',
          providerCostUnit: 'USD',
          providerCostCheckedAt: start,
        },
        {
          businessId,
          callSid: `CA-h2-${suffix}`,
          fromNumber: '+14155550182',
          status: 'missed',
          startedAt: start,
          transcript: [],
        },
      ],
    });
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.phoneCall.deleteMany({ where: { businessId } });
      await tx.phoneNumber.deleteMany({ where: { businessId } });
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  beforeEach(() => mockedAxios.get.mockReset());

  it('reports a live provider read, and flags a number routed away from Noxtill', async () => {
    mockedAxios.get
      .mockResolvedValueOnce({ data: { status: 'active' } })
      .mockResolvedValueOnce({
        data: { voice_url: 'https://other.example.com/voice' },
      });
    const health = await service.health(businessId);
    const byKey = Object.fromEntries(
      health.checks.map((check) => [check.key, check]),
    );
    expect(byKey.twilio_account.status).toBe('ok');
    expect(byKey.webhook_url.status).toBe('ok');
    expect(byKey.business_line.status).toBe('error');
    expect(byKey.business_line.detail).toContain(
      'https://other.example.com/voice',
    );
    expect(health.overall).toBe('error');
    expect(health.lastCallAt).not.toBeNull();
  });

  it('reports rejected credentials as an error instead of assuming health', async () => {
    mockedAxios.isAxiosError.mockReturnValue(true);
    mockedAxios.get.mockRejectedValue({ response: { status: 401 } });
    const health = await service.health(businessId);
    const account = health.checks.find(
      (check) => check.key === 'twilio_account',
    );
    expect(account).toMatchObject({ status: 'error' });
    expect(account?.detail).toContain('rejected');
  });

  it('measures this month’s usage from saved calls only', async () => {
    const usage = await service.usage(businessId);
    expect(usage).toMatchObject({
      inboundCalls: 2,
      missedCalls: 1,
      inboundMinutes: 2,
      outboundDials: 0,
      callbackDials: 0,
      providerCharges: [{ unit: 'USD', amount: '0.0250' }],
      limits: { usageCaps: 'not_configured' },
    });
  });
});
