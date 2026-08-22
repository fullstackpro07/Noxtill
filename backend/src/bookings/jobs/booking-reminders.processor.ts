import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SendGateService } from '../../messaging/send-gate.service';
import {
  BOOKING_REMINDERS_QUEUE,
  BOOKING_REMINDER_WINDOW_MIN,
} from './booking-reminders.constants';
import { DEFAULT_REMINDER_RULES } from '../bookings.constants';
import { AppointmentStatus } from '@prisma/client';

interface BookingRemindersJobData {
  /** ISO timestamp override, used only by tests to make "now" deterministic. */
  now?: string;
}

interface EffectiveRule {
  offsetHours: number;
  templateKey: string;
  channel?: 'whatsapp' | 'sms' | 'email';
  customMessage?: string;
}

/**
 * `booking_reminders` (BE-055, made configurable by UPD-BE-092): fires reminders per business
 * according to its own `ReminderRule` rows. Runs every 15 min (BOOKING_REMINDER_WINDOW_MIN) and
 * treats an offset as "due" once the appointment's start time falls inside the current window —
 * so a delayed tick still catches it, but a cancelled appointment is filtered out at the query
 * itself and never reminded. A business with zero rules gets `DEFAULT_REMINDER_RULES` — the exact
 * pre-UPD-BE-092 behaviour — so nothing regresses for businesses that haven't configured any.
 * Cross-tenant by design (a background job, no CLS context) — same reasoning as
 * `ExpensesService.cloneRecurringExpenses`.
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

    const businessIds = await this.prisma.business.findMany({
      select: { id: true },
    });
    const activeRules = await this.prisma.reminderRule.findMany({
      where: { active: true },
    });
    const rulesByBusiness = new Map<string, EffectiveRule[]>();
    for (const rule of activeRules) {
      const list = rulesByBusiness.get(rule.businessId) ?? [];
      list.push({
        offsetHours: rule.offsetHours,
        templateKey: rule.templateKey,
        channel: rule.channel ?? undefined,
        customMessage: rule.customMessage ?? undefined,
      });
      rulesByBusiness.set(rule.businessId, list);
    }

    for (const { id: businessId } of businessIds) {
      const rules: EffectiveRule[] =
        rulesByBusiness.get(businessId) ?? DEFAULT_REMINDER_RULES;

      for (const rule of rules) {
        const dueAt = new Date(
          now.getTime() + rule.offsetHours * 60 * 60 * 1000,
        );
        const appointments = await this.prisma.appointment.findMany({
          where: {
            businessId,
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
              templateKey: rule.templateKey,
              channel: rule.channel,
              customBody: rule.customMessage,
              variables: {
                serviceName: appointment.service.name,
                dateTime: appointment.startsAt.toISOString(),
              },
            })
            .catch(() => undefined);
          sent += 1;
        }
      }
    }

    this.logger.debug(`Booking reminders sent for ${sent} appointment(s)`);
  }
}
