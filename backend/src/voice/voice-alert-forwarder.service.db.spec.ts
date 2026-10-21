import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { VoiceAlertForwarderService } from './voice-alert-forwarder.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('VoiceAlertForwarderService (real MySQL)', () => {
  let prisma: PrismaService;
  let businessId: string;
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const config = (url?: string) =>
    ({
      get: (key: string) => (key === 'OPS_ALERT_WEBHOOK_URL' ? url : undefined),
    }) as unknown as ConfigService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    businessId = (
      await prisma.business.create({
        data: { name: 'Alerting Salon', slug: `alerts-${suffix}` },
      })
    ).id;
    await prisma.voiceUsageRecord.createMany({
      data: [
        {
          businessId,
          eventKey: `ops-${suffix}`,
          provider: 'noxtill',
          unit: 'operations_alert',
          quantity: 4,
          state: 'observed',
          evidence: { type: 'realtime_failure_burst' },
        },
        {
          businessId,
          eventKey: `budget-${suffix}`,
          provider: 'noxtill',
          unit: 'budget_warning',
          quantity: 0,
          state: 'recorded',
          evidence: {
            threshold: 90,
            capUsd: 50,
            confirmedPlusEstimatedUsd: 46.2,
          },
        },
      ],
    });
    await prisma.voiceProviderWebhookEvent.create({
      data: {
        businessId,
        eventKey: `dl-${suffix}`,
        eventType: 'call.status',
        callSid: 'CA-dead',
        payload: {},
        state: 'dead_letter',
        consecutiveFailures: 5,
        lastAttemptAt: new Date(),
      },
    });
  });

  afterAll(async () => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.voiceAlertDelivery.deleteMany({ where: { businessId } });
      await tx.voiceProviderWebhookEvent.deleteMany({ where: { businessId } });
      await tx.voiceUsageRecord.deleteMany({ where: { businessId } });
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  it('sends nothing when no webhook URL is configured', async () => {
    mockedAxios.post.mockReset();
    await new VoiceAlertForwarderService(prisma, config()).forward();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('delivers each alert once and retries only the failed one', async () => {
    mockedAxios.post.mockReset();
    mockedAxios.isAxiosError.mockReturnValue(true);
    mockedAxios.post
      .mockRejectedValueOnce({ response: { status: 500 } })
      .mockResolvedValue({ status: 200 });
    const service = new VoiceAlertForwarderService(
      prisma,
      config('https://hooks.example.com/ops'),
    );
    const first = await service.forward();
    expect(first).toEqual({ delivered: 2, failed: 1 });
    const texts = mockedAxios.post.mock.calls.map(
      (call) => (call[1] as { text: string }).text,
    );
    expect(texts.join('\n')).toContain('Alerting Salon');
    expect(texts.some((t) => t.includes('90% of the $50 monthly cap'))).toBe(
      true,
    );
    expect(
      texts.some(
        (t) => t.includes('call.status') && t.includes('operator replay'),
      ),
    ).toBe(true);

    const second = await service.forward();
    expect(second).toEqual({ delivered: 1, failed: 0 });
    const third = await service.forward();
    expect(third).toEqual({ delivered: 0, failed: 0 });
    const rows = await prisma.voiceAlertDelivery.findMany({
      where: { businessId },
    });
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.deliveredAt)).toBe(true);
  });
});
