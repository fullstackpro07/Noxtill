import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../common/filters/app.exception';
import { SendGateService } from '../messaging/send-gate.service';
import { CreatePublicBookingDto } from './dto/create-public-booking.dto';
import { QuerySlotsDto } from './dto/query-slots.dto';
import { computeAvailableSlots, WorkingHours } from './working-hours.util';
import { BOOKING_ERROR_CODES } from './bookings.constants';
import { AppointmentStatus, ProductKind } from '../../generated/prisma';

const RESCHEDULE_TOKEN_BYTES = 16;

/**
 * Public booking flow (BE-051/052/053/055) — no auth, resolved by business
 * slug. Concurrent bookings for the same slot are serialized with a
 * Postgres advisory transaction lock keyed on (staff-or-service, startsAt):
 * whichever request grabs the lock first re-checks for a conflicting
 * appointment inside the transaction and wins; the loser sees a real
 * conflict on its own re-check and gets a 409, never a duplicate booking.
 */
@Injectable()
export class PublicBookingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sendGate: SendGateService,
  ) {}

  private async resolveBusiness(slug: string) {
    const business = await this.prisma.business.findUnique({ where: { slug } });
    if (!business) {
      throw new NotFoundException('Business not found');
    }
    return business;
  }

  async listServices(slug: string) {
    const business = await this.resolveBusiness(slug);
    return this.prisma.product.findMany({
      where: {
        businessId: business.id,
        kind: ProductKind.service,
        active: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async getSlots(slug: string, query: QuerySlotsDto) {
    const business = await this.resolveBusiness(slug);
    const service = await this.prisma.product.findFirst({
      where: {
        id: query.service,
        businessId: business.id,
        kind: ProductKind.service,
      },
    });
    if (!service) {
      throw new AppException(
        BOOKING_ERROR_CODES.SERVICE_NOT_FOUND,
        'Service not found',
        HttpStatus.NOT_FOUND,
      );
    }

    const dayStart = new Date(`${query.date}T00:00:00.000Z`);
    const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
    const existing = await this.prisma.appointment.findMany({
      where: {
        businessId: business.id,
        ...(query.staff ? { staffUserId: query.staff } : {}),
        status: { notIn: [AppointmentStatus.cancelled] },
        startsAt: { gte: dayStart, lt: dayEnd },
      },
      select: { startsAt: true, endsAt: true },
    });

    const slots = computeAvailableSlots({
      workingHours: business.workingHours as WorkingHours,
      timezone: business.timezone,
      date: query.date,
      durationMin: service.durationMin ?? 30,
      busyIntervals: existing.map((a) => ({
        start: a.startsAt,
        end: a.endsAt,
      })),
    });

    return { slots: slots.map((s) => s.toISOString()) };
  }

  async createBooking(slug: string, dto: CreatePublicBookingDto) {
    const business = await this.resolveBusiness(slug);
    const startsAt = new Date(dto.startsAt);

    const service = await this.prisma.product.findFirst({
      where: {
        id: dto.serviceId,
        businessId: business.id,
        kind: ProductKind.service,
      },
    });
    if (!service) {
      throw new AppException(
        BOOKING_ERROR_CODES.SERVICE_NOT_FOUND,
        'Service not found',
        HttpStatus.NOT_FOUND,
      );
    }
    const endsAt = new Date(
      startsAt.getTime() + (service.durationMin ?? 30) * 60 * 1000,
    );

    const appointment = await this.prisma.$transaction(async (tx) => {
      const lockKey = `${business.id}:${dto.staffId ?? dto.serviceId}:${startsAt.toISOString()}`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

      const conflict = await tx.appointment.findFirst({
        where: {
          businessId: business.id,
          ...(dto.staffId ? { staffUserId: dto.staffId } : {}),
          status: { notIn: [AppointmentStatus.cancelled] },
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
        },
      });
      if (conflict) {
        throw new AppException(
          BOOKING_ERROR_CODES.SLOT_UNAVAILABLE,
          'That slot was just taken',
          HttpStatus.CONFLICT,
        );
      }

      const customer = await tx.customer.upsert({
        where: {
          businessId_phone: {
            businessId: business.id,
            phone: dto.customerPhone,
          },
        },
        create: {
          businessId: business.id,
          phone: dto.customerPhone,
          name: dto.customerName,
        },
        update: {},
      });

      return tx.appointment.create({
        data: {
          businessId: business.id,
          serviceId: dto.serviceId,
          staffUserId: dto.staffId,
          customerId: customer.id,
          startsAt,
          endsAt,
          source: 'link',
          rescheduleToken: randomBytes(RESCHEDULE_TOKEN_BYTES).toString('hex'),
        },
      });
    });

    await this.sendGate
      .send({
        businessId: business.id,
        customerId: appointment.customerId,
        templateKey: 'booking_confirm',
        variables: {
          serviceName: service.name,
          dateTime: appointment.startsAt.toISOString(),
        },
      })
      .catch(() => undefined);

    return appointment;
  }

  async reschedule(token: string, startsAt: string) {
    const appointment = await this.loadByToken(token);
    const durationMs =
      appointment.endsAt.getTime() - appointment.startsAt.getTime();
    const newStart = new Date(startsAt);
    const newEnd = new Date(newStart.getTime() + durationMs);

    return this.prisma.$transaction(async (tx) => {
      const conflict = await tx.appointment.findFirst({
        where: {
          id: { not: appointment.id },
          businessId: appointment.businessId,
          ...(appointment.staffUserId
            ? { staffUserId: appointment.staffUserId }
            : {}),
          status: { notIn: [AppointmentStatus.cancelled] },
          startsAt: { lt: newEnd },
          endsAt: { gt: newStart },
        },
      });
      if (conflict) {
        throw new AppException(
          BOOKING_ERROR_CODES.SLOT_UNAVAILABLE,
          'That slot was just taken',
          HttpStatus.CONFLICT,
        );
      }

      return tx.appointment.update({
        where: { id: appointment.id },
        data: { startsAt: newStart, endsAt: newEnd },
      });
    });
  }

  async cancel(token: string) {
    const appointment = await this.loadByToken(token);
    return this.prisma.appointment.update({
      where: { id: appointment.id },
      data: { status: AppointmentStatus.cancelled },
    });
  }

  private async loadByToken(token: string) {
    const appointment = await this.prisma.appointment.findUnique({
      where: { rescheduleToken: token },
    });
    if (!appointment) {
      throw new NotFoundException('Appointment not found');
    }
    return appointment;
  }
}
