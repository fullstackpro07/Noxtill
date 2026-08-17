import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { DepositsService } from './deposits.service';
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

describe('DepositsService (UPD-BE-019)', () => {
  let prisma: PrismaService;
  let depositsService: DepositsService;
  let businessId: string;
  let appointmentId: string;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();

    const cls = new FakeClsService();
    const tenantPrisma = new TenantPrismaService(
      prisma,
      cls as unknown as ClsService,
    );
    depositsService = new DepositsService(tenantPrisma);

    const business = await prisma.business.create({
      data: { name: 'Deposits Test Biz', slug: `deposits-test-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const customer = await prisma.customer.create({
      data: { businessId, phone: `+1${Date.now()}`, name: 'Deposit Customer' },
    });
    const svc = await prisma.product.create({
      data: {
        businessId,
        kind: 'service',
        name: 'Consultation',
        durationMin: 60,
      },
    });
    const appointment = await prisma.appointment.create({
      data: {
        businessId,
        serviceId: svc.id,
        customerId: customer.id,
        startsAt: new Date('2026-09-01T10:00:00Z'),
        endsAt: new Date('2026-09-01T11:00:00Z'),
        status: 'confirmed',
      },
    });
    appointmentId = appointment.id;
  });

  afterAll(async () => {
    await prisma.deposit.deleteMany({ where: { businessId } });
    await prisma.appointment.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.$disconnect();
  });

  it('creates a pending deposit against a real appointment', async () => {
    const deposit = await depositsService.create(businessId, {
      appointmentId,
      amount: 20,
      method: 'cash',
    });
    expect(deposit.status).toBe('pending');
  });

  it('rejects a deposit against an appointment from another business', async () => {
    await expect(
      depositsService.create(businessId, {
        appointmentId: 'not-a-real-appointment-id',
        amount: 10,
        method: 'cash',
      }),
    ).rejects.toThrow();
  });

  it('capturing a cash deposit marks it captured and increments Appointment.depositPaid', async () => {
    const deposit = await depositsService.create(businessId, {
      appointmentId,
      amount: 15,
      method: 'cash',
    });
    const before = await prisma.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
    });

    const captured = await depositsService.capture(businessId, deposit.id);
    expect(captured.status).toBe('captured');

    const after = await prisma.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
    });
    expect(Number(after.depositPaid)).toBe(Number(before.depositPaid) + 15);
  });

  it('refunding a captured cash deposit decrements Appointment.depositPaid back', async () => {
    const deposit = await depositsService.create(businessId, {
      appointmentId,
      amount: 12,
      method: 'cash',
    });
    await depositsService.capture(businessId, deposit.id);
    const before = await prisma.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
    });

    const refunded = await depositsService.refund(businessId, deposit.id);
    expect(refunded.status).toBe('refunded');

    const after = await prisma.appointment.findUniqueOrThrow({
      where: { id: appointmentId },
    });
    expect(Number(after.depositPaid)).toBe(Number(before.depositPaid) - 12);
  });

  it('fails cleanly on a card/online deposit instead of faking a successful capture', async () => {
    const deposit = await depositsService.create(businessId, {
      appointmentId,
      amount: 30,
      method: 'card',
    });
    await expect(
      depositsService.capture(businessId, deposit.id),
    ).rejects.toBeInstanceOf(AppException);

    const stillPending = await prisma.deposit.findUniqueOrThrow({
      where: { id: deposit.id },
    });
    expect(stillPending.status).toBe('pending');
  });

  it('rejects capturing a deposit that is not pending', async () => {
    const deposit = await depositsService.create(businessId, {
      appointmentId,
      amount: 5,
      method: 'cash',
    });
    await depositsService.capture(businessId, deposit.id);
    await expect(
      depositsService.capture(businessId, deposit.id),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('forfeitForAppointment() flips every captured deposit on that appointment to forfeited', async () => {
    const deposit = await depositsService.create(businessId, {
      appointmentId,
      amount: 25,
      method: 'cash',
    });
    await depositsService.capture(businessId, deposit.id);

    await depositsService.forfeitForAppointment(appointmentId);

    const forfeited = await prisma.deposit.findUniqueOrThrow({
      where: { id: deposit.id },
    });
    expect(forfeited.status).toBe('forfeited');
  });
});
