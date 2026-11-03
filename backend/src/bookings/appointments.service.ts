import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
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
import { nextBookingNo } from './booking-number.util';
import { assertBufferAvailable } from './booking-buffer.util';
import { resolvePolicies } from '../common/policies/policies.service';
import { assertBookingWindow, assertDayNotFull } from './booking-policy.util';
import { assertPhoneBookingSlot } from './phone-booking-policy.util';
import {
  APPOINTMENT_STATUS_TRANSITIONS,
  BOOKING_ERROR_CODES,
} from './bookings.constants';
import {
  AppointmentSource,
  AppointmentStatus,
  DepositStatus,
  ProductKind,
} from '@prisma/client';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Services, formal fields (UPD-BE-087) — enforced at every internal booking-creation/reschedule
 * path. An empty `eligibleStaffIds` means "any staff eligible," matching every service that
 * predates this feature, so existing bookings/tests keep working unchanged. */
function assertEligibleStaff(
  service: { eligibleStaffIds: unknown; name: string },
  staffId?: string | null,
): void {
  const eligible = (service.eligibleStaffIds as string[] | null) ?? [];
  if (eligible.length === 0 || !staffId) return;
  if (!eligible.includes(staffId)) {
    throw new AppException(
      BOOKING_ERROR_CODES.STAFF_NOT_ELIGIBLE,
      `The selected staff member isn't configured to perform "${service.name}"`,
      HttpStatus.BAD_REQUEST,
    );
  }
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
      include: {
        service: true,
        customer: true,
        staffUser: { include: { user: true } },
      },
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
      // MySQL migration: `tags` is a JSON column now (Prisma's MySQL connector has no native
      // array column type), hence the explicit `string[]` read.
      const customerTags = (customer?.tags as string[] | null) ?? [];
      if (customer && !customerTags.includes('No-show')) {
        await this.tenantPrisma.client.customer.update({
          where: { id: updated.customerId },
          data: { tags: [...customerTags, 'No-show'] },
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
    const service = await this.tenantPrisma.client.product.findUnique({
      where: { id: appointment.serviceId },
    });

    const durationMs =
      appointment.endsAt.getTime() - appointment.startsAt.getTime();
    const newStart = new Date(dto.startsAt);
    const newEnd = new Date(newStart.getTime() + durationMs);
    const staffId =
      dto.staffUserId !== undefined ? dto.staffUserId : appointment.staffUserId;
    if (service) assertEligibleStaff(service, staffId);

    return this.tenantPrisma.client.$transaction(async (tx) => {
      await assertSlotAvailable(tx, {
        businessId,
        staffId,
        serviceId: appointment.serviceId,
        startsAt: newStart,
        endsAt: newEnd,
        excludeAppointmentId: appointment.id,
      });
      await assertBufferAvailable(tx, {
        businessId,
        staffId,
        startsAt: newStart,
        endsAt: newEnd,
        bufferBeforeMin: service?.bufferBeforeMin,
        bufferAfterMin: service?.bufferAfterMin,
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
  /** Phone bookings share the canonical transaction, but never pretend the caller is physically
   * present or that a cash deposit was collected. They enforce remote booking rules and can
   * create a real requested (not confirmed) booking for staff review. */
  async createWalkIn(
    businessId: string,
    dto: CreateWalkInAppointmentDto,
    source: AppointmentSource = AppointmentSource.walk_in,
  ) {
    const isPhone = source === AppointmentSource.phone;
    const service = await this.tenantPrisma.client.product.findFirst({
      where: {
        id: dto.serviceId,
        businessId,
        kind: ProductKind.service,
        ...(isPhone ? { active: true } : {}),
      },
    });
    if (!service) {
      throw new AppException(
        BOOKING_ERROR_CODES.SERVICE_NOT_FOUND,
        'Service not found',
        HttpStatus.NOT_FOUND,
      );
    }

    assertEligibleStaff(service, dto.staffId);
    if (isPhone && (service.durationMin ?? 30) <= 0) {
      throw new AppException(
        'INVALID_SERVICE_DURATION',
        'This service has no valid booking duration. Contact staff.',
      );
    }
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(
      startsAt.getTime() + (service.durationMin ?? 30) * 60 * 1000,
    );
    if (
      isPhone &&
      (!Number.isFinite(startsAt.getTime()) || startsAt <= new Date())
    ) {
      throw new AppException(
        'INVALID_BOOKING_TIME',
        'Choose a future booking time',
      );
    }

    // Services, formal fields depth fix (UPD-INT-004) — the customer is physically present for a
    // walk-in, so a required deposit must be collected (cash) in this same request rather than
    // deferred, unlike `approve()` where it's collected ahead of the appointment existing.
    const requiredDeposit = service.depositRequired
      ? Number(service.depositAmount ?? 0)
      : 0;
    if (
      !isPhone &&
      requiredDeposit > 0 &&
      (dto.depositAmount ?? 0) < requiredDeposit
    ) {
      throw new AppException(
        BOOKING_ERROR_CODES.DEPOSIT_REQUIRED,
        `"${service.name}" requires a deposit of at least ${requiredDeposit} (cash) to book — ${dto.depositAmount ?? 0} given.`,
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.tenantPrisma.client.$transaction(async (tx) => {
      await assertSlotAvailable(tx, {
        businessId,
        staffId: dto.staffId,
        serviceId: dto.serviceId,
        startsAt,
        endsAt,
      });
      let requiresReview = false;
      if (isPhone) {
        const business = await tx.business.findFirst({
          where: { id: businessId },
        });
        if (!business) {
          throw new AppException(
            'BUSINESS_NOT_FOUND',
            'Business not found',
            HttpStatus.NOT_FOUND,
          );
        }
        const policies = resolvePolicies(business);
        assertBookingWindow(policies, startsAt, new Date());
        assertPhoneBookingSlot(business, startsAt, service.durationMin ?? 30);
        if (dto.staffId) {
          const staff = await tx.businessUser.findFirst({
            where: { id: dto.staffId, businessId, active: true },
          });
          if (!staff) {
            throw new AppException(
              BOOKING_ERROR_CODES.STAFF_NOT_ELIGIBLE,
              'The selected staff member is not active in this business',
            );
          }
        }
        await assertDayNotFull(
          tx,
          policies,
          businessId,
          startsAt,
          business.timezone,
        );
        requiresReview =
          policies.bool('voice.bookingsRequireStaffApproval') ||
          service.depositRequired ||
          (!dto.staffId &&
            Array.isArray(service.eligibleStaffIds) &&
            service.eligibleStaffIds.length > 0);
      }
      await assertBufferAvailable(tx, {
        businessId,
        staffId: dto.staffId,
        startsAt,
        endsAt,
        bufferBeforeMin: service.bufferBeforeMin,
        bufferAfterMin: service.bufferAfterMin,
        checkUnassigned: isPhone,
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

      const appointment = await tx.appointment.create({
        data: {
          businessId,
          serviceId: dto.serviceId,
          staffUserId: dto.staffId,
          customerId: customer.id,
          startsAt,
          endsAt,
          status: requiresReview
            ? AppointmentStatus.requested
            : AppointmentStatus.confirmed,
          source,
          ...(isPhone
            ? { rescheduleToken: randomBytes(16).toString('hex') }
            : {}),
          bookingNo: await nextBookingNo(tx, businessId),
        },
      });

      if (!isPhone && requiredDeposit > 0) {
        await tx.deposit.create({
          data: {
            businessId,
            appointmentId: appointment.id,
            amount: dto.depositAmount!,
            method: 'cash',
            status: DepositStatus.captured,
          },
        });
        await tx.appointment.update({
          where: { id: appointment.id },
          data: { depositPaid: { increment: dto.depositAmount! } },
        });
      }

      return tx.appointment.findUniqueOrThrow({
        where: { id: appointment.id },
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

    assertEligibleStaff(service, dto.staffId);
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
      await assertBufferAvailable(tx, {
        businessId,
        staffId: dto.staffId,
        startsAt,
        endsAt,
        bufferBeforeMin: service.bufferBeforeMin,
        bufferAfterMin: service.bufferAfterMin,
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
          bookingNo: await nextBookingNo(tx, businessId),
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

  /**
   * Services, formal fields depth fix (UPD-INT-004) — a deposit-required service can no longer be
   * confirmed with zero deposit captured. Cash-only, same honest limit as `DepositsService.capture`
   * itself (no one-off card/online charge primitive exists yet). Checks the service's own
   * `depositRequired`/`depositAmount`, not the separate, deliberately-out-of-scope-for-now
   * `DepositSettings` no-show trigger.
   */
  private async assertDepositSatisfied(
    appointmentId: string,
    service: { depositRequired: boolean; depositAmount: unknown; name: string },
  ): Promise<void> {
    if (!service.depositRequired) return;
    const required = Number(service.depositAmount ?? 0);
    if (required <= 0) return;

    const captured = await this.tenantPrisma.client.deposit.aggregate({
      where: { appointmentId, status: DepositStatus.captured },
      _sum: { amount: true },
    });
    const capturedTotal = Number(captured._sum.amount ?? 0);
    if (capturedTotal < required) {
      throw new AppException(
        BOOKING_ERROR_CODES.DEPOSIT_REQUIRED,
        `"${service.name}" requires a deposit of at least ${required} before this booking can be confirmed — only ${capturedTotal} captured so far.`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  async approve(businessId: string, id: string) {
    const requested = await this.requireRequested(id);
    await this.assertDepositSatisfied(id, requested.service);
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
      SELECT DATE_FORMAT(starts_at, '%Y-%m') AS month,
             COUNT(*) AS total,
             SUM(CASE WHEN status = 'no_show' THEN 1 ELSE 0 END) AS no_shows
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

  /** Appointments List bulk actions (UPD-FE-072) — best-effort per row, matching the
   * session-wide convention (e.g. `WaitlistService.tryAutoOffer`): one bad row never blocks the rest. */
  async bulkCancel(businessId: string, ids: string[]) {
    let cancelled = 0;
    const failed: string[] = [];
    for (const id of ids) {
      try {
        await this.updateStatus(businessId, id, AppointmentStatus.cancelled);
        cancelled += 1;
      } catch {
        failed.push(id);
      }
    }
    return { cancelled, failed };
  }

  /** Sends the real `booking_reminder` template immediately, outside the scheduled job's timing window. */
  async bulkRemind(businessId: string, ids: string[]) {
    const appointments = await this.tenantPrisma.client.appointment.findMany({
      where: { id: { in: ids }, businessId },
      include: { service: true },
    });

    let sent = 0;
    const failed: string[] = [];
    for (const appointment of appointments) {
      try {
        await this.sendGate.send({
          businessId,
          customerId: appointment.customerId,
          templateKey: 'booking_reminder',
          variables: {
            serviceName: appointment.service.name,
            dateTime: appointment.startsAt.toISOString(),
          },
        });
        sent += 1;
      } catch {
        failed.push(appointment.id);
      }
    }
    return { sent, failed };
  }
}
