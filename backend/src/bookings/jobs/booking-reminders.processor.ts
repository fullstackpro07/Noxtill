import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SendGateService } from '../../messaging/send-gate.service';
import {
  BOOKING_REMINDERS_QUEUE,
  BOOKING_REMINDER_HOUR_OFFSETS,
  BOOKING_REMINDER_WINDOW_MIN,
} from './booking-reminders.constants';
import { AppointmentStatus } from '../../../generated/prisma';

interface BookingRemindersJobData {
  /** ISO timestamp override, used only by tests to make "now" deterministic. */
  now?: string;
}

/**
 * `booking_reminders` (BE-055): fires at T-24h and T-2h before each booked
 * appointment. Runs every 15 min (BOOKING_REMINDER_WINDOW_MIN) and treats an
 * offset as "due" once the appointment's start time falls inside the current
 * window — so a delayed tick still catches it, but a cancelled appointment
 * is filtered out at the query itself and never reminded.
 */
@Processor(BOOKING_REMINDERS_QUEUE)
export class BookingRemindersProcessor extends WorkerHost {
  private readonly logger = new Logger(BookingRemindersProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sendGate: SendGateService,
  ) {
    super();
  }

  async process(job: Job<BookingRemindersJobData>): Promise<void> {
    if (job.name !== 'tick') return;
    const now = job.data?.now ? new Date(job.data.now) : new Date();
    return this.runReminders(now);
  }

  async runReminders(now: Date = new Date()): Promise<void> {
    const windowMs = BOOKING_REMINDER_WINDOW_MIN * 60 * 1000;
    let sent = 0;

    for (const hours of BOOKING_REMINDER_HOUR_OFFSETS) {
      const dueAt = new Date(now.getTime() + hours * 60 * 60 * 1000);
      const appointments = await this.prisma.appointment.findMany({
        where: {
          status: {
            in: [AppointmentStatus.booked, AppointmentStatus.confirmed],
          },
          startsAt: { gte: dueAt, lt: new Date(dueAt.getTime() + windowMs) },
        },
        include: { service: true },
      });

      for (const appointment of appointments) {
        await this.sendGate
          .send({
            businessId: appointment.businessId,
            customerId: appointment.customerId,
            templateKey: 'booking_reminder',
            variables: {
              serviceName: appointment.service.name,
              dateTime: appointment.startsAt.toISOString(),
            },
          })
          .catch(() => undefined);
        sent += 1;
      }
    }

    this.logger.debug(`Booking reminders sent for ${sent} appointment(s)`);
  }
}
