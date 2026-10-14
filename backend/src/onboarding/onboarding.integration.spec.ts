import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import { CapabilitiesService } from '../common/capabilities/capabilities.service';
import { AuthService } from '../auth/auth.service';
import { AccountService } from '../auth/account.service';
import { AuthTokensService } from '../auth/auth-tokens.service';
import { AuthMailerService } from '../auth/auth-mailer.service';
import { SessionsService } from '../auth/sessions.service';
import { TwoFactorService } from '../auth/two-factor.service';
import type { SendGateService } from '../messaging/send-gate.service';
import type { AiInfraService } from '../ai/ai-infra.service';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { OnboardingService, offeringsFromText } from './onboarding.service';
import { derive } from './onboarding.derive';

// These specs exercise the real email-verification gate, whatever the local dev .env sets.
process.env.AUTH_SKIP_EMAIL_VERIFICATION = 'false';

/** Auth & Onboarding — real MySQL, real services; only the external AI call is stubbed (unavailable). */
/** Resolves to the typed error code an AppException carries. */
const codeOf = (p: Promise<unknown>) =>
  p.then(
    () => 'resolved',
    (e: unknown) =>
      e instanceof AppException
        ? (e.getResponse() as { code: string }).code
        : String(e),
  );

describe('Auth & Onboarding integration', () => {
  let prisma: PrismaService;
  let auth: AuthService;
  let account: AccountService;
  let tokens: AuthTokensService;
  let onboarding: OnboardingService;
  const email = `onb-${Date.now()}@example.com`;
  let userId: string;
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const config = new ConfigService({
      JWT_SECRET: 'test-secret',
      JWT_REFRESH_SECRET: 'test-refresh',
      JWT_ACCESS_TTL: '15m',
      JWT_REFRESH_TTL: '7d',
    });
    const jwt = new JwtService();
    tokens = new AuthTokensService(prisma, new AuthMailerService(config));
    auth = new AuthService(
      prisma,
      jwt,
      config,
      new CapabilitiesService(prisma),
      new SessionsService(prisma),
      new TwoFactorService(prisma, {
        send: jest.fn(),
      } as unknown as SendGateService),
      tokens,
    );
    account = new AccountService(prisma, jwt, config, auth, tokens);
    const ai = {
      complete: jest.fn().mockRejectedValue(new Error('AI not configured')),
    } as unknown as AiInfraService;
    onboarding = new OnboardingService(prisma, ai);
  });

  afterAll(async () => {
    if (userId) {
      await prisma.session.deleteMany({ where: { userId } });
      await prisma.businessUser.deleteMany({ where: { userId } });
      await prisma.user.delete({ where: { id: userId } });
    }
    if (businessId) {
      await prisma.product.deleteMany({ where: { businessId } });
      await prisma.business.delete({ where: { id: businessId } });
    }
    await prisma.$disconnect();
  });

  const owner = (): AuthenticatedUser => ({
    sub: userId,
    businessId,
    role: 'owner',
    capabilities: [],
  });

  it('email-only signup creates an unverified owner, a placeholder business and a confirmation link', async () => {
    const res = await auth.signup({ email, password: 'Salon2026!' });
    userId = res.user.id;
    businessId = res.business.id;
    expect(res.accessToken).toBeTruthy();
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.emailVerifiedAt).toBeNull();
    expect(user.name).toBe('Onb');
    const business = await prisma.business.findUniqueOrThrow({
      where: { id: businessId },
    });
    expect(business.onboardingCompletedAt).toBeNull();
    expect(
      await prisma.authToken.count({
        where: { userId, purpose: 'verify_email' },
      }),
    ).toBe(1);
  });

  it('enforces the 45s resend cooldown server-side', async () => {
    expect(await codeOf(account.resendVerification(userId))).toBe(
      'RESEND_TOO_SOON',
    );
  });

  it('blocks onboarding until the email is confirmed', async () => {
    expect(await codeOf(onboarding.saveDraft(owner(), {}))).toBe(
      'EMAIL_NOT_VERIFIED',
    );
  });

  it('confirms the email with a single-use link', async () => {
    const raw = await tokens.create(userId, 'verify_email', email);
    await expect(account.verifyEmail(raw)).resolves.toMatchObject({
      verified: true,
    });
    await expect(account.verifyEmail(raw)).rejects.toBeInstanceOf(AppException);
    const status = await account.verificationStatus(userId);
    expect(status.verified).toBe(true);
  });

  it('forgot password answers the same for unknown addresses', async () => {
    await expect(
      account.forgotPassword('nobody-here@example.com'),
    ).resolves.toEqual({ ok: true });
  });

  it('reset refuses weak and reused passwords, then revokes every session', async () => {
    const weak = await tokens.create(userId, 'reset_password');
    expect(await codeOf(account.resetPassword(weak, 'onlyletters'))).toBe(
      'WEAK_PASSWORD',
    );
    expect(await codeOf(account.resetPassword(weak, 'Salon2026!'))).toBe(
      'PASSWORD_REUSED',
    );
    await expect(account.resetPassword(weak, 'NewSalon2027')).resolves.toEqual({
      reset: true,
    });
    expect(
      await prisma.session.count({ where: { userId, revokedAt: null } }),
    ).toBe(0);
    expect(await codeOf(account.resetPassword(weak, 'Another2028'))).toBe(
      'AUTH_LINK_INVALID',
    );
  });

  const draft = {
    basics: {
      bizName: 'Green Leaf Salon',
      bizEmail: email,
      dialCode: '+1',
      phone: '(201) 555-0123',
      countryIso: 'US',
      countryName: 'United States',
      currency: 'USD',
      city: 'New York',
    },
    category: 'Salon & Beauty',
    tags: ['Hair Salon'],
    desc: 'We run a beauty salon offering haircuts, hair coloring, facials and bridal makeup. Customers book online.',
    discovery: {
      booking: ['They book appointments', 'Walk-ins'],
      reminders: ['Send appointment reminders'],
      retail: ['Yes, beauty products'],
      ops: ['Customer records and history', 'Staff schedules', 'Reviews'],
    },
  };

  it('derives activities and modules only from the answers', () => {
    const d = derive(draft);
    expect(d.matchedIds).toEqual(
      expect.arrayContaining([
        'bookings',
        'marketing',
        'pos',
        'inventory',
        'crm',
        'staff',
        'reviews',
      ]),
    );
    expect(d.matchedIds).not.toContain('projects');
    expect(offeringsFromText(draft.desc)).toEqual([
      'Haircuts',
      'Hair coloring',
      'Facials',
      'Bridal makeup',
    ]);
  });

  const waitFor = async (key: 'analysis' | 'provisioning') => {
    for (let i = 0; i < 50; i++) {
      const s = await onboarding.get(owner());
      const run = s.state[key];
      if (run && run.status !== 'running') return run;
      await new Promise((r) => setTimeout(r, 100));
    }
    throw new Error(`${key} never finished`);
  };

  it('runs the analysis with real stage statuses and falls back to the description when AI is unavailable', async () => {
    await onboarding.saveDraft(owner(), draft, 'step2');
    await onboarding.startAnalysis(owner());
    const run = await waitFor('analysis');
    expect(run.status).toBe('done');
    expect(run.stages.every((s) => s.status === 'complete')).toBe(true);
    const result = run.result as {
      offeringsSource: string;
      insights: { label: string; value: string }[];
    };
    expect(result.offeringsSource).toBe('description');
    expect(result.insights.find((i) => i.label === 'Location')?.value).toBe(
      'New York, United States',
    );
  });

  it('requires at least 5 approved modules, all from the matched set', async () => {
    expect(
      await codeOf(
        onboarding.saveSelection(owner(), [
          'bookings',
          'crm',
          'projects',
          'ai_phone',
        ]),
      ),
    ).toBe('TOO_FEW_MODULES');
    await expect(
      onboarding.saveSelection(owner(), [
        'bookings',
        'crm',
        'pos',
        'inventory',
        'marketing',
      ]),
    ).resolves.toEqual({
      selected: ['bookings', 'crm', 'pos', 'inventory', 'marketing'],
    });
  });

  it('provisions the workspace: profile, sidebar modules, inactive draft catalog, completion', async () => {
    await onboarding.startProvisioning(owner());
    const run = await waitFor('provisioning');
    expect(run.status).toBe('done');
    const b = await prisma.business.findUniqueOrThrow({
      where: { id: businessId },
    });
    expect(b.name).toBe('Green Leaf Salon');
    expect(b.city).toBe('New York');
    expect(b.phone).toBe('+1 (201) 555-0123');
    expect(b.onboardingCompletedAt).not.toBeNull();
    expect(b.enabledModules).toEqual(
      expect.arrayContaining([
        'dashboard',
        'settings',
        'bookings',
        'customers',
        'sales',
        'inventory',
        'marketing',
      ]),
    );
    expect(b.enabledModules).not.toContain('staff');
    const drafts = await prisma.product.findMany({ where: { businessId } });
    expect(drafts).toHaveLength(4);
    expect(drafts.every((p) => !p.active && p.kind === 'service')).toBe(true);
  });
});
