import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { CreateAdvanceDto, UpdateAdvanceDto } from './dto/create-advance.dto';
import { ADVANCE_ERROR_CODES } from './advances.constants';
import { StaffAdvanceStatus } from '@prisma/client';

function currentMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Advances (UPD-BE-033). "Auto-deducted from the next commission payout" is real, but happens at
 * `PayrollService.export()` time (UPD-BE-034) — the only place a payout is actually materialized
 * in this codebase — this service also supports a real manual `settle()` for a payout made outside
 * payroll (e.g. paid back in cash); either path flips the same `status` field, so a manually
 * settled advance is never double-deducted at the next payroll export.
 */
@Injectable()
export class AdvancesService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  create(
    businessId: string,
    staffUserId: string,
    dto: CreateAdvanceDto,
    recordedByUserId?: string,
  ) {
    return this.tenantPrisma.client.staffAdvance.create({
      data: {
        businessId,
        staffUserId,
        amount: dto.amount,
        reason: dto.reason,
        category: dto.category,
        recordedByUserId,
      },
    });
  }

  list(staffUserId: string) {
    return this.tenantPrisma.client.staffAdvance.findMany({
      where: { staffUserId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** UPD-BE-113: business-wide view for the Advances screen — the per-staff `list()` above stays
   * as-is for its own route. UPD-BE-STAFF-05 adds real recorded-by names, resolved the same way
   * `AuditService.list` resolves actor names — one batched follow-up query, since `User` has no
   * Prisma relation from here (it isn't tenant-scoped). */
  async listAll() {
    const rows = await this.tenantPrisma.client.staffAdvance.findMany({
      orderBy: { createdAt: 'desc' },
      include: { staffUser: { include: { user: true } } },
    });
    const recorderIds = [
      ...new Set(
        rows
          .map((r) => r.recordedByUserId)
          .filter((id): id is string => id !== null),
      ),
    ];
    const recorders =
      recorderIds.length > 0
        ? await this.tenantPrisma.client.user.findMany({
            where: { id: { in: recorderIds } },
            select: { id: true, name: true },
          })
        : [];
    const nameById = new Map(recorders.map((r) => [r.id, r.name]));
    return rows.map((r) => ({
      ...r,
      recordedByName: r.recordedByUserId
        ? (nameById.get(r.recordedByUserId) ?? null)
        : null,
    }));
  }

  async update(id: string, dto: UpdateAdvanceDto) {
    const advance = await this.findOutstanding(id);
    return this.tenantPrisma.client.staffAdvance.update({
      where: { id: advance.id },
      data: { amount: dto.amount, reason: dto.reason, category: dto.category },
    });
  }

  async cancel(id: string) {
    const advance = await this.findOutstanding(id);
    return this.tenantPrisma.client.staffAdvance.update({
      where: { id: advance.id },
      data: { status: StaffAdvanceStatus.cancelled },
    });
  }

  /** Real manual settlement (UPD-BE-STAFF-05) — the owner/manager records that this advance was
   * paid back outside the formal payroll flow, so it's never netted again at export time. */
  async settle(id: string) {
    const advance = await this.findOutstanding(id);
    return this.tenantPrisma.client.staffAdvance.update({
      where: { id: advance.id },
      data: {
        status: StaffAdvanceStatus.deducted,
        deductedInMonth: currentMonth(),
      },
    });
  }

  private async findOutstanding(id: string) {
    const advance = await this.tenantPrisma.client.staffAdvance.findUnique({
      where: { id },
    });
    if (!advance) {
      throw new NotFoundException('Advance not found');
    }
    if (advance.status !== StaffAdvanceStatus.outstanding) {
      throw new AppException(
        ADVANCE_ERROR_CODES.NOT_OUTSTANDING,
        `Advance is already "${advance.status}"`,
        HttpStatus.CONFLICT,
      );
    }
    return advance;
  }
}
