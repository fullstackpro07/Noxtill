import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { VoiceProviderCostProcessor } from './voice-provider-cost.processor';
import { PhoneCallStatus } from '@prisma/client';

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
      new ConfigService({}),
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
});
