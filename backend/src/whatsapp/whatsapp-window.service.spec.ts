import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { WhatsappWindowService } from './whatsapp-window.service';

describe('WhatsappWindowService (BE-016)', () => {
  let prisma: PrismaService;
  let service: WhatsappWindowService;
  let businessId: string;
  let customerId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = {
      get: () => undefined,
      set: () => undefined,
    } as unknown as ClsService;
    const tenantPrisma = new TenantPrismaService(prisma, cls);
    service = new WhatsappWindowService(tenantPrisma);

    const business = await prisma.business.create({
      data: { name: 'WA Window Test', slug: `wa-window-test-${Date.now()}` },
    });
    businessId = business.id;
    const customer = await prisma.customer.create({
      data: { businessId, phone: '+10000000099', name: 'Window Customer' },
    });
    customerId = customer.id;
  });

  afterAll(async () => {
    await prisma.whatsappWindow.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.business.deleteMany({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('is closed before any inbound reply', async () => {
    expect(await service.isOpen(businessId, customerId)).toBe(false);
  });

  it('opens the window on refresh and stays open', async () => {
    await service.refresh(businessId, customerId);
    expect(await service.isOpen(businessId, customerId)).toBe(true);
  });

  it('refresh is idempotent (upsert, not duplicate rows)', async () => {
    await service.refresh(businessId, customerId);
    const count = await prisma.whatsappWindow.count({
      where: { businessId, customerId },
    });
    expect(count).toBe(1);
  });
});
