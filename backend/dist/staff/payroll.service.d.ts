import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { S3Service } from '../common/storage/s3.service';
import { CommissionsService } from './commissions.service';
import { TimesheetsService } from './timesheets.service';
export declare class PayrollService {
    private readonly tenantPrisma;
    private readonly s3;
    private readonly commissions;
    private readonly timesheets;
    constructor(tenantPrisma: TenantPrismaService, s3: S3Service, commissions: CommissionsService, timesheets: TimesheetsService);
    export(businessId: string, month: string): Promise<{
        url: string;
        warnings: string[];
    }>;
    private netAdvances;
}
