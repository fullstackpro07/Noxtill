import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CreateAdvanceDto, UpdateAdvanceDto } from './dto/create-advance.dto';
export declare class AdvancesService {
    private readonly tenantPrisma;
    constructor(tenantPrisma: TenantPrismaService);
    create(businessId: string, staffUserId: string, dto: CreateAdvanceDto): import("generated/prisma/runtime/library").DynamicModelExtensionFluentApi<import("../../generated/prisma").Prisma.TypeMap<import("generated/prisma/runtime/library").InternalArgs & {
        result: {};
        model: {};
        query: {};
        client: {};
    }, {}>, "StaffAdvance", "create", never> & import("generated/prisma/runtime/library").PrismaPromise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        status: import("../../generated/prisma").$Enums.StaffAdvanceStatus;
        staffUserId: string;
        amount: import("generated/prisma/runtime/library").Decimal;
        reason: string | null;
        deductedInMonth: string | null;
    }>;
    list(staffUserId: string): import("generated/prisma/runtime/library").PrismaPromise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        status: import("../../generated/prisma").$Enums.StaffAdvanceStatus;
        staffUserId: string;
        amount: import("generated/prisma/runtime/library").Decimal;
        reason: string | null;
        deductedInMonth: string | null;
    }[]>;
    update(id: string, dto: UpdateAdvanceDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        status: import("../../generated/prisma").$Enums.StaffAdvanceStatus;
        staffUserId: string;
        amount: import("generated/prisma/runtime/library").Decimal;
        reason: string | null;
        deductedInMonth: string | null;
    }>;
    cancel(id: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        status: import("../../generated/prisma").$Enums.StaffAdvanceStatus;
        staffUserId: string;
        amount: import("generated/prisma/runtime/library").Decimal;
        reason: string | null;
        deductedInMonth: string | null;
    }>;
    private findOutstanding;
}
