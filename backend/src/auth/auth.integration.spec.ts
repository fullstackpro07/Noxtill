import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import {
  buildAuthKit,
  cleanupUsers,
  resetRateLimits,
  type AuthKit,
} from './testing/auth-test-kit';
import type { LoginOutcome } from './auth.service';

process.env.AUTH_SKIP_EMAIL_VERIFICATION = 'false';

const codeOf = (p: Promise<unknown>) =>
  p.then(
    () => 'resolved',
    (e: unknown) =>
      e instanceof AppException
        ? (e.getResponse() as { code: string }).code
        : (e as Error).message,
  );
const authed = (o: LoginOutcome) =>
  o as Extract<LoginOutcome, { status: 'authenticated' }>;

/** Core sign-in behaviour on real MySQL (BE-007, UPD-BE-040, UPD-INT-012) on opaque sessions. */
describe('AuthService integration', () => {
  const ts = Date.now();
  const prefix = `authint-${ts}-`;
  const mail = (t: string) => `${prefix}${t}@example.com`;
  const PASSWORD = 'a long enough passphrase';
  const meta = {
    ipAddress: '192.0.2.10',
    userAgent: 'jest',
    deviceId: `dev-${ts}`,
  };
  let prisma: PrismaService;
  let kit: AuthKit;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    await resetRateLimits(prisma);
    kit = buildAuthKit(prisma);
  });

  afterAll(async () => {
    await cleanupUsers(prisma, prefix);
    await prisma.$disconnect();
  });

  async function verified(tag: string) {
    const res = await kit.auth.signup(
      { email: mail(tag), password: PASSWORD },
      meta,
    );
    await prisma.user.update({
      where: { id: res.user.id },
      data: { emailVerifiedAt: new Date(), mfaRequired: false },
    });
    await prisma.businessUser.updateMany({
      where: { userId: res.user.id },
      data: { role: 'manager' },
    });
    return res;
  }

  it('signup creates a business, an owner who must enrol MFA, and an opaque session', async () => {
    const res = await kit.auth.signup(
      { email: mail('signup'), password: PASSWORD },
      meta,
    );
    expect(res.tokens.accessToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(res.tokens.refreshToken).not.toBe(res.tokens.accessToken);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: res.user.id },
    });
    expect(user.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user.mfaRequired).toBe(true);
    const session = await prisma.session.findUniqueOrThrow({
      where: { id: res.tokens.sessionId },
    });
    expect(session.mfaSetupRequired).toBe(true);
    // Only hashes are stored.
    expect(session.accessTokenHash).not.toBe(res.tokens.accessToken);
  });

  it('rejects a duplicate email and a weak password', async () => {
    expect(
      await codeOf(
        kit.auth.signup({ email: mail('signup'), password: PASSWORD }, meta),
      ),
    ).toBe('ACCOUNT_EXISTS');
    expect(
      await codeOf(
        kit.auth.signup({ email: mail('weak'), password: 'short' }, meta),
      ),
    ).toBe('WEAK_PASSWORD');
  });

  it('logs in with correct credentials on a known device; wrong password is a plain 401', async () => {
    await verified('login');
    expect(
      (
        await kit.auth.login(
          { emailOrPhone: mail('login'), password: PASSWORD },
          meta,
        )
      ).status,
    ).toBe('authenticated');
    expect(
      await codeOf(
        kit.auth.login(
          { emailOrPhone: mail('login'), password: 'not the password' },
          meta,
        ),
      ),
    ).toBe('Invalid credentials');
  });

  it('upgrades a legacy bcrypt hash to Argon2id on the next successful sign-in', async () => {
    const res = await verified('legacy');
    await prisma.user.update({
      where: { id: res.user.id },
      data: { passwordHash: bcrypt.hashSync(PASSWORD, 4) },
    });
    await kit.auth.login(
      { emailOrPhone: mail('legacy'), password: PASSWORD },
      meta,
    );
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: res.user.id } }))
        .passwordHash,
    ).toMatch(/^\$argon2id\$/);
  });

  it('a deactivated business blocks sign-in and refresh, and works again once reactivated', async () => {
    const res = await verified('branch');
    await prisma.business.update({
      where: { id: res.business.id },
      data: { active: false },
    });
    expect(
      await codeOf(
        kit.auth.login(
          { emailOrPhone: mail('branch'), password: PASSWORD },
          meta,
        ),
      ),
    ).toBe('BUSINESS_DEACTIVATED');
    expect(await codeOf(kit.auth.refresh(res.tokens.refreshToken))).toBe(
      'INVALID_REFRESH',
    );
    await prisma.business.update({
      where: { id: res.business.id },
      data: { active: true },
    });
    expect(
      (
        await kit.auth.login(
          { emailOrPhone: mail('branch'), password: PASSWORD },
          meta,
        )
      ).status,
    ).toBe('authenticated');
  });

  it('two logins get two independent sessions; logout ends only the current one', async () => {
    const res = await verified('twodev');
    const a = authed(
      await kit.auth.login(
        { emailOrPhone: mail('twodev'), password: PASSWORD },
        meta,
      ),
    );
    const b = authed(
      await kit.auth.login(
        { emailOrPhone: mail('twodev'), password: PASSWORD },
        meta,
      ),
    );
    expect(a.tokens.sessionId).not.toBe(b.tokens.sessionId);
    await kit.auth.logout({
      sub: res.user.id,
      businessId: res.business.id,
      sessionId: a.tokens.sessionId,
    } as AuthenticatedUser);
    expect(await kit.sessions.resolveAccess(a.tokens.accessToken)).toBeNull();
    expect(
      await kit.sessions.resolveAccess(b.tokens.accessToken),
    ).not.toBeNull();
    // Rotation issues new tokens and retires the presented refresh token.
    const rotated = await kit.auth.refresh(b.tokens.refreshToken);
    expect(rotated.tokens.refreshToken).not.toBe(b.tokens.refreshToken);
    expect(await kit.sessions.resolveAccess(b.tokens.accessToken)).toBeNull();
    expect(
      await kit.sessions.resolveAccess(rotated.tokens.accessToken),
    ).not.toBeNull();
  });

  it('the device list never exposes token hashes and marks the current session', async () => {
    const res = await verified('list');
    const list = await kit.sessions.list(res.user.id, res.tokens.sessionId);
    expect(list.find((s) => s.current)?.id).toBe(res.tokens.sessionId);
    expect(JSON.stringify(list)).not.toMatch(/Hash|token/i);
  });
});
