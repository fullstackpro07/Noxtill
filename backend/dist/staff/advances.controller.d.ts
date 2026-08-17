import { AdvancesService } from './advances.service';
import { CreateAdvanceDto, UpdateAdvanceDto } from './dto/create-advance.dto';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class AdvancesController {
    private readonly advances;
    constructor(advances: AdvancesService);
    create(user: AuthenticatedUser, staffUserId: string, dto: CreateAdvanceDto): import("generated/prisma/runtime/library").DynamicModelExtensionFluentApi<import("generated/prisma").Prisma.TypeMap<import("generated/prisma/runtime/library").InternalArgs & {
        result: {};
        model: {};
        query: {};
        client: {};
    }, {}>, "StaffAdvance", "create", never> & import("generated/prisma/runtime/library").PrismaPromise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        status: import("generated/prisma").$Enums.StaffAdvanceStatus;
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
        status: import("generated/prisma").$Enums.StaffAdvanceStatus;
        staffUserId: string;
        amount: import("generated/prisma/runtime/library").Decimal;
        reason: string | null;
        deductedInMonth: string | null;
    }[]>;
    update(advanceId: string, dto: UpdateAdvanceDto): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        status: import("generated/prisma").$Enums.StaffAdvanceStatus;
        staffUserId: string;
        amount: import("generated/prisma/runtime/library").Decimal;
        reason: string | null;
        deductedInMonth: string | null;
    }>;
    cancel(advanceId: string): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        status: import("generated/prisma").$Enums.StaffAdvanceStatus;
        staffUserId: string;
        amount: import("generated/prisma/runtime/library").Decimal;
        reason: string | null;
        deductedInMonth: string | null;
    }>;
}
