import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { AppException } from '../common/filters/app.exception';
import { normalizePhoneE164 } from '../common/utils/phone.util';
import { CustomerTagsService } from './customer-tags.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { QueryCustomersDto } from './dto/query-customers.dto';
import { CUSTOMER_ERROR_CODES } from './customers.constants';
import { Prisma } from '@prisma/client';
import { excludeErasedCustomers } from './segment-rules.util';

/** Customers CRUD, search, and GDPR erasure (BE-040). */
@Injectable()
export class CustomersService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly auditService: AuditService,
    private readonly customerTags: CustomerTagsService,
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

    const customer = await this.tenantPrisma.client.customer.create({
      data: {
        phone,
        name: dto.name,
        email: dto.email,
        address: dto.address,
        birthday: dto.birthday ? new Date(dto.birthday) : undefined,
        notes: dto.notes,
        tags: dto.tags ?? [],
        consentMarketing: dto.consentMarketing ?? false,
      } as unknown as Prisma.CustomerUncheckedCreateInput,
    });

    // Same real mechanism the import pipeline uses for opening balances (BE-099) — a real
    // CreditEntry, so it shows up in the customer's own ledger rather than a stored Customer field.
    if (dto.openingBalance && dto.openingBalance > 0) {
      await this.tenantPrisma.client.creditEntry.create({
        data: {
          businessId,
          customerId: customer.id,
          kind: 'credit',
          amount: dto.openingBalance,
          note: 'Opening balance',
        },
      });
    }

    if (dto.tags?.length) {
      await Promise.all(
        dto.tags.map((tag) => this.customerTags.ensureExists(businessId, tag)),
      );
    }

    return customer;
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
      where: excludeErasedCustomers(where),
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const customer = await this.tenantPrisma.client.customer.findFirst({
      where: excludeErasedCustomers({ id }),
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

  async update(businessId: string, id: string, dto: UpdateCustomerDto) {
    await this.assertExists(id);
    const updated = await this.tenantPrisma.client.customer.update({
      where: { id },
      data: {
        notes: dto.notes,
        tags: dto.tags,
        consentMarketing: dto.consentMarketing,
        name: dto.name,
        address: dto.address,
        status: dto.status,
        customFieldValues: dto.customFieldValues as
          Prisma.InputJsonValue | undefined,
      },
    });

    if (dto.tags?.length) {
      await Promise.all(
        dto.tags.map((tag) => this.customerTags.ensureExists(businessId, tag)),
      );
    }

    return updated;
  }

  /** GDPR erasure: wipes PII, keeps anonymized transaction history, requires the customer's own phone as confirmation. */
  async erase(id: string, confirmPhone: string) {
    const customer = await this.assertExists(id);
    const result = await this.tenantPrisma.client.$transaction(async (tx) => {
      // Agent task/draft creation takes this same row lock. This serializes erasure
      // with those writes so no customer-agent record can appear after cleanup.
      const rows = await tx.$queryRaw<Array<{ id: string; phone: string }>>`
        SELECT id, phone
        FROM customers
        WHERE id = ${id} AND business_id = ${customer.businessId}
        FOR UPDATE
      `;
      const current = rows[0];
      if (!current) {
        throw new NotFoundException('Customer not found');
      }
      if (confirmPhone !== current.phone) {
        throw new AppException(
          CUSTOMER_ERROR_CODES.CONFIRMATION_MISMATCH,
          "Confirmation does not match this customer's phone number",
          HttpStatus.BAD_REQUEST,
        );
      }

      const [
        deletedTasks,
        deletedDrafts,
        deletedMemoryNotes,
        deletedChannelConsents,
      ] = await Promise.all([
        tx.customerFollowUpTask.deleteMany({
          where: { businessId: customer.businessId, customerId: id },
        }),
        tx.messageDraft.deleteMany({
          where: {
            businessId: customer.businessId,
            customerId: id,
            sourceKey: { startsWith: `customer_agent:${id}:` },
          },
        }),
        tx.memoryNote.deleteMany({
          where: {
            businessId: customer.businessId,
            subjectType: 'customer',
            subjectId: id,
          },
        }),
        tx.customerChannelConsent.deleteMany({
          where: { businessId: customer.businessId, customerId: id },
        }),
      ]);
      const erased = await tx.customer.update({
        where: { id, businessId: customer.businessId },
        data: {
          name: 'Erased Customer',
          phone: `erased-${id}`,
          email: null,
          address: null,
          birthday: null,
          notes: null,
          tags: [],
          customFieldValues: {},
          consentMarketing: false,
          optedOut: true,
        },
      });
      return {
        erased,
        deletedTasks: deletedTasks.count,
        deletedDrafts: deletedDrafts.count,
        deletedMemoryNotes: deletedMemoryNotes.count,
        deletedChannelConsents: deletedChannelConsents.count,
      };
    });

    await this.auditService.log({
      entity: 'Customer',
      entityId: id,
      action: 'customer.erase',
      // The audit confirms the operation without copying the erased PII into
      // the append-only audit log.
      after: {
        erased: true,
        clearedFields: [
          'name',
          'phone',
          'email',
          'address',
          'birthday',
          'notes',
          'tags',
          'customFieldValues',
          'consentMarketing',
        ],
        deletedCustomerAgentDrafts: result.deletedDrafts,
        deletedFollowUpTasks: result.deletedTasks,
        deletedCustomerMemoryNotes: result.deletedMemoryNotes,
        deletedCustomerChannelConsents: result.deletedChannelConsents,
      },
    });

    return result.erased;
  }

  /** Customer export (UPD-BE-097) — a real personal-data export: the customer's own record plus every real row tied to them, not a placeholder. */
  async export(id: string) {
    const customer = await this.tenantPrisma.client.customer.findFirst({
      where: excludeErasedCustomers({ id }),
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
        channelConsentHistory: {
          orderBy: [{ channel: 'asc' }, { revision: 'desc' }],
        },
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
      channelConsentHistory: customer.channelConsentHistory,
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
    const mergedRevocationChannels = await client.$transaction(async (tx) => {
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

      // A merge must never turn a revoked channel decision into permission to contact. Preserve
      // each revoked choice from the duplicate as a fresh, auditable suppression on the canonical
      // profile. A grant from a duplicate is not copied onto a different canonical profile.
      const duplicateConsentHistory = await tx.customerChannelConsent.findMany({
        where: {
          businessId: duplicate.businessId,
          customerId: duplicateCustomerId,
        },
        orderBy: [{ channel: 'asc' }, { revision: 'desc' }],
        select: {
          channel: true,
          state: true,
          recordedByUserId: true,
        },
      });
      const latestDuplicateConsent = new Map<
        (typeof duplicateConsentHistory)[number]['channel'],
        (typeof duplicateConsentHistory)[number]
      >();
      for (const consent of duplicateConsentHistory) {
        if (!latestDuplicateConsent.has(consent.channel)) {
          latestDuplicateConsent.set(consent.channel, consent);
        }
      }
      const suppressedChannels: string[] = [];
      for (const [channel, consent] of latestDuplicateConsent) {
        if (consent.state !== 'revoked') continue;
        const latestCanonical = await tx.customerChannelConsent.findFirst({
          where: { businessId: canonical.businessId, customerId: id, channel },
          orderBy: { revision: 'desc' },
          select: { revision: true, state: true },
        });
        if (latestCanonical?.state === 'revoked') continue;
        await tx.customerChannelConsent.create({
          data: {
            businessId: canonical.businessId,
            customerId: id,
            channel,
            state: 'revoked',
            source: 'profile_merge_suppression',
            evidenceReference: `merge-${duplicateCustomerId}`,
            revision: Number(latestCanonical?.revision ?? 0) + 1,
            recordedByUserId: consent.recordedByUserId,
          },
        });
        suppressedChannels.push(channel);
      }

      await tx.customer.delete({ where: { id: duplicateCustomerId } });
      return suppressedChannels;
    });

    await this.auditService.log({
      entity: 'Customer',
      entityId: id,
      action: 'customer.merge',
      before: { duplicateCustomerId },
      after: {
        mergedInto: id,
        channelConsentSuppressedFromDuplicate: mergedRevocationChannels,
      },
    });

    return this.findOne(id);
  }

  private async assertExists(id: string) {
    const customer = await this.tenantPrisma.client.customer.findFirst({
      where: excludeErasedCustomers({ id }),
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
    return customer;
  }
}
