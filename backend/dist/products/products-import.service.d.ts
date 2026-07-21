import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { S3Service } from '../common/storage/s3.service';
export interface UploadedFile {
    buffer: Buffer;
    size: number;
    mimetype: string;
    originalname: string;
}
export interface ImportSummary {
    created: number;
    skipped: number;
    errorsFileUrl?: string;
}
export declare class ProductsImportService {
    private readonly tenantPrisma;
    private readonly s3;
    constructor(tenantPrisma: TenantPrismaService, s3: S3Service);
    import(businessId: string, file: UploadedFile): Promise<ImportSummary>;
    private parseFile;
    private validateRow;
    private uploadErrorsCsv;
}
