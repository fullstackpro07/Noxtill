import { ClsService } from 'nestjs-cls';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { type WidgetRangeDays } from './widgets.constants';
export declare class WidgetsService {
    private readonly tenantPrisma;
    private readonly cls;
    private readonly cache;
    constructor(tenantPrisma: TenantPrismaService, cls: ClsService);
    listRegistry(): {
        key: string;
        title: string;
        category: import("./widgets.constants").WidgetCategory;
    }[];
    getWidgetData(key: string, days?: WidgetRangeDays): Promise<unknown>;
}
