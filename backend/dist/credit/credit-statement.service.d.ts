import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { LocaleService } from '../common/localization/locale.service';
import { S3Service } from '../common/storage/s3.service';
import { PdfRendererService } from '../common/pdf/pdf-renderer.service';
export declare class CreditStatementService {
    private readonly tenantPrisma;
    private readonly locale;
    private readonly s3;
    private readonly pdfRenderer;
    constructor(tenantPrisma: TenantPrismaService, locale: LocaleService, s3: S3Service, pdfRenderer: PdfRendererService);
    generate(businessId: string, customerId: string): Promise<{
        url: string;
    }>;
    private renderHtml;
}
