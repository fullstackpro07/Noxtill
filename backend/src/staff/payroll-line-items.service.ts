import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PayrollLineItemType } from '@prisma/client';

/**
 * Real one-off manual payroll adjustments (UPD-BE-STAFF-06) — a bonus, reimbursement or ad-hoc
 * deduction for one staff member in one month, folded into `PayrollService`'s computation. Never
 * touches `StaffAdvance`/`CommissionPayment`, which have their own real lifecycles.
 */
@Injectable()
export class PayrollLineItemsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  create(
    businessId: string,
    staffUserId: string,
    month: string,
    label: string,
    amount: number,
    type: PayrollLineItemType,
    createdByUserId?: string,
  ) {
    return this.tenantPrisma.client.payrollLineItem.create({
      data: {
        businessId,
        staffUserId,
        month,
        label,
        amount,
        type,
        createdByUserId,
      },
    });
  }

  listForMonth(month: string) {
    return this.tenantPrisma.client.payrollLineItem.findMany({
      where: { month },
      include: { staffUser: { include: { user: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  delete(id: string) {
    return this.tenantPrisma.client.payrollLineItem.delete({ where: { id } });
  }
}
