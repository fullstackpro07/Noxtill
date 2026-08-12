import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { ReviewRequestsService } from '../reviews/review-requests.service';
import { ActivityService } from '../activity/activity.service';
import { generateReviewToken } from '../reviews/review-token.util';
import { QueryAppointmentsDto } from './dto/query-appointments.dto';
import { RescheduleInternalAppointmentDto } from './dto/reschedule-internal-appointment.dto';
import { CreateWalkInAppointmentDto } from './dto/create-walk-in-appointment.dto';
import { assertSlotAvailable } from './booking-lock.util';
import {
  APPOINTMENT_STATUS_TRANSITIONS,
  BOOKING_ERROR_CODES,
} from './bookings.constants';
import {
  AppointmentSource,
  AppointmentStatus,
  ProductKind,
} from '../../generated/prisma';

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly reviewRequests: ReviewRequestsService,
    private readonly activity: ActivityService,
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
      include: {
        service: true,
        customer: true,
        staffUser: { include: { user: true } },
      },
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
      // Recorded before scheduleSend(): activity recording is fast and fail-fast by design and
      // must not be gated behind the queue-scheduling call below, which retries indefinitely by
      // BullMQ's own design and can block this request far longer (see orders.service.ts).
      await this.activity.record(businessId, {
        type: 'booking',
        description: 'Appointment completed',
        entityType: 'Appointment',
        entityId: updated.id,
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

  /** Internal, staff-initiated reschedule (e.g. drag-and-drop on the calendar) — distinct from the
   * public, token-based customer self-service reschedule, which only ever moves time, not staff. */
  async reschedule(
    businessId: string,
    id: string,
    dto: RescheduleInternalAppointmentDto,
  ) {
    const appointment = await this.tenantPrisma.client.appointment.findUnique({
      where: { id },
    });
    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }

    const durationMs =
      appointment.endsAt.getTime() - appointment.startsAt.getTime();
    const newStart = new Date(dto.startsAt);
    const newEnd = new Date(newStart.getTime() + durationMs);
    const staffId =
      dto.staffUserId !== undefined ? dto.staffUserId : appointment.staffUserId;

    return this.tenantPrisma.client.$transaction(async (tx) => {
      await assertSlotAvailable(tx, {
        businessId,
        staffId,
        serviceId: appointment.serviceId,
        startsAt: newStart,
        endsAt: newEnd,
        excludeAppointmentId: appointment.id,
      });

      return tx.appointment.update({
        where: { id: appointment.id },
        data: { startsAt: newStart, endsAt: newEnd, staffUserId: staffId },
        include: {
          service: true,
          customer: true,
          staffUser: { include: { user: true } },
        },
      });
    });
  }

  /** Walk-in booking (internal only — no public counterpart) — customer is already present, so it
   * skips straight to "confirmed" and doesn't send a booking_confirm message. */
  async createWalkIn(businessId: string, dto: CreateWalkInAppointmentDto) {
    const service = await this.tenantPrisma.client.product.findFirst({
      where: { id: dto.serviceId, kind: ProductKind.service },
    });
    if (!service) {
      throw new AppException(
        BOOKING_ERROR_CODES.SERVICE_NOT_FOUND,
        'Service not found',
        HttpStatus.NOT_FOUND,
      );
    }

    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(
      startsAt.getTime() + (service.durationMin ?? 30) * 60 * 1000,
    );

    return this.tenantPrisma.client.$transaction(async (tx) => {
      await assertSlotAvailable(tx, {
        businessId,
        staffId: dto.staffId,
        serviceId: dto.serviceId,
        startsAt,
        endsAt,
      });

      const customer = await tx.customer.upsert({
        where: {
          businessId_phone: { businessId, phone: dto.customerPhone },
        },
        create: {
          businessId,
          phone: dto.customerPhone,
          name: dto.customerName,
        },
        update: {},
      });

      return tx.appointment.create({
        data: {
          businessId,
          serviceId: dto.serviceId,
          staffUserId: dto.staffId,
          customerId: customer.id,
          startsAt,
          endsAt,
          status: AppointmentStatus.confirmed,
          source: AppointmentSource.walk_in,
        },
        include: {
          service: true,
          customer: true,
          staffUser: { include: { user: true } },
        },
      });
    });
  }
}
