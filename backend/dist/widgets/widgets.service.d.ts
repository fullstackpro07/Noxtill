import { ClsService } from 'nestjs-cls';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
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
    getWidgetData(key: string): Promise<unknown>;
}
