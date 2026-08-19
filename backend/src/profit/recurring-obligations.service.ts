import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CreateRecurringObligationDto } from './dto/create-recurring-obligation.dto';
import { UpdateRecurringObligationDto } from './dto/update-recurring-obligation.dto';

/** Cash Flow forecasting's real, schedulable obligations (UPD-BE-078) — plain CRUD; `CashForecastService` is the consumer. */
@Injectable()
export class RecurringObligationsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  list() {
    return this.tenantPrisma.client.recurringObligation.findMany({
      orderBy: { nextDueDate: 'asc' },
    });
  }

  create(businessId: string, dto: CreateRecurringObligationDto) {
    return this.tenantPrisma.client.recurringObligation.create({
      data: {
        businessId,
        name: dto.name,
        amount: dto.amount,
        frequency: dto.frequency,
        // A bare "YYYY-MM-DD" string fails Prisma's `@db.Date` validation ("expected ISO-8601
        // DateTime") — a real `Date` object is required even for a date-only column.
        nextDueDate: new Date(dto.nextDueDate),
        category: dto.category,
      },
    });
  }

  async update(id: string, dto: UpdateRecurringObligationDto) {
    await this.findOneOrThrow(id);
    return this.tenantPrisma.client.recurringObligation.update({
      where: { id },
      data: {
        ...dto,
        ...(dto.nextDueDate ? { nextDueDate: new Date(dto.nextDueDate) } : {}),
      },
    });
  }

  async remove(id: string) {
    await this.findOneOrThrow(id);
    await this.tenantPrisma.client.recurringObligation.delete({
      where: { id },
    });
    return { success: true };
  }

  private async findOneOrThrow(id: string) {
    const existing =
      await this.tenantPrisma.client.recurringObligation.findUnique({
        where: { id },
      });
    if (!existing)
      throw new NotFoundException('Recurring obligation not found');
    return existing;
  }
}
