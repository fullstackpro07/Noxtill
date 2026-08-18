import { Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { WidgetsService } from '../widgets/widgets.service';
import { UpdateDashboardConfigDto } from './dto/update-dashboard-config.dto';
import { DASHBOARD_TODAY_WIDGET_KEYS } from './dashboard.constants';
import { Prisma } from '@prisma/client';

/** Dashboard layout + first-paint aggregate (BE-068). */
@Injectable()
export class DashboardService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly widgetsService: WidgetsService,
  ) {}

  async getConfig(businessId: string) {
    const business = await this.tenantPrisma.client.business.findUniqueOrThrow({
      where: { id: businessId },
    });
    return business.dashboardConfig;
  }

  async updateConfig(businessId: string, dto: UpdateDashboardConfigDto) {
    await this.tenantPrisma.client.business.update({
      where: { id: businessId },
      data: { dashboardConfig: dto.config as Prisma.InputJsonValue },
    });
    return dto.config;
  }

  async today() {
    const entries = await Promise.all(
      DASHBOARD_TODAY_WIDGET_KEYS.map(
        async (key) =>
          [key, await this.widgetsService.getWidgetData(key)] as const,
      ),
    );
    return Object.fromEntries(entries);
  }
}
