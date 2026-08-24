import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { LocaleService } from '../../common/localization/locale.service';
import { SendGateService } from '../../messaging/send-gate.service';
import {
  REVIEW_REMINDERS_LOCAL_HOUR,
  REVIEW_REMINDERS_QUEUE,
  REVIEW_REMINDER_DAY_OFFSETS,
} from './review-reminders.constants';

interface ReviewRemindersJobData {
  /** ISO timestamp override, used only by tests to make "current local hour" / age math deterministic. */
  now?: string;
}

/**
 * Daily per-business tick (BE-045): a ReviewRequest that hasn't been
 * responded to gets a reminder at day 3 (reminderCount 0→1) and day 7
 * (reminderCount 1→2); never a 3rd. `reminderCount` doubles as the index
 * into REVIEW_REMINDER_DAY_OFFSETS, so each request advances at most one
 * step per tick even if the tick is delayed.
 */
@Processor(REVIEW_REMINDERS_QUEUE)
export class ReviewRemindersProcessor extends WorkerHost {
  private readonly logger = new Logger(ReviewRemindersProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly locale: LocaleService,
    private readonly sendGate: SendGateService,
  ) {
    super();
  }

  async process(job: Job<ReviewRemindersJobData>): Promise<void> {
    if (job.name !== 'tick') return;
    const now = job.data?.now ? new Date(job.data.now) : new Date();
    return this.runReminders(now);
  }

  async runReminders(now: Date = new Date()): Promise<void> {
    const businesses = await this.prisma.business.findMany({
      select: { id: true, timezone: true, reviewSettings: true },
    });

    for (const business of businesses) {
      if (
        this.locale.currentLocalTime(business.timezone, now).slice(0, 2) !==
        REVIEW_REMINDERS_LOCAL_HOUR
      )
        continue;

      // UPD-BE-104: a business can override the day-3/day-7 default via Review Settings.
      const settings = business.reviewSettings as {
        reminderDayOffsets?: number[];
      } | null;
      const dayOffsets =
        settings?.reminderDayOffsets && settings.reminderDayOffsets.length > 0
          ? settings.reminderDayOffsets
          : REVIEW_REMINDER_DAY_OFFSETS;
      const maxCount = dayOffsets.length;

      const pending = await this.prisma.reviewRequest.findMany({
        where: {
          businessId: business.id,
          respondedAt: null,
          reminderCount: { lt: maxCount },
        },
      });

      for (const request of pending) {
        const ageDays =
          (now.getTime() - request.createdAt.getTime()) / (1000 * 60 * 60 * 24);
        const dueOffset = dayOffsets[request.reminderCount];
        if (ageDays < dueOffset) continue;

        await this.sendGate
          .send({
            businessId: business.id,
            customerId: request.customerId ?? undefined,
            templateKey: 'review_request',
            variables: { reviewUrl: `/r/${request.token}` },
          })
          .catch(() => undefined);

        await this.prisma.reviewRequest.update({
          where: { id: request.id },
          data: { reminderCount: { increment: 1 } },
        });
      }
    }

    this.logger.debug(
      `Review reminders evaluated for ${businesses.length} business(es)`,
    );
  }
}
