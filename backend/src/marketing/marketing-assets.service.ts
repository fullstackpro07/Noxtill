import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { toDataURL } from 'qrcode';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PdfRendererService } from '../common/pdf/pdf-renderer.service';
import { S3Service } from '../common/storage/s3.service';
import { ProfitService } from '../profit/profit.service';
import { validateUploadedFile } from '../common/utils/file-validation.util';
import { ALLOWED_IMAGE_MIME_TYPES } from '../digitizer/digitizer.constants';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import { GenerateMarketingKitDto } from './dto/generate-marketing-kit.dto';
import {
  isPxFormat,
  MARKETING_ASSET_FORMAT_DIMENSIONS,
  MAX_MARKETING_ASSET_BACKGROUND_SIZE_BYTES,
  type MarketingAssetTemplate,
} from './marketing-assets.constants';
import { Role } from '@prisma/client';

const MM_PER_INCH = 25.4;
const PNG_DPI = 150;

function mmToPx(mm: number): number {
  return Math.round((mm / MM_PER_INCH) * PNG_DPI);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

interface TemplateTheme {
  background: string;
  surface: string;
  heading: string;
  body: string;
  accent: string;
}

const TEMPLATE_THEMES: Record<MarketingAssetTemplate, TemplateTheme> = {
  classic: {
    background: '#FAF7F0',
    surface: 'rgba(255,255,255,0.88)',
    heading: '#0C4B3B',
    body: '#3f3a2e',
    accent: '#E8A93C',
  },
  bold: {
    background: '#0C4B3B',
    surface: 'rgba(0,0,0,0.28)',
    heading: '#FAF7F0',
    body: '#e4ddc9',
    accent: '#E8A93C',
  },
  minimal: {
    background: '#FFFFFF',
    surface: 'rgba(255,255,255,0.92)',
    heading: '#1c231e',
    body: '#5a5546',
    accent: '#0C4B3B',
  },
};

/**
 * Marketing Assets (UPD-BE-105) — real poster/flyer/social-story generation from the business's
 * own real data (logo/brand color from Review Settings, top products from `ProfitService`, an
 * owner-contact WhatsApp deep link), rendered via the same shared Puppeteer pipeline as
 * invoices/QR posters. No stock imagery or fabricated content — every content block is either the
 * business's own uploaded background or real catalog/contact data, and a block that has no real
 * data behind it (e.g. `top_products` with zero sales yet) is simply omitted, never faked.
 */
@Injectable()
export class MarketingAssetsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly pdfRenderer: PdfRendererService,
    private readonly s3: S3Service,
    private readonly profit: ProfitService,
    private readonly cls: ClsService,
  ) {}

  async uploadBackground(file: {
    buffer: Buffer;
    size: number;
    mimetype: string;
  }): Promise<{ backgroundKey: string; backgroundUrl: string }> {
    await validateUploadedFile(file, {
      allowedMimeTypes: [...ALLOWED_IMAGE_MIME_TYPES],
      maxSizeBytes: MAX_MARKETING_ASSET_BACKGROUND_SIZE_BYTES,
    });

    const businessId = this.currentBusinessId();
    const extension =
      file.mimetype === 'image/png'
        ? 'png'
        : file.mimetype === 'image/webp'
          ? 'webp'
          : 'jpg';
    const key = `marketing-kit/${businessId}/background-${Date.now()}.${extension}`;
    const backgroundUrl = await this.s3.uploadAndSign(
      key,
      file.buffer,
      file.mimetype,
    );
    return { backgroundKey: key, backgroundUrl };
  }

  async generate(dto: GenerateMarketingKitDto): Promise<{ url: string }> {
    const businessId = this.currentBusinessId();
    const business = await this.tenantPrisma.client.business.findUniqueOrThrow({
      where: { id: businessId },
    });
    const settings = (business.reviewSettings as Record<string, unknown>) ?? {};
    const brandColor = settings.brandColor as string | undefined;
    const logoKey = settings.logoKey as string | undefined;

    const owner = await this.tenantPrisma.client.businessUser.findFirst({
      where: { role: Role.owner },
      include: { user: true },
    });
    const phone = owner?.user.phone ?? null;

    const [logoUrl, backgroundUrl, topProducts] = await Promise.all([
      logoKey ? this.s3.getSignedDownloadUrl(logoKey) : Promise.resolve(null),
      dto.backgroundKey
        ? this.s3.getSignedDownloadUrl(dto.backgroundKey)
        : Promise.resolve(null),
      dto.contentBlocks.includes('top_products')
        ? this.profit.byProduct(30).then((r) => r.products)
        : Promise.resolve([]),
    ]);
    const qrDataUrl =
      dto.contentBlocks.includes('qr_code') && phone
        ? await toDataURL(`https://wa.me/${phone.replace(/[^0-9]/g, '')}`, {
            margin: 1,
            width: 400,
          })
        : null;

    const dims = MARKETING_ASSET_FORMAT_DIMENSIONS[dto.format];
    const pxFormat = isPxFormat(dims);
    const fileType: 'png' | 'pdf' = pxFormat ? 'png' : (dto.fileType ?? 'png');

    const html = this.renderHtml(dto, {
      businessName: business.name,
      brandColor,
      logoUrl,
      backgroundUrl,
      phone,
      qrDataUrl,
      topProducts: topProducts.slice(0, 5),
    });

    let buffer: Buffer;
    let contentType: string;
    let extension: string;
    if (pxFormat) {
      buffer = await this.pdfRenderer.renderPng(html, {
        width: dims.widthPx,
        height: dims.heightPx,
      });
      contentType = 'image/png';
      extension = 'png';
    } else if (fileType === 'pdf') {
      buffer = await this.pdfRenderer.renderPdf(html, {
        width: `${dims.widthMm}mm`,
        height: `${dims.heightMm}mm`,
      });
      contentType = 'application/pdf';
      extension = 'pdf';
    } else {
      buffer = await this.pdfRenderer.renderPng(html, {
        width: mmToPx(dims.widthMm),
        height: mmToPx(dims.heightMm),
      });
      contentType = 'image/png';
      extension = 'png';
    }

    const key = `marketing-kit/${businessId}/${dto.format}-${Date.now()}.${extension}`;
    return { url: await this.s3.uploadAndSign(key, buffer, contentType) };
  }

  private currentBusinessId(): string {
    return this.cls.get<string>(CLS_KEY_BUSINESS_ID);
  }

  private renderHtml(
    dto: GenerateMarketingKitDto,
    data: {
      businessName: string;
      brandColor?: string;
      logoUrl: string | null;
      backgroundUrl: string | null;
      phone: string | null;
      qrDataUrl: string | null;
      topProducts: { name: string; units: number }[];
    },
  ): string {
    const theme = TEMPLATE_THEMES[dto.template];
    const heading = data.brandColor ?? theme.heading;
    const blocks = new Set(dto.contentBlocks);

    const backgroundStyle = data.backgroundUrl
      ? `background-image: url('${data.backgroundUrl}'); background-size: cover; background-position: center;`
      : `background: ${theme.background};`;

    return `
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            html, body { width: 100%; height: 100%; font-family: -apple-system, 'Segoe UI', sans-serif; }
            body { ${backgroundStyle} display: flex; align-items: center; justify-content: center; padding: 40px; }
            .card { width: 100%; height: 100%; background: ${theme.surface}; border-radius: 20px; padding: 40px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 18px; }
            .logo { width: 84px; height: 84px; border-radius: 50%; object-fit: cover; }
            h1 { font-size: 34px; color: ${heading}; }
            .tagline { font-size: 18px; color: ${theme.body}; max-width: 80%; }
            .products { display: flex; flex-direction: column; gap: 6px; font-size: 16px; color: ${theme.body}; }
            .products p { font-weight: 600; }
            .phone { font-size: 16px; color: ${theme.body}; }
            .qr { width: 120px; height: 120px; }
          </style>
        </head>
        <body>
          <div class="card">
            ${blocks.has('logo') && data.logoUrl ? `<img class="logo" src="${data.logoUrl}" alt="" />` : ''}
            ${blocks.has('business_name') ? `<h1>${escapeHtml(data.businessName)}</h1>` : ''}
            ${blocks.has('tagline') && dto.tagline ? `<p class="tagline">${escapeHtml(dto.tagline)}</p>` : ''}
            ${
              blocks.has('top_products') && data.topProducts.length > 0
                ? `<div class="products"><p>Popular right now</p>${data.topProducts.map((p) => `<span>${escapeHtml(p.name)}</span>`).join('')}</div>`
                : ''
            }
            ${blocks.has('qr_code') && data.qrDataUrl ? `<img class="qr" src="${data.qrDataUrl}" alt="Scan to chat on WhatsApp" />` : ''}
            ${blocks.has('phone') && data.phone ? `<p class="phone">${escapeHtml(data.phone)}</p>` : ''}
          </div>
        </body>
      </html>
    `;
  }
}
