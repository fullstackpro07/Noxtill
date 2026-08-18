import { HttpStatus, Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { CLS_KEY_USER_ID } from '../common/tenancy/tenant.constants';
import { OpenShiftDto } from './dto/open-shift.dto';
import { RecordCashMovementDto } from './dto/record-cash-movement.dto';
import { ReconcileShiftDto } from './dto/reconcile-shift.dto';
import {
  CASH_REGISTER_ERROR_CODES,
  VARIANCE_NOTE_THRESHOLD,
} from './cash-register.constants';
import { CashMovementType, CashShiftStatus } from '@prisma/client';

/**
 * Cash Register (UPD-BE-006). One open shift per business at a time — checked explicitly before
 * opening a new one, since Postgres/Prisma has no direct way to express a partial unique index
 * ("only one row where status = open") through the schema alone.
 */
@Injectable()
export class CashRegisterService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly cls: ClsService,
  ) {}

  async getCurrentShift(businessId: string) {
    return this.tenantPrisma.client.cashShift.findFirst({
      where: { businessId, status: CashShiftStatus.open },
      include: { movements: { orderBy: { createdAt: 'asc' } } },
    });
  }

  async openShift(businessId: string, dto: OpenShiftDto) {
    const existing = await this.getCurrentShift(businessId);
    if (existing) {
      throw new AppException(
        CASH_REGISTER_ERROR_CODES.SHIFT_ALREADY_OPEN,
        'A cash shift is already open for this business.',
        HttpStatus.CONFLICT,
      );
    }

    const openedByUserId = this.cls.get<string>(CLS_KEY_USER_ID);
    return this.tenantPrisma.client.cashShift.create({
      data: {
        businessId,
        openedByUserId,
        openingFloat: dto.openingFloat,
        movements: {
          create: {
            businessId,
            type: CashMovementType.opening,
            amount: dto.openingFloat,
            recordedByUserId: openedByUserId,
          },
        },
      },
      include: { movements: true },
    });
  }

  /** A bare close, no variance recorded — for businesses that don't do formal reconciliation.
   * `POST /cash-reconciliation` (UPD-BE-007) supersedes this for anyone who does. */
  async closeShift(businessId: string) {
    const shift = await this.requireOpenShift(businessId);
    return this.tenantPrisma.client.cashShift.update({
      where: { id: shift.id },
      data: { status: CashShiftStatus.closed, closedAt: new Date() },
    });
  }

  async recordMovement(businessId: string, dto: RecordCashMovementDto) {
    const shift = await this.requireOpenShift(businessId);
    const recordedByUserId = this.cls.get<string>(CLS_KEY_USER_ID);
    return this.tenantPrisma.client.cashMovement.create({
      data: {
        businessId,
        shiftId: shift.id,
        type: dto.type as CashMovementType,
        amount: dto.amount,
        note: dto.note,
        recordedByUserId,
      },
    });
  }

  /** Best-effort hook from a completed cash sale (see orders.service.ts) — silently skipped if
   * no shift is currently open, since not every business uses the cash register at all. */
  async recordSaleMovement(
    businessId: string,
    amount: number,
    orderId: string,
  ): Promise<void> {
    const shift = await this.getCurrentShift(businessId);
    if (!shift) return;
    await this.tenantPrisma.client.cashMovement.create({
      data: {
        businessId,
        shiftId: shift.id,
        type: CashMovementType.sale,
        amount,
        note: `Order ${orderId}`,
      },
    });
  }

  /** Best-effort hook from a cash-method return refund (see returns.service.ts) — silently
   * skipped if no shift is currently open, same convention as `recordSaleMovement`. */
  async recordRefundMovement(
    businessId: string,
    amount: number,
    note: string,
  ): Promise<void> {
    const shift = await this.getCurrentShift(businessId);
    if (!shift) return;
    await this.tenantPrisma.client.cashMovement.create({
      data: {
        businessId,
        shiftId: shift.id,
        type: CashMovementType.refund,
        amount,
        note,
      },
    });
  }

  /**
   * Shift Closing (UPD-BE-007) — computes expected cash from the shift's own movements, requires
   * a note once the counted-vs-expected gap exceeds VARIANCE_NOTE_THRESHOLD, then closes the
   * shift. Supersedes a bare `closeShift()` for any business that actually counts its drawer.
   */
  async reconcile(businessId: string, dto: ReconcileShiftDto) {
    const shift = await this.requireOpenShift(businessId);
    const expected = await this.expectedCash(businessId, shift.id);
    const variance = Math.round((dto.countedCash - expected) * 100) / 100;

    if (Math.abs(variance) > VARIANCE_NOTE_THRESHOLD && !dto.note?.trim()) {
      throw new AppException(
        CASH_REGISTER_ERROR_CODES.VARIANCE_NOTE_REQUIRED,
        `A variance of ${variance} needs a note before closing (threshold: ${VARIANCE_NOTE_THRESHOLD}).`,
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.tenantPrisma.client.cashShift.update({
      where: { id: shift.id },
      data: {
        status: CashShiftStatus.closed,
        closedAt: new Date(),
        countedCash: dto.countedCash,
        variance,
        varianceNote: dto.note,
      },
    });
  }

  async expectedCash(businessId: string, shiftId: string): Promise<number> {
    const movements = await this.tenantPrisma.client.cashMovement.findMany({
      where: { businessId, shiftId },
    });
    const sign: Record<CashMovementType, 1 | -1> = {
      opening: 1,
      sale: 1,
      cash_in: 1,
      refund: -1,
      cash_out: -1,
    };
    const total = movements.reduce(
      (sum, m) => sum + Number(m.amount) * sign[m.type],
      0,
    );
    return Math.round(total * 100) / 100;
  }

  private async requireOpenShift(businessId: string) {
    const shift = await this.getCurrentShift(businessId);
    if (!shift) {
      throw new AppException(
        CASH_REGISTER_ERROR_CODES.NO_OPEN_SHIFT,
        'No open shift — open one first.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return shift;
  }
}
