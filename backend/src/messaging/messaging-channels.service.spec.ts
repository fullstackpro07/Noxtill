import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { MessagingChannelsService } from './messaging-channels.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('MessagingChannelsService (UPD-BE-118)', () => {
  let prisma: PrismaService;
  let service: MessagingChannelsService;
  let businessId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    service = new MessagingChannelsService(tenantPrisma);

    const business = await prisma.business.create({
      data: {
        name: 'Messaging Channels Test Biz',
        slug: `messaging-channels-test-${Date.now()}`,
      },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
  });

  afterAll(async () => {
    await prisma.message.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('defaults priority to the real hardcoded order, and every real template starts approved', async () => {
    const settings = await service.getSettings(businessId);
    expect(settings.priority).toEqual(['whatsapp', 'sms', 'email']);
    expect(settings.templates.length).toBeGreaterThan(20);
    expect(
      settings.templates.every((t) => t.approval.status === 'approved'),
    ).toBe(true);
  });

  it('updatePriority() really persists a custom order', async () => {
    const updated = await service.updatePriority(businessId, {
      priority: ['email', 'whatsapp'],
    });
    expect(updated.priority).toEqual(['email', 'whatsapp']);

    const refetched = await service.getSettings(businessId);
    expect(refetched.priority).toEqual(['email', 'whatsapp']);
  });

  it('setTemplateApproval() really persists a rejected status with a reason, without affecting other templates', async () => {
    const updated = await service.setTemplateApproval(businessId, 'otp_code', {
      status: 'rejected',
      reason: 'Copy needs revision',
    });
    const otp = updated.templates.find((t) => t.key === 'otp_code');
    expect(otp?.approval).toEqual({
      status: 'rejected',
      reason: 'Copy needs revision',
    });

    const other = updated.templates.find((t) => t.key === 'booking_confirm');
    expect(other?.approval.status).toBe('approved');
  });

  it('usageByChannel reflects real Message rows created this month', async () => {
    await prisma.message.create({
      data: {
        businessId,
        channel: 'whatsapp',
        category: 'utility',
        templateKey: 'otp_code',
        status: 'queued',
      },
    });
    const settings = await service.getSettings(businessId);
    expect(settings.usageByChannel.whatsapp).toBeGreaterThanOrEqual(1);
  });
});
