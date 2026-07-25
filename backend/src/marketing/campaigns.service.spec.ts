import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { SendGateService } from '../messaging/send-gate.service';
import { SegmentsService } from '../customers/segments.service';
import { CampaignsService } from './campaigns.service';
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

describe('CampaignsService (BE-061)', () => {
  let prisma: PrismaService;
  let service: CampaignsService;
  let businessId: string;
  const sendGate = { send: jest.fn().mockResolvedValue(undefined) };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new CampaignsService(
      tenantPrisma,
      sendGate as unknown as SendGateService,
      new SegmentsService(tenantPrisma),
    );

    const business = await prisma.business.create({
      data: {
        name: 'Campaign Test Biz',
        slug: `campaign-test-${Date.now()}`,
        msgQuota: 5,
        msgUsed: 0,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    await prisma.customer.createMany({
      data: [
        { businessId, phone: `+1${Date.now()}1`, name: 'Alice', tags: ['VIP'] },
        { businessId, phone: `+1${Date.now()}2`, name: 'Bob', tags: ['VIP'] },
        {
          businessId,
          phone: `+1${Date.now()}3`,
          name: 'Opted Out',
          tags: ['VIP'],
          optedOut: true,
        },
      ],
    });
  });

  afterEach(() => {
    sendGate.send.mockClear();
  });

  afterAll(async () => {
    await prisma.message.deleteMany({ where: { businessId } });
    await prisma.campaign.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('fans out to eligible (non-opted-out) segment members and personalizes {{customerName}}', async () => {
    const campaign = await service.create(businessId, {
      segment: 'vip',
      body: 'Hi {{customerName}}, enjoy 10% off!',
    });

    expect(campaign.sentCount).toBe(2);
    expect(sendGate.send).toHaveBeenCalledTimes(2);
    expect(sendGate.send).toHaveBeenCalledWith(
      expect.objectContaining({
        businessId,
        templateKey: 'campaign',
        campaignId: campaign.id,
        variables: { body: 'Hi Alice, enjoy 10% off!' },
      }),
    );
  });

  it('blocks the whole send before queuing anything when quota is insufficient', async () => {
    await prisma.business.update({
      where: { id: businessId },
      data: { msgUsed: 4 },
    });

    await expect(
      service.create(businessId, { segment: 'vip', body: 'Another blast' }),
    ).rejects.toBeInstanceOf(AppException);
    expect(sendGate.send).not.toHaveBeenCalled();

    await prisma.business.update({
      where: { id: businessId },
      data: { msgUsed: 0 },
    });
  });

  it('rejects a segment with no reachable members', async () => {
    await expect(
      service.create(businessId, { segment: 'lapsed', body: 'Come back!' }),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('reports the funnel from Message statuses attributed to the campaign', async () => {
    // sendGate.send is mocked in this suite (no real DB write), so seed Message
    // rows directly to exercise the funnel aggregation itself.
    const campaign = await service.create(businessId, {
      segment: 'vip',
      body: 'Funnel test',
    });

    await prisma.message.createMany({
      data: [
        {
          businessId,
          campaignId: campaign.id,
          channel: 'whatsapp',
          category: 'marketing',
          templateKey: 'campaign',
          status: 'delivered',
        },
        {
          businessId,
          campaignId: campaign.id,
          channel: 'whatsapp',
          category: 'marketing',
          templateKey: 'campaign',
          status: 'read',
        },
      ],
    });

    const report = await service.report(campaign.id);
    expect(report.sent).toBe(2);
    expect(report.delivered).toBe(1);
    expect(report.read).toBe(1);
    expect(report.failed).toBe(0);
  });
});
