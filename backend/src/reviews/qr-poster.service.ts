import { Injectable } from '@nestjs/common';
import { toDataURL } from 'qrcode';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PdfRendererService } from '../common/pdf/pdf-renderer.service';
import { S3Service } from '../common/storage/s3.service';
import { GenerateQrPosterDto } from './dto/generate-qr-poster.dto';

const MM_PER_INCH = 25.4;
const PNG_DPI = 150;

const PAGE_SIZE_MM: Record<
  GenerateQrPosterDto['format'],
  { width: number; height: number }
> = {
  a5: { width: 148, height: 210 },
  a4: { width: 210, height: 297 },
  sticker: { width: 80, height: 80 },
};

function mmToPx(mm: number): number {
  return Math.round((mm / MM_PER_INCH) * PNG_DPI);
}

/** Puppeteer's `page.setContent` runs with `--no-sandbox` and actually executes any markup it's given, so a
 * business name is never safe to interpolate raw — this closes that off for the one template this service owns. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * QR poster generation (Reviews Grow tab): the QR is encoded server-side and embedded into an
 * HTML template, rendered via the shared Puppeteer pipeline, and delivered through S3 — the exact
 * same authenticated HTML→file→signed-URL pattern as invoices (BE-027) and credit statements
 * (BE-032). Never public; the poster is a business asset the owner downloads, not something
 * anyone else can request.
 */
@Injectable()
export class QrPosterService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly pdfRenderer: PdfRendererService,
    private readonly s3: S3Service,
  ) {}

  async generate(
    businessId: string,
    dto: GenerateQrPosterDto,
  ): Promise<{ url: string }> {
    const business = await this.tenantPrisma.client.business.findUniqueOrThrow({
      where: { id: businessId },
    });

    const settings = (business.reviewSettings as Record<string, unknown>) ?? {};
    const brandColor = (settings.brandColor as string | undefined) ?? undefined;
    const logoKey = settings.logoKey as string | undefined;
    const logoUrl = logoKey
      ? await this.s3.getSignedDownloadUrl(logoKey)
      : undefined;

    const qrDataUrl = await toDataURL(dto.targetUrl, { margin: 1, width: 600 });
    const html = this.renderHtml(
      business.name,
      qrDataUrl,
      dto.format,
      brandColor,
      logoUrl,
    );
    const { width, height } = PAGE_SIZE_MM[dto.format];

    let buffer: Buffer;
    let contentType: string;
    let extension: string;
    if (dto.fileType === 'pdf') {
      buffer = await this.pdfRenderer.renderPdf(html, {
        width: `${width}mm`,
        height: `${height}mm`,
      });
      contentType = 'application/pdf';
      extension = 'pdf';
    } else {
      buffer = await this.pdfRenderer.renderPng(html, {
        width: mmToPx(width),
        height: mmToPx(height),
      });
      contentType = 'image/png';
      extension = 'png';
    }

    const key = `qr-posters/${businessId}/${dto.format}-${Date.now()}.${extension}`;
    return { url: await this.s3.uploadAndSign(key, buffer, contentType) };
  }

  private renderHtml(
    businessName: string,
    qrDataUrl: string,
    format: GenerateQrPosterDto['format'],
    brandColor?: string,
    logoUrl?: string,
  ): string {
    const isSticker = format === 'sticker';
    const headingColor = brandColor ?? '#0C4B3B';
    return `
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            html, body { width: 100%; height: 100%; }
            body {
              font-family: sans-serif;
              color: #182420;
              background: #FAF7F0;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              text-align: center;
              padding: ${isSticker ? '10px' : '48px'};
            }
            .logo { width: ${isSticker ? '36px' : '96px'}; height: ${isSticker ? '36px' : '96px'}; object-fit: contain; margin-bottom: ${isSticker ? '4px' : '16px'}; }
            h1 { font-size: ${isSticker ? '13px' : '28px'}; color: ${headingColor}; margin-bottom: ${isSticker ? '6px' : '24px'}; }
            img.qr { width: ${isSticker ? '65%' : '70%'}; max-width: 420px; }
            p { margin-top: ${isSticker ? '6px' : '24px'}; font-size: ${isSticker ? '9px' : '18px'}; color: #6b6353; }
          </style>
        </head>
        <body>
          ${logoUrl ? `<img class="logo" src="${logoUrl}" alt="" />` : ''}
          <h1>${escapeHtml(businessName)}</h1>
          <img class="qr" src="${qrDataUrl}" alt="QR code" />
          <p>Scan to leave a review</p>
        </body>
      </html>
    `;
  }
}
