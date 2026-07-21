import { Queue } from 'bullmq';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { CustomerImportParser, ImportFile } from './customer-import.parser';
import { ImportPreview } from './customer-import.types';
export declare class CustomerImportService {
    private readonly tenantPrisma;
    private readonly prisma;
    private readonly parser;
    private readonly auditService;
    private readonly queue;
    constructor(tenantPrisma: TenantPrismaService, prisma: PrismaService, parser: CustomerImportParser, auditService: AuditService, queue: Queue);
    stageImport(businessId: string, file: ImportFile): Promise<ImportPreview>;
    getBatch(batchId: string): Promise<ImportPreview>;
    confirm(businessId: string, batchId: string): Promise<{
        batchId: string;
        status: string;
    }>;
    executeBatch(businessId: string, batchId: string): Promise<void>;
    private executeChunk;
    private stageRows;
    private computeCounts;
    private toPreview;
}
