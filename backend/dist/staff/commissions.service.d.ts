import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
export declare class CommissionsService {
    private readonly tenantPrisma;
    constructor(tenantPrisma: TenantPrismaService);
    report(month: string): Promise<{
        businessUserId: string;
        name: string;
        role: import("../../generated/prisma").$Enums.Role;
        totalSales: number;
        commission: number;
    }[]>;
}
