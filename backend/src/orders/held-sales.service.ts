import { Injectable, NotFoundException } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CLS_KEY_USER_ID } from '../common/tenancy/tenant.constants';
import { OrdersService } from './orders.service';
import { HoldSaleDto } from './dto/hold-sale.dto';
import { ResumeHeldSaleDto } from './dto/resume-held-sale.dto';
import { CreateSaleDto } from './dto/create-sale.dto';
import { Prisma } from '../../generated/prisma';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Held Sales (UPD-BE-005). A hold is just a cart snapshot — no stock is reserved, no row exists
 * anywhere else. Resuming feeds the exact same cart straight into `OrdersService.createSale()`
 * unchanged, so it goes through the identical atomic validation (stock, pricing, credit-requires-
 * customer) as any other sale; the held row is only deleted AFTER that succeeds, so a failed
 * resume (e.g. stock sold out while held) leaves the hold intact rather than losing it.
 */
@Injectable()
export class HeldSalesService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly cls: ClsService,
    private readonly ordersService: OrdersService,
  ) {}

  async hold(businessId: string, dto: HoldSaleDto) {
    const heldByUserId = this.cls.get<string>(CLS_KEY_USER_ID);
    const { note, ...cart } = dto;
    return this.tenantPrisma.client.heldSale.create({
      data: {
        businessId,
        cart: cart as unknown as Prisma.InputJsonValue,
        heldByUserId,
        note,
      },
    });
  }

  async list(businessId: string) {
    const rows = await this.tenantPrisma.client.heldSale.findMany({
      where: { businessId },
      orderBy: { createdAt: 'asc' },
    });

    const productIds = new Set<string>();
    for (const row of rows) {
      const cart = row.cart as unknown as HoldSaleDto;
      for (const item of cart.items) productIds.add(item.productId);
    }
    const products = await this.tenantPrisma.client.product.findMany({
      where: { id: { in: Array.from(productIds) } },
      select: { id: true, sellingPrice: true },
    });
    const priceById = new Map(
      products.map((p) => [p.id, Number(p.sellingPrice)]),
    );

    return rows.map((row) => {
      const cart = row.cart as unknown as HoldSaleDto;
      const estimatedTotal = round2(
        cart.items.reduce((sum, item) => {
          const price =
            item.priceOverride ?? priceById.get(item.productId) ?? 0;
          return sum + price * item.qty;
        }, 0) - (cart.discount ?? 0),
      );
      return { ...row, cart, estimatedTotal };
    });
  }

  async discard(businessId: string, id: string) {
    const held = await this.tenantPrisma.client.heldSale.findUnique({
      where: { id },
    });
    if (!held || held.businessId !== businessId) {
      throw new NotFoundException('Held sale not found');
    }
    await this.tenantPrisma.client.heldSale.delete({ where: { id } });
  }

  async resume(businessId: string, id: string, dto: ResumeHeldSaleDto) {
    const held = await this.tenantPrisma.client.heldSale.findUnique({
      where: { id },
    });
    if (!held || held.businessId !== businessId) {
      throw new NotFoundException('Held sale not found');
    }

    const cart = held.cart as unknown as Omit<CreateSaleDto, 'payment'>;
    const saleDto: CreateSaleDto = { ...cart, payment: dto.payment };

    const order = await this.ordersService.createSale(businessId, saleDto);
    // Only removed after the real sale genuinely succeeds — see class doc comment.
    await this.tenantPrisma.client.heldSale.delete({ where: { id } });
    return order;
  }
}
