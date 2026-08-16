import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { CreateDepositDto } from './dto/create-deposit.dto';
import { DEPOSIT_ERROR_CODES } from './bookings.constants';
import { DepositStatus, Prisma } from '../../generated/prisma';

/**
 * Deposits (UPD-BE-019). Cash deposits are captured/refunded for real, immediately, with
 * `Appointment.depositPaid` kept in sync. Card/online capture is a disclosed, honest gap: the
 * only charge primitive `PaymentGatewayAdapter` exposes is `createCheckoutSession`, hardcoded to
 * Stripe *subscription*-mode checkout for billing plans — there's no one-off-charge capability to
 * reuse, so capturing a card/online deposit fails cleanly rather than faking success.
 */
@Injectable()
export class DepositsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async create(businessId: string, dto: CreateDepositDto) {
    const appointment = await this.tenantPrisma.client.appointment.findUnique({
      where: { id: dto.appointmentId },
    });
    if (!appointment || appointment.businessId !== businessId) {
      throw new NotFoundException('Appointment not found');
    }

    return this.tenantPrisma.client.deposit.create({
      data: {
        appointmentId: dto.appointmentId,
        amount: dto.amount,
        method: dto.method,
      } as Prisma.DepositUncheckedCreateInput,
    });
  }

  list(appointmentId?: string) {
    return this.tenantPrisma.client.deposit.findMany({
      where: { appointmentId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async capture(businessId: string, id: string) {
    const deposit = await this.findWithStatus(
      businessId,
      id,
      DepositStatus.pending,
    );

    if (deposit.method !== 'cash') {
      throw new AppException(
        DEPOSIT_ERROR_CODES.ONLINE_CAPTURE_NOT_SUPPORTED,
        `Capturing a "${deposit.method}" deposit isn't supported yet — there's no one-off-charge gateway primitive to reuse. Use "cash" for now.`,
        HttpStatus.NOT_IMPLEMENTED,
      );
    }

    const [updated] = await this.tenantPrisma.client.$transaction([
      this.tenantPrisma.client.deposit.update({
        where: { id },
        data: { status: DepositStatus.captured },
      }),
      this.tenantPrisma.client.appointment.update({
        where: { id: deposit.appointmentId },
        data: { depositPaid: { increment: deposit.amount } },
      }),
    ]);
    return updated;
  }

  async refund(businessId: string, id: string) {
    const deposit = await this.findWithStatus(
      businessId,
      id,
      DepositStatus.captured,
    );

    const [updated] = await this.tenantPrisma.client.$transaction([
      this.tenantPrisma.client.deposit.update({
        where: { id },
        data: { status: DepositStatus.refunded },
      }),
      this.tenantPrisma.client.appointment.update({
        where: { id: deposit.appointmentId },
        data: { depositPaid: { decrement: deposit.amount } },
      }),
    ]);
    return updated;
  }

  /** Called from AppointmentsService.updateStatus's no_show branch — best-effort, never throws. */
  async forfeitForAppointment(appointmentId: string): Promise<void> {
    await this.tenantPrisma.client.deposit.updateMany({
      where: { appointmentId, status: DepositStatus.captured },
      data: { status: DepositStatus.forfeited },
    });
  }

  private async findWithStatus(
    businessId: string,
    id: string,
    status: DepositStatus,
  ) {
    const deposit = await this.tenantPrisma.client.deposit.findUnique({
      where: { id },
    });
    if (!deposit || deposit.businessId !== businessId) {
      throw new NotFoundException('Deposit not found');
    }
    if (deposit.status !== status) {
      throw new AppException(
        status === DepositStatus.pending
          ? DEPOSIT_ERROR_CODES.NOT_PENDING
          : DEPOSIT_ERROR_CODES.NOT_CAPTURED,
        `Deposit is "${deposit.status}", expected "${status}"`,
        HttpStatus.CONFLICT,
      );
    }
    return deposit;
  }
}
