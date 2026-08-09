import { ReportsService } from './reports.service';
import { GenerateReportDto } from './dto/generate-report.dto';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
export declare class ReportsController {
    private readonly reports;
    constructor(reports: ReportsService);
    generate(user: AuthenticatedUser, kind: string, dto: GenerateReportDto): Promise<{
        url: string;
    }>;
    send(user: AuthenticatedUser, kind: string, dto: GenerateReportDto): Promise<{
        locale: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        businessId: string;
        category: import("generated/prisma").$Enums.MessageCategory;
        customerId: string | null;
        status: import("generated/prisma").$Enums.MessageStatus;
        channel: import("generated/prisma").$Enums.MessageChannel;
        templateKey: string;
        payload: import("generated/prisma/runtime/library").JsonValue;
        providerRef: string | null;
        scheduledFor: Date | null;
        campaignId: string | null;
    }>;
}
