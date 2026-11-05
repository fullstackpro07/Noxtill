import { randomUUID } from 'crypto';
import { Role } from '@prisma/client';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CustomerChannelConsentService } from './customer-channel-consent.service';

describe('CustomerChannelConsentService (real MySQL)', () => {
  const prisma = new PrismaService();
  let service: CustomerChannelConsentService;
  let businessId: string;
  let foreignBusinessId: string;
  let actorUserId: string;
  let customerId: string;
  let foreignCustomerId: string;

  beforeAll(async () => {
    await prisma.$connect();
    const suffix = randomUUID();
    const [business, foreignBusiness, user] = await Promise.all([
      prisma.business.create({
        data: {
          name: 'QA Channel Consent',
          slug: `qa-channel-consent-${suffix}`,
        },
      }),
      prisma.business.create({
        data: {
          name: 'QA Foreign Channel Consent',
          slug: `qa-channel-consent-other-${suffix}`,
        },
      }),
      prisma.user.create({
        data: {
          name: 'QA Consent Recorder',
          email: `qa-channel-consent-${suffix}@example.test`,
          passwordHash: 'unused-test-password',
        },
      }),
    ]);
    businessId = business.id;
    foreignBusinessId = foreignBusiness.id;
    actorUserId = user.id;
    await prisma.businessUser.create({
      data: { businessId, userId: actorUserId, role: Role.manager },
    });
    const [customer, foreignCustomer] = await Promise.all([
      prisma.customer.create({
        data: {
          businessId,
          name: 'QA Consent Customer',
          phone: `+1555${suffix.replaceAll('-', '').slice(-10)}`,
        },
      }),
      prisma.customer.create({
        data: {
          businessId: foreignBusinessId,
          name: 'QA Foreign Consent Customer',
          phone: `+1666${suffix.replaceAll('-', '').slice(-10)}`,
        },
      }),
    ]);
    customerId = customer.id;
    foreignCustomerId = foreignCustomer.id;
    const cls = { get: () => businessId } as unknown as ClsService;
    const tenant = new TenantPrismaService(prisma, cls);
    service = new CustomerChannelConsentService(tenant);
  });

  afterAll(async () => {
    const businessIds = [businessId, foreignBusinessId];
    await prisma.customerChannelConsent.deleteMany({
      where: { businessId: { in: businessIds } },
    });
    await prisma.auditLog.deleteMany({
      where: { businessId: { in: businessIds } },
    });
    await prisma.customer.deleteMany({
      where: { businessId: { in: businessIds } },
    });
    await prisma.businessUser.deleteMany({
      where: { businessId: { in: businessIds } },
    });
    await prisma.user.deleteMany({ where: { id: actorUserId } });
    await prisma.business.deleteMany({ where: { id: { in: businessIds } } });
    await prisma.$disconnect();
  });

  it('defaults newly created CRM records to no marketing consent', async () => {
    await expect(
      prisma.customer.findUniqueOrThrow({
        where: { id: foreignCustomerId },
        select: { consentMarketing: true },
      }),
    ).resolves.toMatchObject({ consentMarketing: false });
  });

  it('records an immutable revision history and resolves the latest channel choice', async () => {
    const initial = await service.list(businessId, customerId);
    expect(initial.channels).toEqual(
      expect.arrayContaining([
        {
          channel: 'email',
          state: 'unknown',
          evidenceReference: null,
          source: null,
          updatedAt: null,
        },
        {
          channel: 'sms',
          state: 'unknown',
          evidenceReference: null,
          source: null,
          updatedAt: null,
        },
        {
          channel: 'whatsapp',
          state: 'unknown',
          evidenceReference: null,
          source: null,
          updatedAt: null,
        },
      ]),
    );
    expect(initial.history).toEqual([]);

    const granted = await service.record(businessId, actorUserId, customerId, {
      channel: 'email',
      state: 'granted',
      source: 'website_form',
      evidenceReference: 'form-qa-17',
    });
    const revoked = await service.record(businessId, actorUserId, customerId, {
      channel: 'email',
      state: 'revoked',
      source: 'customer_portal',
      evidenceReference: 'portal-qa-18',
    });

    expect(granted.revision).toBe(1);
    expect(revoked.revision).toBe(2);
    const snapshot = await service.list(businessId, customerId);
    expect(
      snapshot.channels.find((row) => row.channel === 'email'),
    ).toMatchObject({
      state: 'revoked',
      evidenceReference: 'portal-qa-18',
      source: 'customer_portal',
    });
    expect(snapshot.history.map((row) => row.state)).toEqual([
      'revoked',
      'granted',
    ]);
    expect(
      (
        await prisma.customer.findUniqueOrThrow({
          where: { id: customerId },
          select: { consentMarketing: true },
        })
      ).consentMarketing,
    ).toBe(false);
    expect(
      await prisma.auditLog.count({
        where: {
          businessId,
          action: 'customers.channel_consent_recorded',
        },
      }),
    ).toBe(2);
  });

  it('fails closed for unverified evidence, opt-out blocks grants, and revocation is always allowed', async () => {
    await expect(
      service.record(businessId, actorUserId, customerId, {
        channel: 'sms',
        state: 'granted',
        source: 'other',
        evidenceReference: 'qa@example.test',
      }),
    ).rejects.toMatchObject({
      response: { code: 'CUSTOMER_CHANNEL_CONSENT_REFERENCE_INVALID' },
    });

    await prisma.customer.update({
      where: { id: customerId },
      data: { optedOut: true },
    });
    await expect(
      service.record(businessId, actorUserId, customerId, {
        channel: 'sms',
        state: 'granted',
        source: 'paper_form',
        evidenceReference: 'paper-qa-19',
      }),
    ).rejects.toMatchObject({
      response: { code: 'CUSTOMER_CHANNEL_CONSENT_FORBIDDEN' },
    });

    await expect(
      service.record(businessId, actorUserId, customerId, {
        channel: 'sms',
        state: 'revoked',
        source: 'recorded_call',
        evidenceReference: 'call-qa-20',
      }),
    ).resolves.toMatchObject({ state: 'revoked', revision: 1 });
  });

  it('does not disclose or record consent for a foreign customer identifier', async () => {
    await expect(
      service.list(businessId, foreignCustomerId),
    ).rejects.toMatchObject({
      response: { code: 'CUSTOMER_NOT_FOUND' },
    });
    await expect(
      service.record(businessId, actorUserId, foreignCustomerId, {
        channel: 'whatsapp',
        state: 'granted',
        source: 'customer_portal',
        evidenceReference: 'foreign-qa-21',
      }),
    ).rejects.toMatchObject({
      response: { code: 'CUSTOMER_NOT_FOUND' },
    });
    expect(
      await prisma.customerChannelConsent.count({
        where: { businessId, customerId: foreignCustomerId },
      }),
    ).toBe(0);
  });
});
