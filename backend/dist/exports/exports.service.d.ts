import { Queue } from 'bullmq';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { S3Service } from '../common/storage/s3.service';
import { ExportKind } from './exports.constants';
export declare class ExportsService {
    private readonly tenantPrisma;
    private readonly s3;
    private readonly exportsQueue;
    constructor(tenantPrisma: TenantPrismaService, s3: S3Service, exportsQueue: Queue);
    enqueueAccountZip(businessId: string, userId: string): Promise<{
        queued: true;
    }>;
    generateXlsx(businessId: string, kind: ExportKind): Promise<{
        url: string;
    }>;
    buildXlsxBuffer(businessId: string, kind: ExportKind): Promise<Buffer>;
    private fetchRows;
    private fetchSalesRows;
    private fetchCustomerRows;
    private fetchCreditRows;
    private fetchStockRows;
    private fetchExpenseRows;
}
