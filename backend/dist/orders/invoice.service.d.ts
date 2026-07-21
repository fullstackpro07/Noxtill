import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { LocaleService } from '../common/localization/locale.service';
import { S3Service } from '../common/storage/s3.service';
import { PdfRendererService } from '../common/pdf/pdf-renderer.service';
import { SendGateService } from '../messaging/send-gate.service';
export declare class InvoiceService {
    private readonly tenantPrisma;
    private readonly locale;
    private readonly s3;
    private readonly sendGate;
    private readonly pdfRenderer;
    constructor(tenantPrisma: TenantPrismaService, locale: LocaleService, s3: S3Service, sendGate: SendGateService, pdfRenderer: PdfRendererService);
    generate(businessId: string, orderId: string, send?: boolean): Promise<{
        url: string;
    }>;
    private renderHtml;
}
