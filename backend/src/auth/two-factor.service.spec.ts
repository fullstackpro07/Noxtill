import { PrismaService } from '../prisma/prisma.service';
import { TwoFactorService } from './two-factor.service';
import { SendGateService } from '../messaging/send-gate.service';
import { AppException } from '../common/filters/app.exception';
import { TWO_FACTOR_MAX_ATTEMPTS } from './two-factor.constants';

describe('TwoFactorService (UPD-BE-040)', () => {
  let prisma: PrismaService;
  let service: TwoFactorService;
  let businessId: string;
  let userId: string;
  const sendGate = {
    send: jest
      .fn<Promise<void>, [Record<string, unknown>]>()
      .mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new TwoFactorService(
      prisma,
      sendGate as unknown as SendGateService,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Two Factor Test Biz',
        slug: `two-factor-test-${Date.now()}`,
      },
    });
    businessId = business.id;

    const user = await prisma.user.create({
      data: {
        name: '2FA User',
        phone: `+1${Date.now()}`,
        passwordHash: 'irrelevant-hash',
      },
    });
    userId = user.id;
  });

  afterEach(() => {
    sendGate.send.mockClear();
  });

  afterAll(async () => {
    await prisma.twoFactorCode.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  function lastSentCode(): string {
    const call = sendGate.send.mock.calls[sendGate.send.mock.calls.length - 1];
    return (call[0].variables as Record<string, string>).code;
  }

  it('sends a real 6-digit code via SendGateService and stores only its hash', async () => {
    await service.generateAndSend(userId, businessId, '+15550001234');

    expect(sendGate.send).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId,
        templateKey: 'otp_code',
        to: { phone: '+15550001234' },
      }),
    );
    const code = lastSentCode();
    expect(code).toMatch(/^\d{6}$/);

    const stored = await prisma.twoFactorCode.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    expect(stored!.codeHash).not.toBe(code); // never stored raw
  });

  it('verifies the real correct code and consumes it — reusing it afterward fails', async () => {
    await service.generateAndSend(userId, businessId, '+15550001234');
    const code = lastSentCode();

    await expect(service.verify(userId, code)).resolves.toBeUndefined();
    await expect(service.verify(userId, code)).rejects.toBeInstanceOf(
      AppException,
    );
  });

  it('rejects a wrong code and locks out after too many attempts', async () => {
    await service.generateAndSend(userId, businessId, '+15550001234');

    for (let i = 0; i < TWO_FACTOR_MAX_ATTEMPTS; i++) {
      await expect(service.verify(userId, '000000')).rejects.toBeInstanceOf(
        AppException,
      );
    }
    // The real correct code is now locked out too, even though it was never used.
    const code = lastSentCode();
    await expect(service.verify(userId, code)).rejects.toBeInstanceOf(
      AppException,
    );
  });

  it('rejects an expired code', async () => {
    await service.generateAndSend(userId, businessId, '+15550001234');
    const code = lastSentCode();

    await prisma.twoFactorCode.updateMany({
      where: { userId, consumedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    await expect(service.verify(userId, code)).rejects.toBeInstanceOf(
      AppException,
    );
  });
});
