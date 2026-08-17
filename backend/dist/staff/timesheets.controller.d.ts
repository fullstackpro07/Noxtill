import { TimesheetsService } from './timesheets.service';
import { QueryTimesheetsDto } from './dto/query-timesheets.dto';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class TimesheetsController {
    private readonly timesheets;
    constructor(timesheets: TimesheetsService);
    report(user: AuthenticatedUser, query: QueryTimesheetsDto): Promise<{
        businessUserId: string;
        name: string;
        role: import("generated/prisma").$Enums.Role;
        hoursWorked: number;
        overtimeHours: number;
        scheduledShiftCount: number;
        approved: boolean;
        approvedByUserId: string | null;
        approvedAt: Date | null;
    }[]>;
    approve(user: AuthenticatedUser, staffUserId: string, query: QueryTimesheetsDto): import("generated/prisma/runtime/library").DynamicModelExtensionFluentApi<import("generated/prisma").Prisma.TypeMap<import("generated/prisma/runtime/library").InternalArgs & {
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
