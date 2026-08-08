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
exports.ProductsImportService = void 0;
const common_1 = require("@nestjs/common");
const sync_1 = require("csv-parse/sync");
const exceljs_1 = require("exceljs");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const s3_service_1 = require("../common/storage/s3.service");
const file_validation_util_1 = require("../common/utils/file-validation.util");
const prisma_1 = require("../../generated/prisma");
const MAX_IMPORT_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME_TYPES = [
    'text/csv',
    'text/plain',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];
let ProductsImportService = class ProductsImportService {
    tenantPrisma;
    s3;
    constructor(tenantPrisma, s3) {
        this.tenantPrisma = tenantPrisma;
        this.s3 = s3;
    }
    async import(businessId, file) {
        await (0, file_validation_util_1.validateUploadedFile)(file, {
            allowedMimeTypes: ALLOWED_MIME_TYPES,
            maxSizeBytes: MAX_IMPORT_SIZE_BYTES,
        });
        const rows = await this.parseFile(file);
        let created = 0;
        const errors = [];
        for (const [index, row] of rows.entries()) {
            const rowNumber = index + 2;
            const validation = this.validateRow(row);
            if (validation.error) {
                errors.push({ row: rowNumber, reason: validation.error, data: row });
                continue;
            }
            try {
                await this.tenantPrisma.client.product.create({
                    data: {
                        businessId,
                        ...validation.data,
                    },
                });
                created += 1;
            }
            catch {
                errors.push({
                    row: rowNumber,
                    reason: `A product with sku "${validation.data.sku}" already exists`,
                    data: row,
                });
            }
        }
        const errorsFileUrl = errors.length > 0
            ? await this.uploadErrorsCsv(businessId, errors)
            : undefined;
        return { created, skipped: errors.length, errorsFileUrl };
    }
    async parseFile(file) {
        const isXlsx = file.mimetype.includes('sheet') ||
            file.originalname.toLowerCase().endsWith('.xlsx');
        if (isXlsx) {
            const workbook = new exceljs_1.Workbook();
            await workbook.xlsx.load(file.buffer);
            const sheet = workbook.worksheets[0];
            const [headerRow, ...dataRows] = sheet.getRows(1, sheet.rowCount) ?? [];
            if (!headerRow)
                return [];
            const headers = headerRow.values
                .slice(1)
                .map((h) => String(h ?? '').trim());
            return dataRows.map((row) => {
                const values = row.values.slice(1);
                return Object.fromEntries(headers.map((header, i) => [header, String(values[i] ?? '').trim()]));
            });
        }
        return (0, sync_1.parse)(file.buffer.toString('utf-8'), {
            columns: true,
            skip_empty_lines: true,
            trim: true,
        });
    }
    validateRow(row) {
        const name = row.name?.trim();
        if (!name) {
            return { error: 'name is required' };
        }
        const kind = (row.kind?.trim().toLowerCase() || 'product');
        if (kind !== prisma_1.ProductKind.product && kind !== prisma_1.ProductKind.service) {
            return {
                error: `kind must be "product" or "service", got "${row.kind}"`,
            };
        }
        const costPrice = Number(row.costPrice ?? row.cost_price ?? 0);
        const sellingPrice = Number(row.sellingPrice ?? row.selling_price ?? 0);
        if (Number.isNaN(costPrice) || costPrice < 0) {
            return {
                error: `costPrice must be a non-negative number, got "${row.costPrice}"`,
            };
        }
        if (Number.isNaN(sellingPrice) || sellingPrice < 0) {
            return {
                error: `sellingPrice must be a non-negative number, got "${row.sellingPrice}"`,
            };
        }
        const stockQty = Number(row.stockQty ?? row.stock_qty ?? 0);
        if (Number.isNaN(stockQty) || stockQty < 0) {
            return {
                error: `stockQty must be a non-negative number, got "${row.stockQty}"`,
            };
        }
        return {
            data: {
                name,
                kind,
                category: row.category?.trim() || undefined,
                sku: row.sku?.trim() || undefined,
                costPrice,
                sellingPrice,
                stockQty,
            },
        };
    }
    async uploadErrorsCsv(businessId, errors) {
        const header = 'row,reason,data\n';
        const body = errors
            .map((e) => `${e.row},"${e.reason.replace(/"/g, '""')}","${JSON.stringify(e.data).replace(/"/g, '""')}"`)
            .join('\n');
        const key = `imports/products/${businessId}/${Date.now()}-errors.csv`;
        return this.s3.uploadAndSign(key, Buffer.from(header + body), 'text/csv');
    }
};
exports.ProductsImportService = ProductsImportService;
exports.ProductsImportService = ProductsImportService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        s3_service_1.S3Service])
], ProductsImportService);
//# sourceMappingURL=products-import.service.js.map