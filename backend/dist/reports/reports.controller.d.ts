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
        id: string;
        createdAt: Date;
        updatedAt: Date;
        locale: string;
        businessId: string;
        customerId: string | null;
        channel: import("generated/prisma").$Enums.MessageChannel;
        category: import("generated/prisma").$Enums.MessageCategory;
        templateKey: string;
        payload: import("generated/prisma/runtime/library").JsonValue;
        status: import("generated/prisma").$Enums.MessageStatus;
        providerRef: string | null;
        scheduledFor: Date | null;
        campaignId: string | null;
    }>;
}
