import { Controller, Get, Param, Query } from '@nestjs/common';
import { SalesHistoryService } from './sales-history.service';
import { PrismaService } from '../prisma/prisma.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { OrderType, PaymentMethod, Role } from '@prisma/client';

/** UPD-BE-084: Sales History — real completed/cancelled sales, staff-scoped like Today's Business. */
@Controller('sales/history')
export class SalesHistoryController {
  constructor(
    private readonly salesHistory: SalesHistoryService,
    private readonly tenantPrisma: TenantPrismaService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('staffUserId') staffUserId?: string,
    @Query('paymentMethod') paymentMethod?: PaymentMethod,
    @Query('orderType') orderType?: OrderType,
    @Query('minAmount') minAmount?: string,
    @Query('maxAmount') maxAmount?: string,
  ) {
    const callerBusinessUserId = await this.resolveBusinessUserId(user);
    return this.salesHistory.list(
      user.businessId,
      user.role,
      callerBusinessUserId,
      {
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
        staffUserId,
        paymentMethod,
        orderType,
        minAmount: minAmount ? Number(minAmount) : undefined,
        maxAmount: maxAmount ? Number(maxAmount) : undefined,
      },
    );
  }

  @Get('summary')
  async summary(
    @CurrentUser() user: AuthenticatedUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const callerBusinessUserId = await this.resolveBusinessUserId(user);
    return this.salesHistory.dailyRevenue(
      user.businessId,
      user.role,
      callerBusinessUserId,
      {
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
      },
    );
  }

  @Get(':id')
  async findOne(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ) {
    const order = await this.salesHistory.findOne(user.businessId, id);
    const auditTrail = await this.prisma.auditLog.findMany({
      where: { businessId: user.businessId, entity: 'Order', entityId: id },
      orderBy: { createdAt: 'asc' },
    });
    return { order, auditTrail };
  }

  private async resolveBusinessUserId(
    user: AuthenticatedUser,
  ): Promise<string | null> {
    if (user.role !== Role.staff) return null;
    const businessUser = await this.tenantPrisma.client.businessUser.findUnique(
      {
        where: {
          businessId_userId: { businessId: user.businessId, userId: user.sub },
        },
        select: { id: true },
      },
    );
    return businessUser?.id ?? null;
  }
}
