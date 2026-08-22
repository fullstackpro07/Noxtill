import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { toDataURL } from 'qrcode';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { PdfRendererService } from '../common/pdf/pdf-renderer.service';
import { S3Service } from '../common/storage/s3.service';
import { UpdateBookingLinkSettingsDto } from './dto/update-booking-link-settings.dto';
import { GenerateBookingQrDto } from './dto/generate-booking-qr.dto';
import { DEFAULT_BOOKING_LINK_SETTINGS } from './bookings.constants';

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

const MM_PER_INCH = 25.4;
const PNG_DPI = 150;

const PAGE_SIZE_MM: Record<
  GenerateBookingQrDto['format'],
  { width: number; height: number }
> = {
  a5: { width: 148, height: 210 },
  a4: { width: 210, height: 297 },
  sticker: { width: 80, height: 80 },
};

function mmToPx(mm: number): number {
  return Math.round((mm / MM_PER_INCH) * PNG_DPI);
}

/** Same reasoning as ReviewsModule's QrPosterService: this HTML is rendered by Puppeteer for real, so a business name is never safe to interpolate raw. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Booking Link & QR (UPD-BE-090). Three responsibilities: the public booking page's own
 * customisation (`BookingLinkSettings`), real visits/bookings/conversion analytics layered on the
 * already-real public booking flow, and QR poster generation — the last of which deliberately
 * mirrors `QrPosterService` (Reviews) rather than sharing it, since the two posters have unrelated
 * copy/branding and belong to different modules.
 */
@Injectable()
export class BookingLinkService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly pdfRenderer: PdfRendererService,
    private readonly s3: S3Service,
    private readonly config: ConfigService,
  ) {}

  async getSettings(businessId: string) {
    const existing =
      await this.tenantPrisma.client.bookingLinkSettings.findUnique({
        where: { businessId },
      });
    return existing ?? { businessId, ...DEFAULT_BOOKING_LINK_SETTINGS };
  }

  async updateSettings(businessId: string, dto: UpdateBookingLinkSettingsDto) {
    return this.tenantPrisma.client.bookingLinkSettings.upsert({
      where: { businessId },
      create: {
        businessId,
        ...DEFAULT_BOOKING_LINK_SETTINGS,
        ...dto,
      },
      update: dto,
    });
  }

  /** Visits/bookings/conversion (UPD-BE-090) — `bookings` counts real appointments sourced from
   * the public page (`link`/`qr`), not walk-ins/requests/waitlist conversions. */
  async stats(businessId: string, months = 6) {
    const since = new Date();
    since.setUTCMonth(since.getUTCMonth() - months);
    since.setUTCDate(1);
    since.setUTCHours(0, 0, 0, 0);

    const visitRows = await this.tenantPrisma.client.$queryRaw<
      { month: string; total: bigint }[]
    >`
      SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, COUNT(*) AS total
      FROM booking_link_visits
      WHERE business_id = ${businessId} AND created_at >= ${since}
      GROUP BY month
      ORDER BY month
    `;
    const bookingRows = await this.tenantPrisma.client.$queryRaw<
      { month: string; total: bigint }[]
    >`
      SELECT DATE_FORMAT(created_at, '%Y-%m') AS month, COUNT(*) AS total
      FROM appointments
      WHERE business_id = ${businessId} AND created_at >= ${since}
        AND source IN ('link', 'qr')
      GROUP BY month
      ORDER BY month
    `;

    const months_ = new Map<string, { visits: number; bookings: number }>();
    for (const row of visitRows) {
      months_.set(row.month, { visits: Number(row.total), bookings: 0 });
    }
    for (const row of bookingRows) {
      const entry = months_.get(row.month) ?? { visits: 0, bookings: 0 };
      entry.bookings = Number(row.total);
      months_.set(row.month, entry);
    }

    const trend = Array.from(months_.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, { visits, bookings }]) => ({
        month,
        visits,
        bookings,
        conversion: visits > 0 ? round2((bookings / visits) * 100) : 0,
      }));

    const totalVisits = trend.reduce((sum, r) => sum + r.visits, 0);
    const totalBookings = trend.reduce((sum, r) => sum + r.bookings, 0);

    return {
      months,
      totalVisits,
      totalBookings,
      conversion:
        totalVisits > 0 ? round2((totalBookings / totalVisits) * 100) : 0,
      trend,
    };
  }

  private buildTargetUrl(slug: string): string {
    const frontendUrl =
      this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000';
    return `${frontendUrl}/book/${slug}?src=qr`;
  }

  async generateQr(
    businessId: string,
    dto: GenerateBookingQrDto,
  ): Promise<{ url: string }> {
    const business = await this.tenantPrisma.client.business.findUniqueOrThrow({
      where: { id: businessId },
    });

    const targetUrl = this.buildTargetUrl(business.slug);
    const qrDataUrl = await toDataURL(targetUrl, { margin: 1, width: 600 });
    const html = this.renderHtml(business.name, qrDataUrl, dto.format);
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

    const key = `booking-qr-posters/${businessId}/${dto.format}-${Date.now()}.${extension}`;
    return { url: await this.s3.uploadAndSign(key, buffer, contentType) };
  }

  private renderHtml(
    businessName: string,
    qrDataUrl: string,
    format: GenerateBookingQrDto['format'],
  ): string {
    const isSticker = format === 'sticker';
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
            h1 { font-size: ${isSticker ? '13px' : '28px'}; color: #0C4B3B; margin-bottom: ${isSticker ? '6px' : '24px'}; }
            img { width: ${isSticker ? '65%' : '70%'}; max-width: 420px; }
            p { margin-top: ${isSticker ? '6px' : '24px'}; font-size: ${isSticker ? '9px' : '18px'}; color: #6b6353; }
          </style>
        </head>
        <body>
          <h1>${escapeHtml(businessName)}</h1>
          <img src="${qrDataUrl}" alt="QR code" />
          <p>Scan to book an appointment</p>
        </body>
      </html>
    `;
  }
}
