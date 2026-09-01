import { PrismaService } from '../prisma/prisma.service';
import { LocaleService } from '../common/localization/locale.service';
import {
  SendGateService,
  SendGateParams,
} from '../messaging/send-gate.service';
import { NightlyCloseService } from './nightly-close.service';
import { Message, Role } from '@prisma/client';

describe('NightlyCloseService history/preview/test-send (UPD-BE-083)', () => {
  let prisma: PrismaService;
  let service: NightlyCloseService;
  let businessId: string;
  let ownerUserId: string;
  const sendGate = {
    send: jest
      .fn<Promise<Message>, [SendGateParams]>()
      .mockResolvedValue(undefined as unknown as Message),
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    service = new NightlyCloseService(
      prisma,
      new LocaleService(),
      sendGate as unknown as SendGateService,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Nightly Close Test Biz',
        slug: `nightly-close-test-${Date.now()}`,
      },
    });
    businessId = business.id;

    const user = await prisma.user.create({
      data: {
        name: 'Owner',
        phone: `+1415555${String(Date.now()).slice(-4)}`,
        passwordHash: 'x',
      },
    });
    ownerUserId = user.id;
    await prisma.businessUser.create({
      data: { businessId, userId: user.id, role: Role.owner },
    });
  });

  afterEach(() => {
    sendGate.send.mockClear();
  });

  afterAll(async () => {
    await prisma.nightlyCloseLog.deleteMany({ where: { businessId } });
    await prisma.businessUser.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.user.delete({ where: { id: ownerUserId } });
    await prisma.$disconnect();
  });

  it('preview() composes real day data without sending anything', async () => {
    const result = await service.preview(businessId);
    expect(result.businessId).toBe(businessId);
    expect(sendGate.send).not.toHaveBeenCalled();
  });

  it('composeAndSend() logs a real "sent" row on success', async () => {
    await service.composeAndSend(businessId, new Date());
    expect(sendGate.send).toHaveBeenCalledTimes(1);

    const log = await prisma.nightlyCloseLog.findFirst({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
    });
    expect(log?.status).toBe('sent');
    expect(log?.error).toBeNull();
  });

  it('composeAndSend() logs a real "failed" row and rethrows when the send fails', async () => {
    sendGate.send.mockRejectedValueOnce(new Error('WhatsApp window closed'));
    const date = new Date(Date.now() - 24 * 60 * 60 * 1000);

    await expect(service.composeAndSend(businessId, date)).rejects.toThrow(
      'WhatsApp window closed',
    );

    const log = await prisma.nightlyCloseLog.findFirst({
      where: {
        businessId,
        closeDate: new Date(date.toISOString().slice(0, 10)),
      },
    });
    expect(log?.status).toBe('failed');
    expect(log?.error).toContain('WhatsApp window closed');
  });

  it('a same-day retry updates the existing log row instead of duplicating it', async () => {
    const date = new Date();
    await service.composeAndSend(businessId, date);
    await service.composeAndSend(businessId, date);

    const rows = await prisma.nightlyCloseLog.findMany({
      where: {
        businessId,
        closeDate: new Date(date.toISOString().slice(0, 10)),
      },
    });
    expect(rows).toHaveLength(1);
  });

  it('testSend() sends immediately regardless of the configured schedule time', async () => {
    await service.testSend(businessId);
    expect(sendGate.send).toHaveBeenCalledTimes(1);
  });

  it('getHistory() returns real per-day figures joined with the real delivery log, newest first', async () => {
    const history = await service.getHistory(businessId);
    expect(history.length).toBeGreaterThan(0);
    expect(history[0]).toHaveProperty('deliveryStatus');
    expect(history[0]).toHaveProperty('revenue');
    // newest-first ordering
    for (let i = 1; i < history.length; i++) {
      expect(new Date(history[i - 1].date).getTime()).toBeGreaterThanOrEqual(
        new Date(history[i].date).getTime(),
      );
    }
  });

  it('getHistory() filters by status', async () => {
    const failedOnly = await service.getHistory(businessId, {
      status: 'failed',
    });
    expect(failedOnly.every((row) => row.deliveryStatus === 'failed')).toBe(
      true,
    );
    expect(failedOnly.length).toBeGreaterThanOrEqual(1);
  });

  describe('Nightly Close Settings, full (UPD-BE-119)', () => {
    it('getSettings() defaults to every real section, in order, no custom lines, voice off', async () => {
      const settings = await service.getSettings(businessId);
      expect(settings.config.sections).toEqual([
        'sales',
        'lowStock',
        'appointmentsTomorrow',
        'newReviews',
        'openFeedback',
        'creditPayments',
      ]);
      expect(settings.config.voiceNoteEnabled).toBe(false);
      expect(settings.config.customLines).toEqual([]);
    });

    it('updateSettings() really persists a reordered/reduced section list, a voice selection, and custom lines', async () => {
      const updated = await service.updateSettings(businessId, {
        sections: ['creditPayments', 'sales'],
        voiceNoteEnabled: true,
        voiceId: 'warm_female',
        customLines: [{ label: 'Weather', value: 'Sunny, light foot traffic' }],
      });
      expect(updated.config.sections).toEqual(['creditPayments', 'sales']);
      expect(updated.config.voiceNoteEnabled).toBe(true);
      expect(updated.config.voiceId).toBe('warm_female');
      expect(updated.config.customLines).toEqual([
        { label: 'Weather', value: 'Sunny, light foot traffic' },
      ]);

      const refetched = await service.getSettings(businessId);
      expect(refetched.config.sections).toEqual(['creditPayments', 'sales']);
    });

    it('a partial updateSettings() call merges over the existing config rather than resetting it', async () => {
      await service.updateSettings(businessId, {
        sections: ['sales', 'lowStock'],
        customLines: [{ label: 'Note', value: 'Test' }],
      });
      await service.updateSettings(businessId, { voiceNoteEnabled: false });

      const settings = await service.getSettings(businessId);
      expect(settings.config.sections).toEqual(['sales', 'lowStock']);
      expect(settings.config.customLines).toEqual([
        { label: 'Note', value: 'Test' },
      ]);
      expect(settings.config.voiceNoteEnabled).toBe(false);
    });

    it('composeAndSend() sends a real customBody reflecting only the configured sections, in the configured order, plus custom lines', async () => {
      await service.updateSettings(businessId, {
        sections: ['creditPayments', 'sales'],
        customLines: [{ label: 'Weather', value: 'Rainy' }],
      });

      await service.composeAndSend(businessId, new Date());

      const [[sendArgs]] = sendGate.send.mock.calls.slice(-1);
      const body = (sendArgs as { customBody: string }).customBody;
      const creditIndex = body.indexOf('Credit payments today');
      const salesIndex = body.indexOf('Sales:');
      expect(creditIndex).toBeGreaterThanOrEqual(0);
      expect(salesIndex).toBeGreaterThan(creditIndex);
      expect(body).toContain('Weather: Rainy');
      expect(body).not.toContain('Low stock');
      expect(body).not.toContain('Tomorrow:');
    });
  });
});
