import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { CLS_KEY_USER_ID } from '../common/tenancy/tenant.constants';
import {
  CreateShiftDto,
  RequestShiftSwapDto,
  UpdateShiftDto,
} from './dto/create-shift.dto';
import { SHIFT_ERROR_CODES } from './shifts.constants';
import { Prisma, ShiftSwapStatus } from '../../generated/prisma';

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
}
