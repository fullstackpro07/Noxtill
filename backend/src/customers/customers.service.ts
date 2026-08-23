import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { AppException } from '../common/filters/app.exception';
import { normalizePhoneE164 } from '../common/utils/phone.util';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { QueryCustomersDto } from './dto/query-customers.dto';
import { CUSTOMER_ERROR_CODES } from './customers.constants';
import { Prisma } from '@prisma/client';

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

  /** Customer export (UPD-BE-097) — a real personal-data export: the customer's own record plus every real row tied to them, not a placeholder. */
  async export(id: string) {
    const customer = await this.tenantPrisma.client.customer.findUnique({
      where: { id },
      include: {
        orders: { orderBy: { createdAt: 'desc' }, include: { items: true } },
        creditEntries: { orderBy: { createdAt: 'desc' } },
        appointments: {
          orderBy: { startsAt: 'desc' },
          include: { service: true },
        },
        privateFeedback: { orderBy: { createdAt: 'desc' } },
        loyaltyMembers: { include: { program: true } },
        memberships: { include: { plan: true } },
        installmentPlans: { include: { installments: true } },
      },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    await this.auditService.log({
      entity: 'Customer',
      entityId: id,
      action: 'customer.export',
      after: {},
    });

    return {
      exportedAt: new Date().toISOString(),
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        address: customer.address,
        birthday: customer.birthday,
        notes: customer.notes,
        tags: customer.tags,
        consentMarketing: customer.consentMarketing,
        optedOut: customer.optedOut,
        lifetimeSpend: customer.lifetimeSpend,
        visitCount: customer.visitCount,
        lastVisitAt: customer.lastVisitAt,
        createdAt: customer.createdAt,
      },
      orders: customer.orders,
      creditEntries: customer.creditEntries,
      appointments: customer.appointments,
      privateFeedback: customer.privateFeedback,
      loyaltyMembers: customer.loyaltyMembers,
      memberships: customer.memberships,
      installmentPlans: customer.installmentPlans,
    };
  }

  /**
   * Customer export + merge (UPD-BE-097) — duplicate resolution. Every real row across this
   * customer's relations is reassigned onto the canonical customer (`id`); `LoyaltyMember` and
   * `WhatsappWindow` have real unique constraints that a blind reassignment could violate (already
   * enrolled in the same loyalty program, or an existing WhatsApp window), so those two are
   * resolved explicitly (keep the canonical row, drop the duplicate's) rather than reassigned.
   * The duplicate customer row itself is deleted once everything real has moved off it.
   */
  async merge(id: string, duplicateCustomerId: string) {
    if (id === duplicateCustomerId) {
      throw new AppException(
        CUSTOMER_ERROR_CODES.MERGE_SAME_CUSTOMER,
        'Cannot merge a customer into itself',
        HttpStatus.BAD_REQUEST,
      );
    }
    const canonical = await this.assertExists(id);
    const duplicate = await this.assertExists(duplicateCustomerId);

    const client = this.tenantPrisma.client;
    await client.$transaction(async (tx) => {
      await tx.order.updateMany({
        where: { customerId: duplicateCustomerId },
        data: { customerId: id },
      });
      await tx.creditEntry.updateMany({
        where: { customerId: duplicateCustomerId },
        data: { customerId: id },
      });
      await tx.appointment.updateMany({
        where: { customerId: duplicateCustomerId },
        data: { customerId: id },
      });
      await tx.message.updateMany({
        where: { customerId: duplicateCustomerId },
        data: { customerId: id },
      });
      await tx.reviewRequest.updateMany({
        where: { customerId: duplicateCustomerId },
        data: { customerId: id },
      });
      await tx.privateFeedback.updateMany({
        where: { customerId: duplicateCustomerId },
        data: { customerId: id },
      });
      await tx.return.updateMany({
        where: { customerId: duplicateCustomerId },
        data: { customerId: id },
      });
      await tx.waitlistEntry.updateMany({
        where: { customerId: duplicateCustomerId },
        data: { customerId: id },
      });
      await tx.queueToken.updateMany({
        where: { customerId: duplicateCustomerId },
        data: { customerId: id },
      });
      await tx.installmentPlan.updateMany({
        where: { customerId: duplicateCustomerId },
        data: { customerId: id },
      });
      await tx.creditShareLink.updateMany({
        where: { customerId: duplicateCustomerId },
        data: { customerId: id },
      });
      await tx.creditReminderLog.updateMany({
        where: { customerId: duplicateCustomerId },
        data: { customerId: id },
      });
      await tx.membership.updateMany({
        where: { customerId: duplicateCustomerId },
        data: { customerId: id },
      });
      await tx.videoTestimonial.updateMany({
        where: { customerId: duplicateCustomerId },
        data: { customerId: id },
      });
      await tx.voucher.updateMany({
        where: { customerId: duplicateCustomerId },
        data: { customerId: id },
      });
      await tx.customer.updateMany({
        where: { referredByCustomerId: duplicateCustomerId },
        data: { referredByCustomerId: id },
      });

      // LoyaltyMember: unique on [programId, customerId] — reassign only where the canonical
      // customer isn't already enrolled in that same program.
      const duplicateLoyalty = await tx.loyaltyMember.findMany({
        where: { customerId: duplicateCustomerId },
      });
      for (const member of duplicateLoyalty) {
        const conflict = await tx.loyaltyMember.findUnique({
          where: {
            programId_customerId: {
              programId: member.programId,
              customerId: id,
            },
          },
        });
        if (conflict) {
          await tx.stamp.deleteMany({ where: { memberId: member.id } });
          await tx.loyaltyMember.delete({ where: { id: member.id } });
        } else {
          await tx.loyaltyMember.update({
            where: { id: member.id },
            data: { customerId: id },
          });
        }
      }

      // WhatsappWindow: unique on [businessId, customerId] — keep the canonical customer's own
      // window (it reflects who actually replied most recently) rather than overwrite it.
      const duplicateWindow = await tx.whatsappWindow.findFirst({
        where: { customerId: duplicateCustomerId },
      });
      if (duplicateWindow) {
        const canonicalWindow = await tx.whatsappWindow.findFirst({
          where: { customerId: id },
        });
        if (canonicalWindow) {
          await tx.whatsappWindow.delete({ where: { id: duplicateWindow.id } });
        } else {
          await tx.whatsappWindow.update({
            where: { id: duplicateWindow.id },
            data: { customerId: id },
          });
        }
      }

      await tx.customer.update({
        where: { id },
        data: {
          lifetimeSpend: {
            increment: duplicate.lifetimeSpend,
          },
          visitCount: { increment: duplicate.visitCount },
          lastVisitAt:
            duplicate.lastVisitAt &&
            (!canonical.lastVisitAt ||
              duplicate.lastVisitAt > canonical.lastVisitAt)
              ? duplicate.lastVisitAt
              : undefined,
        },
      });

      await tx.customer.delete({ where: { id: duplicateCustomerId } });
    });

    await this.auditService.log({
      entity: 'Customer',
      entityId: id,
      action: 'customer.merge',
      before: { duplicateCustomerId },
      after: { mergedInto: id },
    });

    return this.findOne(id);
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
