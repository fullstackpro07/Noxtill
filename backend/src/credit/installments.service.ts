import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { ActivityService } from '../activity/activity.service';
import { AppException } from '../common/filters/app.exception';
import { CREDIT_ERROR_CODES } from './credit.constants';
import { InstallmentPlanStatus, InstallmentStatus } from '@prisma/client';

function todayEnd(): Date {
  const d = new Date();
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

/**
 * Instalments (UPD-BE-021) — the top-level `/installments` list (across every plan/customer) and
 * the actual pay action, which is the one thing that turns a scheduled line into a real
 * `CreditEntry`. Kept as its own service/controller (rather than folded into `CreditService`)
 * since these routes address installments directly, not nested under a customer.
 */
@Injectable()
export class InstallmentsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly auditService: AuditService,
    private readonly activity: ActivityService,
  ) {}

  /** `due=today` -> due today or earlier and still pending (i.e. "due or overdue"); omitted -> every pending installment. */
  list(due?: 'today') {
    return this.tenantPrisma.client.installment.findMany({
      where: {
        status: InstallmentStatus.pending,
        ...(due === 'today' ? { dueDate: { lte: todayEnd() } } : {}),
      },
      orderBy: { dueDate: 'asc' },
      include: {
        plan: { include: { customer: true } },
      },
    });
  }

  async pay(businessId: string, id: string) {
    const installment = await this.tenantPrisma.client.installment.findUnique({
      where: { id },
      include: { plan: { include: { customer: true } } },
    });
    if (!installment || installment.businessId !== businessId) {
      throw new NotFoundException('Installment not found');
    }
    if (installment.status !== InstallmentStatus.pending) {
      throw new AppException(
        CREDIT_ERROR_CODES.INSTALLMENT_NOT_PENDING,
        `Instalment is "${installment.status}", expected "pending"`,
        HttpStatus.CONFLICT,
      );
    }

    const { customer, id: planId } = installment.plan;

    const [entry, updatedInstallment] =
      await this.tenantPrisma.client.$transaction([
        this.tenantPrisma.client.creditEntry.create({
          data: {
            businessId,
            customerId: customer.id,
            kind: 'payment',
            amount: installment.amount,
            note: `Instalment ${installment.seq} of plan ${planId}`,
          },
        }),
        this.tenantPrisma.client.installment.update({
          where: { id },
          data: { status: InstallmentStatus.paid, paidAt: new Date() },
        }),
      ]);

    await this.tenantPrisma.client.installment.update({
      where: { id },
      data: { creditEntryId: entry.id },
    });

    const remaining = await this.tenantPrisma.client.installment.count({
      where: { planId, status: InstallmentStatus.pending },
    });
    if (remaining === 0) {
      await this.tenantPrisma.client.installmentPlan.update({
        where: { id: planId },
        data: { status: InstallmentPlanStatus.completed },
      });
    }

    await this.auditService.log({
      entity: 'Installment',
      entityId: id,
      action: 'credit.installment_paid',
      after: { entry, installment: updatedInstallment },
    });

    await this.activity.record(businessId, {
      type: 'payment',
      description: `Instalment ${installment.seq} paid by ${customer.name} — ${Number(installment.amount)}`,
      amount: Number(installment.amount),
      entityType: 'CreditEntry',
      entityId: entry.id,
    });

    return {
      entry,
      installment: { ...updatedInstallment, creditEntryId: entry.id },
    };
  }
}
