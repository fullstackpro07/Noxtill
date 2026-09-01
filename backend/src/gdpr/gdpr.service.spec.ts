import { ClsService } from 'nestjs-cls';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { AuditService } from '../common/audit/audit.service';
import { CustomersService } from '../customers/customers.service';
import { GdprService } from './gdpr.service';
import type { S3Service } from '../common/storage/s3.service';
import { AppException } from '../common/filters/app.exception';
import { DSR_URGENT_AT_DAY } from './gdpr.constants';

class FakeClsService {
  private store: Record<string, unknown> = {};
  get<T>(key: string): T {
    return this.store[key] as T;
  }
  set(key: string, value: unknown) {
    this.store[key] = value;
  }
}

describe('GdprService (UPD-BE-123)', () => {
  let prisma: PrismaService;
  let service: GdprService;
  let businessId: string;
  let userId: string;
  const s3 = {
    uploadAndSign: jest
      .fn<Promise<string>, [string, Buffer, string]>()
      .mockResolvedValue('https://signed.example/gdpr-export.json'),
  };

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
    const customersService = new CustomersService(tenantPrisma, auditService);
    service = new GdprService(
      tenantPrisma,
      s3 as unknown as S3Service,
      customersService,
    );

    const business = await prisma.business.create({
      data: { name: 'GDPR Test Biz', slug: `gdpr-test-${Date.now()}` },
    });
    businessId = business.id;
    cls.set(CLS_KEY_BUSINESS_ID, businessId);

    const user = await prisma.user.create({
      data: {
        name: 'GDPR Requester',
        email: `gdpr-test-${Date.now()}@example.com`,
        passwordHash: 'x',
      },
    });
    userId = user.id;
  });

  afterEach(() => {
    s3.uploadAndSign.mockClear();
  });

  afterAll(async () => {
    await prisma.dataSubjectRequest.deleteMany({ where: { businessId } });
    await prisma.auditLog.deleteMany({ where: { businessId } });
    await prisma.customer.deleteMany({ where: { businessId } });
    await prisma.business.delete({ where: { id: businessId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it('create() writes a real pending request tied to a real customer', async () => {
    const customer = await prisma.customer.create({
      data: {
        businessId,
        name: 'Erin Test',
        phone: `+1415555${Date.now() % 10000}`,
      },
    });

    const request = await service.create(businessId, userId, {
      customerId: customer.id,
      kind: 'export',
    });
    expect(request.status).toBe('pending');
    expect(request.customer.name).toBe('Erin Test');

    await prisma.dataSubjectRequest.delete({ where: { id: request.id } });
    await prisma.customer.delete({ where: { id: customer.id } });
  });

  it('create() rejects an unknown customerId', async () => {
    await expect(
      service.create(businessId, userId, {
        customerId: 'nope',
        kind: 'export',
      }),
    ).rejects.toBeInstanceOf(AppException);
  });

  it('fulfill() on an export request really calls CustomersService.export() and uploads a real signed link', async () => {
    const customer = await prisma.customer.create({
      data: {
        businessId,
        name: 'Export Me',
        phone: `+1415555${(Date.now() + 1) % 10000}`,
      },
    });
    const request = await service.create(businessId, userId, {
      customerId: customer.id,
      kind: 'export',
    });

    const fulfilled = await service.fulfill(businessId, request.id, {});
    expect(fulfilled.status).toBe('fulfilled');
    expect(fulfilled.resultUrl).toBe('https://signed.example/gdpr-export.json');
    expect(fulfilled.fulfilledAt).not.toBeNull();
    expect(s3.uploadAndSign).toHaveBeenCalledTimes(1);
    const [, buffer, contentType] = s3.uploadAndSign.mock.calls[0];
    expect(contentType).toBe('application/json');
    const parsed = JSON.parse(buffer.toString()) as {
      customer: { name: string };
    };
    expect(parsed.customer.name).toBe('Export Me');

    await prisma.dataSubjectRequest.delete({ where: { id: request.id } });
    await prisma.customer.delete({ where: { id: customer.id } });
  });

  it('fulfill() on an erasure request really calls CustomersService.erase() and wipes real PII', async () => {
    const phone = `+1415555${(Date.now() + 2) % 10000}`;
    const customer = await prisma.customer.create({
      data: { businessId, name: 'Erase Me', phone },
    });
    const request = await service.create(businessId, userId, {
      customerId: customer.id,
      kind: 'erasure',
    });

    const fulfilled = await service.fulfill(businessId, request.id, {
      confirmPhone: phone,
    });
    expect(fulfilled.status).toBe('fulfilled');

    const erasedCustomer = await prisma.customer.findUniqueOrThrow({
      where: { id: customer.id },
    });
    expect(erasedCustomer.name).toBe('Erased Customer');
    expect(erasedCustomer.phone).not.toBe(phone);

    await prisma.dataSubjectRequest.delete({ where: { id: request.id } });
    await prisma.customer.delete({ where: { id: customer.id } });
  });

  it('fulfill() rejects an erasure with the wrong confirmation phone, leaving the request open', async () => {
    const customer = await prisma.customer.create({
      data: {
        businessId,
        name: 'Wrong Confirm',
        phone: `+1415555${(Date.now() + 3) % 10000}`,
      },
    });
    const request = await service.create(businessId, userId, {
      customerId: customer.id,
      kind: 'erasure',
    });

    await expect(
      service.fulfill(businessId, request.id, { confirmPhone: '+10000000000' }),
    ).rejects.toThrow();

    const stillOpen = await service.findOne(businessId, request.id);
    expect(stillOpen.status).toBe('pending');

    await prisma.dataSubjectRequest.delete({ where: { id: request.id } });
    await prisma.customer.delete({ where: { id: customer.id } });
  });

  it('reject() marks a request rejected with a real note, and it can no longer be fulfilled', async () => {
    const customer = await prisma.customer.create({
      data: {
        businessId,
        name: 'Reject Me',
        phone: `+1415555${(Date.now() + 4) % 10000}`,
      },
    });
    const request = await service.create(businessId, userId, {
      customerId: customer.id,
      kind: 'export',
    });

    const rejected = await service.reject(businessId, request.id, {
      note: 'Duplicate request',
    });
    expect(rejected.status).toBe('rejected');
    expect(rejected.note).toBe('Duplicate request');

    await expect(service.fulfill(businessId, request.id, {})).rejects.toThrow();

    await prisma.dataSubjectRequest.delete({ where: { id: request.id } });
    await prisma.customer.delete({ where: { id: customer.id } });
  });

  it('markInProgress() moves a pending request to in_progress', async () => {
    const customer = await prisma.customer.create({
      data: {
        businessId,
        name: 'In Progress',
        phone: `+1415555${(Date.now() + 5) % 10000}`,
      },
    });
    const request = await service.create(businessId, userId, {
      customerId: customer.id,
      kind: 'export',
    });

    const updated = await service.markInProgress(businessId, request.id);
    expect(updated.status).toBe('in_progress');

    await prisma.dataSubjectRequest.delete({ where: { id: request.id } });
    await prisma.customer.delete({ where: { id: customer.id } });
  });

  it('the legal-window urgency flag really flips at the 25-of-30-day mark, and never applies to a resolved request', async () => {
    const customer = await prisma.customer.create({
      data: {
        businessId,
        name: 'Aging Request',
        phone: `+1415555${(Date.now() + 6) % 10000}`,
      },
    });
    const freshRequest = await service.create(businessId, userId, {
      customerId: customer.id,
      kind: 'export',
    });
    expect(freshRequest.status).toBe('pending');

    const agingDate = new Date(
      Date.now() - (DSR_URGENT_AT_DAY + 1) * 24 * 60 * 60 * 1000,
    );
    await prisma.dataSubjectRequest.update({
      where: { id: freshRequest.id },
      data: { createdAt: agingDate },
    });

    const aged = await service.findOne(businessId, freshRequest.id);
    expect(aged.urgent).toBe(true);
    expect(aged.daysRemaining).toBeLessThanOrEqual(5);

    const resolved = await service.reject(businessId, freshRequest.id, {});
    const resolvedFetched = await service.findOne(businessId, resolved.id);
    expect(resolvedFetched.urgent).toBe(false);

    await prisma.dataSubjectRequest.delete({ where: { id: freshRequest.id } });
    await prisma.customer.delete({ where: { id: customer.id } });
  });

  it('list() supports filtering by status', async () => {
    const customer = await prisma.customer.create({
      data: {
        businessId,
        name: 'List Filter',
        phone: `+1415555${(Date.now() + 7) % 10000}`,
      },
    });
    const request = await service.create(businessId, userId, {
      customerId: customer.id,
      kind: 'export',
    });

    const pending = await service.list(businessId, 'pending');
    expect(pending.some((r) => r.id === request.id)).toBe(true);
    const fulfilled = await service.list(businessId, 'fulfilled');
    expect(fulfilled.some((r) => r.id === request.id)).toBe(false);

    await prisma.dataSubjectRequest.delete({ where: { id: request.id } });
    await prisma.customer.delete({ where: { id: customer.id } });
  });

  describe('tenant isolation (fixed real cross-business leak)', () => {
    it("list() never returns another business's requests", async () => {
      const otherBusiness = await prisma.business.create({
        data: { name: 'Other GDPR Biz', slug: `gdpr-other-${Date.now()}` },
      });
      const otherCustomer = await prisma.customer.create({
        data: {
          businessId: otherBusiness.id,
          name: 'Other Biz Customer',
          phone: `+1415555${(Date.now() + 8) % 10000}`,
        },
      });
      // Created directly via the raw client, not `service.create()` — that method's internal
      // customer lookup goes through the tenant-scoped client, which would force-rewrite the
      // query to the fake CLS's statically-bound `businessId` for this whole test file, not
      // `otherBusiness.id`.
      const otherRequest = await prisma.dataSubjectRequest.create({
        data: {
          businessId: otherBusiness.id,
          customerId: otherCustomer.id,
          kind: 'export',
          requestedByUserId: userId,
        },
      });

      const ownList = await service.list(businessId);
      expect(ownList.some((r) => r.id === otherRequest.id)).toBe(false);

      await prisma.dataSubjectRequest.delete({
        where: { id: otherRequest.id },
      });
      await prisma.customer.delete({ where: { id: otherCustomer.id } });
      await prisma.business.delete({ where: { id: otherBusiness.id } });
    });

    it('findOne()/markInProgress()/reject() 404 on a request that belongs to another business', async () => {
      const otherBusiness = await prisma.business.create({
        data: { name: 'Other GDPR Biz 2', slug: `gdpr-other2-${Date.now()}` },
      });
      const otherCustomer = await prisma.customer.create({
        data: {
          businessId: otherBusiness.id,
          name: 'Other Biz Customer 2',
          phone: `+1415555${(Date.now() + 9) % 10000}`,
        },
      });
      const otherRequest = await prisma.dataSubjectRequest.create({
        data: {
          businessId: otherBusiness.id,
          customerId: otherCustomer.id,
          kind: 'export',
          requestedByUserId: userId,
        },
      });

      await expect(
        service.findOne(businessId, otherRequest.id),
      ).rejects.toThrow();
      await expect(
        service.markInProgress(businessId, otherRequest.id),
      ).rejects.toThrow();
      await expect(
        service.reject(businessId, otherRequest.id, {}),
      ).rejects.toThrow();

      await prisma.dataSubjectRequest.delete({
        where: { id: otherRequest.id },
      });
      await prisma.customer.delete({ where: { id: otherCustomer.id } });
      await prisma.business.delete({ where: { id: otherBusiness.id } });
    });
  });
});
