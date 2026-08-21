import { PrismaService } from '../prisma/prisma.service';
import { LocaleService } from '../common/localization/locale.service';
import { SendGateService } from '../messaging/send-gate.service';
import { NightlyCloseService } from './nightly-close.service';
import { Role } from '@prisma/client';

describe('NightlyCloseService history/preview/test-send (UPD-BE-083)', () => {
  let prisma: PrismaService;
  let service: NightlyCloseService;
  let businessId: string;
  let ownerUserId: string;
  const sendGate = {
    send: jest.fn().mockResolvedValue(undefined),
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
});
