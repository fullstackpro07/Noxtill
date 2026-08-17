import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { LocaleService } from '../common/localization/locale.service';
import { S3Service } from '../common/storage/s3.service';
import { PdfRendererService } from '../common/pdf/pdf-renderer.service';
import { ProfitService } from '../profit/profit.service';
import { CommissionsService } from '../staff/commissions.service';
import { SendGateService } from '../messaging/send-gate.service';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';
import { ReportKind } from './reports.types';
export declare class ReportsService {
    private readonly tenantPrisma;
    private readonly locale;
    private readonly s3;
    private readonly pdfRenderer;
    private readonly profitService;
    private readonly commissionsService;
    private readonly sendGate;
    constructor(tenantPrisma: TenantPrismaService, locale: LocaleService, s3: S3Service, pdfRenderer: PdfRendererService, profitService: ProfitService, commissionsService: CommissionsService, sendGate: SendGateService);
    generate(kind: ReportKind, month: string | undefined, authUser: AuthenticatedUser): Promise<{
        url: string;
    }>;
    send(kind: ReportKind, month: string | undefined, authUser: AuthenticatedUser): Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        locale: string;
        businessId: string;
        customerId: string | null;
        channel: import("../../generated/prisma").$Enums.MessageChannel;
        category: import("../../generated/prisma").$Enums.MessageCategory;
        templateKey: string;
        payload: import("generated/prisma/runtime/library").JsonValue;
        status: import("../../generated/prisma").$Enums.MessageStatus;
        providerRef: string | null;
        scheduledFor: Date | null;
        campaignId: string | null;
    }>;
    private buildBody;
    private buildMonthly;
    private buildPnl;
    private buildSales;
    private buildStaff;
    private buildReviews;
    private renderHtml;
}
