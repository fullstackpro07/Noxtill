import { HttpStatus, Injectable } from '@nestjs/common';
import { BiTwinAssumptionKey, BiTwinEntityType, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AppException } from '../common/filters/app.exception';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBiTwinAssumptionDto } from './dto/create-bi-twin-assumption.dto';

const LAST_30_DAYS = 30 * 24 * 60 * 60 * 1000;
const NEXT_7_DAYS = 7 * 24 * 60 * 60 * 1000;

const ASSUMPTION_LIMITS: Record<
  BiTwinAssumptionKey,
  { min: number; max: number; integer?: boolean }
> = {
  [BiTwinAssumptionKey.staff_weekly_hours]: { min: 0, max: 168 },
  [BiTwinAssumptionKey.supplier_lead_days]: { min: 0, max: 3650 },
  [BiTwinAssumptionKey.product_reorder_buffer_units]: {
    min: 0,
    max: 1_000_000,
    integer: true,
  },
  [BiTwinAssumptionKey.branch_daily_capacity]: {
    min: 0,
    max: 1_000_000,
    integer: true,
  },
  [BiTwinAssumptionKey.expense_adjustment_percent]: { min: -100, max: 1000 },
};

const ASSUMPTION_ENTITIES: Record<BiTwinAssumptionKey, BiTwinEntityType[]> = {
  [BiTwinAssumptionKey.staff_weekly_hours]: [BiTwinEntityType.staff],
  [BiTwinAssumptionKey.supplier_lead_days]: [BiTwinEntityType.supplier],
  [BiTwinAssumptionKey.product_reorder_buffer_units]: [
    BiTwinEntityType.product,
  ],
  [BiTwinAssumptionKey.branch_daily_capacity]: [BiTwinEntityType.branch],
  [BiTwinAssumptionKey.expense_adjustment_percent]: [
    BiTwinEntityType.business,
    BiTwinEntityType.branch,
  ],
};

@Injectable()
export class DigitalTwinService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
  ) {}

  async context(businessId: string) {
    const caller = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, name: true, parentId: true },
    });
    if (!caller) {
      throw new AppException(
        'BI_TWIN_BUSINESS_NOT_FOUND',
        'Business not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    const rootId = caller.parentId ?? caller.id;
    const branches = await this.prisma.business.findMany({
      where: { OR: [{ id: rootId }, { parentId: rootId, active: true }] },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        name: true,
        parentId: true,
        currency: true,
        active: true,
      },
    });
    const ids = branches.map((branch) => branch.id);
    const since = new Date(Date.now() - LAST_30_DAYS);
    const now = new Date();
    const scheduleEnd = new Date(now.getTime() + NEXT_7_DAYS);

    const [
      staff,
      shifts,
      products,
      suppliers,
      purchaseOrders,
      expenseAggs,
      integrations,
      workflows,
      serviceProducts,
    ] = await Promise.all([
      this.prisma.businessUser.findMany({
        where: { businessId: { in: ids }, active: true },
        orderBy: [
          { businessId: 'asc' },
          { user: { name: 'asc' } },
          { id: 'asc' },
        ],
        select: {
          id: true,
          businessId: true,
          role: true,
          user: { select: { name: true } },
        },
      }),
      this.prisma.staffShift.findMany({
        where: {
          businessId: { in: ids },
          status: 'scheduled',
          startsAt: { lt: scheduleEnd },
          endsAt: { gt: now },
        },
        orderBy: [{ businessId: 'asc' }, { startsAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          businessId: true,
          staffUserId: true,
          startsAt: true,
          endsAt: true,
        },
      }),
      this.prisma.product.findMany({
        where: { businessId: { in: ids }, active: true },
        orderBy: [{ businessId: 'asc' }, { name: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          businessId: true,
          name: true,
          kind: true,
          stockQty: true,
          lowStockThreshold: true,
          costPrice: true,
          durationMin: true,
        },
      }),
      this.prisma.supplier.findMany({
        where: { businessId: { in: ids } },
        orderBy: [{ businessId: 'asc' }, { name: 'asc' }, { id: 'asc' }],
        select: { id: true, businessId: true, name: true },
      }),
      this.prisma.purchaseOrder.groupBy({
        by: ['businessId', 'status'],
        where: { businessId: { in: ids } },
        _count: { _all: true },
      }),
      this.prisma.expense.groupBy({
        by: ['businessId'],
        where: { businessId: { in: ids }, incurredOn: { gte: since } },
        _count: { _all: true },
        _sum: { amount: true },
      }),
      this.prisma.integration.findMany({
        where: { businessId: { in: ids } },
        orderBy: [{ businessId: 'asc' }, { provider: 'asc' }],
        select: {
          id: true,
          businessId: true,
          provider: true,
          status: true,
          connectedAt: true,
          lastSyncAt: true,
        },
      }),
      this.prisma.workflow.groupBy({
        by: ['businessId', 'active'],
        where: { businessId: { in: ids }, archivedAt: null },
        _count: { _all: true },
      }),
      this.prisma.product.findMany({
        where: { businessId: { in: ids }, active: true, kind: 'service' },
        orderBy: [{ businessId: 'asc' }, { name: 'asc' }, { id: 'asc' }],
        select: { id: true, businessId: true, name: true, durationMin: true },
      }),
    ]);

    const shiftHoursByBusiness = new Map<string, number>();
    const scheduledPeopleByBusiness = new Map<string, Set<string>>();
    for (const shift of shifts) {
      const clippedStart = Math.max(now.getTime(), shift.startsAt.getTime());
      const clippedEnd = Math.min(
        scheduleEnd.getTime(),
        shift.endsAt.getTime(),
      );
      const hours = Math.max(0, clippedEnd - clippedStart) / 3_600_000;
      shiftHoursByBusiness.set(
        shift.businessId,
        (shiftHoursByBusiness.get(shift.businessId) ?? 0) + hours,
      );
      const people =
        scheduledPeopleByBusiness.get(shift.businessId) ?? new Set<string>();
      people.add(shift.staffUserId);
      scheduledPeopleByBusiness.set(shift.businessId, people);
    }
    const expensesByBusiness = new Map(
      expenseAggs.map((row) => [row.businessId, row]),
    );
    const openOrderStatuses = new Set([
      'draft',
      'sent',
      'confirmed',
      'partially_received',
    ]);

    const branchRows = branches.map((branch) => {
      const branchProducts = products.filter(
        (row) => row.businessId === branch.id,
      );
      const branchServices = serviceProducts.filter(
        (row) => row.businessId === branch.id,
      );
      const expense = expensesByBusiness.get(branch.id);
      const openPurchaseOrderCount = purchaseOrders
        .filter(
          (row) =>
            row.businessId === branch.id && openOrderStatuses.has(row.status),
        )
        .reduce((sum, row) => sum + row._count._all, 0);
      const activeWorkflowCount = workflows
        .filter((row) => row.businessId === branch.id && row.active)
        .reduce((sum, row) => sum + row._count._all, 0);
      const activeBusinessUsers = staff.filter(
        (row) => row.businessId === branch.id,
      );
      const branchIntegrations = integrations.filter(
        (row) => row.businessId === branch.id,
      );
      return {
        id: branch.id,
        name: branch.name,
        parentId: branch.parentId,
        active: branch.active,
        currency: branch.currency,
        staff: {
          activeCount: activeBusinessUsers.length,
          scheduledPeopleNext7Days:
            scheduledPeopleByBusiness.get(branch.id)?.size ?? 0,
          scheduledHoursNext7Days: this.round2(
            shiftHoursByBusiness.get(branch.id) ?? 0,
          ),
          capacityStatus: shifts.some((shift) => shift.businessId === branch.id)
            ? 'Partial'
            : 'No scheduled shifts recorded',
        },
        products: {
          activeCount: branchProducts.length,
          productCount: branchProducts.filter((row) => row.kind === 'product')
            .length,
          serviceCount: branchServices.length,
          totalRecordedStockUnits: branchProducts
            .filter((row) => row.kind === 'product')
            .reduce((sum, row) => sum + row.stockQty, 0),
          nonzeroRecordedUnitCostCount: branchProducts.filter(
            (row) => Number(row.costPrice) > 0,
          ).length,
          serviceDurationsRecorded: branchServices.filter(
            (row) => row.durationMin !== null,
          ).length,
          costCoverage:
            'Partial: zero cost values cannot be distinguished from unconfigured defaults.',
        },
        suppliers: {
          count: suppliers.filter((row) => row.businessId === branch.id).length,
          openPurchaseOrders: openPurchaseOrderCount,
          leadTimes: 'Not tracked',
        },
        costs: {
          recordedExpenseCountLast30Days: expense?._count._all ?? 0,
          recordedExpenseTotalLast30Days: Number(expense?._sum.amount ?? 0),
          periodDays: 30,
          currency: branch.currency,
        },
        processes: {
          activeWorkflowCount,
          source: 'Automations workflows',
        },
        integrations: branchIntegrations.map((row) => ({
          provider: row.provider,
          status: row.status,
          connectedAt: row.connectedAt,
          lastSyncAt: row.lastSyncAt,
        })),
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      business: { id: caller.id, name: caller.name },
      branches: branchRows,
      targets: {
        business: { id: caller.id, name: caller.name },
        branches: branches.map(({ id, name }) => ({ id, name })),
        staff: staff.map((row) => ({
          id: row.id,
          businessId: row.businessId,
          name: row.user.name,
          role: row.role,
        })),
        products: products.map((row) => ({
          id: row.id,
          businessId: row.businessId,
          name: row.name,
          kind: row.kind,
        })),
        suppliers: suppliers.map(
          ({ id, businessId: targetBusinessId, name }) => ({
            id,
            businessId: targetBusinessId,
            name,
          }),
        ),
      },
      assetCoverage:
        'Not tracked: no physical asset/equipment source model is configured.',
      serviceCapacity:
        'Partial: service records and durations are read from Products; demand, staff skills and validated available capacity are not tracked here.',
      disclosures: [
        'Operational facts are read live from their owning modules; this view stores only versioned assumptions and never changes source records.',
        'Scheduled staff hours show scheduled shifts overlapping the next seven days, not total capacity or productivity.',
        'Recorded expenses are shown per branch in that branch’s own currency; cross-currency totals are intentionally not combined.',
        'Product cost completeness is partial because a zero cost may be either an actual value or an unconfigured default.',
        'Supplier lead times and physical equipment/assets are not tracked in the source schema.',
      ],
    };
  }

  async listAssumptions(businessId: string) {
    const rows =
      await this.tenantPrisma.client.biTwinAssumptionVersion.findMany({
        where: { businessId },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 200,
      });
    return rows.map((row) => ({ ...row, value: Number(row.value) }));
  }

  async createAssumption(
    businessId: string,
    actorUserId: string,
    dto: CreateBiTwinAssumptionDto,
  ) {
    const limits = ASSUMPTION_LIMITS[dto.assumptionKey];
    if (
      !limits ||
      !ASSUMPTION_ENTITIES[dto.assumptionKey]?.includes(dto.entityType) ||
      !Number.isFinite(dto.value) ||
      dto.value < limits.min ||
      dto.value > limits.max ||
      (limits.integer && !Number.isInteger(dto.value))
    ) {
      throw new AppException(
        'BI_TWIN_INVALID_ASSUMPTION',
        'The value is outside the supported range for this assumption.',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.assertEntityInGroup(businessId, dto.entityType, dto.entityId);
    const seriesId = dto.seriesId ?? randomUUID();
    try {
      return await this.tenantPrisma.client.$transaction(async (tx) => {
        const latest = dto.seriesId
          ? await tx.biTwinAssumptionVersion.findFirst({
              where: { businessId, seriesId },
              orderBy: [{ version: 'desc' }, { id: 'desc' }],
            })
          : null;
        if (dto.seriesId && !latest) {
          throw new AppException(
            'BI_TWIN_ASSUMPTION_NOT_FOUND',
            'The assumption version series was not found for this business.',
            HttpStatus.NOT_FOUND,
          );
        }
        if (
          latest &&
          (latest.entityType !== dto.entityType ||
            latest.entityId !== dto.entityId ||
            latest.assumptionKey !== dto.assumptionKey)
        ) {
          throw new AppException(
            'BI_TWIN_ASSUMPTION_SERIES_MISMATCH',
            'A new version must keep the entity and assumption from its earlier versions.',
            HttpStatus.BAD_REQUEST,
          );
        }
        const row = await tx.biTwinAssumptionVersion.create({
          data: {
            businessId,
            seriesId,
            version: (latest?.version ?? 0) + 1,
            entityType: dto.entityType,
            entityId: dto.entityId,
            assumptionKey: dto.assumptionKey,
            value: new Prisma.Decimal(dto.value),
            rationale: dto.rationale.trim(),
            createdByUserId: actorUserId,
          },
        });
        await tx.auditLog.create({
          data: {
            businessId,
            actorUserId,
            action: 'bi.digital_twin.assumption.created',
            entity: 'bi_twin_assumption_version',
            entityId: row.id,
            after: {
              seriesId,
              version: row.version,
              entityType: row.entityType,
              entityId: row.entityId,
              assumptionKey: row.assumptionKey,
              value: dto.value,
              rationale: row.rationale,
            },
          },
        });
        return { ...row, value: Number(row.value) };
      });
    } catch (error) {
      if (error instanceof AppException) throw error;
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new AppException(
          'BI_TWIN_ASSUMPTION_VERSION_CONFLICT',
          'Another version was saved at the same time. Refresh and try again.',
          HttpStatus.CONFLICT,
        );
      }
      throw error;
    }
  }

  private async assertEntityInGroup(
    businessId: string,
    entityType: BiTwinEntityType,
    entityId: string,
  ): Promise<string[]> {
    const caller = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { id: true, parentId: true },
    });
    if (!caller)
      throw new AppException(
        'BI_TWIN_BUSINESS_NOT_FOUND',
        'Business not found.',
        HttpStatus.NOT_FOUND,
      );
    const rootId = caller.parentId ?? caller.id;
    const branches = await this.prisma.business.findMany({
      where: { OR: [{ id: rootId }, { parentId: rootId, active: true }] },
      select: { id: true },
    });
    const branchIds = branches.map((row) => row.id);
    let exists = false;
    switch (entityType) {
      case BiTwinEntityType.business:
        exists = entityId === businessId;
        break;
      case BiTwinEntityType.branch:
        exists = branchIds.includes(entityId);
        break;
      case BiTwinEntityType.staff:
        exists = !!(await this.prisma.businessUser.findFirst({
          where: { id: entityId, businessId: { in: branchIds }, active: true },
          select: { id: true },
        }));
        break;
      case BiTwinEntityType.product:
        exists = !!(await this.prisma.product.findFirst({
          where: { id: entityId, businessId: { in: branchIds }, active: true },
          select: { id: true },
        }));
        break;
      case BiTwinEntityType.supplier:
        exists = !!(await this.prisma.supplier.findFirst({
          where: { id: entityId, businessId: { in: branchIds } },
          select: { id: true },
        }));
        break;
    }
    if (!exists) {
      throw new AppException(
        'BI_TWIN_ENTITY_NOT_FOUND',
        'Choose an active entity in this business group.',
        HttpStatus.NOT_FOUND,
      );
    }
    return branchIds;
  }

  private round2(value: number): number {
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }
}
