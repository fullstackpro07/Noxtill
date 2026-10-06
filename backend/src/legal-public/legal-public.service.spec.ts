import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import { LegalPublicService } from './legal-public.service';

/** Real-DB spec (no Prisma mocks). The email provider is never called: tests use the honeypot,
 * validation and "provider not configured" paths only. */
describe('LegalPublicService', () => {
  let prisma: PrismaService;
  let service: LegalPublicService;
  const consentId = `c_spec${Date.now()}`;
  const noEmailConfig = { get: () => undefined } as unknown as ConfigService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    service = new LegalPublicService(noEmailConfig, prisma);
  });

  afterAll(async () => {
    await prisma.legalConsentRecord.deleteMany({ where: { consentId } });
    await prisma.$disconnect();
  });

  it('stores a cookie-preference record and drops unknown categories', async () => {
    const rec = await service.recordConsent({
      consentId,
      kind: 'cookie_preferences',
      region: 'eea',
      policyVersion: '1.0',
      categories: {
        necessary: true,
        analytics: true,
        advertising: false,
        tracking: true,
      },
      language: 'en-US',
      source: 'cookie-policy-preference-center',
      gpc: false,
    });
    const row = await prisma.legalConsentRecord.findUniqueOrThrow({
      where: { id: rec.id },
    });
    expect(row.kind).toBe('cookie_preferences');
    expect(row.region).toBe('eea');
    expect(row.categories).toEqual({
      necessary: true,
      analytics: true,
      advertising: false,
    });
    expect(row.gpc).toBe(false);
  });

  it('stores a Do Not Sell opt-out with its GPC flag', async () => {
    const rec = await service.recordConsent({
      consentId,
      kind: 'do_not_sell_or_share',
      policyVersion: '1.0',
      optedOut: true,
      source: 'gpc',
      gpc: true,
    });
    const row = await prisma.legalConsentRecord.findUniqueOrThrow({
      where: { id: rec.id },
    });
    expect(row.optedOut).toBe(true);
    expect(row.gpc).toBe(true);
    expect(row.categories).toBeNull();
  });

  it('reports the API and a live database check', async () => {
    const st = await service.status();
    expect(st.components).toEqual([
      { name: 'API', status: 'operational' },
      { name: 'Database', status: 'operational' },
    ]);
    expect(st.summary).toBe('API and database operational');
    expect(Number.isNaN(Date.parse(st.checkedAt))).toBe(false);
  });

  it('accepts a honeypot submission silently without delivering it', async () => {
    await expect(
      service.submitForm({
        route: 'support',
        fields: { name: 'Bot', email: 'bot@example.com' },
        website: 'https://spam.example',
      }),
    ).resolves.toEqual({ inbox: 'support@noxtill.com' });
  });

  it('rejects a form without a valid reply email', async () => {
    await expect(
      service.submitForm({
        route: 'privacy',
        fields: { name: 'Ana', email: 'nope' },
      }),
    ).rejects.toMatchObject({
      response: { code: 'LEGAL_FORM_EMAIL_INVALID' },
    });
  });

  it('never claims delivery when the email provider is not configured', async () => {
    const err = await service
      .submitForm({
        route: 'accessibility',
        fields: {
          page: '/pricing',
          task: 'Read plans',
          email: 'ana@example.com',
        },
      })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AppException);
    expect((err as AppException).getResponse()).toMatchObject({
      code: 'LEGAL_FORM_DELIVERY_UNAVAILABLE',
    });
  });
});
