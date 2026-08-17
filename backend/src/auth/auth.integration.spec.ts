import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import { CapabilitiesService } from '../common/capabilities/capabilities.service';
import { SessionsService } from './sessions.service';
import { TwoFactorService } from './two-factor.service';
import type { SendGateService } from '../messaging/send-gate.service';

describe('AuthService integration (BE-007)', () => {
  let prisma: PrismaService;
  let authService: AuthService;
  const testEmail = `auth-test-${Date.now()}@example.com`;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const config = new ConfigService({
      JWT_SECRET: 'test-secret',
      JWT_REFRESH_SECRET: 'test-refresh-secret',
      JWT_ACCESS_TTL: '15m',
      JWT_REFRESH_TTL: '7d',
      LOGIN_MAX_ATTEMPTS: 3,
      LOGIN_LOCK_MINUTES: 15,
    });
    const jwt = new JwtService();
    const sessions = new SessionsService(prisma);
    const sendGate = { send: jest.fn().mockResolvedValue(undefined) };
    const twoFactor = new TwoFactorService(
      prisma,
      sendGate as unknown as SendGateService,
    );

    authService = new AuthService(
      prisma,
      jwt,
      config,
      new CapabilitiesService(prisma),
      sessions,
      twoFactor,
    );
  });

  afterAll(async () => {
    const user = await prisma.user.findFirst({ where: { email: testEmail } });
    if (user) {
      await prisma.session.deleteMany({ where: { userId: user.id } });
      await prisma.businessUser.deleteMany({ where: { userId: user.id } });
      const business = await prisma.businessUser.findFirst({
        where: { userId: user.id },
      });
      await prisma.user.delete({ where: { id: user.id } });
      if (business) {
        await prisma.business
          .deleteMany({ where: { id: business.businessId } })
          .catch(() => undefined);
      }
    }
    await prisma.$disconnect();
  });

  it('signup creates business + owner user and issues tokens', async () => {
    const result = await authService.signup({
      businessName: 'Auth Test Biz',
      name: 'Test Owner',
      email: testEmail,
      password: 'supersecret123',
    });

    expect(result.accessToken).toBeDefined();
    expect(result.refreshToken).toBeDefined();
    expect(result.user.email).toBe(testEmail);
  });

  it('rejects signup with a duplicate email', async () => {
    await expect(
      authService.signup({
        businessName: 'Dup Biz',
        name: 'Dup Owner',
        email: testEmail,
        password: 'supersecret123',
      }),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('logs in with correct credentials', async () => {
    const result = await authService.login({
      emailOrPhone: testEmail,
      password: 'supersecret123',
    });
    if (!('accessToken' in result)) {
      throw new Error('Expected full tokens, got a pending-2FA response');
    }
    expect(result.accessToken).toBeDefined();
  });

  it('rejects wrong password and locks the account after max attempts', async () => {
    await expect(
      authService.login({ emailOrPhone: testEmail, password: 'wrong-1' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      authService.login({ emailOrPhone: testEmail, password: 'wrong-2' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      authService.login({ emailOrPhone: testEmail, password: 'wrong-3' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    // 4th attempt: account is now locked, even with the correct password.
    await expect(
      authService.login({
        emailOrPhone: testEmail,
        password: 'supersecret123',
      }),
    ).rejects.toBeInstanceOf(AppException);
  });
});

describe('AuthService — sessions + 2FA (UPD-BE-040)', () => {
  let prisma: PrismaService;
  let authService: AuthService;
  let jwt: JwtService;
  const testEmail = `auth-2fa-test-${Date.now()}@example.com`;
  const testPhone = `+1${Date.now()}9`;
  const sendGate = {
    send: jest
      .fn<Promise<void>, [Record<string, unknown>]>()
      .mockResolvedValue(undefined),
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const config = new ConfigService({
      JWT_SECRET: 'test-secret-2fa',
      JWT_REFRESH_SECRET: 'test-refresh-secret-2fa',
      JWT_ACCESS_TTL: '15m',
      JWT_REFRESH_TTL: '7d',
    });
    jwt = new JwtService();
    const sessions = new SessionsService(prisma);
    const twoFactor = new TwoFactorService(
      prisma,
      sendGate as unknown as SendGateService,
    );

    authService = new AuthService(
      prisma,
      jwt,
      config,
      new CapabilitiesService(prisma),
      sessions,
      twoFactor,
    );
  });

  afterEach(() => {
    sendGate.send.mockClear();
  });

  afterAll(async () => {
    const user = await prisma.user.findFirst({ where: { email: testEmail } });
    if (user) {
      await prisma.twoFactorCode.deleteMany({ where: { userId: user.id } });
      await prisma.session.deleteMany({ where: { userId: user.id } });
      await prisma.businessUser.deleteMany({ where: { userId: user.id } });
      const business = await prisma.businessUser.findFirst({
        where: { userId: user.id },
      });
      await prisma.user.delete({ where: { id: user.id } });
      if (business) {
        await prisma.business
          .deleteMany({ where: { id: business.businessId } })
          .catch(() => undefined);
      }
    }
    await prisma.$disconnect();
  });

  function lastSentCode(): string {
    const call = sendGate.send.mock.calls[sendGate.send.mock.calls.length - 1];
    return (call[0].variables as Record<string, string>).code;
  }

  it('two real concurrent logins get two real, independent sessions', async () => {
    await authService.signup({
      businessName: '2FA Test Biz',
      name: 'Test Owner',
      email: testEmail,
      phone: testPhone,
      password: 'supersecret123',
    });

    const first = await authService.login({
      emailOrPhone: testEmail,
      password: 'supersecret123',
    });
    const second = await authService.login({
      emailOrPhone: testEmail,
      password: 'supersecret123',
    });
    if (!('refreshToken' in first) || !('refreshToken' in second)) {
      throw new Error('Expected full tokens');
    }

    // Refreshing the FIRST session must still work — logging in again no longer kills it
    // (the pre-existing single-shared-hash bug this ticket fixes).
    await expect(
      authService.refresh(first.refreshToken),
    ).resolves.toBeDefined();
    await expect(
      authService.refresh(second.refreshToken),
    ).resolves.toBeDefined();
  });

  it('enable -> confirm real 2FA, then a real login requires the real code', async () => {
    const user = await prisma.user.findFirstOrThrow({
      where: { email: testEmail },
    });
    const businessUser = await prisma.businessUser.findFirstOrThrow({
      where: { userId: user.id },
    });

    await authService.enableTwoFactor(user.id, businessUser.businessId);
    const enableCode = lastSentCode();
    await authService.confirmTwoFactor(user.id, enableCode);

    const refreshed = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(refreshed.twoFactorEnabled).toBe(true);

    // Login now returns a pending-2FA response, never full tokens directly.
    const loginResult = await authService.login({
      emailOrPhone: testEmail,
      password: 'supersecret123',
    });
    if (!('pending2fa' in loginResult)) {
      throw new Error('Expected a pending-2FA response');
    }
    expect(loginResult.pending2fa).toBe(true);

    const loginCode = lastSentCode();
    const verified = await authService.verifyTwoFactorLogin(
      loginResult.tempToken,
      loginCode,
    );
    expect(verified.accessToken).toBeDefined();

    // Disabling requires the real password.
    await expect(
      authService.disableTwoFactor(user.id, 'wrong-password'),
    ).rejects.toBeInstanceOf(AppException);
    await authService.disableTwoFactor(user.id, 'supersecret123');
    const disabled = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
    });
    expect(disabled.twoFactorEnabled).toBe(false);
  });

  it('logout revokes only the current session, not every device', async () => {
    const first = await authService.login({
      emailOrPhone: testEmail,
      password: 'supersecret123',
    });
    const second = await authService.login({
      emailOrPhone: testEmail,
      password: 'supersecret123',
    });
    if (!('refreshToken' in first) || !('refreshToken' in second)) {
      throw new Error('Expected full tokens');
    }

    const firstPayload = jwt.decode<{ sessionId: string }>(first.refreshToken);

    await authService.logout(firstPayload.sessionId);

    // The first session's refresh token is now dead; the second device is untouched.
    await expect(authService.refresh(first.refreshToken)).rejects.toThrow();
    await expect(
      authService.refresh(second.refreshToken),
    ).resolves.toBeDefined();
  });
});
