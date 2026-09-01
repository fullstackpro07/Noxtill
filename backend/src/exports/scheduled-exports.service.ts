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
import { ReportsService } from '../reports/reports.service';
import { SendGateService } from '../messaging/send-gate.service';
import {
  CreateScheduledExportDto,
  ScheduleRecipientDto,
} from './dto/create-scheduled-export.dto';
import { UpdateScheduledExportDto } from './dto/update-scheduled-export.dto';
import { isExportFormat, isExportKind } from './exports.constants';
import { isReportKind, REPORT_LABELS } from '../reports/reports.types';
import {
  Prisma,
  Role,
  ScheduledExport,
  ScheduledExportFrequency,
} from '@prisma/client';

const FREQUENCY_DAYS: Record<ScheduledExportFrequency, number> = {
  weekly: 7,
  monthly: 28,
};

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
    private readonly reportsService: ReportsService,
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
        createdByUserId: userId,
        recipients: (dto.recipients ?? []) as unknown as Prisma.InputJsonValue,
      },
    });
  }

  list() {
    return this.tenantPrisma.client.scheduledExport.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(id: string, dto: UpdateScheduledExportDto) {
    await this.findOwned(id);
    return this.tenantPrisma.client.scheduledExport.update({
      where: { id },
      data: {
        active: dto.active,
        frequency: dto.frequency,
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

  /** The daily job's real work: find every active schedule due for its frequency, generate the
   * real underlying artifact (data export or report, whichever this schedule is for), and deliver
   * it — to explicit recipients over WhatsApp/email if any are set, else the original in-app
   * notify-the-creator behavior. Returns how many actually ran, for the job log. */
  async runDueSchedules(referenceDate: Date = new Date()): Promise<number> {
    const schedules = await this.prisma.scheduledExport.findMany({
      where: { active: true },
    });

    let ran = 0;
    for (const schedule of schedules) {
      const dueDays = FREQUENCY_DAYS[schedule.frequency];
      const daysSinceLastRun = schedule.lastRunAt
        ? (referenceDate.getTime() - schedule.lastRunAt.getTime()) /
          (24 * 60 * 60 * 1000)
        : Infinity;
      if (daysSinceLastRun < dueDays) continue;

      try {
        const { url, label } = await this.generateArtifact(schedule);

        await this.prisma.scheduledExport.update({
          where: { id: schedule.id },
          data: { lastRunAt: referenceDate },
        });

        await this.deliver(schedule, url, label);
        ran += 1;
      } catch (error) {
        if (error instanceof SkipSchedule) {
          this.logger.warn(
            `Skipping scheduled export ${schedule.id}: ${error.message}`,
          );
          continue;
        }
        this.logger.error(
          `Scheduled export ${schedule.id} failed: ${(error as Error).message}`,
        );
      }
    }
    return ran;
  }

  private async generateArtifact(
    schedule: ScheduledExport,
  ): Promise<{ url: string; label: string }> {
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
      // Reconstructs the minimal `AuthenticatedUser` shape `ReportsService.generate()` actually
      // reads (businessId/role/sub) from real DB state — there's no live HTTP request to take one
      // from in a background job. Falls back to `owner` when the creator's own membership can't
      // be found (e.g. since removed), matching this job's existing "best-effort, log and skip on
      // real failure" convention rather than silently under-scoping the report.
      const { url } = await this.reportsService.generate(
        schedule.reportKind,
        undefined,
        {
          sub: schedule.createdByUserId ?? '',
          businessId: schedule.businessId,
          role: businessUser?.role ?? Role.owner,
          capabilities: [],
        },
      );
      return { url, label: REPORT_LABELS[schedule.reportKind] };
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
        await this.sendGate.send({
          businessId: schedule.businessId,
          templateKey: 'report_ready',
          to: { phone: recipient.phone, email: recipient.email },
          variables: { reportLabel: label, url },
        });
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
