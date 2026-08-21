import { Controller, Get, Body, Put, Query } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { TodayBusinessService } from './today-business.service';
import { UpdateDashboardConfigDto } from './dto/update-dashboard-config.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { OrderType, PaymentMethod, Role } from '@prisma/client';

@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly todayBusinessService: TodayBusinessService,
    private readonly tenantPrisma: TenantPrismaService,
  ) {}

  @Get('config')
  getConfig(@CurrentUser() user: AuthenticatedUser) {
    return this.dashboardService.getConfig(user.businessId);
  }

  @Put('config')
  updateConfig(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateDashboardConfigDto,
  ) {
    return this.dashboardService.updateConfig(user.businessId, dto);
  }

  @Get('today')
  today() {
    return this.dashboardService.today();
  }

  /** UPD-BE-082: staff see only their own transactions. */
  @Get('today/detail')
  async todayDetail(
    @CurrentUser() user: AuthenticatedUser,
    @Query('staffUserId') staffUserId?: string,
    @Query('paymentMethod') paymentMethod?: PaymentMethod,
    @Query('orderType') orderType?: OrderType,
  ) {
    const callerBusinessUserId = await this.resolveBusinessUserId(user);
    return this.todayBusinessService.getDetail(
      user.businessId,
      user.role,
      callerBusinessUserId,
      { staffUserId, paymentMethod, orderType },
    );
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
