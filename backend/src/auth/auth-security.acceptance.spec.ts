/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Jest asymmetric matchers (`expect.arrayContaining`/`expect.objectContaining`) are typed `any`. */
import { ExecutionContext, RequestMethod } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { REQUIRE_STEP_UP_KEY } from '../common/decorators/require-step-up.decorator';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { StaffService } from '../staff/staff.service';
import type { ApiKeyAuthService } from '../developer/api-key-auth.service';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { totpCode, totpStep } from '../super-admin/totp.util';
import { AuthController } from './auth.controller';
import {
  buildAuthKit,
  cleanupUsers,
  resetRateLimits,
  type AuthKit,
} from './testing/auth-test-kit';
import { SoftAuthenticator } from './testing/soft-authenticator';
import { csrfTokenFor } from './security/auth-cookies';
import type { LoginOutcome } from './auth.service';
import type { ProviderProfile } from './oauth/oauth-providers';

process.env.AUTH_SKIP_EMAIL_VERIFICATION = 'false';
process.env.AUTH_COOKIE_SECURE = 'false';

const codeOf = (p: Promise<unknown>) =>
  p.then(
    () => 'resolved',
    (e: unknown) =>
      e instanceof AppException
        ? (e.getResponse() as { code: string }).code
        : ((e as { response?: { code?: string } })?.response?.code ??
          String(e)),
  );

class FakeCls {
  private store: Record<string, unknown> = {};
  get<T>(k: string): T {
    return this.store[k] as T;
  }
  set(k: string, v: unknown) {
    this.store[k] = v;
  }
}

/**
 * Authentication Security Specification v1.0 §13 acceptance tests (automated, real MySQL).
 * Tests 2, 4-provider-token-level and 7 are also covered at token level in `oauth/oidc.spec.ts`
 * and `security/auth-security.units.spec.ts`; test 19 and 22 in the units spec.
 */
describe('Auth security spec — acceptance (§13)', () => {
  const ts = Date.now();
  const prefix = `sec-${ts}-`;
  const mail = (tag: string) => `${prefix}${tag}@example.com`;
  const PASSWORD = 'correct horse battery staple';
  let prisma: PrismaService;
  let kit: AuthKit;
  let guard: JwtAuthGuard;
  let nextProfile: ProviderProfile;
  let ipSeq = 0;
  const meta = (device = 'device-a') => ({
    ipAddress: `198.51.100.${(ipSeq++ % 200) + 1}`,
    userAgent: 'jest Windows',
    deviceId: `${device}-${ts}`,
  });

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    await resetRateLimits(prisma);
    kit = buildAuthKit(prisma, {
      GOOGLE_OAUTH_CLIENT_ID: 'g-id',
      GOOGLE_OAUTH_CLIENT_SECRET: 'g-secret',
      AUTH_MICROSOFT_ENABLED: 'true',
      MICROSOFT_CLIENT_ID: 'm-id',
      MICROSOFT_CLIENT_SECRET: 'm-secret',
      AUTH_FACEBOOK_ENABLED: 'true',
      FACEBOOK_APP_ID: 'f-id',
      FACEBOOK_APP_SECRET: 'f-secret',
      AUTH_PASSKEYS_ENABLED: 'true',
    });
    jest
      .spyOn(kit.social, 'fetchProfile')
      .mockImplementation(() => Promise.resolve(nextProfile));
    guard = new JwtAuthGuard(new Reflector(), {} as ApiKeyAuthService, prisma);
  });

  afterAll(async () => {
    await cleanupUsers(prisma, prefix);
    await prisma.oAuthTransaction.deleteMany({
      where: { createdAt: { gte: new Date(ts - 60_000) } },
    });
    await resetRateLimits(prisma);
    await prisma.$disconnect();
  });

  // ---------------------------------------------------------------- helpers

  /** Signs up (password), verifies the email, and returns the user id. */
  async function verifiedUser(tag: string, opts: { owner?: boolean } = {}) {
    const res = await kit.auth.signup(
      { email: mail(tag), password: PASSWORD },
      meta(),
    );
    await prisma.user.update({
      where: { id: res.user.id },
      data: {
        emailVerifiedAt: new Date(),
        ...(opts.owner === false ? { mfaRequired: false } : {}),
      },
    });
    if (opts.owner === false) {
      await prisma.businessUser.updateMany({
        where: { userId: res.user.id },
        data: { role: 'manager' },
      });
      await prisma.session.updateMany({
        where: { userId: res.user.id },
        data: { mfaSetupRequired: false },
      });
    }
    return {
      userId: res.user.id,
      businessId: res.business.id,
      tokens: res.tokens,
    };
  }

  async function signIn(
    provider: ProviderProfile['provider'],
    profile: Omit<ProviderProfile, 'provider'>,
  ) {
    nextProfile = { provider, ...profile };
    const url = await kit.social.start(provider, 'login');
    const state = new URL(url).searchParams.get('state')!;
    const redirect = new URL(
      await kit.social.callback(provider, { code: 'c', state }, meta()),
    );
    const handoff = redirect.searchParams.get('code');
    if (!handoff) return { error: redirect.searchParams.get('error') };
    return { outcome: await kit.social.exchange(handoff, meta()) };
  }

  function ctx(
    req: Record<string, unknown>,
    handler: () => void = () => undefined,
  ): ExecutionContext {
    return {
      getType: () => 'http',
      getHandler: () => handler,
      getClass: () => class {},
      switchToHttp: () => ({
        getRequest: () => req,
        getResponse: () => ({ setHeader: () => undefined }),
      }),
    } as unknown as ExecutionContext;
  }

  const authed = (o: unknown) =>
    o as Extract<LoginOutcome, { status: 'authenticated' }>;

  // ---------------------------------------------------------------- password + device + MFA

  it('password sign-in from a new device needs the emailed code; a known device does not', async () => {
    const { userId } = await verifiedUser('device', { owner: false });
    const first = await kit.auth.login(
      { emailOrPhone: mail('device'), password: PASSWORD },
      meta('laptop'),
    );
    expect(first).toMatchObject({
      status: 'device_code',
      email: expect.stringContaining('@example.com'),
    });
    const code = kit.lastCode(mail('device'))!;
    const done = await kit.auth.verifyLoginDevice(
      (first as { ticket: string }).ticket,
      code,
      meta('laptop'),
    );
    expect(done.status).toBe('authenticated');
    const again = await kit.auth.login(
      { emailOrPhone: mail('device'), password: PASSWORD },
      meta('laptop'),
    );
    expect(again.status).toBe('authenticated');
    // The code is bound to the browser that asked for it.
    const other = await kit.auth.login(
      { emailOrPhone: mail('device'), password: PASSWORD },
      meta('phone'),
    );
    expect(
      await codeOf(
        kit.auth.verifyLoginDevice(
          (other as { ticket: string }).ticket,
          kit.lastCode(mail('device'))!,
          meta('tablet'),
        ),
      ),
    ).toBe('SIGN_IN_EXPIRED');
    expect(
      await prisma.knownDevice.count({ where: { userId } }),
    ).toBeGreaterThanOrEqual(2);
  });

  it('an owner without a second factor gets a setup-only session; TOTP then gates every sign-in', async () => {
    const { userId, tokens } = await verifiedUser('owner');
    // Setup-only session: the guard refuses normal routes but allows MFA enrolment.
    const req = (path: string, method = 'GET') => ({
      headers: {},
      cookies: { nx_at: tokens.accessToken },
      method,
      originalUrl: path,
    });
    expect(await codeOf(guard.canActivate(ctx(req('/api/v1/orders'))))).toBe(
      'MFA_SETUP_REQUIRED',
    );
    await expect(guard.canActivate(ctx(req('/api/v1/auth/mfa')))).resolves.toBe(
      true,
    );

    const { secret } = await kit.mfa.startTotp(userId);
    const confirm = await kit.mfa.confirmTotp(
      userId,
      totpCode(secret, totpStep()),
    );
    expect(confirm.recoveryCodes).toHaveLength(10);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: userId } }))
        .twoFactorEnabled,
    ).toBe(true);
    await expect(guard.canActivate(ctx(req('/api/v1/orders')))).resolves.toBe(
      true,
    );

    const login = await kit.auth.login(
      { emailOrPhone: mail('owner'), password: PASSWORD },
      meta(),
    );
    expect(login).toMatchObject({
      status: 'mfa',
      methods: expect.arrayContaining(['totp', 'recovery']),
    });
    const ticket = (login as { ticket: string }).ticket;
    // The step just used at confirmation can't be replayed.
    expect(
      await codeOf(
        kit.auth.verifyLoginMfa(
          ticket,
          { code: totpCode(secret, totpStep()) },
          meta(),
        ),
      ),
    ).toBe('MFA_CODE_INVALID');
    const rc = confirm.recoveryCodes[0];
    expect(
      (await kit.auth.verifyLoginMfa(ticket, { recoveryCode: rc }, meta()))
        .status,
    ).toBe('authenticated');
    expect(
      await codeOf(
        kit.auth.verifyLoginMfa(ticket, { recoveryCode: rc }, meta()),
      ),
    ).toBe('MFA_CODE_INVALID');
  });

  // ---------------------------------------------------------------- linking (§3)

  it('test 1: pre-emptive takeover — a verified Google sign-in destroys the unverified local password', async () => {
    const attacker = await kit.auth.signup(
      { email: mail('victim'), password: PASSWORD },
      meta(),
    );
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: attacker.user.id } }))
        .emailVerifiedAt,
    ).toBeNull();
    const { outcome } = await signIn('google', {
      subject: `g-victim-${ts}`,
      email: mail('victim'),
      emailVerified: true,
      name: 'Real Owner',
    });
    expect(outcome?.status).toMatch(/authenticated|mfa/);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: attacker.user.id },
      include: { authIdentities: true },
    });
    expect(user).toMatchObject({ hasPassword: false, mustReset: true });
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(user.authIdentities[0]).toMatchObject({
      provider: 'google',
      providerSubject: `g-victim-${ts}`,
    });
    // The attacker's session is gone and their password no longer works.
    expect(
      await kit.sessions.resolveAccess(attacker.tokens.accessToken),
    ).toBeNull();
    expect(
      await codeOf(
        kit.auth.login(
          { emailOrPhone: mail('victim'), password: PASSWORD },
          meta(),
        ),
      ),
    ).toContain('Invalid credentials');
  });

  it('a verified Google email auto-links to an existing verified account (§3.1)', async () => {
    const { userId } = await verifiedUser('gauto', { owner: false });
    const { outcome } = await signIn('google', {
      subject: `g-auto-${ts}`,
      email: mail('gauto'),
      emailVerified: true,
    });
    expect(outcome?.status).toBe('authenticated');
    expect(
      await prisma.authIdentity.findFirst({
        where: { providerSubject: `g-auto-${ts}` },
      }),
    ).toMatchObject({
      userId,
    });
    expect(await prisma.user.count({ where: { email: mail('gauto') } })).toBe(
      1,
    );
  });

  it('test 3: a Google ID token with email_verified false is rejected', async () => {
    const res = await signIn('google', {
      subject: `g-unv-${ts}`,
      email: mail('gunv'),
      emailVerified: false,
    });
    expect(res.error).toBe('provider_email_unverified');
    expect(await prisma.user.count({ where: { email: mail('gunv') } })).toBe(0);
  });

  it('test 4: a callback with a state that was never issued is rejected', async () => {
    const r = new URL(
      await kit.social.callback(
        'google',
        { code: 'c', state: 'never-issued' },
        meta(),
      ),
    );
    expect(r.searchParams.get('error')).toBe('provider_state');
  });

  it('test 6: Facebook with an email matching a Google account — no automatic link, email code first', async () => {
    const google = await signIn('google', {
      subject: `g-fb-${ts}`,
      email: mail('fbmatch'),
      emailVerified: true,
    });
    expect(google.outcome).toBeDefined();
    const userId = (
      await prisma.user.findUniqueOrThrow({ where: { email: mail('fbmatch') } })
    ).id;
    const { outcome } = await signIn('facebook', {
      subject: `f-${ts}`,
      email: mail('fbmatch'),
      emailVerified: false,
    });
    expect(outcome).toMatchObject({
      status: 'confirm_link',
      provider: 'facebook',
    });
    expect(
      await prisma.authIdentity.count({
        where: { provider: 'facebook', providerSubject: `f-${ts}` },
      }),
    ).toBe(0);
    const ticket = (outcome as { ticket: string }).ticket;
    expect(
      await codeOf(kit.social.confirmLink(ticket, '000000', meta())),
    ).toMatch(/AUTH_CODE_INVALID|SIGN_IN_EXPIRED/);
    const done = await kit.social.confirmLink(
      ticket,
      kit.lastCode(mail('fbmatch'))!,
      meta(),
    );
    expect(done.status).toMatch(/authenticated|mfa/);
    expect(
      await prisma.authIdentity.findFirst({
        where: { provider: 'facebook', providerSubject: `f-${ts}` },
      }),
    ).toMatchObject({
      userId,
      providerEmailVerified: false,
    });
  });

  it('test 20: the only remaining sign-in method cannot be removed', async () => {
    const { outcome } = await signIn('google', {
      subject: `g-only-${ts}`,
      email: mail('gonly'),
      emailVerified: true,
    });
    const userId = (
      await prisma.user.findUniqueOrThrow({ where: { email: mail('gonly') } })
    ).id;
    const session = await prisma.session.findFirstOrThrow({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    expect(outcome).toBeDefined();
    const user: AuthenticatedUser = {
      sub: userId,
      businessId: session.businessId,
      role: 'owner',
      capabilities: [],
      sessionId: session.id,
    };
    expect(await codeOf(kit.social.unlink(user, 'google'))).toBe(
      'LAST_SIGN_IN_METHOD',
    );
  });

  // ---------------------------------------------------------------- passkeys (§5)

  describe('passkeys', () => {
    let userId: string;
    let handle: string;
    const rp = { id: 'app.example.com', origin: 'https://app.example.com' };

    async function register(counter: number) {
      const auth = new SoftAuthenticator(rp.id, rp.origin);
      await prisma.passkeyCredential.create({
        data: {
          userId,
          credentialId: auth.credentialId,
          publicKey: new Uint8Array(auth.cosePublicKey),
          counter,
          deviceType: counter === 0 ? 'multiDevice' : 'singleDevice',
          label: 'Test key',
          transports: [],
        },
      });
      return auth;
    }

    beforeAll(async () => {
      ({ userId } = await verifiedUser('passkey'));
      handle = 'x'.repeat(10) + ts;
      await prisma.user.update({
        where: { id: userId },
        data: { webauthnUserId: handle },
      });
    });

    it('test 10: a synced passkey reporting counter 0 against stored 0 is accepted', async () => {
      const auth = await register(0);
      const { challengeId, options } =
        await kit.passkeys.authenticationOptions();
      const outcome = await kit.passkeys.authenticationVerify(
        challengeId,
        auth.assertion(options.challenge, 0, { userHandle: handle }),
        meta(),
      );
      expect((outcome as LoginOutcome).status).toBe('authenticated');
    });

    it('test 8: replaying an assertion with a used challenge is rejected', async () => {
      const auth = await register(0);
      const { challengeId, options } =
        await kit.passkeys.authenticationOptions();
      const response = auth.assertion(options.challenge, 0, {
        userHandle: handle,
      }) as never;
      await kit.passkeys.authenticationVerify(challengeId, response, meta());
      expect(
        await codeOf(
          kit.passkeys.authenticationVerify(challengeId, response, meta()),
        ),
      ).toBe('PASSKEY_CHALLENGE_INVALID');
    });

    it('a wrong origin is rejected', async () => {
      const auth = await register(0);
      const { challengeId, options } =
        await kit.passkeys.authenticationOptions();
      expect(
        await codeOf(
          kit.passkeys.authenticationVerify(
            challengeId,
            auth.assertion(options.challenge, 0, {
              userHandle: handle,
              origin: 'https://evil.example',
            }) as never,
            meta(),
          ),
        ),
      ).toBe('PASSKEY_REJECTED');
    });

    it('test 9: a counter regression is rejected, disables the credential, ends every session and alerts', async () => {
      const auth = await register(5);
      const live = await kit.auth.completeLogin(userId, meta(), {
        method: 'passkey',
      });
      const before = kit.outbox.length;
      const { challengeId, options } =
        await kit.passkeys.authenticationOptions();
      expect(
        await codeOf(
          kit.passkeys.authenticationVerify(
            challengeId,
            auth.assertion(options.challenge, 3) as never,
            meta(),
          ),
        ),
      ).toBe('PASSKEY_REJECTED');
      const cred = await prisma.passkeyCredential.findUniqueOrThrow({
        where: { credentialId: auth.credentialId },
      });
      expect(cred.disabledAt).not.toBeNull();
      expect(
        await kit.sessions.resolveAccess(authed(live).tokens.accessToken),
      ).toBeNull();
      expect(
        kit.outbox.slice(before).some((m) => m.subject.includes('passkey')),
      ).toBe(true);
      expect(
        await prisma.securityEvent.count({
          where: { userId, type: 'passkey_counter_regression' },
        }),
      ).toBe(1);
      // A normal hardware-key advance still works on another credential.
      const hw = await register(5);
      const opts2 = await kit.passkeys.authenticationOptions();
      const ok = await kit.passkeys.authenticationVerify(
        opts2.challengeId,
        hw.assertion(opts2.options.challenge, 6),
        meta(),
      );
      expect((ok as LoginOutcome).status).toBe('authenticated');
    });
  });

  // ---------------------------------------------------------------- OTP (§6)

  it('test 11: the sixth wrong code is refused — code dead, address locked 15 min, owner notified', async () => {
    const { userId } = await verifiedUser('otp', { owner: false });
    await prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: null },
    });
    await kit.tokens.sendVerifyEmail(userId, mail('otp'));
    const right = kit.lastCode(mail('otp'))!;
    const wrong = right === '000000' ? '111111' : '000000';
    for (let i = 0; i < 4; i++) {
      expect(await codeOf(kit.account.verifyEmail(userId, wrong, meta()))).toBe(
        'AUTH_CODE_INVALID',
      );
    }
    expect(await codeOf(kit.account.verifyEmail(userId, wrong, meta()))).toBe(
      'AUTH_CODE_LOCKED',
    );
    expect(await codeOf(kit.account.verifyEmail(userId, right, meta()))).toBe(
      'AUTH_CODE_LOCKED',
    );
    const u = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(u.otpLockedUntil!.getTime()).toBeGreaterThan(
      Date.now() + 14 * 60_000,
    );
    expect(
      kit.outbox.some(
        (m) =>
          m.to === mail('otp') &&
          m.subject.includes('Too many incorrect codes'),
      ),
    ).toBe(true);
    expect(
      await prisma.securityEvent.count({
        where: { userId, type: 'otp_locked' },
      }),
    ).toBe(1);
  });

  it('test 12: a reset request for an unregistered address has the same body, status and timing', async () => {
    await verifiedUser('enum', { owner: false });
    const t1 = Date.now();
    const known = await kit.account.forgotPassword(mail('enum'), meta());
    const d1 = Date.now() - t1;
    const t2 = Date.now();
    const unknown = await kit.account.forgotPassword(mail('nobody'), meta());
    const d2 = Date.now() - t2;
    expect(unknown).toEqual(known);
    expect(d1).toBeGreaterThanOrEqual(690);
    expect(d2).toBeGreaterThanOrEqual(690);
    expect(Math.abs(d1 - d2)).toBeLessThan(250);
  });

  it('test 13: a login code cannot be redeemed for another purpose', async () => {
    const { userId } = await verifiedUser('bind', { owner: false });
    const login = await kit.auth.login(
      { emailOrPhone: mail('bind'), password: PASSWORD },
      meta('new-browser'),
    );
    expect(login.status).toBe('device_code');
    const loginCode = kit.lastCode(mail('bind'))!;
    expect(
      await codeOf(kit.tokens.verifyEmailOtp(userId, loginCode, 'link_email')),
    ).toBe('AUTH_CODE_INVALID');
    expect(
      await codeOf(
        kit.account.resetPassword(
          loginCode.padEnd(20, '0'),
          'another long passphrase',
        ),
      ),
    ).toBe('AUTH_LINK_INVALID');
  });

  // ---------------------------------------------------------------- sessions (§8, §9)

  it('test 14: reusing a rotated refresh token revokes the family and every session, and notifies', async () => {
    const { userId, tokens } = await verifiedUser('reuse', { owner: false });
    const other = authed(
      await kit.auth.completeLogin(userId, meta('second'), {
        method: 'passkey',
      }),
    );
    const rotated = await kit.auth.refresh(tokens.refreshToken);
    // Outside the 10-second parallel-tab window, the old token is treated as stolen.
    await prisma.refreshToken.updateMany({
      where: { session: { userId }, consumedAt: { not: null } },
      data: { consumedAt: new Date(Date.now() - 60_000) },
    });
    const before = kit.outbox.length;
    expect(await codeOf(kit.auth.refresh(tokens.refreshToken))).toBe(
      'INVALID_REFRESH',
    );
    expect(
      await kit.sessions.resolveAccess(rotated.tokens.accessToken),
    ).toBeNull();
    expect(
      await kit.sessions.resolveAccess(other.tokens.accessToken),
    ).toBeNull();
    expect(await codeOf(kit.auth.refresh(rotated.tokens.refreshToken))).toBe(
      'INVALID_REFRESH',
    );
    expect(kit.outbox.slice(before).some((m) => m.to === mail('reuse'))).toBe(
      true,
    );
    expect(
      await prisma.securityEvent.count({
        where: { userId, type: 'refresh_reuse_detected' },
      }),
    ).toBe(1);
  });

  it('test 15: after logout the old refresh token is rejected', async () => {
    const { userId, businessId, tokens } = await verifiedUser('logout', {
      owner: false,
    });
    await kit.auth.logout({
      sub: userId,
      businessId,
      sessionId: tokens.sessionId,
    } as AuthenticatedUser);
    expect(await codeOf(kit.auth.refresh(tokens.refreshToken))).toBe(
      'INVALID_REFRESH',
    );
    expect(await kit.sessions.resolveAccess(tokens.accessToken)).toBeNull();
  });

  it('test 16: logout is POST-only and a cookie-authenticated write without the CSRF token is refused', async () => {
    const proto = AuthController.prototype as unknown as Record<
      string,
      () => void
    >;
    expect(Reflect.getMetadata(METHOD_METADATA, proto.logout)).toBe(
      RequestMethod.POST,
    );
    const getRoutes = Object.getOwnPropertyNames(proto)
      .filter((k) => typeof proto[k] === 'function')
      .filter(
        (k) =>
          Reflect.getMetadata(METHOD_METADATA, proto[k]) === RequestMethod.GET,
      )
      .map((k) => Reflect.getMetadata(PATH_METADATA, proto[k]) as string);
    expect(getRoutes).not.toContain('logout');

    const { tokens } = await verifiedUser('csrf', { owner: false });
    const req = {
      headers: {},
      cookies: { nx_at: tokens.accessToken },
      method: 'POST',
      originalUrl: '/api/v1/orders',
    };
    expect(await codeOf(guard.canActivate(ctx(req)))).toBe('CSRF_INVALID');
    const ok = {
      ...req,
      headers: { 'x-csrf-token': csrfTokenFor(tokens.sessionId) },
    };
    await expect(guard.canActivate(ctx(ok))).resolves.toBe(true);
  });

  it('test 17: a session established before a password reset is rejected afterwards', async () => {
    const { userId, tokens } = await verifiedUser('reset', { owner: false });
    const link = await kit.tokens.create(userId, 'reset_password');
    await kit.account.resetPassword(link, 'a brand new long passphrase');
    expect(await kit.sessions.resolveAccess(tokens.accessToken)).toBeNull();
    expect(
      kit.outbox.some(
        (m) =>
          m.to === mail('reset') && m.subject.includes('password was changed'),
      ),
    ).toBe(true);
  });

  it('test 18: removing a staff member ends their session immediately', async () => {
    const owner = await verifiedUser('staffowner', { owner: false });
    const staffUser = await prisma.user.create({
      data: {
        name: 'Staff',
        email: mail('staff'),
        passwordHash: 'x',
        emailVerifiedAt: new Date(),
      },
    });
    const membership = await prisma.businessUser.create({
      data: {
        businessId: owner.businessId,
        userId: staffUser.id,
        role: 'staff',
      },
    });
    const staffSession = authed(
      await kit.auth.completeLogin(staffUser.id, meta('counter'), {
        method: 'passkey',
      }),
    );
    expect(
      await kit.sessions.resolveAccess(staffSession.tokens.accessToken),
    ).not.toBeNull();
    const cls = new FakeCls();
    cls.set(CLS_KEY_BUSINESS_ID, owner.businessId);
    const staff = new StaffService(
      new TenantPrismaService(prisma, cls as unknown as ClsService),
    );
    await staff.remove(membership.id);
    expect(
      await kit.sessions.resolveAccess(staffSession.tokens.accessToken),
    ).toBeNull();
    expect(
      await codeOf(kit.auth.refresh(staffSession.tokens.refreshToken)),
    ).toBe('INVALID_REFRESH');
  });

  it('any deactivation path (People offboarding, branch deactivation) ends access on the next request', async () => {
    const { userId, businessId, tokens } = await verifiedUser('offboard', {
      owner: false,
    });
    const req = {
      headers: {},
      cookies: { nx_at: tokens.accessToken },
      method: 'GET',
      originalUrl: '/api/v1/orders',
    };
    await expect(guard.canActivate(ctx(req))).resolves.toBe(true);
    // Exactly what pp-hr.service does when it revokes access on offboarding.
    await prisma.businessUser.updateMany({
      where: { userId, businessId },
      data: { active: false },
    });
    expect(await codeOf(guard.canActivate(ctx(req)))).toBe('ACCESS_REMOVED');
    expect(await kit.sessions.resolveAccess(tokens.accessToken)).toBeNull();
  });

  it('an unverified account can only reach the verification routes (§3.2)', async () => {
    const res = await kit.auth.signup(
      { email: mail('unverified'), password: PASSWORD },
      meta(),
    );
    const req = (path: string) => ({
      headers: {},
      cookies: { nx_at: res.tokens.accessToken },
      method: 'GET',
      originalUrl: path,
    });
    expect(await codeOf(guard.canActivate(ctx(req('/api/v1/customers'))))).toBe(
      'EMAIL_NOT_VERIFIED',
    );
    await expect(
      guard.canActivate(ctx(req('/api/v1/auth/verification'))),
    ).resolves.toBe(true);
  });

  it('elevated actions need a step-up within 10 minutes (§8.5)', async () => {
    const { userId, businessId, tokens } = await verifiedUser('stepup', {
      owner: false,
    });
    const handler = () => undefined;
    Reflect.defineMetadata(REQUIRE_STEP_UP_KEY, true, handler);
    const req = {
      headers: { 'x-csrf-token': csrfTokenFor(tokens.sessionId) },
      cookies: { nx_at: tokens.accessToken },
      method: 'POST',
      originalUrl: '/api/v1/exports',
    };
    expect(await codeOf(guard.canActivate(ctx(req, handler)))).toBe(
      'STEP_UP_REQUIRED',
    );
    const user = {
      sub: userId,
      businessId,
      sessionId: tokens.sessionId,
    } as AuthenticatedUser;
    expect(
      await codeOf(kit.auth.stepUp(user, { password: 'wrong password here' })),
    ).toBe('STEP_UP_FAILED');
    await kit.auth.stepUp(user, { password: PASSWORD });
    await expect(guard.canActivate(ctx(req, handler))).resolves.toBe(true);
  });

  it('a shared-device session ends after 15 idle minutes (§8.5)', async () => {
    const { userId } = await verifiedUser('shared', { owner: false });
    const shared = authed(
      await kit.auth.completeLogin(userId, meta(), {
        method: 'passkey',
        rememberMe: false,
      }),
    );
    await prisma.session.update({
      where: { id: shared.tokens.sessionId },
      data: { lastUsedAt: new Date(Date.now() - 16 * 60_000) },
    });
    expect(
      await kit.sessions.resolveAccess(shared.tokens.accessToken),
    ).toBeNull();
  });

  it('ten wrong passwords lock the account: 429 + Retry-After, sessions ended, owner emailed (§10.1)', async () => {
    const { userId, tokens } = await verifiedUser('lock', { owner: false });
    const before = kit.outbox.length;
    let last: unknown;
    for (let i = 0; i < 10; i++) {
      last = await kit.auth
        .login(
          { emailOrPhone: mail('lock'), password: `wrong-${i}-password` },
          meta(),
        )
        .catch((e: unknown) => e);
    }
    expect((last as AppException).getStatus()).toBe(429);
    expect(
      (last as { retryAfterSeconds?: number }).retryAfterSeconds,
    ).toBeGreaterThan(0);
    expect(await kit.sessions.resolveAccess(tokens.accessToken)).toBeNull();
    expect(
      kit.outbox
        .slice(before)
        .some((m) => m.to === mail('lock') && m.subject.includes('locked')),
    ).toBe(true);
    expect(
      await prisma.securityEvent.count({
        where: { userId, type: 'account_locked' },
      }),
    ).toBe(1);
    // An unknown address gets the same 429 shape once its own counter is exhausted — never "no such user".
    let unknown: unknown;
    for (let i = 0; i < 11; i++) {
      unknown = await kit.auth
        .login(
          { emailOrPhone: mail('ghost'), password: 'whatever-password' },
          meta(),
        )
        .catch((e: unknown) => e);
    }
    expect((unknown as AppException).getStatus()).toBe(429);
  }, 30_000); // 21 Argon2id verifications — slow when suites run in parallel
});
