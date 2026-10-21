import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  VoiceUsageMeteringService,
  voiceSpendState,
} from './voice-usage-metering.service';

describe('Voice usage measurements, spending limits and warnings (real MySQL)', () => {
  const prisma = new PrismaService();
  const service = new VoiceUsageMeteringService(prisma);
  let businessId: string;
  let userId: string;
  let callId: string;

  beforeAll(async () => {
    await prisma.$connect();
    const stamp = randomUUID();
    businessId = (
      await prisma.business.create({
        data: {
          name: 'Metering QA',
          slug: `meter-${stamp}`,
          policies: { 'voice.monthlySpendCapUsd': 1 },
        },
      })
    ).id;
    userId = (
      await prisma.user.create({
        data: {
          name: 'Metering owner',
          email: `meter-${stamp}@example.com`,
          passwordHash: 'test-only',
        },
      })
    ).id;
    await prisma.businessUser.create({
      data: { businessId, userId, role: 'owner' },
    });
    callId = (
      await prisma.phoneCall.create({
        data: {
          businessId,
          callSid: `CA-meter-${stamp}`,
          fromNumber: '+15555552222',
          endedAt: new Date(),
          status: 'completed',
          isTestCall: true,
        },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { businessId } });
    await prisma.voiceUsageRecord.deleteMany({ where: { businessId } });
    await prisma.phoneCall.deleteMany({ where: { businessId } });
    await prisma.businessUser.deleteMany({ where: { businessId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('keeps provider duration and actual QA charges, warns at 70/90 once and blocks at the cap', async () => {
    await service.recordProviderCall(callId, {
      duration: '60',
      price: '-0.75',
      price_unit: 'usd',
    });
    expect(await prisma.notification.count({ where: { businessId } })).toBe(1);
    await Promise.all([
      service.recordProviderCall(callId, {
        duration: '60',
        price: '-0.95',
        price_unit: 'usd',
      }),
      service.checkAlerts(businessId),
    ]);
    expect(await prisma.notification.count({ where: { businessId } })).toBe(2);
    await service.recordProviderCall(callId, {
      duration: '60',
      price: '-1.05',
      price_unit: 'usd',
    });
    expect((await voiceSpendState(prisma, businessId)).reached).toBe(true);
    expect(await prisma.voiceUsageRecord.count({ where: { callId } })).toBe(1);
    expect((await service.summary(businessId)).units).toContainEqual({
      unit: 'inbound_provider_seconds',
      state: 'confirmed',
      quantity: 60,
      records: 1,
    });
  });

  it('shows unpriced data and does not invent cross-currency conversion or invoice prices', async () => {
    const call = await prisma.phoneCall.create({
      data: {
        businessId,
        callSid: `CA-other-${randomUUID()}`,
        fromNumber: '+15555552222',
        direction: 'outbound',
        endedAt: new Date(),
        status: 'completed',
      },
    });
    await service.recordProviderCall(call.id, {
      duration: '10',
      price: null,
      price_unit: 'USD',
    });
    let summary = await service.summary(businessId);
    expect(summary.pendingOrUnpriced).toBe(1);
    expect(summary.pricing.requiredPrice).toBeNull();
    await service.recordProviderCall(call.id, {
      duration: '10',
      price: '-200',
      price_unit: 'eur',
    });
    summary = await service.summary(businessId);
    expect(summary.costs).toContainEqual({
      currency: 'EUR',
      state: 'confirmed',
      amount: 200,
    });
    expect(summary.spendAgainstCapUsd).toBe(1.05);
    await prisma.business.update({
      where: { id: businessId },
      data: { policies: {} },
    });
    expect((await voiceSpendState(prisma, businessId)).reached).toBe(false);
  });

  it('records provider-reported transcription audio duration once without inventing a charge', async () => {
    const call = await prisma.phoneCall.create({
      data: {
        businessId,
        callSid: `CA-transcription-${randomUUID()}`,
        fromNumber: '+15555552222',
        isTestCall: true,
      },
    });
    const objectKey = `voice-recordings/${businessId}/qa-audio.mp3`;
    await service.recordTranscriptionDuration(
      businessId,
      call.callSid,
      objectKey,
      18.4,
    );
    await service.recordTranscriptionDuration(
      businessId,
      call.callSid,
      objectKey,
      18.4,
    );
    const usage = await prisma.voiceUsageRecord.findFirstOrThrow({
      where: { businessId, unit: 'transcription_audio_seconds' },
    });
    expect(Number(usage.quantity)).toBe(18.4);
    expect(usage).toMatchObject({
      provider: 'openai',
      state: 'unpriced',
      cost: null,
    });
    expect(
      await prisma.voiceUsageRecord.count({
        where: { businessId, unit: 'transcription_audio_seconds' },
      }),
    ).toBe(1);
    expect((await service.summary(businessId)).units).toContainEqual({
      unit: 'transcription_audio_seconds',
      state: 'unpriced',
      quantity: 18.4,
      records: 1,
    });
  });
});
