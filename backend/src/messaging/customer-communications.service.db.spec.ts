import { randomUUID } from 'crypto';
import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CustomerCommunicationsService } from './customer-communications.service';
import { AppException } from '../common/filters/app.exception';

describe('Verified voice customer tickets and message drafts (real MySQL)', () => {
  const prisma = new PrismaService();
  let businessId: string;
  let otherId: string;
  let callId: string;
  let service: CustomerCommunicationsService;
  const token = randomUUID().replaceAll('-', '');
  beforeAll(async () => {
    await prisma.$connect();
    const stamp = randomUUID();
    businessId = (
      await prisma.business.create({
        data: { name: 'Voice communications QA', slug: `comm-${stamp}` },
      })
    ).id;
    otherId = (
      await prisma.business.create({
        data: { name: 'Other communications QA', slug: `comm-other-${stamp}` },
      })
    ).id;
    const customer = await prisma.customer.create({
      data: { businessId, phone: '+15555553333', name: 'QA verified caller' },
    });
    const product = await prisma.product.create({
      data: { businessId, kind: 'service', name: 'QA service' },
    });
    await prisma.appointment.create({
      data: {
        businessId,
        customerId: customer.id,
        serviceId: product.id,
        bookingNo: 1,
        startsAt: new Date(Date.now() + 86400000),
        endsAt: new Date(Date.now() + 90000000),
        rescheduleToken: token,
      },
    });
    callId = (
      await prisma.phoneCall.create({
        data: {
          businessId,
          callSid: `CA-comm-${stamp}`,
          fromNumber: customer.phone,
          recordingConsentStatus: 'granted',
        },
      })
    ).id;
    service = new CustomerCommunicationsService(
      prisma,
      new TenantPrismaService(prisma, {
        get: () => businessId,
      } as unknown as ClsService),
    );
  });
  afterAll(async () => {
    await prisma.phoneCall.deleteMany({ where: { businessId } });
    await prisma.appointment.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.product.deleteMany({ where: { businessId } });
    await prisma.business.deleteMany({
      where: { id: { in: [businessId, otherId] } },
    });
    await prisma.$disconnect();
  });

  it('requires an owning customer credential and writes idempotently without queueing a message or review', async () => {
    await expect(
      service.createFromVerifiedCall(otherId, callId, 'foreign', {
        kind: 'support_ticket',
        bookingToken: token,
        title: 'Help',
        body: 'Need help',
      }),
    ).rejects.toBeInstanceOf(AppException);
    await expect(
      service.createFromVerifiedCall(businessId, callId, 'wrong', {
        kind: 'support_ticket',
        bookingToken: 'wrong',
        title: 'Help',
        body: 'Need help',
      }),
    ).rejects.toBeInstanceOf(AppException);
    const input = {
      kind: 'support_ticket' as const,
      bookingToken: token,
      title: 'QA service request',
      body: 'Please review the caller’s service request.',
    };
    const first = await service.createFromVerifiedCall(
      businessId,
      callId,
      'request-1',
      input,
    );
    expect(
      await service.createFromVerifiedCall(
        businessId,
        callId,
        'request-1',
        input,
      ),
    ).toEqual(first);
    expect(first.status).toBe('open');
    expect(
      await service.createFromVerifiedCall(businessId, callId, 'request-2', {
        kind: 'inbox_draft',
        bookingToken: token,
        body: 'QA draft for staff review.',
      }),
    ).toMatchObject({ status: 'draft', sent: false });
    const outputs = await service.forCall(businessId, callId);
    expect(outputs.tickets).toHaveLength(1);
    expect(outputs.drafts).toHaveLength(1);
    expect(await prisma.message.count({ where: { businessId } })).toBe(0);
    expect(await prisma.privateFeedback.count({ where: { businessId } })).toBe(
      0,
    );
  });
});
