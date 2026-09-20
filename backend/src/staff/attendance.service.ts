import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { Prisma } from '@prisma/client';

/** Check-in/out toggle (BE-057) — one open (checkOut=null) row per staff member at a time. */
@Injectable()
export class AttendanceService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}

  async toggle(businessId: string, userId: string) {
    const businessUser = await this.tenantPrisma.client.businessUser.findUnique(
      {
        where: { businessId_userId: { businessId, userId } },
      },
    );
    if (!businessUser) {
      throw new NotFoundException('Staff record not found for this account');
    }

    const open = await this.tenantPrisma.client.attendance.findFirst({
      where: { staffUserId: businessUser.id, checkOut: null },
      orderBy: { checkIn: 'desc' },
    });

    if (open) {
      return this.tenantPrisma.client.attendance.update({
        where: { id: open.id },
        data: { checkOut: new Date() },
      });
    }

    return this.tenantPrisma.client.attendance.create({
      data: {
        staffUserId: businessUser.id,
        checkIn: new Date(),
      } as Prisma.AttendanceUncheckedCreateInput,
    });
  }

  list(staffUserId?: string, from?: string, to?: string) {
    return this.tenantPrisma.client.attendance.findMany({
      where: {
        staffUserId,
        checkIn: {
          gte: from ? new Date(from) : undefined,
          lt: to ? new Date(to) : undefined,
        },
      },
      orderBy: { checkIn: 'desc' },
      include: { staffUser: { include: { user: true } } },
    });
  }

  /**
   * Manual entry (UPD-BE-STAFF-03) — a manager adding a complete session (both times already
   * known) for a staff member who forgot to clock in, e.g. Both times are required; this is not
   * for starting an open-ended session (`toggle` already covers that for the staff member
   * themself). Flagged `edited` and written to the real audit trail, never silently indistinguishable
   * from a normal self clock-in/out.
   */
  async manualEntry(
    staffUserId: string,
    checkIn: string,
    checkOut: string,
    reason: string,
  ) {
    const checkInDate = new Date(checkIn);
    const checkOutDate = new Date(checkOut);
    if (checkOutDate <= checkInDate) {
      throw new BadRequestException('Check-out must be after check-in');
    }

    const created = await this.tenantPrisma.client.attendance.create({
      data: {
        staffUserId,
        checkIn: checkInDate,
        checkOut: checkOutDate,
        edited: true,
      } as Prisma.AttendanceUncheckedCreateInput,
      include: { staffUser: { include: { user: true } } },
    });

    await this.audit.log({
      entity: 'attendance',
      entityId: created.id,
      action: 'attendance.manual_entry',
      after: { checkIn, checkOut, reason },
    });

    return created;
  }

  /**
   * Correction (UPD-BE-STAFF-03) — the original value is never overwritten silently: it's captured
   * in the audit log's `before` alongside the required reason, matching the design's own promise
   * that "the original value stays in the activity log."
   */
  async correct(
    id: string,
    checkIn: string,
    checkOut: string | null,
    note: string,
  ) {
    const existing = await this.tenantPrisma.client.attendance.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Attendance entry not found');
    }
    const checkInDate = new Date(checkIn);
    const checkOutDate = checkOut ? new Date(checkOut) : null;
    if (checkOutDate && checkOutDate <= checkInDate) {
      throw new BadRequestException('Check-out must be after check-in');
    }

    const updated = await this.tenantPrisma.client.attendance.update({
      where: { id },
      data: { checkIn: checkInDate, checkOut: checkOutDate, edited: true },
      include: { staffUser: { include: { user: true } } },
    });

    await this.audit.log({
      entity: 'attendance',
      entityId: id,
      action: 'attendance.correct',
      before: {
        checkIn: existing.checkIn.toISOString(),
        checkOut: existing.checkOut?.toISOString() ?? null,
      },
      after: { checkIn, checkOut, note },
    });

    return updated;
  }
}
