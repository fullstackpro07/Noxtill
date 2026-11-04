import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { CustomersService } from './customers.service';
import { CustomerTagsService } from './customer-tags.service';
import { AppException } from '../common/filters/app.exception';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('CustomersService (BE-040)', () => {
  let prisma: PrismaService;
  let customersService: CustomersService;
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    const auditService = new AuditService(
      tenantPrisma,
      cls as unknown as ClsService,
    );
    customersService = new CustomersService(
      tenantPrisma,
      auditService,
      new CustomerTagsService(tenantPrisma),
    );

    const business = await prisma.business.create({
      data: {
        name: 'Customers Test Biz',
        slug: `customers-test-${Date.now()}`,
        country: 'US',
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { businessId } });
    await prisma.creditEntry.deleteMany({ where: { businessId } });
    await prisma.memoryNote.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=0');
      await tx.business.delete({ where: { id: businessId } });
      await tx.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS=1');
    });
    await prisma.$disconnect();
  });

  it('creates a customer with the phone normalized to E.164', async () => {
    const customer = await customersService.create(businessId, {
      phone: '(415) 555-0132',
      name: 'Alex',
    });
    expect(customer.phone).toBe('+14155550132');
    expect(customer.consentMarketing).toBe(false);
  });

  it('rejects an unparseable phone number', async () => {
    await expect(
      customersService.create(businessId, {
        phone: 'not-a-phone',
        name: 'Bad',
      }),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('finds customers by fuzzy name/phone search', async () => {
    const results = await customersService.findAll({ q: 'Alex' });
    expect(results.some((c) => c.name === 'Alex')).toBe(true);
  });

  it('erases customer PII and customer-agent records without retaining PII in the audit log', async () => {
    const customer = await customersService.create(businessId, {
      phone: '+14155550199',
      name: 'To Erase',
      email: 'erase@example.com',
    });
    await prisma.customer.update({
      where: { id: customer.id },
      data: {
        address: '1 Private Street',
        notes: 'Sensitive customer note',
        tags: ['private-tag'],
        customFieldValues: { privateField: 'private value' },
      },
    });
    await prisma.messageDraft.create({
      data: {
        businessId,
        customerId: customer.id,
        sourceKey: `customer_agent:${customer.id}:manual:erase-test`,
        body: 'Private agent draft',
      },
    });
    const unrelatedDraft = await prisma.messageDraft.create({
      data: {
        businessId,
        customerId: customer.id,
        sourceKey: `voice:erase-test:${customer.id}`,
        body: 'Keep the separate voice-domain draft',
      },
    });
    await prisma.customerFollowUpTask.create({
      data: {
        businessId,
        customerId: customer.id,
        title: 'Private follow-up',
        reason: 'Contains customer-specific context',
        idempotencyKey: `erase-${customer.id}`,
        payloadHash: 'a'.repeat(64),
        createdByUserId: 'customer-erasure-test',
      },
    });
    await prisma.memoryNote.create({
      data: {
        businessId,
        subjectType: 'customer',
        subjectId: customer.id,
        body: 'Private note containing customer context',
      },
    });
    await prisma.customerChannelConsent.create({
      data: {
        businessId,
        customerId: customer.id,
        channel: 'email',
        state: 'granted',
        source: 'website_form',
        evidenceReference: 'erase-consent-form-1',
        revision: 1,
        recordedByUserId: 'customer-erasure-test',
      },
    });

    await expect(
      customersService.erase(customer.id, '+10000000000'),
    ).rejects.toBeInstanceOf(AppException);
    expect(
      await prisma.customerFollowUpTask.count({
        where: { businessId, customerId: customer.id },
      }),
    ).toBe(1);
    expect(
      await prisma.messageDraft.count({
        where: {
          businessId,
          customerId: customer.id,
          sourceKey: { startsWith: `customer_agent:${customer.id}:` },
        },
      }),
    ).toBe(1);

    const erased = await customersService.erase(customer.id, '+14155550199');
    expect(erased.name).toBe('Erased Customer');
    expect(erased.email).toBeNull();
    expect(erased.phone).not.toBe('+14155550199');
    expect(erased.address).toBeNull();
    expect(erased.notes).toBeNull();
    expect(erased.tags).toEqual([]);
    expect(erased.customFieldValues).toEqual({});
    expect(erased.consentMarketing).toBe(false);
    expect(erased.optedOut).toBe(true);

    expect(
      (await customersService.findAll({})).some(
        (row) => row.id === customer.id,
      ),
    ).toBe(false);
    await expect(customersService.findOne(customer.id)).rejects.toThrow(
      'Customer not found',
    );
    await expect(customersService.export(customer.id)).rejects.toThrow(
      'Customer not found',
    );
    await expect(
      customersService.update(businessId, customer.id, { name: 'Restored' }),
    ).rejects.toThrow('Customer not found');

    expect(
      await prisma.customerFollowUpTask.count({
        where: { businessId, customerId: customer.id },
      }),
    ).toBe(0);
    expect(
      await prisma.memoryNote.count({
        where: {
          businessId,
          subjectType: 'customer',
          subjectId: customer.id,
        },
      }),
    ).toBe(0);
    expect(
      await prisma.messageDraft.findMany({
        where: {
          businessId,
          customerId: customer.id,
          sourceKey: { startsWith: `customer_agent:${customer.id}:` },
        },
      }),
    ).toHaveLength(0);
    expect(
      await prisma.customerChannelConsent.count({
        where: { businessId, customerId: customer.id },
      }),
    ).toBe(0);
    expect(
      await prisma.messageDraft.findUnique({
        where: { id: unrelatedDraft.id },
      }),
    ).not.toBeNull();

    const audits = await prisma.auditLog.findMany({
      where: { entityId: customer.id, action: 'customer.erase' },
      select: { before: true, after: true },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0].before).toBeNull();
    const auditAfter = JSON.stringify(audits[0].after);
    expect(auditAfter).not.toContain('+14155550199');
    expect(auditAfter).not.toContain('erase@example.com');
    expect(auditAfter).not.toContain('To Erase');
    expect(auditAfter).toContain('deletedCustomerAgentDrafts');
    expect(auditAfter).toContain('deletedCustomerMemoryNotes');
    expect(auditAfter).toContain('deletedCustomerChannelConsents');
  });

  describe('export (UPD-BE-097)', () => {
    it('exports a real, non-placeholder record of everything tied to this customer', async () => {
      const customer = await customersService.create(businessId, {
        phone: '+14155550210',
        name: 'Export Me',
        email: 'export@example.com',
      });
      await prisma.creditEntry.create({
        data: {
          businessId,
          customerId: customer.id,
          kind: 'credit',
          amount: 40,
        },
      });

      const exported = await customersService.export(customer.id);
      expect(exported.customer.name).toBe('Export Me');
      expect(exported.customer.email).toBe('export@example.com');
      expect(exported.creditEntries).toHaveLength(1);
      expect(Number(exported.creditEntries[0].amount)).toBe(40);

      const audits = await prisma.auditLog.findMany({
        where: { entityId: customer.id, action: 'customer.export' },
      });
      expect(audits).toHaveLength(1);
    });
  });

  describe('merge (UPD-BE-097)', () => {
    it('reassigns real history from the duplicate onto the canonical customer, then deletes the duplicate', async () => {
      const canonical = await customersService.create(businessId, {
        phone: '+14155550220',
        name: 'Canonical',
      });
      const duplicate = await customersService.create(businessId, {
        phone: '+14155550221',
        name: 'Duplicate',
      });
      await prisma.customer.update({
        where: { id: duplicate.id },
        data: { lifetimeSpend: 150, visitCount: 3 },
      });
      await prisma.creditEntry.create({
        data: {
          businessId,
          customerId: duplicate.id,
          kind: 'credit',
          amount: 25,
        },
      });

      const merged = await customersService.merge(canonical.id, duplicate.id);
      expect(Number(merged.lifetimeSpend)).toBe(150);
      expect(merged.visitCount).toBe(3);

      const movedEntry = await prisma.creditEntry.findFirst({
        where: { customerId: canonical.id, amount: 25 },
      });
      expect(movedEntry).toBeDefined();

      const stillExists = await prisma.customer.findUnique({
        where: { id: duplicate.id },
      });
      expect(stillExists).toBeNull();

      const audits = await prisma.auditLog.findMany({
        where: { entityId: canonical.id, action: 'customer.merge' },
      });
      expect(audits).toHaveLength(1);
    });

    it('carries a duplicate channel revocation forward but does not transfer a channel grant', async () => {
      const canonical = await customersService.create(businessId, {
        phone: '+14155550225',
        name: 'Consent Canonical',
      });
      const duplicate = await customersService.create(businessId, {
        phone: '+14155550226',
        name: 'Consent Duplicate',
      });
      await prisma.customerChannelConsent.createMany({
        data: [
          {
            businessId,
            customerId: canonical.id,
            channel: 'email',
            state: 'granted',
            source: 'website_form',
            evidenceReference: 'canonical-email-form',
            revision: 1,
            recordedByUserId: 'merge-test',
          },
          {
            businessId,
            customerId: duplicate.id,
            channel: 'email',
            state: 'revoked',
            source: 'customer_portal',
            evidenceReference: 'duplicate-email-revoke',
            revision: 1,
            recordedByUserId: 'merge-test',
          },
          {
            businessId,
            customerId: duplicate.id,
            channel: 'sms',
            state: 'granted',
            source: 'paper_form',
            evidenceReference: 'duplicate-sms-form',
            revision: 1,
            recordedByUserId: 'merge-test',
          },
        ],
      });

      await customersService.merge(canonical.id, duplicate.id);

      const emailConsent = await prisma.customerChannelConsent.findFirst({
        where: { businessId, customerId: canonical.id, channel: 'email' },
        orderBy: { revision: 'desc' },
      });
      expect(emailConsent).toMatchObject({
        state: 'revoked',
        source: 'profile_merge_suppression',
        revision: 2,
      });
      expect(
        await prisma.customerChannelConsent.findFirst({
          where: { businessId, customerId: canonical.id, channel: 'sms' },
        }),
      ).toBeNull();
      expect(
        await prisma.customerChannelConsent.count({
          where: { businessId, customerId: duplicate.id },
        }),
      ).toBe(0);
      const audit = await prisma.auditLog.findFirst({
        where: { businessId, entityId: canonical.id, action: 'customer.merge' },
        select: { after: true },
      });
      expect(audit?.after).toMatchObject({
        channelConsentSuppressedFromDuplicate: ['email'],
      });
    });

    it('rejects merging a customer into itself', async () => {
      const customer = await customersService.create(businessId, {
        phone: '+14155550230',
        name: 'Solo',
      });
      await expect(
        customersService.merge(customer.id, customer.id),
      ).rejects.toBeInstanceOf(AppException);
    });

    it('reassigns referrals so no row is left pointing at a deleted customer', async () => {
      const canonical = await customersService.create(businessId, {
        phone: '+14155550240',
        name: 'Referral Canonical',
      });
      const duplicate = await customersService.create(businessId, {
        phone: '+14155550241',
        name: 'Referral Duplicate',
      });
      const referred = await prisma.customer.create({
        data: {
          businessId,
          phone: '+14155550242',
          name: 'Referred Customer',
          referredByCustomerId: duplicate.id,
        },
      });

      await customersService.merge(canonical.id, duplicate.id);

      const updated = await prisma.customer.findUniqueOrThrow({
        where: { id: referred.id },
      });
      expect(updated.referredByCustomerId).toBe(canonical.id);
    });
  });
});
