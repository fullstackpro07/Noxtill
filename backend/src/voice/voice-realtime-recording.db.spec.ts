import { randomUUID } from 'crypto';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { VoiceRealtimeService } from './voice-realtime.service';
import { VoiceUsageMeteringService } from './voice-usage-metering.service';

describe('Realtime recording import (MySQL, provider simulated)', () => {
  const prisma = new PrismaService();
  const storage = { upload: jest.fn(), delete: jest.fn() };
  const config = new ConfigService({
    TWILIO_ACCOUNT_SID: 'AC-qa',
    TWILIO_AUTH_TOKEN: 'qa-only',
  });
  const service = new VoiceRealtimeService(
    prisma,
    config,
    {} as never,
    new VoiceUsageMeteringService(prisma),
    storage as never,
  );
  let businessId: string;
  const recordingSid = `RE${'a'.repeat(32)}`;

  beforeAll(async () => {
    await prisma.$connect();
    businessId = (
      await prisma.business.create({
        data: {
          name: 'QA recording import',
          slug: `qa-recording-${randomUUID()}`,
        },
      })
    ).id;
  });
  afterEach(() => {
    jest.restoreAllMocks();
    storage.upload.mockReset();
    storage.delete.mockReset();
  });
  afterAll(async () => {
    await prisma.voiceUsageRecord.deleteMany({ where: { businessId } });
    await prisma.auditLog.deleteMany({ where: { businessId } });
    await prisma.phoneCall.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });
  async function call(
    consent: 'granted' | 'declined' = 'granted',
    deleted = false,
  ) {
    return prisma.phoneCall.create({
      data: {
        businessId,
        callSid: `CA-${randomUUID()}`,
        fromNumber: '+15550000001',
        recordingConsentStatus: consent,
        isTestCall: true,
        recordingDeletedAt: deleted ? new Date() : null,
      },
    });
  }
  function receipt(callSid: string) {
    return jest
      .spyOn(axios, 'get')
      .mockResolvedValueOnce({
        data: { call_sid: callSid, status: 'completed' },
      })
      .mockResolvedValueOnce({ data: Buffer.from('qa-audio-bytes') });
  }
  it('imports confirmed media once, meters actual bytes even for QA, then removes the provider copy', async () => {
    const row = await call();
    const get = receipt(row.callSid);
    const remove = jest.spyOn(axios, 'delete').mockResolvedValue({});
    await service.saveRecording(row.callSid, recordingSid);
    await service.saveRecording(row.callSid, recordingSid);
    expect(storage.upload).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenCalledTimes(2);
    const usage = await prisma.voiceUsageRecord.findFirstOrThrow({
      where: { callId: row.id },
    });
    expect(Number(usage.quantity)).toBe(Buffer.byteLength('qa-audio-bytes'));
    expect(usage.cost).toBeNull();
  });
  it('never imports a declined or previously deleted recording, or one belonging to another call', async () => {
    const declined = await call('declined');
    const get = jest.spyOn(axios, 'get');
    await service.saveRecording(declined.callSid, recordingSid);
    expect(get).not.toHaveBeenCalled();
    const deleted = await call('granted', true);
    get.mockResolvedValueOnce({
      data: { call_sid: deleted.callSid, status: 'completed' },
    });
    const remove = jest.spyOn(axios, 'delete').mockResolvedValue({});
    await service.saveRecording(deleted.callSid, recordingSid);
    expect(remove).toHaveBeenCalledTimes(1);
    const wrong = await call();
    get.mockResolvedValueOnce({
      data: { call_sid: 'another-call', status: 'completed' },
    });
    await service.saveRecording(wrong.callSid, recordingSid);
    expect(storage.upload).not.toHaveBeenCalled();
  });
  it('keeps a legal-hold provider copy and does not recreate media after a concurrent deletion', async () => {
    const held = await call();
    await prisma.phoneCall.update({
      where: { id: held.id },
      data: { legalHoldAt: new Date() },
    });
    receipt(held.callSid);
    const remove = jest.spyOn(axios, 'delete').mockResolvedValue({});
    await service.saveRecording(held.callSid, recordingSid);
    expect(remove).not.toHaveBeenCalled();
    const erased = await call();
    jest
      .spyOn(axios, 'get')
      .mockResolvedValueOnce({
        data: { call_sid: erased.callSid, status: 'completed' },
      })
      .mockResolvedValueOnce({ data: Buffer.from('qa') });
    storage.upload.mockImplementationOnce(async () => {
      await prisma.phoneCall.update({
        where: { id: erased.id },
        data: { recordingDeletedAt: new Date() },
      });
    });
    await service.saveRecording(erased.callSid, recordingSid);
    expect(storage.delete).toHaveBeenCalledTimes(1);
    expect(
      (await prisma.phoneCall.findUniqueOrThrow({ where: { id: erased.id } }))
        .recordingKey,
    ).toBeNull();
  });
});
