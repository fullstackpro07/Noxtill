import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { AppException } from '../common/filters/app.exception';
import { normalizePhoneE164 } from '../common/utils/phone.util';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { QueryCustomersDto } from './dto/query-customers.dto';
import { CUSTOMER_ERROR_CODES } from './customers.constants';
import { Prisma } from '../../generated/prisma';

/** Customers CRUD, search, and GDPR erasure (BE-040). */
@Injectable()
export class CustomersService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly auditService: AuditService,
  ) {}

  async create(businessId: string, dto: CreateCustomerDto) {
    const business = await this.tenantPrisma.client.business.findUniqueOrThrow({
      where: { id: businessId },
    });
    const phone = normalizePhoneE164(dto.phone, business.country ?? undefined);
    if (!phone) {
      throw new AppException(
        CUSTOMER_ERROR_CODES.INVALID_PHONE,
        `Could not parse phone: ${dto.phone}`,
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.tenantPrisma.client.customer.create({
      data: {
        phone,
        name: dto.name,
        email: dto.email,
        address: dto.address,
        birthday: dto.birthday ? new Date(dto.birthday) : undefined,
        notes: dto.notes,
        tags: dto.tags ?? [],
        consentMarketing: dto.consentMarketing ?? true,
      } as unknown as Prisma.CustomerUncheckedCreateInput,
    });
  }

  findAll(query: QueryCustomersDto) {
    // MySQL migration: `tags` is a JSON array now (Prisma's MySQL connector has no native array
    // column type), so the array-contains check uses the Json filter API instead of the old
    // scalar-list `has` operator.
    const where: Prisma.CustomerWhereInput = {
      tags: query.tag ? { array_contains: [query.tag] } : undefined,
      OR: query.q
        ? [{ name: { contains: query.q } }, { phone: { contains: query.q } }]
        : undefined,
    };

    return this.tenantPrisma.client.customer.findMany({
      where,
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const customer = await this.tenantPrisma.client.customer.findUnique({
      where: { id },
      include: {
        orders: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { items: true },
        },
        privateFeedback: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
    return customer;
  }

  async update(id: string, dto: UpdateCustomerDto) {
    await this.assertExists(id);
    return this.tenantPrisma.client.customer.update({
      where: { id },
      data: {
        notes: dto.notes,
        tags: dto.tags,
        consentMarketing: dto.consentMarketing,
        name: dto.name,
        address: dto.address,
      },
    });
  }

  /** GDPR erasure: wipes PII, keeps anonymized transaction history, requires the customer's own phone as confirmation. */
  async erase(id: string, confirmPhone: string) {
    const customer = await this.assertExists(id);
    if (confirmPhone !== customer.phone) {
      throw new AppException(
        CUSTOMER_ERROR_CODES.CONFIRMATION_MISMATCH,
        "Confirmation does not match this customer's phone number",
        HttpStatus.BAD_REQUEST,
      );
    }

    const before = {
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      address: customer.address,
    };

    const erased = await this.tenantPrisma.client.customer.update({
      where: { id },
      data: {
        name: 'Erased Customer',
        phone: `erased-${customer.id}`,
        email: null,
        address: null,
        birthday: null,
        notes: null,
        tags: [],
      },
    });

    await this.auditService.log({
      entity: 'Customer',
      entityId: id,
      action: 'customer.erase',
      before,
      after: { erased: true },
    });

    return erased;
  }

  private async assertExists(id: string) {
    const customer = await this.tenantPrisma.client.customer.findUnique({
      where: { id },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
    return customer;
  }
}
