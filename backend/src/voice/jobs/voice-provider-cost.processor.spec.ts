import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { VoiceProviderCostProcessor } from './voice-provider-cost.processor';
import { PhoneCallStatus } from '@prisma/client';
import { VoiceUsageMeteringService } from '../voice-usage-metering.service';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('VoiceProviderCostProcessor (AI Phone, full — Numbers screen "Provider cost")', () => {
  let prisma: PrismaService;
  let businessId: string;
  let callCounter = 0;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const business = await prisma.business.create({
      data: {
        name: 'Provider Cost Test Biz',
        slug: `voice-provider-cost-${Date.now()}`,
      },
    });
    businessId = business.id;
  });

  afterAll(async () => {
    await prisma.voiceUsageRecord.deleteMany({ where: { businessId } });
    await prisma.message.deleteMany({ where: { businessId } });
    await prisma.phoneCall.deleteMany({ where: { businessId } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function createEndedCall(
    overrides: {
      providerCostCheckedAt?: Date | null;
      endedHoursAgo?: number;
    } = {},
  ) {
    callCounter += 1;
    return prisma.phoneCall.create({
      data: {
        businessId,
        callSid: `CA-cost-${callCounter}`,
        fromNumber: '+15550000000',
        status: PhoneCallStatus.completed,
        endedAt: new Date(
          Date.now() - (overrides.endedHoursAgo ?? 0) * 3_600_000,
        ),
        transcript: [],
        providerCostCheckedAt: overrides.providerCostCheckedAt ?? null,
      },
    });
  }

  it('does nothing when Twilio credentials are not configured', async () => {
    const processor = new VoiceProviderCostProcessor(
      prisma,
      new ConfigService({ TWILIO_ACCOUNT_SID: '', TWILIO_AUTH_TOKEN: '' }),
    );
    await createEndedCall();
    await processor.runCheck();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('records the real price Twilio reports and marks the call checked', async () => {
    const config = new ConfigService({
      TWILIO_ACCOUNT_SID: 'AC-test',
      TWILIO_AUTH_TOKEN: 'test-token',
    });
    const processor = new VoiceProviderCostProcessor(prisma, config);
    const call = await createEndedCall();
    mockedAxios.get.mockResolvedValue({
      data: { price: '-0.0085', price_unit: 'USD' },
    });

    await processor.runCheck();

    const updated = await prisma.phoneCall.findUniqueOrThrow({
      where: { id: call.id },
    });
    expect(Number(updated.providerCost)).toBeCloseTo(0.0085);
    expect(updated.providerCostUnit).toBe('USD');
    expect(updated.providerCostCheckedAt).not.toBeNull();
  });

  it('settles a day-old call as unpriced — no cost is invented when Twilio never priced it', async () => {
    const config = new ConfigService({
      TWILIO_ACCOUNT_SID: 'AC-test',
      TWILIO_AUTH_TOKEN: 'test-token',
    });
    const processor = new VoiceProviderCostProcessor(prisma, config);
    const call = await createEndedCall({ endedHoursAgo: 30 });
    mockedAxios.get.mockResolvedValue({
      data: { price: null, price_unit: null },
    });

    await processor.runCheck();

    const updated = await prisma.phoneCall.findUniqueOrThrow({
      where: { id: call.id },
    });
    expect(updated.providerCost).toBeNull();
    expect(updated.providerCostCheckedAt).not.toBeNull();
  });

  it('leaves a just-ended call unchecked when Twilio has no price yet, so the next hourly tick asks again', async () => {
    const config = new ConfigService({
      TWILIO_ACCOUNT_SID: 'AC-test',
      TWILIO_AUTH_TOKEN: 'test-token',
    });
    const processor = new VoiceProviderCostProcessor(prisma, config);
    const call = await createEndedCall({ endedHoursAgo: 0.1 });
    mockedAxios.get.mockResolvedValue({
      data: { price: null, price_unit: null },
    });

    await processor.runCheck();
    let row = await prisma.phoneCall.findUniqueOrThrow({
      where: { id: call.id },
    });
    expect(row.providerCostCheckedAt).toBeNull();
    expect(row.providerCost).toBeNull();

    // Twilio prices it a little later — the next tick picks it up.
    mockedAxios.get.mockResolvedValue({
      data: { price: '-0.0042', price_unit: 'USD' },
    });
    await processor.runCheck();
    row = await prisma.phoneCall.findUniqueOrThrow({ where: { id: call.id } });
    expect(Number(row.providerCost)).toBeCloseTo(0.0042);
    expect(row.providerCostCheckedAt).not.toBeNull();
  });

  it('skips a call that has already been checked', async () => {
    const config = new ConfigService({
      TWILIO_ACCOUNT_SID: 'AC-test',
      TWILIO_AUTH_TOKEN: 'test-token',
    });
    const processor = new VoiceProviderCostProcessor(prisma, config);
    await createEndedCall({ providerCostCheckedAt: new Date() });

    await processor.runCheck();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it('checks the oldest eligible calls first with a stable tie-breaker', async () => {
    const processor = new VoiceProviderCostProcessor(
      prisma,
      new ConfigService({
        TWILIO_ACCOUNT_SID: 'AC-test',
        TWILIO_AUTH_TOKEN: 'test-token',
      }),
    );
    await createEndedCall();
    mockedAxios.get.mockResolvedValue({
      data: { duration: '1', price: '-0.001', price_unit: 'USD' },
    });
    const findMany = jest.spyOn(prisma.phoneCall, 'findMany');
    try {
      await processor.runCheck();
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ startedAt: 'asc' }, { id: 'asc' }],
          take: 200,
        }),
      );
    } finally {
      findMany.mockRestore();
    }
  });

  it('records Twilio text-back message price and segments once without double-counting the charge', async () => {
    const config = new ConfigService({
      TWILIO_ACCOUNT_SID: 'AC-test',
      TWILIO_AUTH_TOKEN: 'test-token',
    });
    const processor = new VoiceProviderCostProcessor(
      prisma,
      config,
      new VoiceUsageMeteringService(prisma),
    );
    const sid = `SM${'a'.repeat(32)}`;
    const message = await prisma.message.create({
      data: {
        businessId,
        channel: 'sms',
        category: 'utility',
        templateKey: 'missed_call',
        status: 'sent',
        providerRef: sid,
      },
    });
    await prisma.phoneCall.create({
      data: {
        businessId,
        callSid: `CA-sms-cost-${Date.now()}`,
        fromNumber: '+15550000001',
        status: PhoneCallStatus.completed,
        textBackStatus: 'queued',
        textBackMessageId: message.id,
      },
    });
    mockedAxios.get.mockResolvedValue({
      data: {
        price: '-0.0120',
        price_unit: 'USD',
        num_segments: '2',
        status: 'delivered',
        date_sent: new Date().toUTCString(),
      },
    });

    await expect(processor.runMessageCheck()).resolves.toEqual({
      checked: 1,
      priced: 1,
    });
    const charge = await prisma.voiceUsageRecord.findUniqueOrThrow({
      where: {
        businessId_eventKey: { businessId, eventKey: `twilio:sms:${sid}` },
      },
    });
    const segments = await prisma.voiceUsageRecord.findUniqueOrThrow({
      where: {
        businessId_eventKey: {
          businessId,
          eventKey: `twilio:sms-segments:${sid}`,
        },
      },
    });
    expect(charge).toMatchObject({
      provider: 'twilio',
      unit: 'outbound_sms_messages',
      currency: 'USD',
      state: 'confirmed',
    });
    expect(Number(charge.cost)).toBeCloseTo(0.012);
    expect(Number(segments.quantity)).toBe(2);
    expect(segments.cost).toBeNull();

    await processor.runMessageCheck();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    expect(
      await prisma.voiceUsageRecord.count({
        where: { businessId, unit: 'outbound_sms_messages' },
      }),
    ).toBe(1);
  });

  it('retries an unpriced message and updates its ledger row when Twilio later reports the charge', async () => {
    const config = new ConfigService({
      TWILIO_ACCOUNT_SID: 'AC-test',
      TWILIO_AUTH_TOKEN: 'test-token',
    });
    const processor = new VoiceProviderCostProcessor(
      prisma,
      config,
      new VoiceUsageMeteringService(prisma),
    );
    const sid = `SM${'b'.repeat(32)}`;
    const message = await prisma.message.create({
      data: {
        businessId,
        channel: 'sms',
        category: 'utility',
        templateKey: 'missed_call',
        status: 'sent',
        providerRef: sid,
      },
    });
    await prisma.phoneCall.create({
      data: {
        businessId,
        callSid: `CA-sms-pending-${Date.now()}`,
        fromNumber: '+15550000002',
        status: PhoneCallStatus.completed,
        textBackStatus: 'queued',
        textBackMessageId: message.id,
      },
    });
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        price: null,
        price_unit: null,
        num_segments: '0',
        status: 'sent',
      },
    });
    await processor.runMessageCheck();
    let charge = await prisma.voiceUsageRecord.findUniqueOrThrow({
      where: {
        businessId_eventKey: { businessId, eventKey: `twilio:sms:${sid}` },
      },
    });
    expect(charge.state).toBe('pending');
    expect(charge.cost).toBeNull();

    mockedAxios.get.mockResolvedValueOnce({
      data: {
        price: '-0.021',
        price_unit: 'USD',
        num_segments: '3',
        status: 'delivered',
      },
    });
    await processor.runMessageCheck();
    charge = await prisma.voiceUsageRecord.findUniqueOrThrow({
      where: {
        businessId_eventKey: { businessId, eventKey: `twilio:sms:${sid}` },
      },
    });
    expect(charge.state).toBe('confirmed');
    expect(Number(charge.cost)).toBeCloseTo(0.021);
    expect(
      await prisma.voiceUsageRecord.count({
        where: { businessId, eventKey: `twilio:sms:${sid}` },
      }),
    ).toBe(1);
  });
});
