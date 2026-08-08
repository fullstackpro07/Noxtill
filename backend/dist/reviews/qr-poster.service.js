"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QrPosterService = void 0;
const common_1 = require("@nestjs/common");
const qrcode_1 = require("qrcode");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const pdf_renderer_service_1 = require("../common/pdf/pdf-renderer.service");
const s3_service_1 = require("../common/storage/s3.service");
const MM_PER_INCH = 25.4;
const PNG_DPI = 150;
const PAGE_SIZE_MM = {
    a5: { width: 148, height: 210 },
    a4: { width: 210, height: 297 },
    sticker: { width: 80, height: 80 },
};
function mmToPx(mm) {
    return Math.round((mm / MM_PER_INCH) * PNG_DPI);
}
function escapeHtml(value) {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
let QrPosterService = class QrPosterService {
    tenantPrisma;
    pdfRenderer;
    s3;
    constructor(tenantPrisma, pdfRenderer, s3) {
        this.tenantPrisma = tenantPrisma;
        this.pdfRenderer = pdfRenderer;
        this.s3 = s3;
    }
    async generate(businessId, dto) {
        const business = await this.tenantPrisma.client.business.findUniqueOrThrow({
            where: { id: businessId },
        });
        const qrDataUrl = await (0, qrcode_1.toDataURL)(dto.targetUrl, { margin: 1, width: 600 });
        const html = this.renderHtml(business.name, qrDataUrl, dto.format);
        const { width, height } = PAGE_SIZE_MM[dto.format];
        let buffer;
        let contentType;
        let extension;
        if (dto.fileType === 'pdf') {
            buffer = await this.pdfRenderer.renderPdf(html, {
                width: `${width}mm`,
                height: `${height}mm`,
            });
            contentType = 'application/pdf';
            extension = 'pdf';
        }
        else {
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
    renderHtml(businessName, qrDataUrl, format) {
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
          <p>Scan to leave a review</p>
        </body>
      </html>
    `;
    }
};
exports.QrPosterService = QrPosterService;
exports.QrPosterService = QrPosterService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        pdf_renderer_service_1.PdfRendererService,
        s3_service_1.S3Service])
], QrPosterService);
//# sourceMappingURL=qr-poster.service.js.map