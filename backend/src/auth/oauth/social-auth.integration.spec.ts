import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/filters/app.exception';
import { CapabilitiesService } from '../../common/capabilities/capabilities.service';
import { SecurityEventsService } from '../../common/security/security-events.service';
import type { AuthenticatedUser } from '../../common/tenancy/auth-context';
import type { SendGateService } from '../../messaging/send-gate.service';
import { AuthService } from '../auth.service';
import { AuthTokensService } from '../auth-tokens.service';
import { AuthMailerService } from '../auth-mailer.service';
import { SessionsService } from '../sessions.service';
import { TwoFactorService } from '../two-factor.service';
import { SignInMethodsService } from '../sign-in-methods.service';
import { SocialAuthService } from './social-auth.service';
import type { ProviderProfile, SocialProvider } from './oauth-providers';

process.env.AUTH_SKIP_EMAIL_VERIFICATION = 'false';

const codeOf = (p: Promise<unknown>) =>
  p.then(
    () => 'resolved',
    (e: unknown) =>
      e instanceof AppException
        ? (e.getResponse() as { code: string }).code
        : String(e),
  );

/**
 * Auth & Social Login spec §6/§8 — real MySQL and real services. Only the provider network
 * boundary (`fetchProfile`: code → validated profile) is stubbed; its ID-token validation is
 * covered by `oidc.spec.ts`.
 */
describe('Social sign-in (integration)', () => {
  const ts = Date.now();
  const mail = (tag: string) => `soc-${ts}-${tag}@example.com`;
  const meta = { ipAddress: '203.0.113.9', userAgent: 'jest' };
  let prisma: PrismaService;
  let social: SocialAuthService;
  let config: ConfigService;
  let nextProfile: ProviderProfile;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    config = new ConfigService({
      JWT_SECRET: 'test-secret',
      JWT_REFRESH_SECRET: 'test-refresh',
      JWT_ACCESS_TTL: '15m',
      JWT_REFRESH_TTL: '7d',
      FRONTEND_URL: 'https://app.example.com',
      BACKEND_URL: 'https://api.example.com/api/v1',
      GOOGLE_OAUTH_CLIENT_ID: 'g-id',
      GOOGLE_OAUTH_CLIENT_SECRET: 'g-secret',
      AUTH_MICROSOFT_ENABLED: 'true',
      MICROSOFT_CLIENT_ID: 'm-id',
      MICROSOFT_CLIENT_SECRET: 'm-secret',
      AUTH_FACEBOOK_ENABLED: 'true',
      FACEBOOK_APP_ID: 'f-id',
      FACEBOOK_APP_SECRET: 'f-secret',
    });
    const tokens = new AuthTokensService(prisma, new AuthMailerService(config));
    const events = new SecurityEventsService(prisma);
    const auth = new AuthService(
      prisma,
      new JwtService(),
      config,
      new CapabilitiesService(prisma),
      new SessionsService(prisma),
      new TwoFactorService(prisma, {
        send: jest.fn().mockResolvedValue({ sent: true }),
      } as unknown as SendGateService),
      tokens,
      events,
    );
    social = new SocialAuthService(
      prisma,
      config,
      auth,
      tokens,
      new SignInMethodsService(prisma),
      events,
    );
    jest
      .spyOn(social, 'fetchProfile')
      .mockImplementation(() => Promise.resolve(nextProfile));
  });

  afterAll(async () => {
    const users = await prisma.user.findMany({
      where: { email: { startsWith: `soc-${ts}-` } },
      select: { id: true, businessUsers: { select: { businessId: true } } },
    });
    const userIds = users.map((u) => u.id);
    const businessIds = users.flatMap((u) =>
      u.businessUsers.map((b) => b.businessId),
    );
    await prisma.securityEvent.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.twoFactorCode.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.businessUser.deleteMany({
      where: { userId: { in: userIds } },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.business.deleteMany({ where: { id: { in: businessIds } } });
    await prisma.oAuthTransaction.deleteMany({
      where: { createdAt: { gte: new Date(ts - 60_000) }, nonce: { not: '' } },
    });
    await prisma.$disconnect();
  });

  /** Runs start → provider callback (stubbed profile) and returns the frontend redirect. */
  async function roundTrip(
    provider: SocialProvider,
    profile: Omit<ProviderProfile, 'provider'>,
    opts: { purpose?: 'login' | 'link'; userId?: string } = {},
  ) {
    nextProfile = { provider, ...profile };
    const url = await social.start(
      provider,
      opts.purpose ?? 'login',
      opts.userId,
    );
    const state = new URL(url).searchParams.get('state')!;
    const redirect = await social.callback(
      provider,
      { code: 'auth-code', state },
      meta,
    );
    return { redirect: new URL(redirect), state };
  }

  async function signIn(
    provider: SocialProvider,
    profile: Omit<ProviderProfile, 'provider'>,
  ) {
    const { redirect } = await roundTrip(provider, profile);
    const handoff = redirect.searchParams.get('code');
    if (!handoff) return { error: redirect.searchParams.get('error') };
    return { result: await social.exchange(handoff, meta), handoff };
  }

  const freshUser = async (userId: string): Promise<AuthenticatedUser> => {
    const s = await prisma.session.findFirstOrThrow({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    const bu = await prisma.businessUser.findFirstOrThrow({
      where: { userId },
    });
    return {
      sub: userId,
      businessId: bu.businessId,
      role: 'owner',
      capabilities: [],
      sessionId: s.id,
    };
  };

  let googleUserId: string;
  let msUserId: string;
  let fbUserId: string;

  it('lists only providers whose flag and credentials are set', () => {
    expect(social.providers()).toEqual({
      google: true,
      microsoft: true,
      facebook: true,
      passkeys: false,
    });
    // Flag on but no Microsoft credentials → hidden. Google is switched off by its flag even if
    // the local .env (which Prisma loads into process.env) has Google credentials.
    const off = new SocialAuthService(
      prisma,
      new ConfigService({
        AUTH_MICROSOFT_ENABLED: 'true',
        MICROSOFT_CLIENT_ID: '',
        MICROSOFT_CLIENT_SECRET: '',
        AUTH_GOOGLE_ENABLED: 'false',
        AUTH_FACEBOOK_ENABLED: 'false',
      }),
      {} as AuthService,
      {} as AuthTokensService,
      new SignInMethodsService(prisma),
    );
    expect(off.providers()).toEqual({
      google: false,
      microsoft: !!(
        process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET
      ),
      facebook: false,
      passkeys: false,
    });
  });

  it('callback redirects with a one-time code, never tokens', async () => {
    const { redirect } = await roundTrip('google', {
      subject: `g-${ts}`,
      email: mail('google'),
      emailVerified: true,
      name: 'Gina Google',
    });
    expect(redirect.origin + redirect.pathname).toBe(
      'https://app.example.com/auth/callback',
    );
    expect(redirect.toString()).not.toMatch(/accessToken|refreshToken|eyJ/);
    const result = await social.exchange(
      redirect.searchParams.get('code')!,
      meta,
    );
    expect(result).toHaveProperty('accessToken');
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: mail('google') },
      include: { authIdentities: true, businessUsers: true },
    });
    googleUserId = user.id;
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(user.authIdentities).toHaveLength(1);
    expect(user.authIdentities[0]).toMatchObject({
      provider: 'google',
      providerSubject: `g-${ts}`,
    });
    // A new user goes through normal onboarding as owner of a placeholder business — nothing more.
    expect(user.businessUsers).toHaveLength(1);
    expect(user.businessUsers[0].role).toBe('owner');
  });

  it('a linked subject signs the same user in again — no duplicate user or business', async () => {
    const { result } = await signIn('google', {
      subject: `g-${ts}`,
      email: mail('google'),
      emailVerified: true,
    });
    expect(result).toHaveProperty('accessToken');
    expect(await prisma.user.count({ where: { email: mail('google') } })).toBe(
      1,
    );
    expect(
      await prisma.businessUser.count({ where: { userId: googleUserId } }),
    ).toBe(1);
  });

  it('a matching email never auto-links (§6.2)', async () => {
    const { error } = await signIn('microsoft', {
      subject: `m-steal-${ts}`,
      email: mail('google'),
      emailVerified: false,
    });
    expect(error).toBe('account_exists');
    expect(
      await prisma.authIdentity.count({
        where: { providerSubject: `m-steal-${ts}` },
      }),
    ).toBe(0);
  });

  it('a new Microsoft user is created unverified and sent a Noxtill email code', async () => {
    const { result } = await signIn('microsoft', {
      subject: `m-${ts}`,
      email: mail('ms'),
      emailVerified: false,
      name: 'Mo Microsoft',
    });
    expect(result).toHaveProperty('accessToken');
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: mail('ms') },
    });
    msUserId = user.id;
    expect(user.emailVerifiedAt).toBeNull();
    expect(
      await prisma.authToken.count({
        where: { userId: user.id, purpose: 'verify_email', usedAt: null },
      }),
    ).toBe(1);
  });

  it('Facebook with no email asks for one, then creates an unverified account', async () => {
    const { result } = await signIn('facebook', {
      subject: `f-${ts}`,
      emailVerified: false,
      name: 'Fay Facebook',
    });
    expect(result).toMatchObject({
      needsEmail: true,
      provider: 'facebook',
      name: 'Fay Facebook',
    });
    const ticket = (result as { ticket: string }).ticket;

    expect(
      await codeOf(social.completeSignup(ticket, mail('google'), meta)),
    ).toBe('ACCOUNT_EXISTS');
    const done = await social.completeSignup(ticket, mail('fb'), meta);
    expect(done).toHaveProperty('accessToken');
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: mail('fb') },
      include: { authIdentities: true },
    });
    fbUserId = user.id;
    expect(user.emailVerifiedAt).toBeNull();
    expect(user.authIdentities[0]).toMatchObject({
      provider: 'facebook',
      providerEmailVerified: false,
    });
    // The ticket is single-use.
    expect(await codeOf(social.completeSignup(ticket, mail('fb2'), meta))).toBe(
      'SIGN_IN_EXPIRED',
    );
  });

  it('rejects a replayed state, a replayed handoff code and an unknown state', async () => {
    const first = await roundTrip('google', {
      subject: `g-${ts}`,
      email: mail('google'),
      emailVerified: true,
    });
    const replay = await social.callback(
      'google',
      { code: 'again', state: first.state },
      meta,
    );
    expect(new URL(replay).searchParams.get('error')).toBe('provider_state');

    const handoff = first.redirect.searchParams.get('code')!;
    await social.exchange(handoff, meta);
    expect(await codeOf(social.exchange(handoff, meta))).toBe(
      'SIGN_IN_EXPIRED',
    );

    const forged = await social.callback(
      'google',
      { code: 'x', state: 'not-a-real-state' },
      meta,
    );
    expect(new URL(forged).searchParams.get('error')).toBe('provider_state');
  });

  it('a state issued for one provider cannot complete another', async () => {
    const url = await social.start('google', 'login');
    const state = new URL(url).searchParams.get('state')!;
    const res = await social.callback('microsoft', { code: 'c', state }, meta);
    expect(new URL(res).searchParams.get('error')).toBe('provider_state');
  });

  it('linking needs fresh authentication, attaches to the signed-in user, and a subject cannot belong to two users', async () => {
    const user = await freshUser(googleUserId);
    // Stale session + no password → REAUTH_REQUIRED; wrong password → INVALID_PASSWORD.
    await prisma.session.update({
      where: { id: user.sessionId! },
      data: { createdAt: new Date(Date.now() - 60 * 60_000) },
    });
    expect(await codeOf(social.startLink(user, 'microsoft'))).toBe(
      'REAUTH_REQUIRED',
    );
    expect(await codeOf(social.startLink(user, 'microsoft', 'wrong'))).toBe(
      'INVALID_PASSWORD',
    );
    await prisma.session.update({
      where: { id: user.sessionId! },
      data: { createdAt: new Date() },
    });

    nextProfile = {
      provider: 'microsoft',
      subject: `m-link-${ts}`,
      email: 'other@outlook.com',
      emailVerified: false,
    };
    const { url } = await social.startLink(user, 'microsoft');
    const state = new URL(url).searchParams.get('state')!;
    const done = new URL(
      await social.callback('microsoft', { code: 'c', state }, meta),
    );
    expect(done.pathname).toBe('/settings/tools/security');
    expect(done.searchParams.get('linked')).toBe('microsoft');
    expect(
      await prisma.authIdentity.findFirst({
        where: { provider: 'microsoft', providerSubject: `m-link-${ts}` },
      }),
    ).toMatchObject({ userId: googleUserId });

    // The Microsoft-created user tries to link Google with the subject the first user owns.
    const other = await freshUser(msUserId);
    nextProfile = {
      provider: 'google',
      subject: `g-${ts}`,
      email: mail('google'),
      emailVerified: true,
    };
    const link2 = await social.startLink(other, 'google');
    const s2 = new URL(link2.url).searchParams.get('state')!;
    const res2 = new URL(
      await social.callback('google', { code: 'c', state: s2 }, meta),
    );
    expect(res2.searchParams.get('link_error')).toBe('IDENTITY_TAKEN');
  });

  it('disconnecting keeps the account, and the last way back in cannot be removed', async () => {
    const user = await freshUser(googleUserId);
    await expect(social.unlink(user, 'microsoft')).resolves.toEqual({
      disconnected: true,
    });
    expect(await prisma.user.count({ where: { id: googleUserId } })).toBe(1);

    // Facebook user: unverified email, Facebook is its only method.
    const fb = await freshUser(fbUserId);
    expect(await codeOf(social.unlink(fb, 'facebook'))).toBe(
      'LAST_SIGN_IN_METHOD',
    );

    const listed = await social.listIdentities(googleUserId);
    expect(listed.providers.find((p) => p.provider === 'google')).toMatchObject(
      { connected: true },
    );
    expect(
      listed.providers.find((p) => p.provider === 'microsoft'),
    ).toMatchObject({ connected: false });
  });

  it('provider sign-in cannot bypass WhatsApp 2FA', async () => {
    await prisma.user.update({
      where: { id: googleUserId },
      data: { twoFactorEnabled: true, phone: `+1555${String(ts).slice(-7)}` },
    });
    const { result } = await signIn('google', {
      subject: `g-${ts}`,
      email: mail('google'),
      emailVerified: true,
    });
    expect(result).toMatchObject({ pending2fa: true });
    expect(result).not.toHaveProperty('accessToken');
    await prisma.user.update({
      where: { id: googleUserId },
      data: { twoFactorEnabled: false, phone: null },
    });
  });

  it('a suspended user stays blocked', async () => {
    await prisma.user.update({
      where: { id: googleUserId },
      data: { platformStatus: 'suspended' },
    });
    const { redirect } = await roundTrip('google', {
      subject: `g-${ts}`,
      email: mail('google'),
      emailVerified: true,
    });
    expect(
      await codeOf(social.exchange(redirect.searchParams.get('code')!, meta)),
    ).toBe('ACCOUNT_SUSPENDED');
    await prisma.user.update({
      where: { id: googleUserId },
      data: { platformStatus: 'active' },
    });
  });
});
