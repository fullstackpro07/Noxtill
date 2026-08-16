import axios from 'axios';
import { ClsService } from 'nestjs-cls';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../../common/tenancy/tenant.constants';
import { SegmentsService } from '../../customers/segments.service';
import { EmailCampaignsService } from './email-campaigns.service';
import { signPayload } from '../signed-token.util';
import { AppException } from '../../common/filters/app.exception';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('EmailCampaignsService (BE-083)', () => {
  let prisma: PrismaService;
  let service: EmailCampaignsService;
  let businessId: string;
  const config = new ConfigService({
    EMAIL_PROVIDER_KEY: 'pm-token',
    EMAIL_FROM_ADDRESS: 'hello@noxtill.app',
    FRONTEND_URL: 'http://localhost:3000',
    EMAIL_UNSUBSCRIBE_SECRET: 'test-unsub-secret',
  });

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new EmailCampaignsService(
      tenantPrisma,
      new SegmentsService(tenantPrisma),
      config,
    );

    const business = await prisma.business.create({
      data: {
        name: 'Email Campaigns Test Biz',
        slug: `email-campaigns-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    await prisma.customer.create({
      data: {
        businessId,
        name: 'Has Email',
        phone: `+1601${Date.now()}`,
        email: 'has-email@example.com',
      },
    });
    await prisma.customer.create({
      data: { businessId, name: 'No Email', phone: `+1602${Date.now()}` },
    });
  });

  beforeEach(() => {
    mockedAxios.post.mockReset();
  });

  afterAll(async () => {
    await prisma.emailEvent.deleteMany({
      where: { emailCampaign: { businessId } },
    });
    await prisma.emailCampaign.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('sends only to segment members with a real email address, skipping those without one', async () => {
    mockedAxios.post.mockResolvedValue({ data: { MessageID: 'msg-1' } });

    const campaign = await service.create(businessId, {
      subject: 'Hi',
      body: 'Body text',
      segment: 'all',
    });

    expect(campaign.sentCount).toBe(1);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockedAxios.post).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockedAxios.post).toHaveBeenCalledWith(
      'https://api.postmarkapp.com/email',
      expect.objectContaining({ To: 'has-email@example.com', Subject: 'Hi' }),
      expect.any(Object),
    );
  });

  it('always appends a real, working unsubscribe link to the sent body', async () => {
    mockedAxios.post.mockResolvedValue({ data: { MessageID: 'msg-2' } });
    await service.create(businessId, {
      subject: 'Hi again',
      body: 'Body text',
      segment: 'all',
    });

    const [, payload] = mockedAxios.post.mock.calls[0] as [
      string,
      { TextBody: string },
    ];
    expect(payload.TextBody).toContain(
      'http://localhost:3000/unsubscribe?token=',
    );
  });

  it('excludes a previously-unsubscribed recipient from a later send (real suppression-list check)', async () => {
    mockedAxios.post.mockResolvedValue({ data: { MessageID: 'msg-3' } });
    const priorCampaign = await prisma.emailCampaign.create({
      data: { businessId, subject: 'old', body: 'old', segment: 'all' },
    });
    await prisma.emailEvent.create({
      data: {
        emailCampaignId: priorCampaign.id,
        recipient: 'has-email@example.com',
        type: 'unsub',
      },
    });

    const campaign = await service.create(businessId, {
      subject: 'New blast',
      body: 'Body',
      segment: 'all',
    });

    expect(campaign.sentCount).toBe(0);
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('funnel() reflects real EmailEvent counts grouped by type', async () => {
    mockedAxios.post.mockResolvedValue({ data: { MessageID: 'msg-4' } });
    await prisma.emailEvent.deleteMany({
      where: { emailCampaign: { businessId } },
    });
    const campaign = await service.create(businessId, {
      subject: 'Funnel test',
      body: 'Body',
      segment: 'all',
    });

    const funnel = await service.funnel(businessId, campaign.id);
    expect(funnel.sent).toBe(1);
    expect(funnel.unsubscribed).toBe(0);
  });

  it('funnel() throws a typed not-found error for a campaign outside this business', async () => {
    await expect(
      service.funnel(businessId, 'not-a-real-id'),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('unsubscribe() verifies the signed token and records a real suppression event', async () => {
    const campaign = await prisma.emailCampaign.create({
      data: { businessId, subject: 'x', body: 'x', segment: 'all' },
    });
    const token = signPayload(
      { email: 'unsub-me@example.com', businessId, campaignId: campaign.id },
      'test-unsub-secret',
    );

    const result = await service.unsubscribe(token);
    expect(result).toEqual({ ok: true });

    const event = await prisma.emailEvent.findFirst({
      where: {
        emailCampaignId: campaign.id,
        recipient: 'unsub-me@example.com',
        type: 'unsub',
      },
    });
    expect(event).not.toBeNull();
  });

  it('unsubscribe() rejects a forged token', async () => {
    await expect(service.unsubscribe('forged.token')).rejects.toBeInstanceOf(
      AppException,
    );
  });
});
