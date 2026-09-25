import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { ActivityService } from '../activity/activity.service';
import { ActivityPubSubService } from '../activity/activity-pubsub.service';
import { NotificationsService } from '../notifications/notifications.service';
import { DeliverySettingsService } from './delivery-settings.service';
import { DeliveryNotifierService } from './delivery-notifier.service';
import { DeliveryAutomationsService } from './delivery-automations.service';
import { RidersService } from './riders.service';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('DeliveryAutomationsService (real rule engine)', () => {
  let prisma: PrismaService;
  let service: DeliveryAutomationsService;
  let settings: DeliverySettingsService;
  let businessId: string;
  let userId: string;
  let orderNo = 9000;
  const notifier = { notify: jest.fn() };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    settings = new DeliverySettingsService(tenantPrisma);
    const pubsub = { publish: jest.fn() } as unknown as ActivityPubSubService;
    const activity = new ActivityService(tenantPrisma, pubsub);
    const riders = new RidersService(tenantPrisma, pubsub, activity, settings);
    service = new DeliveryAutomationsService(
      tenantPrisma,
      settings,
      notifier as unknown as DeliveryNotifierService,
      riders,
      activity,
      new NotificationsService(tenantPrisma),
    );

    const business = await prisma.business.create({
      data: { name: 'Automations Biz', slug: `automations-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);
    const user = await prisma.user.create({
      data: {
        name: 'Owner',
        email: `automations-${Date.now()}@example.com`,
        passwordHash: 'x',
      },
    });
    userId = user.id;
    await prisma.businessUser.create({
      data: { businessId, userId, role: 'owner' },
    });
  });

  afterAll(async () => {
    await prisma.notification.deleteMany({ where: { businessId } });
    await prisma.deliveryAutomationRun.deleteMany({ where: { businessId } });
    await prisma.activityEvent.deleteMany({ where: { businessId } });
    await prisma.delivery.deleteMany({ where: { businessId } });
    await prisma.payment.deleteMany({ where: { order: { businessId } } });
    await prisma.order.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.rider.deleteMany({ where: { businessId } });
    await prisma.deliverySettings.deleteMany({ where: { businessId } });
    await prisma.businessUser.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  async function makeDelivery(extra: Record<string, unknown> = {}) {
    const order = await prisma.order.create({
      data: {
        businessId,
        orderNo: orderNo++,
        orderType: 'delivery',
        status: 'pending',
        total: 500,
      },
    });
    return prisma.delivery.create({
      data: {
        businessId,
        orderId: order.id,
        addressLine: '1 Test Street',
        ...extra,
      },
    });
  }

  it('does nothing — and logs nothing — while a rule is switched off', async () => {
    notifier.notify.mockClear();
    const d = await makeDelivery();
    await service.onAssigned(businessId, d.id);
    expect(notifier.notify).not.toHaveBeenCalled();
    expect(
      await prisma.deliveryAutomationRun.count({ where: { businessId } }),
    ).toBe(0);
  });

  it('sends the ETA and logs a run when "ETA on assign" is on, and counts it in the summary', async () => {
    await settings.update(businessId, { autoEtaOnAssign: true });
    notifier.notify.mockResolvedValue({ sent: true });
    const d = await makeDelivery();
    await service.onAssigned(businessId, d.id);
    expect(notifier.notify).toHaveBeenCalledWith(businessId, d.id, 'eta');
    const summary = await service.runSummary(businessId);
    expect(summary.get('eta_on_assign')?.count).toBe(1);
  });

  it('a failed send is logged as failed and NOT counted as a run', async () => {
    notifier.notify.mockResolvedValue({ sent: false, reason: 'no channel' });
    const d = await makeDelivery();
    await service.onAssigned(businessId, d.id);
    const summary = await service.runSummary(businessId);
    expect(summary.get('eta_on_assign')?.count).toBe(1);
    expect(
      await prisma.deliveryAutomationRun.count({
        where: { businessId, rule: 'eta_on_assign:failed' },
      }),
    ).toBe(1);
  });

  it('raises an in-app alert for the owner when a delivery fails and the rule is on', async () => {
    await settings.update(businessId, { autoTaskOnFailure: true });
    const d = await makeDelivery({
      status: 'failed',
      failureReason: 'Nobody home',
    });
    await service.onFailed(businessId, d.id);
    const alerts = await prisma.notification.findMany({
      where: { businessId, userId },
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].body).toContain('Nobody home');
  });

  it('flags a stale rider once, not on every tick', async () => {
    await settings.update(businessId, { autoFlagStalePhone: true });
    await prisma.rider.create({
      data: {
        businessId,
        name: 'Quiet Rider',
        phone: '0300',
        status: 'active',
        lastLocationAt: new Date(Date.now() - 30 * 60 * 1000),
      },
    });
    await service.tick(businessId);
    await service.tick(businessId);
    expect(
      await prisma.deliveryAutomationRun.count({
        where: { businessId, rule: 'flag_stale_phone' },
      }),
    ).toBe(1);
  });

  it('messages the customer once when an active delivery slips past its promise by the threshold', async () => {
    await settings.update(businessId, {
      autoEtaOnSlip: true,
      slipThresholdMinutes: 10,
    });
    notifier.notify.mockClear();
    notifier.notify.mockResolvedValue({ sent: true });
    const d = await makeDelivery({
      status: 'assigned',
      promisedAt: new Date(Date.now() - 20 * 60 * 1000),
    });
    await service.tick(businessId);
    expect(notifier.notify).toHaveBeenCalledWith(businessId, d.id, 'slip');
  });
});
