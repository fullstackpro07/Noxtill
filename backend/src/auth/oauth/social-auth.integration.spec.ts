/* eslint-disable @typescript-eslint/no-unsafe-assignment -- Jest asymmetric matchers (`expect.arrayContaining`/`expect.objectContaining`) are typed `any`. */
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AppException } from '../../common/filters/app.exception';
import type { AuthenticatedUser } from '../../common/tenancy/auth-context';
import { totpCode, totpStep } from '../../super-admin/totp.util';
import {
  buildAuthKit,
  cleanupUsers,
  resetRateLimits,
  type AuthKit,
} from '../testing/auth-test-kit';
import { SocialAuthService } from './social-auth.service';
import type { ProviderProfile, SocialProvider } from './oauth-providers';
import type { AuthService } from '../auth.service';

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
 * Social sign-in on real MySQL with real services; only the provider network boundary
 * (`fetchProfile`) is stubbed — its token validation is covered by `oidc.spec.ts` and the units spec.
 */
describe('Social sign-in (integration)', () => {
  const ts = Date.now();
  const prefix = `soc-${ts}-`;
  const mail = (tag: string) => `${prefix}${tag}@example.com`;
  const meta = {
    ipAddress: '203.0.113.9',
    userAgent: 'jest',
    deviceId: `dev-${ts}`,
  };
  let prisma: PrismaService;
  let kit: AuthKit;
  let social: SocialAuthService;
  let nextProfile: ProviderProfile;

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
    });
    social = kit.social;
    jest
      .spyOn(social, 'fetchProfile')
      .mockImplementation(() => Promise.resolve(nextProfile));
  });

  afterAll(async () => {
    await cleanupUsers(prisma, prefix);
    await prisma.facebookDeletionRequest.deleteMany({
      where: { facebookUserId: { startsWith: `f-${ts}` } },
    });
    await prisma.oAuthTransaction.deleteMany({
      where: { createdAt: { gte: new Date(ts - 60_000) } },
    });
    await prisma.$disconnect();
  });

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
      where: { userId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return {
      sub: userId,
      businessId: s.businessId,
      role: 'owner',
      capabilities: [],
      sessionId: s.id,
    };
  };

  let googleUserId: string;

  it('lists only providers whose flag and credentials are set', () => {
    expect(social.providers()).toEqual({
      google: true,
      microsoft: true,
      facebook: true,
      passkeys: false,
    });
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
      kit.tokens,
      kit.methods,
      kit.sessions,
      kit.rateLimit,
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

  it('state is ≥32 bytes and the callback redirects with a one-time code, never tokens', async () => {
    const url = await social.start('google', 'login');
    expect(
      new URL(url).searchParams.get('state')!.length,
    ).toBeGreaterThanOrEqual(43);
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
    expect(result.status).toBe('authenticated');
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: mail('google') },
      include: { authIdentities: true, businessUsers: true },
    });
    googleUserId = user.id;
    expect(user).toMatchObject({ hasPassword: false, mfaRequired: true });
    expect(user.emailVerifiedAt).not.toBeNull();
    expect(user.authIdentities[0]).toMatchObject({
      provider: 'google',
      providerSubject: `g-${ts}`,
    });
    expect(user.businessUsers).toHaveLength(1);
    expect(user.businessUsers[0].role).toBe('owner');
  });

  it('a linked subject signs the same user in again — no duplicate user or business', async () => {
    const { result } = await signIn('google', {
      subject: `g-${ts}`,
      email: mail('google'),
      emailVerified: true,
    });
    expect(result?.status).toBe('authenticated');
    expect(await prisma.user.count({ where: { email: mail('google') } })).toBe(
      1,
    );
    expect(
      await prisma.businessUser.count({ where: { userId: googleUserId } }),
    ).toBe(1);
  });

  it('a Microsoft work account with an unverified email that matches an account gets a code, not a link', async () => {
    const { result } = await signIn('microsoft', {
      subject: `m-steal-${ts}`,
      email: mail('google'),
      emailVerified: false,
      tenantId: '72f988bf-86f1-41af-91ab-2d7cd011db47',
    });
    expect(result).toMatchObject({
      status: 'confirm_link',
      provider: 'microsoft',
    });
    expect(
      await prisma.authIdentity.count({
        where: { providerSubject: `m-steal-${ts}` },
      }),
    ).toBe(0);
  });

  it('a new Microsoft work-account user is created unverified and sent a Noxtill email code; tid is recorded', async () => {
    const { result } = await signIn('microsoft', {
      subject: `m-${ts}`,
      email: mail('ms'),
      emailVerified: false,
      name: 'Mo Microsoft',
      tenantId: '72f988bf-86f1-41af-91ab-2d7cd011db47',
    });
    expect(result?.status).toBe('authenticated');
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: mail('ms') },
      include: { authIdentities: true },
    });
    expect(user.emailVerifiedAt).toBeNull();
    expect(user.authIdentities[0].tenantId).toBe(
      '72f988bf-86f1-41af-91ab-2d7cd011db47',
    );
    expect(kit.lastCode(mail('ms'))).toMatch(/^\d{6}$/);
  });

  it('Facebook with no email asks for one; an email that already has an account goes through a code', async () => {
    const { result } = await signIn('facebook', {
      subject: `f-${ts}`,
      emailVerified: false,
      name: 'Fay Facebook',
    });
    expect(result).toMatchObject({
      status: 'needs_email',
      provider: 'facebook',
      name: 'Fay Facebook',
    });
    const ticket = (result as { ticket: string }).ticket;
    const confirm = await social.completeSignup(ticket, mail('google'), meta);
    expect(confirm).toMatchObject({ status: 'confirm_link' });
    expect(await codeOf(social.completeSignup(ticket, mail('fb2'), meta))).toBe(
      'SIGN_IN_EXPIRED',
    );

    const fresh = await signIn('facebook', {
      subject: `f-${ts}-b`,
      emailVerified: false,
    });
    const done = await social.completeSignup(
      (fresh.result as { ticket: string }).ticket,
      mail('fb'),
      meta,
    );
    expect(done.status).toBe('authenticated');
    const user = await prisma.user.findUniqueOrThrow({
      where: { email: mail('fb') },
      include: { authIdentities: true },
    });
    expect(user.emailVerifiedAt).toBeNull();
    expect(user.authIdentities[0]).toMatchObject({
      provider: 'facebook',
      providerEmailVerified: false,
    });
  });

  it('rejects a replayed state, a replayed handoff code and a state from another provider', async () => {
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
    const url = await social.start('google', 'login');
    const res = await social.callback(
      'microsoft',
      { code: 'c', state: new URL(url).searchParams.get('state')! },
      meta,
    );
    expect(new URL(res).searchParams.get('error')).toBe('provider_state');
  });

  it('linking needs fresh authentication and a subject can belong to only one user', async () => {
    const user = await freshUser(googleUserId);
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
      email: 'x@outlook.com',
      emailVerified: false,
    };
    const { url } = await social.startLink(user, 'microsoft');
    const done = new URL(
      await social.callback(
        'microsoft',
        { code: 'c', state: new URL(url).searchParams.get('state')! },
        meta,
      ),
    );
    expect(done.searchParams.get('linked')).toBe('microsoft');
    expect(
      await prisma.authIdentity.findFirst({
        where: { provider: 'microsoft', providerSubject: `m-link-${ts}` },
      }),
    ).toMatchObject({ userId: googleUserId, providerEmailVerified: false });

    const msUser = (
      await prisma.user.findUniqueOrThrow({ where: { email: mail('ms') } })
    ).id;
    const other = await freshUser(msUser);
    nextProfile = {
      provider: 'google',
      subject: `g-${ts}`,
      email: mail('google'),
      emailVerified: true,
    };
    const link2 = await social.startLink(other, 'google');
    const res2 = new URL(
      await social.callback(
        'google',
        { code: 'c', state: new URL(link2.url).searchParams.get('state')! },
        meta,
      ),
    );
    expect(res2.searchParams.get('link_error')).toBe('IDENTITY_TAKEN');
  });

  it('disconnecting keeps the account, signs out everywhere and emails the owner', async () => {
    const user = await freshUser(googleUserId);
    const before = kit.outbox.length;
    await expect(social.unlink(user, 'microsoft')).resolves.toMatchObject({
      disconnected: true,
    });
    expect(await prisma.user.count({ where: { id: googleUserId } })).toBe(1);
    expect(
      await prisma.session.count({
        where: { userId: googleUserId, revokedAt: null },
      }),
    ).toBe(0);
    expect(kit.outbox.slice(before).some((m) => m.to === mail('google'))).toBe(
      true,
    );
    expect(
      await prisma.securityEvent.count({
        where: { userId: googleUserId, type: 'identity_unlinked' },
      }),
    ).toBe(1);
  });

  it('provider sign-in cannot bypass the second factor', async () => {
    const { secret } = await kit.mfa.startTotp(googleUserId);
    await kit.mfa.confirmTotp(googleUserId, totpCode(secret, totpStep()));
    const { result } = await signIn('google', {
      subject: `g-${ts}`,
      email: mail('google'),
      emailVerified: true,
    });
    expect(result).toMatchObject({
      status: 'mfa',
      methods: expect.arrayContaining(['totp']),
    });
    expect(result).not.toHaveProperty('tokens');
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

  it('Facebook deauthorize marks the identity inactive; data deletion removes it and returns a status URL', async () => {
    const signed = (userId: string, secret = 'f-secret') => {
      const payload = Buffer.from(
        JSON.stringify({ algorithm: 'HMAC-SHA256', user_id: userId }),
      ).toString('base64url');
      return `${createHmac('sha256', secret).update(payload).digest('base64url')}.${payload}`;
    };
    expect(
      await codeOf(
        social.facebookDeauthorize(signed(`f-${ts}-b`, 'wrong-secret')),
      ),
    ).toBe('INVALID_SIGNED_REQUEST');
    await social.facebookDeauthorize(signed(`f-${ts}-b`));
    const identity = await prisma.authIdentity.findFirstOrThrow({
      where: { providerSubject: `f-${ts}-b` },
    });
    expect(identity.disabledAt).not.toBeNull();
    // The account and its business are untouched.
    expect(await prisma.user.count({ where: { id: identity.userId } })).toBe(1);

    const del = await social.facebookDataDeletion(signed(`f-${ts}-b`));
    expect(del.url).toContain(
      `/privacy/facebook-deletion?code=${del.confirmation_code}`,
    );
    expect(
      await prisma.authIdentity.count({
        where: { providerSubject: `f-${ts}-b` },
      }),
    ).toBe(0);
    await expect(
      social.facebookDeletionStatus(del.confirmation_code),
    ).resolves.toMatchObject({ status: 'completed' });
  });
});
