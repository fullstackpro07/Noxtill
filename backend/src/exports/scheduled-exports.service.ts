import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ExportsService } from './exports.service';
import { CreateScheduledExportDto } from './dto/create-scheduled-export.dto';
import { UpdateScheduledExportDto } from './dto/update-scheduled-export.dto';
import { isExportFormat, isExportKind } from './exports.constants';
import { ScheduledExportFrequency } from '@prisma/client';

const FREQUENCY_DAYS: Record<ScheduledExportFrequency, number> = {
  weekly: 7,
  monthly: 28,
};

/** Schedule recurring export (UPD-FE-071). CRUD is tenant-scoped like every other feature;
 * `runDueSchedules()` runs from a background job with no request/tenant context, so it queries
 * across every business at once via the raw `PrismaService`, matching `ExpensesService`'s
 * `cloneRecurringExpenses()` — the only other genuinely cross-tenant scheduled job in this app. */
@Injectable()
export class ScheduledExportsService {
  private readonly logger = new Logger(ScheduledExportsService.name);

  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
    private readonly exportsService: ExportsService,
    private readonly notifications: NotificationsService,
  ) {}

  create(businessId: string, userId: string, dto: CreateScheduledExportDto) {
    return this.tenantPrisma.client.scheduledExport.create({
      data: {
        businessId,
        kind: dto.kind,
        format: dto.format,
        frequency: dto.frequency,
        createdByUserId: userId,
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
      data: dto,
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

  /** The daily job's real work: find every active schedule due for its frequency, generate a
   * real export for it, and notify whoever created it — same "your export is ready" pattern as
   * the account-zip processor. Returns how many actually ran, for the job log. */
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
      if (!isExportKind(schedule.kind) || !isExportFormat(schedule.format)) {
        this.logger.warn(
          `Skipping scheduled export ${schedule.id}: unknown kind/format "${schedule.kind}"/"${schedule.format}"`,
        );
        continue;
      }

      try {
        const { url } = await this.exportsService.generate(
          schedule.businessId,
          schedule.kind,
          schedule.format,
        );
        await this.prisma.scheduledExport.update({
          where: { id: schedule.id },
          data: { lastRunAt: referenceDate },
        });
        if (schedule.createdByUserId) {
          await this.notifications.create(
            schedule.businessId,
            schedule.createdByUserId,
            {
              title: `Your ${schedule.frequency} ${schedule.kind} export is ready`,
              body: `A fresh ${schedule.format.toUpperCase()} export was generated on schedule.`,
              link: url,
            },
          );
        }
        ran += 1;
      } catch (error) {
        this.logger.error(
          `Scheduled export ${schedule.id} failed: ${(error as Error).message}`,
        );
      }
    }
    return ran;
  }
}
