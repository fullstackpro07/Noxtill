import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PdfRendererService } from '../common/pdf/pdf-renderer.service';
import { S3Service } from '../common/storage/s3.service';
import { GenerateQrPosterDto } from './dto/generate-qr-poster.dto';
export declare class QrPosterService {
    private readonly tenantPrisma;
    private readonly pdfRenderer;
    private readonly s3;
    constructor(tenantPrisma: TenantPrismaService, pdfRenderer: PdfRendererService, s3: S3Service);
    generate(businessId: string, dto: GenerateQrPosterDto): Promise<{
        url: string;
    }>;
    private renderHtml;
}
