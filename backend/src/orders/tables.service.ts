import { HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { AppException } from '../common/filters/app.exception';
import { CreateTableDto } from './dto/create-table.dto';
import { UpdateTableDto } from './dto/update-table.dto';
import { MoveTableDto } from './dto/move-table.dto';
import { MergeTablesDto } from './dto/merge-tables.dto';
import { computeOrderTotals, resolveTaxRatePercent } from './order-totals.util';
import { ACTIVE_ORDER_STATUSES, TABLE_ERROR_CODES } from './tables.constants';
import { OrderStatus, TableStatus } from '@prisma/client';

/**
 * Tables / restaurant floor mode (UPD-BE-010). `Table` is deliberately not a foreign key on
 * `Order.tableNo` (see the model's doc comment in schema.prisma) — a table's live status/running
 * total are computed by joining `Order.tableNo = Table.number` at read time, the same join the
 * pre-existing frontend `tables-grid.tsx` already does client-side.
 */
@Injectable()
export class TablesService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  async list(businessId: string) {
    const [tables, activeOrders] = await Promise.all([
      this.tenantPrisma.client.table.findMany({
        where: { businessId },
        orderBy: { number: 'asc' },
      }),
      this.tenantPrisma.client.order.findMany({
        where: {
          businessId,
          status: { in: [...ACTIVE_ORDER_STATUSES] as OrderStatus[] },
          tableNo: { not: null },
        },
        select: { id: true, tableNo: true, total: true, createdAt: true },
      }),
    ]);
    const orderByTableNo = new Map(activeOrders.map((o) => [o.tableNo!, o]));

    return tables.map((table) => {
      const order = orderByTableNo.get(table.number);
      return {
        ...table,
        activeOrderId: order?.id ?? null,
        runningTotal: order ? Number(order.total) : 0,
        openedAt: order?.createdAt ?? null,
      };
    });
  }

  async create(businessId: string, dto: CreateTableDto) {
    const existing = await this.tenantPrisma.client.table.findUnique({
      where: { businessId_number: { businessId, number: dto.number } },
    });
    if (existing) {
      throw new AppException(
        TABLE_ERROR_CODES.NUMBER_TAKEN,
        `Table "${dto.number}" already exists`,
        HttpStatus.CONFLICT,
      );
    }
    return this.tenantPrisma.client.table.create({
      data: { businessId, ...dto },
    });
  }

  async update(businessId: string, id: string, dto: UpdateTableDto) {
    const table = await this.findOwned(businessId, id);
    return this.tenantPrisma.client.table.update({
      where: { id: table.id },
      data: dto,
    });
  }

  async openTable(businessId: string, id: string) {
    const table = await this.findOwned(businessId, id);
    return this.tenantPrisma.client.table.update({
      where: { id: table.id },
      data: { status: TableStatus.occupied, seatedAt: new Date() },
    });
  }

  async move(businessId: string, id: string, dto: MoveTableDto) {
    const source = await this.findOwned(businessId, id);
    const destination = await this.tenantPrisma.client.table.findUnique({
      where: { businessId_number: { businessId, number: dto.toTableNumber } },
    });
    if (!destination) {
      throw new AppException(
        TABLE_ERROR_CODES.TABLE_NOT_FOUND,
        `Table "${dto.toTableNumber}" not found`,
        HttpStatus.NOT_FOUND,
      );
    }

    const sourceOrder = await this.activeOrderAt(businessId, source.number);
    if (!sourceOrder) {
      throw new AppException(
        TABLE_ERROR_CODES.NO_ACTIVE_ORDER,
        `Table "${source.number}" has no active order to move`,
        HttpStatus.BAD_REQUEST,
      );
    }
    const destinationOrder = await this.activeOrderAt(
      businessId,
      destination.number,
    );
    if (destinationOrder) {
      throw new AppException(
        TABLE_ERROR_CODES.DESTINATION_OCCUPIED,
        `Table "${destination.number}" already has an active order`,
        HttpStatus.CONFLICT,
      );
    }

    await this.tenantPrisma.client.$transaction([
      this.tenantPrisma.client.order.update({
        where: { id: sourceOrder.id },
        data: { tableNo: destination.number },
      }),
      this.tenantPrisma.client.table.update({
        where: { id: source.id },
        data: { status: TableStatus.free, seatedAt: null },
      }),
      this.tenantPrisma.client.table.update({
        where: { id: destination.id },
        data: {
          status: TableStatus.occupied,
          seatedAt: source.seatedAt ?? new Date(),
        },
      }),
    ]);

    return this.listOne(businessId, destination.id);
  }

  /** Moves every item from `id`'s active order onto `intoTableNumber`'s active order, then frees `id`. */
  async merge(businessId: string, id: string, dto: MergeTablesDto) {
    const source = await this.findOwned(businessId, id);
    const destination = await this.tenantPrisma.client.table.findUnique({
      where: { businessId_number: { businessId, number: dto.intoTableNumber } },
    });
    if (!destination) {
      throw new AppException(
        TABLE_ERROR_CODES.TABLE_NOT_FOUND,
        `Table "${dto.intoTableNumber}" not found`,
        HttpStatus.NOT_FOUND,
      );
    }

    const sourceOrder = await this.activeOrderAt(businessId, source.number);
    const destinationOrder = await this.activeOrderAt(
      businessId,
      destination.number,
    );
    if (!sourceOrder || !destinationOrder) {
      throw new AppException(
        TABLE_ERROR_CODES.NO_ACTIVE_ORDER,
        'Both tables need an active order to merge',
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.tenantPrisma.client.$transaction(async (tx) => {
      await tx.orderItem.updateMany({
        where: { orderId: sourceOrder.id },
        data: { orderId: destinationOrder.id },
      });

      const items = await tx.orderItem.findMany({
        where: { orderId: destinationOrder.id },
      });
      const business = await tx.business.findUniqueOrThrow({
        where: { id: businessId },
      });
      const taxRules = await tx.taxRule.findMany({ where: { businessId } });
      const productIds = [
        ...new Set(
          items
            .map((i) => i.productId)
            .filter((id): id is string => id !== null),
        ),
      ];
      const products = await tx.product.findMany({
        where: { id: { in: productIds } },
      });
      const productCategoryMap = new Map(
        products.map((p) => [p.id, p.category]),
      );
      const { subtotal, tax, total, cogs } = computeOrderTotals(
        items.map((i) => ({
          price: Number(i.price),
          cost: Number(i.cost),
          qty: i.qty,
          taxRatePercent: resolveTaxRatePercent(
            taxRules.map((r) => ({ ...r, rate: Number(r.rate) })),
            i.productId ? (productCategoryMap.get(i.productId) ?? null) : null,
            Number(business.taxRate),
          ),
        })),
        Number(destinationOrder.discount),
        Number(business.taxRate),
      );

      await tx.order.update({
        where: { id: destinationOrder.id },
        data: { subtotal, tax, total, cogs },
      });
      await tx.order.update({
        where: { id: sourceOrder.id },
        data: { status: OrderStatus.cancelled, tableNo: null },
      });
      await tx.table.update({
        where: { id: source.id },
        data: { status: TableStatus.free, seatedAt: null },
      });
    });

    return this.listOne(businessId, destination.id);
  }

  private async listOne(businessId: string, id: string) {
    const rows = await this.list(businessId);
    const row = rows.find((r) => r.id === id);
    if (!row) {
      throw new NotFoundException('Table not found');
    }
    return row;
  }

  private async activeOrderAt(businessId: string, tableNo: string) {
    return this.tenantPrisma.client.order.findFirst({
      where: {
        businessId,
        tableNo,
        status: { in: [...ACTIVE_ORDER_STATUSES] as OrderStatus[] },
      },
    });
  }

  private async findOwned(businessId: string, id: string) {
    const table = await this.tenantPrisma.client.table.findUnique({
      where: { id },
    });
    if (!table || table.businessId !== businessId) {
      throw new NotFoundException('Table not found');
    }
    return table;
  }
}
