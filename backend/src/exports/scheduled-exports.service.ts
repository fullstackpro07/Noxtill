import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ExportsService } from './exports.service';
import { ReportRunsService } from '../reports/report-runs.service';
import { SendGateService } from '../messaging/send-gate.service';
import {
  CreateScheduledExportDto,
  ScheduleRecipientDto,
} from './dto/create-scheduled-export.dto';
import { UpdateScheduledExportDto } from './dto/update-scheduled-export.dto';
import { isExportFormat, isExportKind } from './exports.constants';
import {
  currentMonth,
  isReportKind,
  monthLabel,
  previousMonth,
  REPORT_LABELS,
} from '../reports/reports.types';
import {
  computeNextRun,
  isScheduleDue,
  SCHEDULE_RUN_HOUR,
} from './schedule-timing';
import {
  Prisma,
  Role,
  ScheduledExport,
} from '@prisma/client';

/** Schedule recurring export (UPD-FE-071), generalized (UPD-BE-116) to also schedule real
 * reports via the same infrastructure — one CRUD, one daily cron, one delivery path — rather
 * than building a parallel `CRUD /reports/schedules` that would duplicate this. CRUD is
 * tenant-scoped like every other feature; `runDueSchedules()` runs from a background job with no
 * request/tenant context, so it queries across every business at once via the raw
 * `PrismaService`, matching `ExpensesService`'s `cloneRecurringExpenses()` — the only other
 * genuinely cross-tenant scheduled job in this app. */
@Injectable()
export class ScheduledExportsService {
  private readonly logger = new Logger(ScheduledExportsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly exportsService: ExportsService,
    private readonly reportRuns: ReportRunsService,
    private readonly sendGate: SendGateService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(
    businessId: string,
    userId: string,
    dto: CreateScheduledExportDto,
  ) {
    if (!dto.kind === !dto.reportKind) {
      throw new BadRequestException(
        'Provide exactly one of `kind` (a data export) or `reportKind` (a report) — not both, not neither.',
      );
    }
    // Reports are always generated as PDF (ReportsService.generate never produces anything else) —
    // a client-supplied format for a report schedule is ignored in favor of the real output shape.
    const format = dto.reportKind ? 'pdf' : dto.format;
    if (!format) {
      throw new BadRequestException(
        '`format` is required for a data-export schedule.',
      );
    }

    return this.tenantPrisma.client.scheduledExport.create({
      data: {
        businessId,
        kind: dto.kind,
        reportKind: dto.reportKind,
        format,
        frequency: dto.frequency,
        dayOfWeek: dto.frequency === 'weekly' ? (dto.dayOfWeek ?? 1) : null,
        dayOfMonth: dto.frequency === 'monthly' ? (dto.dayOfMonth ?? 1) : null,
        createdByUserId: userId,
        recipients: (dto.recipients ?? []) as unknown as Prisma.InputJsonValue,
      },
    });
  }

  async list() {
    const rows = await this.tenantPrisma.client.scheduledExport.findMany({
      orderBy: { createdAt: 'desc' },
    });
    const now = new Date();
    return rows.map((row) => {
      const next = computeNextRun(row, now);
      const period = row.reportKind ? this.periodFor(row.frequency) : null;
      return {
        ...row,
        runHour: SCHEDULE_RUN_HOUR,
        nextRunAt: next ? next.toISOString() : null,
        period,
        periodLabel: period ? monthLabel(period) : null,
      };
    });
  }

  /** Weekly reports cover the month so far; monthly ones the last full month. */
  private periodFor(frequency: 'weekly' | 'monthly'): string {
    const now = currentMonth();
    return frequency === 'weekly' ? now : previousMonth(now);
  }

  async update(id: string, dto: UpdateScheduledExportDto) {
    await this.findOwned(id);
    return this.tenantPrisma.client.scheduledExport.update({
      where: { id },
      data: {
        active: dto.active,
        frequency: dto.frequency,
        dayOfWeek: dto.dayOfWeek,
        dayOfMonth: dto.dayOfMonth,
        format: dto.format,
        recipients: dto.recipients as unknown as
          Prisma.InputJsonValue | undefined,
      },
    });
  }

  async remove(id: string) {
    await this.findOwned(id);
    await this.tenantPrisma.client.scheduledExport.delete({ where: { id } });
  }

  private async findOwned(id: string) {
    const schedule = await this.tenantPrisma.client.scheduledExport.findUnique({
      where: { id },
    });
    if (!schedule) {
      throw new NotFoundException('Scheduled export not found');
    }
    return schedule;
  }

  /** The daily job's real work: find every active schedule that is due (its weekday / day of the
   * month, with catch-up for a missed day), generate the real artifact and deliver it. Every
   * outcome, sent or failed and why, is recorded on the schedule. Returns how many ran. */
  async runDueSchedules(referenceDate: Date = new Date()): Promise<number> {
    const schedules = await this.prisma.scheduledExport.findMany({
      where: { active: true },
    });

    let ran = 0;
    for (const schedule of schedules) {
      if (!isScheduleDue(schedule, referenceDate)) continue;
      if (await this.execute(schedule, referenceDate, 'schedule')) ran += 1;
    }
    return ran;
  }

  /** "Run now": runs one schedule immediately, regardless of when it is next due. */
  async runNow(id: string) {
    const schedule = await this.findOwned(id);
    const ok = await this.execute(schedule, new Date(), 'manual');
    const after = await this.prisma.scheduledExport.findUniqueOrThrow({
      where: { id },
    });
    return {
      ok,
      lastResult: after.lastResult,
      lastError: after.lastError,
      lastReportRunId: after.lastReportRunId,
    };
  }

  /** `lastRunAt` is stamped only on success, so a failure is retried by the next daily check
   * rather than silently skipping a whole period. */
  private async execute(
    schedule: ScheduledExport,
    at: Date,
    trigger: 'schedule' | 'manual',
  ): Promise<boolean> {
    try {
      const { url, label, reportRunId } = await this.generateArtifact(
        schedule,
        trigger,
      );
      await this.deliver(schedule, url, label, reportRunId);
      await this.prisma.scheduledExport.update({
        where: { id: schedule.id },
        data: {
          lastRunAt: at,
          lastResult: 'sent',
          lastError: null,
          lastReportRunId: reportRunId ?? null,
        },
      });
      return true;
    } catch (error) {
      const message = (error as Error).message;
      if (error instanceof SkipSchedule) {
        this.logger.warn(`Skipping scheduled export ${schedule.id}: ${message}`);
      } else {
        this.logger.error(`Scheduled export ${schedule.id} failed: ${message}`);
      }
      await this.prisma.scheduledExport.update({
        where: { id: schedule.id },
        data: { lastResult: 'failed', lastError: message.slice(0, 1000) },
      });
      return false;
    }
  }

  private async generateArtifact(
    schedule: ScheduledExport,
    trigger: 'schedule' | 'manual',
  ): Promise<{ url: string; label: string; reportRunId?: string }> {
    if (schedule.reportKind) {
      if (!isReportKind(schedule.reportKind)) {
        throw new SkipSchedule(`unknown report kind "${schedule.reportKind}"`);
      }
      const businessUser = schedule.createdByUserId
        ? await this.prisma.businessUser.findUnique({
            where: {
              businessId_userId: {
                businessId: schedule.businessId,
                userId: schedule.createdByUserId,
              },
            },
          })
        : null;
      // No request is bound in a background job, so the business is passed explicitly and the run
      // service scopes every query to it. Falls back to owner when the creator's membership is gone.
      const { url, run } = await this.reportRuns.generate({
        businessId: schedule.businessId,
        kind: schedule.reportKind,
        month: this.periodFor(schedule.frequency),
        actor: {
          userId: schedule.createdByUserId ?? undefined,
          role: businessUser?.role ?? Role.owner,
        },
        trigger,
        scheduleId: schedule.id,
      });
      return {
        url,
        label: REPORT_LABELS[schedule.reportKind],
        reportRunId: run.id,
      };
    }

    if (
      !schedule.kind ||
      !isExportKind(schedule.kind) ||
      !isExportFormat(schedule.format)
    ) {
      throw new SkipSchedule(
        `unknown kind/format "${schedule.kind}"/"${schedule.format}"`,
      );
    }
    const { url } = await this.exportsService.generate(
      schedule.businessId,
      schedule.kind,
      schedule.format,
    );
    return { url, label: `${schedule.kind} export` };
  }

  private async deliver(
    schedule: ScheduledExport,
    url: string,
    label: string,
    reportRunId?: string,
  ): Promise<void> {
    const recipients =
      (schedule.recipients as unknown as ScheduleRecipientDto[]) ?? [];

    if (recipients.length === 0) {
      if (schedule.createdByUserId) {
        await this.notifications.create(
          schedule.businessId,
          schedule.createdByUserId,
          {
            title: `Your ${schedule.frequency} ${label} is ready`,
            body: `A fresh ${schedule.format.toUpperCase()} was generated on schedule.`,
            link: url,
          },
          'scheduled_delivery_ready',
        );
      }
      return;
    }

    for (const recipient of recipients) {
      if (!recipient.phone && !recipient.email) continue;
      try {
        if (reportRunId && schedule.createdByUserId) {
          // Through the run's own send, so the message id is stored on the run and its delivery
          // state is later read from the real message. Scheduling is owner-only.
          await this.reportRuns.send(
            schedule.businessId,
            { userId: schedule.createdByUserId, role: Role.owner },
            reportRunId,
            { phone: recipient.phone, email: recipient.email },
          );
        } else {
          await this.sendGate.send({
            businessId: schedule.businessId,
            templateKey: 'report_ready',
            to: { phone: recipient.phone, email: recipient.email },
            variables: { reportLabel: label, url },
          });
        }
      } catch (error) {
        this.logger.warn(
          `Scheduled export ${schedule.id}: delivery to ${recipient.phone ?? recipient.email} failed: ${(error as Error).message}`,
        );
      }
    }
  }
}

/** Internal control-flow signal for `generateArtifact()` — a malformed/unknown schedule should be
 * logged and skipped, not treated as a real generation failure. */
class SkipSchedule extends Error {}
