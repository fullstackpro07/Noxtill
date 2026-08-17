import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { ReviewRequestsService } from '../reviews/review-requests.service';
import { ActivityService } from '../activity/activity.service';
import { SendGateService } from '../messaging/send-gate.service';
import { WaitlistService } from './waitlist.service';
import { DepositsService } from './deposits.service';
import { generateReviewToken } from '../reviews/review-token.util';
import { QueryAppointmentsDto } from './dto/query-appointments.dto';
import { RescheduleInternalAppointmentDto } from './dto/reschedule-internal-appointment.dto';
import { CreateWalkInAppointmentDto } from './dto/create-walk-in-appointment.dto';
import { CreateAppointmentRequestDto } from './dto/create-appointment-request.dto';
import { DeclineAppointmentRequestDto } from './dto/decline-appointment-request.dto';
import { SuggestAlternativeDto } from './dto/suggest-alternative.dto';
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

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

@Injectable()
export class AppointmentsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly reviewRequests: ReviewRequestsService,
    private readonly activity: ActivityService,
    private readonly sendGate: SendGateService,
    private readonly waitlist: WaitlistService,
    private readonly deposits: DepositsService,
  ) {}

  findAll(query: QueryAppointmentsDto) {
    return this.tenantPrisma.client.appointment.findMany({
      where: {
        ...(query.staff ? { staffUserId: query.staff } : {}),
        ...(query.status ? { status: query.status } : {}),
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
      // Deposits (UPD-BE-019): forfeits any captured deposit tied to this appointment.
      await this.deposits.forfeitForAppointment(updated.id);
    }

    if (nextStatus === AppointmentStatus.cancelled) {
      // Waiting List (UPD-BE-017): best-effort, never throws — see WaitlistService.tryAutoOffer.
      await this.waitlist.tryAutoOffer(businessId, {
        serviceId: updated.serviceId,
        staffUserId: updated.staffUserId,
        startsAt: updated.startsAt,
        endsAt: updated.endsAt,
      });
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

  /** Booking Requests (UPD-BE-016) — creates an appointment awaiting staff approve/decline, rather
   * than going straight to `booked`/`confirmed` like the public and walk-in flows. */
  async createRequest(businessId: string, dto: CreateAppointmentRequestDto) {
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
          status: AppointmentStatus.requested,
        },
        include: {
          service: true,
          customer: true,
          staffUser: { include: { user: true } },
        },
      });
    });
  }

  private async requireRequested(id: string) {
    const appointment = await this.tenantPrisma.client.appointment.findUnique({
      where: { id },
      include: { service: true },
    });
    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }
    if (appointment.status !== AppointmentStatus.requested) {
      throw new AppException(
        BOOKING_ERROR_CODES.NOT_REQUESTED,
        `Appointment is "${appointment.status}", expected "requested"`,
        HttpStatus.CONFLICT,
      );
    }
    return appointment;
  }

  async approve(businessId: string, id: string) {
    const requested = await this.requireRequested(id);
    const updated = await this.updateStatus(
      businessId,
      id,
      AppointmentStatus.confirmed,
    );
    await this.sendGate
      .send({
        businessId,
        customerId: updated.customerId,
        templateKey: 'booking_confirm',
        variables: {
          serviceName: requested.service.name,
          dateTime: updated.startsAt.toISOString(),
        },
      })
      .catch(() => undefined);
    return updated;
  }

  async decline(
    businessId: string,
    id: string,
    dto: DeclineAppointmentRequestDto,
  ) {
    const requested = await this.requireRequested(id);
    const updated = await this.updateStatus(
      businessId,
      id,
      AppointmentStatus.cancelled,
    );
    await this.sendGate
      .send({
        businessId,
        customerId: updated.customerId,
        templateKey: 'booking_declined',
        variables: {
          serviceName: requested.service.name,
          reason: dto.reason ?? 'Please contact us to rebook.',
        },
      })
      .catch(() => undefined);
    return updated;
  }

  /** Proposes a different time without changing the appointment's own state — the customer still
   * needs to accept (by rebooking) or staff still needs to approve once a time is agreed. */
  async suggestAlternative(
    businessId: string,
    id: string,
    dto: SuggestAlternativeDto,
  ) {
    const requested = await this.requireRequested(id);
    await this.sendGate
      .send({
        businessId,
        customerId: requested.customerId,
        templateKey: 'booking_suggest_alternative',
        variables: {
          serviceName: requested.service.name,
          dateTime: new Date(dto.startsAt).toISOString(),
        },
      })
      .catch(() => undefined);
    return requested;
  }

  /** No-Shows reporting (UPD-BE-020) — monthly rate/trend + repeat offenders over the trailing `months`. */
  async noShowReport(businessId: string, months = 6) {
    const since = new Date();
    since.setUTCMonth(since.getUTCMonth() - months);
    since.setUTCDate(1);
    since.setUTCHours(0, 0, 0, 0);

    const rows = await this.tenantPrisma.client.$queryRaw<
      { month: string; total: bigint; no_shows: bigint }[]
    >`
      SELECT to_char(date_trunc('month', starts_at), 'YYYY-MM') AS month,
             COUNT(*) AS total,
             COUNT(*) FILTER (WHERE status = 'no_show') AS no_shows
      FROM appointments
      WHERE business_id = ${businessId} AND starts_at >= ${since}
        AND status IN ('completed', 'no_show')
      GROUP BY month
      ORDER BY month
    `;

    const trend = rows.map((row) => {
      const total = Number(row.total);
      const noShows = Number(row.no_shows);
      return {
        month: row.month,
        total,
        noShows,
        rate: total > 0 ? round2((noShows / total) * 100) : 0,
      };
    });

    const totalAppointments = trend.reduce((sum, r) => sum + r.total, 0);
    const totalNoShows = trend.reduce((sum, r) => sum + r.noShows, 0);

    const repeatOffenderRows = await this.tenantPrisma.client.$queryRaw<
      { customer_id: string; name: string; no_show_count: bigint }[]
    >`
      SELECT a.customer_id, c.name, COUNT(*) AS no_show_count
      FROM appointments a
      JOIN customers c ON c.id = a.customer_id
      WHERE a.business_id = ${businessId} AND a.status = 'no_show' AND a.starts_at >= ${since}
      GROUP BY a.customer_id, c.name
      HAVING COUNT(*) >= 2
      ORDER BY no_show_count DESC
    `;

    return {
      months,
      overallRate:
        totalAppointments > 0
          ? round2((totalNoShows / totalAppointments) * 100)
          : 0,
      trend,
      repeatOffenders: repeatOffenderRows.map((row) => ({
        customerId: row.customer_id,
        name: row.name,
        noShowCount: Number(row.no_show_count),
      })),
    };
  }
}
