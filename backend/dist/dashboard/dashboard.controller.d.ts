import { DashboardService } from './dashboard.service';
import { UpdateDashboardConfigDto } from './dto/update-dashboard-config.dto';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class DashboardController {
    private readonly dashboardService;
    constructor(dashboardService: DashboardService);
    getConfig(user: AuthenticatedUser): Promise<import("generated/prisma/runtime/library").JsonValue>;
    updateConfig(user: AuthenticatedUser, dto: UpdateDashboardConfigDto): Promise<Record<string, unknown>>;
    today(): Promise<{
        [k: string]: unknown;
    }>;
}
