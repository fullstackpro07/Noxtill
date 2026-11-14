import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { CapabilitiesService } from '../../common/capabilities/capabilities.service';
import { SecurityEventsService } from '../../common/security/security-events.service';
import { AuthService } from '../auth.service';
import { AccountService } from '../account.service';
import { AuthTokensService } from '../auth-tokens.service';
import { AuthMailerService } from '../auth-mailer.service';
import { SessionsService } from '../sessions.service';
import { SignInMethodsService } from '../sign-in-methods.service';
import { MfaService } from '../mfa/mfa.service';
import { PasswordService } from '../security/password.service';
import { AuthRateLimitService } from '../security/auth-rate-limit.service';
import { SocialAuthService } from '../oauth/social-auth.service';
import { PasskeysService } from '../passkeys/passkeys.service';

export interface SentMail {
  to: string;
  subject: string;
  code?: string;
  url?: string;
}

/**
 * Builds the real auth services on a real PrismaService for integration specs (AGENTS §3: real
 * MySQL, no mocked Prisma). Only email delivery is captured in-memory (`outbox`) so tests can read
 * codes/links; the breach-corpus call is off unless a test turns it on.
 */
export function buildAuthKit(
  prisma: PrismaService,
  extraConfig: Record<string, unknown> = {},
) {
  process.env.AUTH_BREACH_CHECK ??= 'false';
  const config = new ConfigService({
    JWT_SECRET: 'test-secret-test-secret-123',
    JWT_REFRESH_SECRET: 'test-refresh-test-refresh-123',
    FRONTEND_URL: 'https://app.example.com',
    BACKEND_URL: 'https://api.example.com/api/v1',
    AUTH_BREACH_CHECK: 'false',
    NODE_ENV: 'test',
    ...extraConfig,
  });
  const outbox: SentMail[] = [];
  const mailer = new AuthMailerService(config);
  // Capture instead of calling the provider.
  (
    mailer as unknown as {
      send: (m: SentMail & { label: string }) => Promise<boolean>;
    }
  ).send = (m) => {
    outbox.push({ to: m.to, subject: m.subject, code: m.code, url: m.url });
    return Promise.resolve(true);
  };
  const events = new SecurityEventsService(prisma);
  const sessions = new SessionsService(prisma, events);
  const passwords = new PasswordService(config);
  const rateLimit = new AuthRateLimitService(prisma, events);
  const tokens = new AuthTokensService(prisma, mailer, events);
  const mfa = new MfaService(prisma, config, events);
  const auth = new AuthService(
    prisma,
    new JwtService(),
    config,
    new CapabilitiesService(prisma),
    sessions,
    mfa,
    tokens,
    passwords,
    rateLimit,
    mailer,
    events,
  );
  const methods = new SignInMethodsService(
    prisma,
    passwords,
    sessions,
    mfa,
    mailer,
    events,
  );
  const account = new AccountService(
    prisma,
    tokens,
    passwords,
    rateLimit,
    sessions,
    mailer,
    events,
  );
  const social = new SocialAuthService(
    prisma,
    config,
    auth,
    tokens,
    methods,
    sessions,
    rateLimit,
    events,
  );
  const passkeys = new PasskeysService(
    prisma,
    config,
    auth,
    methods,
    sessions,
    mfa,
    rateLimit,
    mailer,
    events,
  );
  const lastCode = (to: string) =>
    [...outbox].reverse().find((m) => m.to === to && m.code)?.code;
  return {
    config,
    outbox,
    lastCode,
    mailer,
    events,
    sessions,
    passwords,
    rateLimit,
    tokens,
    mfa,
    auth,
    methods,
    account,
    social,
    passkeys,
  };
}

export type AuthKit = ReturnType<typeof buildAuthKit>;

/** Removes everything the kit-created users own (FK order), by email prefix. */
export async function cleanupUsers(prisma: PrismaService, emailPrefix: string) {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: emailPrefix } },
    select: { id: true, businessUsers: { select: { businessId: true } } },
  });
  const ids = users.map((u) => u.id);
  const businessIds = users.flatMap((u) =>
    u.businessUsers.map((b) => b.businessId),
  );
  if (!ids.length) return;
  await prisma.securityEvent.deleteMany({ where: { userId: { in: ids } } });
  await prisma.webAuthnChallenge.deleteMany({ where: { userId: { in: ids } } });
  await prisma.session.deleteMany({ where: { userId: { in: ids } } });
  await prisma.businessUser.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.business.deleteMany({ where: { id: { in: businessIds } } });
}

/** Clears auth rate-limit buckets so repeated runs don't trip each other. */
export async function resetRateLimits(prisma: PrismaService) {
  await prisma.authRateBucket.deleteMany({});
}
