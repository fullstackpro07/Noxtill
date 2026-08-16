import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import { CapabilitiesService } from '../common/capabilities/capabilities.service';

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

    authService = new AuthService(
      prisma,
      jwt,
      config,
      new CapabilitiesService(prisma),
    );
  });

  afterAll(async () => {
    const user = await prisma.user.findFirst({ where: { email: testEmail } });
    if (user) {
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
