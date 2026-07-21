import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { ReviewRequestsService } from '../reviews/review-requests.service';
import { generateReviewToken } from '../reviews/review-token.util';
import { QueryAppointmentsDto } from './dto/query-appointments.dto';
import {
  APPOINTMENT_STATUS_TRANSITIONS,
  BOOKING_ERROR_CODES,
} from './bookings.constants';
import { AppointmentStatus } from '../../generated/prisma';

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly reviewRequests: ReviewRequestsService,
  ) {}

  findAll(query: QueryAppointmentsDto) {
    return this.tenantPrisma.client.appointment.findMany({
      where: {
        ...(query.staff ? { staffUserId: query.staff } : {}),
        ...(query.from || query.to
          ? {
              startsAt: {
                ...(query.from ? { gte: new Date(query.from) } : {}),
                ...(query.to ? { lte: new Date(query.to) } : {}),
              },
            }
          : {}),
      },
      orderBy: { startsAt: 'asc' },
      include: { service: true, customer: true },
    });
  }

  async updateStatus(
    businessId: string,
    id: string,
    nextStatus: AppointmentStatus,
  ) {
    const appointment = await this.tenantPrisma.client.appointment.findUnique({
      where: { id },
    });
    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    const allowed = APPOINTMENT_STATUS_TRANSITIONS[appointment.status];
    if (!allowed.includes(nextStatus)) {
      throw new AppException(
        BOOKING_ERROR_CODES.INVALID_STATUS_TRANSITION,
        `Cannot move an appointment from "${appointment.status}" to "${nextStatus}"`,
        HttpStatus.BAD_REQUEST,
      );
    }

    const updated = await this.tenantPrisma.client.appointment.update({
      where: { id },
      data: { status: nextStatus },
    });

    if (nextStatus === AppointmentStatus.completed) {
      const token = generateReviewToken();
      await this.tenantPrisma.client.reviewRequest.create({
        data: {
          businessId,
          customerId: updated.customerId,
          token,
          source: 'appointment',
          sourceId: updated.id,
        },
      });
      await this.reviewRequests.scheduleSend(
        businessId,
        updated.customerId,
        token,
      );
    }

    if (nextStatus === AppointmentStatus.no_show) {
      const customer = await this.tenantPrisma.client.customer.findUnique({
        where: { id: updated.customerId },
      });
      if (customer && !customer.tags.includes('No-show')) {
        await this.tenantPrisma.client.customer.update({
          where: { id: updated.customerId },
          data: { tags: [...customer.tags, 'No-show'] },
        });
      }
    }

    return updated;
  }
}
