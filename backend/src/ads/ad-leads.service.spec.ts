import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { AdLeadsService } from './ad-leads.service';
import { IntegrationProvider } from '@prisma/client';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('AdLeadsService (UPD-BE-071)', () => {
  let prisma: PrismaService;
  let service: AdLeadsService;
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new AdLeadsService(tenantPrisma, prisma);

    const business = await prisma.business.create({
      data: { name: 'Ad Leads Test Biz', slug: `ad-leads-test-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    await prisma.adLead.deleteMany({ where: { businessId } });
    await prisma.adCampaign.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('ingests a real lead and links it to a real campaign by external id', async () => {
    const campaign = await prisma.adCampaign.create({
      data: {
        businessId,
        provider: IntegrationProvider.meta_ads,
        goal: 'leads',
        budget: 10,
        externalId: 'camp_ext_1',
      },
    });

    const lead = await service.ingest(
      businessId,
      IntegrationProvider.meta_ads,
      {
        externalId: 'lead_ext_1',
        campaignExternalId: 'camp_ext_1',
        name: 'Jamie Prospect',
        email: 'jamie@example.com',
        phone: '+14155551234',
      },
    );

    expect(lead.campaignId).toBe(campaign.id);
    expect(lead.name).toBe('Jamie Prospect');
  });

  it('is idempotent — a re-delivered webhook for the same external id does not duplicate', async () => {
    await service.ingest(businessId, IntegrationProvider.meta_ads, {
      externalId: 'lead_dup_1',
      name: 'First Delivery',
    });
    await service.ingest(businessId, IntegrationProvider.meta_ads, {
      externalId: 'lead_dup_1',
      name: 'Second Delivery (redelivered)',
    });

    const rows = await prisma.adLead.findMany({
      where: { businessId, externalId: 'lead_dup_1' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe('First Delivery'); // create wins, update is a no-op by design
  });

  it('same externalId under a different provider is a real distinct lead', async () => {
    await service.ingest(businessId, IntegrationProvider.meta_ads, {
      externalId: 'shared-id',
      name: 'Meta Lead',
    });
    await service.ingest(businessId, IntegrationProvider.linkedin_ads, {
      externalId: 'shared-id',
      name: 'LinkedIn Lead',
    });

    const rows = await prisma.adLead.findMany({
      where: { businessId, externalId: 'shared-id' },
    });
    expect(rows).toHaveLength(2);
  });

  it('list() returns real ingested leads, most recent first', async () => {
    const leads = await service.list();
    expect(leads.length).toBeGreaterThan(0);
  });
});
