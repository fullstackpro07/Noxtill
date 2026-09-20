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
 *
 * Staff depth fix (UPD-INT-011): `swapWithShiftId` makes this a real two-way trade — when set,
 * approving the request reassigns BOTH shifts (the requester gets the covering staff member's
 * named shift, and vice versa), not just a one-way handoff. Omitting it keeps the original
 * plain-coverage-request behavior for cases where nothing is traded back.
 */
@Injectable()
export class ShiftsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly cls: ClsService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(businessId: string, dto: CreateShiftDto) {
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    await this.assertNoOverlap(dto.staffUserId, startsAt, endsAt);
    return this.tenantPrisma.client.staffShift.create({
      data: {
        businessId,
        staffUserId: dto.staffUserId,
        startsAt,
        endsAt,
        note: dto.note,
      },
      include: { staffUser: { include: { user: true } } },
    });
  }

  /**
   * Settings' "Block double bookings" is a real, always-on policy (the toggle is shown
   * permanently on and disabled to communicate that, not because nothing backs it) — a staff
   * member can't be scheduled onto two shifts whose time ranges overlap. Cancelled shifts don't
   * count as a conflict, and a shift is never compared against itself on update.
   */
  private async assertNoOverlap(
    staffUserId: string,
    startsAt: Date,
    endsAt: Date,
    excludeShiftId?: string,
  ) {
    const conflict = await this.tenantPrisma.client.staffShift.findFirst({
      where: {
        staffUserId,
        status: { not: 'cancelled' },
        id: excludeShiftId ? { not: excludeShiftId } : undefined,
        startsAt: { lt: endsAt },
        endsAt: { gt: startsAt },
      },
    });
    if (conflict) {
      throw new AppException(
        SHIFT_ERROR_CODES.OVERLAPPING_SHIFT,
        'This staff member already has a shift that overlaps this time range',
        HttpStatus.CONFLICT,
      );
    }
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
    const existing = await this.findOne(id);
    const startsAt = dto.startsAt ? new Date(dto.startsAt) : existing.startsAt;
    const endsAt = dto.endsAt ? new Date(dto.endsAt) : existing.endsAt;
    if ((dto.startsAt || dto.endsAt) && dto.status !== 'cancelled') {
      await this.assertNoOverlap(existing.staffUserId, startsAt, endsAt, id);
    }
    return this.tenantPrisma.client.staffShift.update({
      where: { id },
      data: {
        startsAt: dto.startsAt ? startsAt : undefined,
        endsAt: dto.endsAt ? endsAt : undefined,
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

    if (dto.swapWithShiftId) {
      await this.validatePairedShift(
        businessId,
        id,
        dto.swapWithShiftId,
        dto.coveringUserId,
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
        swapWithShiftId: dto.swapWithShiftId ?? null,
      },
      include: { staffUser: { include: { user: true } } },
    });
  }

  /**
   * Staff depth fix (UPD-INT-011): validates that a proposed paired shift is real, belongs to the
   * same business, isn't the shift being requested itself, and is actually owned by the proposed
   * covering staff member — checked both at request time (fast feedback) and again inside
   * `approveSwap`'s transaction (authoritative, guards a race where the paired shift changed
   * hands in between).
   */
  private async validatePairedShift(
    businessId: string,
    shiftId: string,
    pairedShiftId: string,
    coveringUserId: string | undefined,
  ) {
    if (pairedShiftId === shiftId) {
      throw new AppException(
        SHIFT_ERROR_CODES.INVALID_PAIRED_SHIFT,
        'A shift cannot be traded for itself',
        HttpStatus.BAD_REQUEST,
      );
    }
    const paired = await this.tenantPrisma.client.staffShift.findUnique({
      where: { id: pairedShiftId },
    });
    if (!paired || paired.businessId !== businessId) {
      throw new AppException(
        SHIFT_ERROR_CODES.INVALID_PAIRED_SHIFT,
        'The proposed shift to trade was not found',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!coveringUserId || paired.staffUserId !== coveringUserId) {
      throw new AppException(
        SHIFT_ERROR_CODES.INVALID_PAIRED_SHIFT,
        'The proposed shift to trade must belong to the covering staff member',
        HttpStatus.BAD_REQUEST,
      );
    }
    return paired;
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
      // Reciprocal trade (UPD-INT-011): if a paired shift was proposed, re-validate it's still
      // really owned by the covering staff member (it may have moved since the request was
      // raised) and hand it back to the original requester — a real two-way exchange, not just a
      // one-way reassignment.
      if (shift.swapWithShiftId) {
        const paired = await tx.staffShift.findUnique({
          where: { id: shift.swapWithShiftId },
        });
        if (
          !paired ||
          paired.businessId !== businessId ||
          paired.staffUserId !== shift.swapCoveringUserId
        ) {
          throw new AppException(
            SHIFT_ERROR_CODES.PAIRED_SHIFT_CHANGED,
            "The covering staff member's proposed shift has since changed hands — ask them to re-propose the swap",
            HttpStatus.CONFLICT,
          );
        }
        await tx.staffShift.update({
          where: { id: paired.id },
          data: { staffUserId: shift.staffUserId },
        });
      }

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

    const actorUserId = this.cls.get<string>(CLS_KEY_USER_ID);
    await this.tenantPrisma.client.schedulePublish.upsert({
      where: {
        businessId_weekStart: { businessId, weekStart: new Date(from) },
      },
      create: {
        businessId,
        weekStart: new Date(from),
        publishedByUserId: actorUserId,
      },
      update: { publishedByUserId: actorUserId, publishedAt: new Date() },
    });

    return { notifiedCount: notified.length, notified };
  }

  /**
   * Real, shared "has this week been published" state — a row only exists once `notify` has
   * actually been called for that week's start, so this reflects the same real action the
   * "Publish Schedule" button performs, visible to every viewer (not per-browser localStorage).
   */
  async publishStatus(businessId: string, weekStart: string) {
    const row = await this.tenantPrisma.client.schedulePublish.findUnique({
      where: {
        businessId_weekStart: { businessId, weekStart: new Date(weekStart) },
      },
    });
    return { published: !!row, publishedAt: row?.publishedAt ?? null };
  }
}
