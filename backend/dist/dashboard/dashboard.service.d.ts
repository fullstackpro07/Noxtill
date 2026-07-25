import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { WidgetsService } from '../widgets/widgets.service';
import { UpdateDashboardConfigDto } from './dto/update-dashboard-config.dto';
import { Prisma } from '../../generated/prisma';
export declare class DashboardService {
    private readonly tenantPrisma;
    private readonly widgetsService;
    constructor(tenantPrisma: TenantPrismaService, widgetsService: WidgetsService);
    getConfig(businessId: string): Promise<Prisma.JsonValue>;
    updateConfig(businessId: string, dto: UpdateDashboardConfigDto): Promise<Record<string, unknown>>;
    today(): Promise<{
        [k: string]: unknown;
    }>;
}
