import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { NotificationsService } from '../notifications/notifications.service';
import { CLS_KEY_USER_ID } from '../common/tenancy/tenant.constants';
import {
  CreateShiftDto,
  RequestShiftSwapDto,
  UpdateShiftDto,
} from './dto/create-shift.dto';
import { SHIFT_ERROR_CODES } from './shifts.constants';
import { Prisma, ShiftSwapStatus } from '@prisma/client';

function formatShiftRange(startsAt: Date, endsAt: Date): string {
  const dateFmt = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const timeFmt = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${dateFmt.format(startsAt)}, ${timeFmt.format(startsAt)}–${timeFmt.format(endsAt)}`;
}

/**
 * Roster (UPD-BE-031). A shift's swap-request fields live on the shift itself (one active
 * request at a time) — requesting is open to any authenticated staff member, approving/rejecting
 * is owner/manager-only (enforced by `@Roles` at the controller), same raise-then-approve shape
 * as `ReturnsService`.
 */
@Injectable()
export class ShiftsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly cls: ClsService,
    private readonly notifications: NotificationsService,
  ) {}

  create(businessId: string, dto: CreateShiftDto) {
    return this.tenantPrisma.client.staffShift.create({
      data: {
        businessId,
        staffUserId: dto.staffUserId,
        startsAt: new Date(dto.startsAt),
        endsAt: new Date(dto.endsAt),
        note: dto.note,
      },
      include: { staffUser: { include: { user: true } } },
    });
  }

  list(staffUserId?: string, from?: string, to?: string) {
    return this.tenantPrisma.client.staffShift.findMany({
      where: {
        staffUserId,
        startsAt: from ? { gte: new Date(from) } : undefined,
        endsAt: to ? { lt: new Date(to) } : undefined,
      },
      orderBy: { startsAt: 'asc' },
      include: { staffUser: { include: { user: true } } },
    });
  }

  async findOne(id: string) {
    const shift = await this.tenantPrisma.client.staffShift.findUnique({
      where: { id },
      include: { staffUser: { include: { user: true } } },
    });
    if (!shift) {
      throw new NotFoundException('Shift not found');
    }
    return shift;
  }

  async update(id: string, dto: UpdateShiftDto) {
    await this.findOne(id);
    return this.tenantPrisma.client.staffShift.update({
      where: { id },
      data: {
        startsAt: dto.startsAt ? new Date(dto.startsAt) : undefined,
        endsAt: dto.endsAt ? new Date(dto.endsAt) : undefined,
        status: dto.status,
        note: dto.note,
      },
      include: { staffUser: { include: { user: true } } },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.tenantPrisma.client.staffShift.delete({ where: { id } });
  }

  async requestSwap(businessId: string, id: string, dto: RequestShiftSwapDto) {
    const actorUserId = this.cls.get<string>(CLS_KEY_USER_ID);
    const shift = await this.findOne(id);
    if (shift.swapStatus === ShiftSwapStatus.pending) {
      throw new AppException(
        SHIFT_ERROR_CODES.SWAP_ALREADY_REQUESTED,
        'This shift already has a pending swap request',
        HttpStatus.CONFLICT,
      );
    }

    const requestedBy = await this.tenantPrisma.client.businessUser.findUnique({
      where: { businessId_userId: { businessId, userId: actorUserId } },
    });

    return this.tenantPrisma.client.staffShift.update({
      where: { id },
      data: {
        swapStatus: ShiftSwapStatus.pending,
        swapRequestedByUserId: requestedBy?.id,
        swapCoveringUserId: dto.coveringUserId,
        swapReason: dto.reason,
        swapReviewedByUserId: null,
      },
      include: { staffUser: { include: { user: true } } },
    });
  }

  async approveSwap(businessId: string, id: string) {
    const actorUserId = this.cls.get<string>(CLS_KEY_USER_ID);
    const shift = await this.findPendingSwap(id);
    if (!shift.swapCoveringUserId) {
      throw new AppException(
        SHIFT_ERROR_CODES.NO_COVERING_STAFF,
        'This swap request has no covering staff member proposed yet',
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.tenantPrisma.client.$transaction(async (tx) => {
      const updated = await tx.staffShift.update({
        where: { id },
        data: {
          swapStatus: ShiftSwapStatus.approved,
          swapReviewedByUserId: actorUserId,
          staffUserId: shift.swapCoveringUserId as string,
        },
        include: { staffUser: { include: { user: true } } },
      });
      await tx.auditLog.create({
        data: {
          businessId,
          actorUserId,
          action: 'shift.swap_approve',
          entity: 'StaffShift',
          entityId: id,
          after: updated as unknown as Prisma.InputJsonValue,
        },
      });
      return updated;
    });
  }

  async rejectSwap(id: string) {
    const actorUserId = this.cls.get<string>(CLS_KEY_USER_ID);
    await this.findPendingSwap(id);
    return this.tenantPrisma.client.staffShift.update({
      where: { id },
      data: {
        swapStatus: ShiftSwapStatus.rejected,
        swapReviewedByUserId: actorUserId,
      },
      include: { staffUser: { include: { user: true } } },
    });
  }

  private async findPendingSwap(id: string) {
    const shift = await this.findOne(id);
    if (shift.swapStatus !== ShiftSwapStatus.pending) {
      throw new AppException(
        SHIFT_ERROR_CODES.NO_SWAP_REQUEST,
        'This shift has no pending swap request',
        HttpStatus.CONFLICT,
      );
    }
    return shift;
  }

  /**
   * UPD-BE-113 "publish-confirmation, naming who gets notified" — there's no draft/published
   * shift state in this schema (every created shift is immediately real), so "publish" here means
   * a real in-app notification (reusing `NotificationsService`, the same bell the frontend already
   * polls) telling each affected staff member their shifts for the range, not a WhatsApp send —
   * these are staff accounts, not `Customer` records, so `SendGateService` doesn't apply here.
   */
  async notify(businessId: string, from: string, to: string) {
    const shifts = await this.tenantPrisma.client.staffShift.findMany({
      where: {
        startsAt: { gte: new Date(from) },
        endsAt: { lt: new Date(to) },
      },
      orderBy: { startsAt: 'asc' },
      include: { staffUser: { include: { user: true } } },
    });

    const byStaffUser = new Map<
      string,
      { userId: string; name: string; shifts: typeof shifts }
    >();
    for (const shift of shifts) {
      const key = shift.staffUserId;
      const entry = byStaffUser.get(key) ?? {
        userId: shift.staffUser.userId,
        name: shift.staffUser.user.name,
        shifts: [],
      };
      entry.shifts.push(shift);
      byStaffUser.set(key, entry);
    }

    const notified: { staffUserId: string; name: string }[] = [];
    for (const [staffUserId, entry] of byStaffUser) {
      const lines = entry.shifts
        .map((s) => formatShiftRange(s.startsAt, s.endsAt))
        .join('\n');
      await this.notifications.create(
        businessId,
        entry.userId,
        {
          title: 'Your schedule has been updated',
          body: `You have ${entry.shifts.length} shift${entry.shifts.length === 1 ? '' : 's'} coming up:\n${lines}`,
          link: '/staff/schedule',
        },
        'schedule_updated',
      );
      notified.push({ staffUserId, name: entry.name });
    }

    return { notifiedCount: notified.length, notified };
  }
}
