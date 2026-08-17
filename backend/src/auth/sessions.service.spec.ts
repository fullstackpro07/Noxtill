import { PrismaService } from '../prisma/prisma.service';
import { SessionsService } from './sessions.service';

describe('SessionsService (UPD-BE-040)', () => {
  let prisma: PrismaService;
  let service: SessionsService;
  let businessId: string;
  let userId: string;
  let otherUserId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new SessionsService(prisma);

    const business = await prisma.business.create({
      data: { name: 'Sessions Test Biz', slug: `sessions-test-${Date.now()}` },
    });
    businessId = business.id;

    const user = await prisma.user.create({
      data: {
        name: 'Session User',
        phone: `+1${Date.now()}1`,
        passwordHash: 'irrelevant-hash',
      },
    });
    userId = user.id;

    const otherUser = await prisma.user.create({
      data: {
        name: 'Other User',
        phone: `+1${Date.now()}2`,
        passwordHash: 'irrelevant-hash',
      },
    });
    otherUserId = otherUser.id;
  });

  afterAll(async () => {
    await prisma.session.deleteMany({ where: { businessId } });
    await prisma.user.deleteMany({
      where: { id: { in: [userId, otherUserId] } },
    });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('creates a real session, sets its refresh-token hash, and verifies against it', async () => {
    const session = await service.create(
      userId,
      businessId,
      'Mozilla/5.0 Test',
      '127.0.0.1',
    );
    expect(session.userAgent).toBe('Mozilla/5.0 Test');
    expect(session.revokedAt).toBeNull();

    await service.setRefreshTokenHash(session.id, 'real-refresh-token-value');

    expect(
      await service.verifyRefreshToken(session.id, 'real-refresh-token-value'),
    ).toBe(true);
    expect(await service.verifyRefreshToken(session.id, 'wrong-token')).toBe(
      false,
    );
  });

  it('revoked sessions are never found active and always fail verification', async () => {
    const session = await service.create(userId, businessId);
    await service.setRefreshTokenHash(session.id, 'token-a');
    await service.revoke(session.id);

    expect(await service.findActive(session.id)).toBeNull();
    expect(await service.verifyRefreshToken(session.id, 'token-a')).toBe(false);
  });

  it('list() returns only the real, non-revoked sessions for that user', async () => {
    const s1 = await service.create(userId, businessId);
    const s2 = await service.create(userId, businessId);
    await service.revoke(s1.id);

    const list = await service.list(userId);
    const ids = list.map((s) => s.id);
    expect(ids).toContain(s2.id);
    expect(ids).not.toContain(s1.id);
  });

  it('revokeOwn() rejects revoking a real session that belongs to someone else', async () => {
    const session = await service.create(otherUserId, businessId);
    await expect(service.revokeOwn(userId, session.id)).rejects.toThrow();

    const stillActive = await service.findActive(session.id);
    expect(stillActive).not.toBeNull();

    await service.revokeOwn(otherUserId, session.id);
    expect(await service.findActive(session.id)).toBeNull();
  });
});
