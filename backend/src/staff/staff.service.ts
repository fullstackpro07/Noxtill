import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { STAFF_ERROR_CODES, TEMP_PASSWORD_BYTES } from './staff.constants';
import {
  AppointmentStatus,
  FeedbackStatus,
  Prisma,
  ProductKind,
  Role,
} from '@prisma/client';

const INBOX_APPOINTMENT_WINDOW_DAYS = 14;

export interface InboxTask {
  id: string;
  type: 'appointment' | 'complaint' | 'restock';
  title: string;
  detail: string;
  assigneeStaffId: string | null;
  dueAt: string | null;
}

const BCRYPT_ROUNDS = 10;

/**
 * Staff CRUD (BE-056) — owner-only (enforced by @RequireCapability(CAPABILITIES.STAFF_MANAGE) at
 * the controller). Inviting staff creates a real User account (a person may
 * already have one from another business, e.g. a contractor working two
 * shops) plus a BusinessUser row scoping their role/commission to this
 * business specifically.
 */
@Injectable()
export class StaffService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  /**
   * `includeInactive` defaults to false so every existing caller (booking/schedule staff pickers,
   * etc.) keeps seeing only people who can actually take a booking or a shift, same as before
   * `active` existed. The Roster screen is the one real caller that needs to see deactivated staff
   * too (to reactivate them), and passes `includeInactive: true` explicitly.
   */
  list(includeInactive = false) {
    return this.tenantPrisma.client.businessUser.findMany({
      where: {
        role: { in: [Role.owner, Role.manager, Role.staff] },
        ...(includeInactive ? {} : { active: true }),
      },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Synthesized read-only inbox (BE-056 extension for INT-009's Team Inbox) — no generic "Task"
   * model exists, so this composes real upcoming appointments, unresolved complaints, and low-stock
   * alerts into one list. There's no "mark done" here; completion happens on the real record
   * (finish the appointment, resolve the complaint, restock the product).
   */
  async inbox(): Promise<InboxTask[]> {
    const windowEnd = new Date(
      Date.now() + INBOX_APPOINTMENT_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    );

    const [appointments, complaints, restockProducts] = await Promise.all([
      this.tenantPrisma.client.appointment.findMany({
        where: {
          status: {
            in: [AppointmentStatus.booked, AppointmentStatus.confirmed],
          },
          startsAt: { lte: windowEnd },
        },
        include: { customer: true, service: true },
        orderBy: { startsAt: 'asc' },
      }),
      this.tenantPrisma.client.privateFeedback.findMany({
        where: { status: { not: FeedbackStatus.resolved } },
        orderBy: { createdAt: 'asc' },
      }),
      this.tenantPrisma.client.product.findMany({
        where: { kind: ProductKind.product, active: true },
      }),
    ]);

    const tasks: InboxTask[] = [];

    for (const a of appointments) {
      tasks.push({
        id: a.id,
        type: 'appointment',
        title: a.customer.name,
        detail: a.service.name,
        assigneeStaffId: a.staffUserId,
        dueAt: a.startsAt.toISOString(),
      });
    }

    for (const f of complaints) {
      tasks.push({
        id: f.id,
        type: 'complaint',
        title: `${f.stars}★ feedback`,
        detail: f.message ?? 'No comment left',
        assigneeStaffId: f.assignedTo,
        dueAt: f.createdAt.toISOString(),
      });
    }

    for (const p of restockProducts.filter(
      (p) => p.stockQty <= p.lowStockThreshold,
    )) {
      tasks.push({
        id: p.id,
        type: 'restock',
        title: p.name,
        detail: `${p.stockQty} left (threshold ${p.lowStockThreshold})`,
        assigneeStaffId: null,
        dueAt: null,
      });
    }

    return tasks;
  }

  async create(businessId: string, dto: CreateStaffDto) {
    if (!dto.email && !dto.phone) {
      throw new AppException(
        STAFF_ERROR_CODES.IDENTITY_REQUIRED,
        'An email or phone number is required to invite staff',
        HttpStatus.BAD_REQUEST,
      );
    }

    const identityFilters: Prisma.UserWhereInput[] = [];
    if (dto.email) identityFilters.push({ email: dto.email });
    if (dto.phone) identityFilters.push({ phone: dto.phone });

    let user = await this.tenantPrisma.client.user.findFirst({
      where: { OR: identityFilters },
    });

    let tempPassword: string | undefined;
    if (user) {
      const existingLink =
        await this.tenantPrisma.client.businessUser.findUnique({
          where: { businessId_userId: { businessId, userId: user.id } },
        });
      if (existingLink?.active) {
        throw new AppException(
          STAFF_ERROR_CODES.ALREADY_STAFF,
          'This person is already staff at this business',
          HttpStatus.CONFLICT,
        );
      }
      // A previously-deactivated staff member re-invited by email/phone comes back as themself —
      // a new BusinessUser row would collide with the `[businessId, userId]` unique constraint,
      // and re-creating a new "person" would orphan their real attendance/commission/order history.
      if (existingLink) {
        const reactivated = await this.tenantPrisma.client.businessUser.update(
          {
            where: { id: existingLink.id },
            data: {
              active: true,
              role: dto.role,
              commissionRule: (dto.commissionRule ?? {}) as Prisma.InputJsonValue,
              hourlyRate: dto.hourlyRate,
            },
            include: { user: true },
          },
        );
        return { ...reactivated, tempPassword };
      }
    } else {
      tempPassword = randomBytes(TEMP_PASSWORD_BYTES).toString('hex');
      const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);
      user = await this.tenantPrisma.client.user.create({
        data: {
          name: dto.name,
          email: dto.email,
          phone: dto.phone,
          passwordHash,
        },
      });
    }

    const businessUser = await this.tenantPrisma.client.businessUser.create({
      data: {
        businessId,
        userId: user.id,
        role: dto.role,
        commissionRule: (dto.commissionRule ?? {}) as Prisma.InputJsonValue,
        hourlyRate: dto.hourlyRate,
      },
      include: { user: true },
    });

    return { ...businessUser, tempPassword };
  }

  async update(id: string, dto: UpdateStaffDto) {
    const existing = await this.loadNonOwner(id);

    if (dto.customRoleId) {
      // Tenant-scoped find — returns null (and thus 404s) for another business's custom role,
      // same protection every other cross-tenant FK assignment in this codebase relies on.
      const customRole = await this.tenantPrisma.client.customRole.findUnique({
        where: { id: dto.customRoleId },
      });
      if (!customRole) {
        throw new NotFoundException('Custom role not found');
      }
    }

    return this.tenantPrisma.client.businessUser.update({
      where: { id: existing.id },
      data: {
        role: dto.role,
        commissionRule: dto.commissionRule as Prisma.InputJsonValue | undefined,
        customRoleId:
          dto.customRoleId === undefined ? undefined : dto.customRoleId,
        hourlyRate: dto.hourlyRate === undefined ? undefined : dto.hourlyRate,
      },
      include: { user: true },
    });
  }

  /**
   * Deactivates (never hard-deletes) a staff member (UPD-BE-STAFF-02) — their attendance,
   * commissions, shifts, orders and activity log entries all stay exactly as they are; only
   * `active` flips, which the auth layer checks on every future login/refresh. Replaces the
   * previous `businessUser.delete`, which would have thrown a foreign-key error for anyone with
   * real history anyway.
   */
  async remove(id: string) {
    const existing = await this.loadNonOwner(id);
    await this.tenantPrisma.client.businessUser.update({
      where: { id: existing.id },
      data: { active: false },
    });
    return { success: true };
  }

  async reactivate(id: string) {
    const existing = await this.loadNonOwner(id);
    return this.tenantPrisma.client.businessUser.update({
      where: { id: existing.id },
      data: { active: true },
      include: { user: true },
    });
  }

  private async loadNonOwner(id: string) {
    const businessUser = await this.tenantPrisma.client.businessUser.findUnique(
      {
        where: { id },
      },
    );
    if (!businessUser) {
      throw new NotFoundException('Staff member not found');
    }
    if (businessUser.role === Role.owner) {
      throw new AppException(
        STAFF_ERROR_CODES.CANNOT_MODIFY_OWNER,
        "The business owner's role cannot be changed here",
        HttpStatus.FORBIDDEN,
      );
    }
    return businessUser;
  }
}
