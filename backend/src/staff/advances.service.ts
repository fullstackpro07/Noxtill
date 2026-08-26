import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { CreateAdvanceDto, UpdateAdvanceDto } from './dto/create-advance.dto';
import { ADVANCE_ERROR_CODES } from './advances.constants';
import { StaffAdvanceStatus } from '@prisma/client';

/**
 * Advances (UPD-BE-033). "Auto-deducted from the next commission payout" is real, but happens at
 * `PayrollService.export()` time (UPD-BE-034) — the only place a payout is actually materialized
 * in this codebase — not here; this service only manages the outstanding/cancelled lifecycle.
 */
@Injectable()
export class AdvancesService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  create(businessId: string, staffUserId: string, dto: CreateAdvanceDto) {
    return this.tenantPrisma.client.staffAdvance.create({
      data: {
        businessId,
        staffUserId,
        amount: dto.amount,
        reason: dto.reason,
      },
    });
  }

  list(staffUserId: string) {
    return this.tenantPrisma.client.staffAdvance.findMany({
      where: { staffUserId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** UPD-BE-113: business-wide view for the Advances screen — the per-staff `list()` above stays as-is for its own route. */
  listAll() {
    return this.tenantPrisma.client.staffAdvance.findMany({
      orderBy: { createdAt: 'desc' },
      include: { staffUser: { include: { user: true } } },
    });
  }

  async update(id: string, dto: UpdateAdvanceDto) {
    const advance = await this.findOutstanding(id);
    return this.tenantPrisma.client.staffAdvance.update({
      where: { id: advance.id },
      data: { amount: dto.amount, reason: dto.reason },
    });
  }

  async cancel(id: string) {
    const advance = await this.findOutstanding(id);
    return this.tenantPrisma.client.staffAdvance.update({
      where: { id: advance.id },
      data: { status: StaffAdvanceStatus.cancelled },
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
