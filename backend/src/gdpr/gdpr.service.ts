import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { S3Service } from '../common/storage/s3.service';
import { CustomersService } from '../customers/customers.service';
import { AppException } from '../common/filters/app.exception';
import { CreateDsrRequestDto } from './dto/create-dsr-request.dto';
import {
  FulfillDsrRequestDto,
  RejectDsrRequestDto,
} from './dto/fulfill-dsr-request.dto';
import {
  DSR_LEGAL_WINDOW_DAYS,
  DSR_URGENT_AT_DAY,
  GDPR_ERROR_CODES,
} from './gdpr.constants';
import { DsrRequestStatus } from '@prisma/client';

function withUrgency<T extends { status: DsrRequestStatus; createdAt: Date }>(
  request: T,
): T & { daysRemaining: number; urgent: boolean } {
  const daysElapsed =
    (Date.now() - request.createdAt.getTime()) / (24 * 60 * 60 * 1000);
  const daysRemaining = Math.max(
    0,
    Math.ceil(DSR_LEGAL_WINDOW_DAYS - daysElapsed),
  );
  const stillOpen =
    request.status === DsrRequestStatus.pending ||
    request.status === DsrRequestStatus.in_progress;
  return {
    ...request,
    daysRemaining,
    urgent: stillOpen && daysElapsed >= DSR_URGENT_AT_DAY,
  };
}

/**
 * Data & Privacy, DSR queue (UPD-BE-123) — a request-tracking layer on top of the already-real
 * `CustomersService.export()`/`.erase()`, which this deliberately never reimplements: `fulfill()`
 * just calls straight through to whichever of those two methods matches the request's `kind`.
 *
 * `DataSubjectRequest` isn't in `TENANT_SCOPED_MODELS` (no Prisma extension auto-scopes it), so
 * every method here takes `businessId` explicitly and filters/verifies against it directly —
 * fixed after finding `list()`/`findOne()`/`markInProgress()`/`reject()` originally queried by
 * bare `id` with no tenant check at all, a real cross-business leak of customer PII requests.
 */
@Injectable()
export class GdprService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly s3: S3Service,
    private readonly customers: CustomersService,
  ) {}

  async create(businessId: string, userId: string, dto: CreateDsrRequestDto) {
    const customer = await this.tenantPrisma.client.customer.findUnique({
      where: { id: dto.customerId },
    });
    if (!customer || customer.businessId !== businessId) {
      throw new AppException(
        GDPR_ERROR_CODES.CUSTOMER_NOT_FOUND,
        'Customer not found',
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.tenantPrisma.client.dataSubjectRequest.create({
      data: {
        businessId,
        customerId: dto.customerId,
        kind: dto.kind,
        note: dto.note,
        requestedByUserId: userId,
      },
      include: { customer: true },
    });
  }

  async list(businessId: string, status?: DsrRequestStatus) {
    const requests = await this.tenantPrisma.client.dataSubjectRequest.findMany(
      {
        where: { businessId, status },
        orderBy: { createdAt: 'asc' },
        include: { customer: true },
      },
    );
    return requests.map(withUrgency);
  }

  async findOne(businessId: string, id: string) {
    const request = await this.findRaw(businessId, id);
    return withUrgency(request);
  }

  /** Real fulfillment: `export` uploads a real signed download of `CustomersService.export()`'s data; `erasure` calls `CustomersService.erase()` — the exact same PII wipe any direct `DELETE /customers/:id` call performs. */
  async fulfill(businessId: string, id: string, dto: FulfillDsrRequestDto) {
    const request = await this.assertOpen(businessId, id);

    if (request.kind === 'export') {
      const data = await this.customers.export(request.customerId);
      const key = `gdpr-exports/${businessId}/${request.customerId}-${Date.now()}.json`;
      const url = await this.s3.uploadAndSign(
        key,
        Buffer.from(JSON.stringify(data, null, 2)),
        'application/json',
      );
      return this.tenantPrisma.client.dataSubjectRequest.update({
        where: { id },
        data: {
          status: DsrRequestStatus.fulfilled,
          fulfilledAt: new Date(),
          resultUrl: url,
        },
        include: { customer: true },
      });
    }

    await this.customers.erase(request.customerId, dto.confirmPhone ?? '');
    return this.tenantPrisma.client.dataSubjectRequest.update({
      where: { id },
      data: { status: DsrRequestStatus.fulfilled, fulfilledAt: new Date() },
      include: { customer: true },
    });
  }

  async markInProgress(businessId: string, id: string) {
    await this.assertOpen(businessId, id);
    return this.tenantPrisma.client.dataSubjectRequest.update({
      where: { id },
      data: { status: DsrRequestStatus.in_progress },
      include: { customer: true },
    });
  }

  async reject(businessId: string, id: string, dto: RejectDsrRequestDto) {
    await this.assertOpen(businessId, id);
    return this.tenantPrisma.client.dataSubjectRequest.update({
      where: { id },
      data: {
        status: DsrRequestStatus.rejected,
        note: dto.note,
      },
      include: { customer: true },
    });
  }

  private async findRaw(businessId: string, id: string) {
    const request =
      await this.tenantPrisma.client.dataSubjectRequest.findUnique({
        where: { id },
        include: { customer: true },
      });
    if (!request || request.businessId !== businessId) {
      throw new NotFoundException('Data subject request not found');
    }
    return request;
  }

  private async assertOpen(businessId: string, id: string) {
    const request = await this.findRaw(businessId, id);
    if (
      request.status === DsrRequestStatus.fulfilled ||
      request.status === DsrRequestStatus.rejected
    ) {
      throw new AppException(
        GDPR_ERROR_CODES.ALREADY_RESOLVED,
        `This request was already ${request.status}.`,
        HttpStatus.CONFLICT,
      );
    }
    return request;
  }
}
