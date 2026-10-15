import { PrismaService } from '../prisma/prisma.service';
import { SendGateService } from '../messaging/send-gate.service';
import { MissedCallService } from './missed-call.service';

describe('MissedCallService (UPD-BE-059)', () => {
  let prisma: PrismaService;
  let service: MissedCallService;
  let businessId: string;
  const sendGate = { send: jest.fn() };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new MissedCallService(
      prisma,
      sendGate as unknown as SendGateService,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Missed Call Test Biz',
        slug: `missed-call-test-${Date.now()}`,
      },
    });
    businessId = business.id;
  });

  afterEach(() => {
    sendGate.send.mockReset();
  });

  afterAll(async () => {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.phoneCall.deleteMany({ where: { businessId } });
      await tx.customer.deleteMany({ where: { businessId } });
      await tx.voiceSuppressionEntry.deleteMany({ where: { businessId } });
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  let seq = 0;
  const missed = (fromNumber: string) =>
    prisma.phoneCall.create({
      data: {
        businessId,
        callSid: `CA-missed-${Date.now()}-${(seq += 1)}`,
        fromNumber,
        status: 'missed',
        transcript: [],
      },
    });

  it('sends a recovery message addressed to an unknown caller and records the message', async () => {
    sendGate.send.mockResolvedValue({ id: 'msg-1' });
    const call = await missed('+15550001111');

    await service.notify(call);

    expect(sendGate.send).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId,
        templateKey: 'missed_call',
        to: { phone: '+15550001111' },
        idempotencyKey: `missed-call:${call.id}`,
      }),
    );
    const row = await prisma.phoneCall.findUniqueOrThrow({
      where: { id: call.id },
    });
    expect(row).toMatchObject({
      textBackStatus: 'queued',
      textBackMessageId: 'msg-1',
    });
  });

  it('never throws back into the caller when the send fails, and records the failure', async () => {
    sendGate.send.mockRejectedValue(new Error('quota exceeded'));
    const call = await missed('+15550002222');

    await expect(service.notify(call)).resolves.toBeUndefined();
    const row = await prisma.phoneCall.findUniqueOrThrow({
      where: { id: call.id },
    });
    expect(row.textBackStatus).toBe('failed');
  });

  it('skips suppressed numbers and opted-out customers without sending', async () => {
    await prisma.voiceSuppressionEntry.create({
      data: {
        businessId,
        phoneE164: '+15550003333',
        source: 'customer_request',
        reason: 'Asked not to be contacted',
        effectiveAt: new Date(Date.now() - 1000),
      },
    });
    await prisma.customer.create({
      data: {
        businessId,
        name: 'Opted Out',
        phone: '+15550004444',
        optedOut: true,
      },
    });
    const suppressed = await missed('+15550003333');
    const optedOut = await missed('+15550004444');

    await service.notify(suppressed);
    await service.notify(optedOut);

    expect(sendGate.send).not.toHaveBeenCalled();
    expect(
      (
        await prisma.phoneCall.findUniqueOrThrow({
          where: { id: suppressed.id },
        })
      ).textBackStatus,
    ).toBe('skipped_suppressed');
    expect(
      (await prisma.phoneCall.findUniqueOrThrow({ where: { id: optedOut.id } }))
        .textBackStatus,
    ).toBe('skipped_opted_out');
  });

  it('sends nothing when the owner turned text-back off', async () => {
    await prisma.business.update({
      where: { id: businessId },
      data: { policies: { 'voice.missedCallTextBack': false } },
    });
    const call = await missed('+15550005555');
    await service.notify(call);
    expect(sendGate.send).not.toHaveBeenCalled();
    expect(
      (await prisma.phoneCall.findUniqueOrThrow({ where: { id: call.id } }))
        .textBackStatus,
    ).toBe('disabled');
  });

  it('never texts a configured test caller', async () => {
    await prisma.business.update({
      where: { id: businessId },
      data: { policies: { 'voice.missedCallTextBack': true } },
    });
    const call = await prisma.phoneCall.create({
      data: {
        businessId,
        callSid: `CA-missed-test-${Date.now()}`,
        fromNumber: '+15550006666',
        status: 'missed',
        isTestCall: true,
        transcript: [],
      },
    });
    await service.notify(call);
    expect(sendGate.send).not.toHaveBeenCalled();
    expect(
      (await prisma.phoneCall.findUniqueOrThrow({ where: { id: call.id } }))
        .textBackStatus,
    ).toBe('skipped_test_call');
  });
});
