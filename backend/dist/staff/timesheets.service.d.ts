import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
export declare class TimesheetsService {
    private readonly tenantPrisma;
    constructor(tenantPrisma: TenantPrismaService);
    report(businessId: string, month: string): Promise<{
        businessUserId: string;
        name: string;
        role: import("../../generated/prisma").$Enums.Role;
        hoursWorked: number;
        overtimeHours: number;
        scheduledShiftCount: number;
        approved: boolean;
        approvedByUserId: string | null;
        approvedAt: Date | null;
    }[]>;
    approve(businessId: string, staffUserId: string, month: string, approvedByUserId: string): import("generated/prisma/runtime/library").DynamicModelExtensionFluentApi<import("../../generated/prisma").Prisma.TypeMap<import("generated/prisma/runtime/library").InternalArgs & {
        result: {};
        model: {};
        query: {};
        client: {};
    }, {}>, "TimesheetApproval", "upsert", never> & import("generated/prisma/runtime/library").PrismaPromise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        staffUserId: string;
        approvedByUserId: string | null;
        month: string;
        approvedAt: Date | null;
    }>;
}
