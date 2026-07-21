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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomerImportService = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq");
const bullmq_2 = require("bullmq");
const crypto_1 = require("crypto");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const prisma_service_1 = require("../prisma/prisma.service");
const audit_service_1 = require("../common/audit/audit.service");
const file_validation_util_1 = require("../common/utils/file-validation.util");
const phone_util_1 = require("../common/utils/phone.util");
const customer_import_parser_1 = require("./customer-import.parser");
const customer_import_constants_1 = require("./customer-import.constants");
const prisma_1 = require("../../generated/prisma");
function detectSource(file) {
    const name = file.originalname.toLowerCase();
    if (file.mimetype.includes('sheet') || name.endsWith('.xlsx'))
        return prisma_1.ImportSource.xlsx;
    if (file.mimetype.includes('wordprocessingml') || name.endsWith('.docx'))
        return prisma_1.ImportSource.docx;
    if (file.mimetype.includes('csv') || name.endsWith('.csv'))
        return prisma_1.ImportSource.csv;
    return prisma_1.ImportSource.text;
}
let CustomerImportService = class CustomerImportService {
    tenantPrisma;
    prisma;
    parser;
    auditService;
    queue;
    constructor(tenantPrisma, prisma, parser, auditService, queue) {
        this.tenantPrisma = tenantPrisma;
        this.prisma = prisma;
        this.parser = parser;
        this.auditService = auditService;
        this.queue = queue;
    }
    async stageImport(businessId, file) {
        await (0, file_validation_util_1.validateUploadedFile)(file, {
            allowedMimeTypes: customer_import_constants_1.ALLOWED_IMPORT_MIME_TYPES,
            maxSizeBytes: customer_import_constants_1.MAX_IMPORT_SIZE_BYTES,
        });
        const contentHash = (0, crypto_1.createHash)('sha256').update(file.buffer).digest('hex');
        const existingBatch = await this.tenantPrisma.client.importBatch.findUnique({
            where: { businessId_contentHash: { businessId, contentHash } },
        });
        if (existingBatch) {
            return this.toPreview(existingBatch);
        }
        const business = await this.tenantPrisma.client.business.findUniqueOrThrow({
            where: { id: businessId },
        });
        const rawRows = await this.parser.parse(file);
        const existingCustomers = await this.tenantPrisma.client.customer.findMany({});
        const staged = this.stageRows(rawRows, business.country, existingCustomers);
        const counts = this.computeCounts(staged);
        const batch = await this.tenantPrisma.client.importBatch.create({
            data: {
                businessId,
                source: detectSource(file),
                status: 'pending',
                counts: counts,
                rows: staged,
                contentHash,
            },
        });
        return this.toPreview(batch);
    }
    async getBatch(batchId) {
        const batch = await this.tenantPrisma.client.importBatch.findUnique({
            where: { id: batchId },
        });
        if (!batch) {
            throw new common_1.NotFoundException('Import batch not found');
        }
        return this.toPreview(batch);
    }
    async confirm(businessId, batchId) {
        const batch = await this.tenantPrisma.client.importBatch.findUnique({
            where: { id: batchId },
        });
        if (!batch) {
            throw new common_1.NotFoundException('Import batch not found');
        }
        if (batch.status === 'completed' || batch.status === 'processing') {
            return { batchId, status: batch.status };
        }
        await this.tenantPrisma.client.importBatch.update({
            where: { id: batchId },
            data: { status: 'processing' },
        });
        await this.queue.add('execute', { businessId, batchId }, { jobId: `customer-import-${batchId}` });
        return { batchId, status: 'processing' };
    }
    async executeBatch(businessId, batchId) {
        const batch = await this.prisma.importBatch.findUniqueOrThrow({
            where: { id: batchId },
        });
        const rows = batch.rows;
        for (let i = 0; i < rows.length; i += customer_import_constants_1.EXECUTE_BATCH_SIZE) {
            const chunk = rows.slice(i, i + customer_import_constants_1.EXECUTE_BATCH_SIZE);
            await this.executeChunk(businessId, chunk);
        }
        const counts = batch.counts;
        await this.prisma.importBatch.update({
            where: { id: batchId },
            data: { status: 'completed' },
        });
        await this.auditService.log({
            entity: 'ImportBatch',
            entityId: batchId,
            action: 'customer_import.execute',
            after: { counts },
        });
    }
    async executeChunk(businessId, chunk) {
        await this.prisma.$transaction(async (tx) => {
            for (const row of chunk) {
                if (row.action === 'skip' || !row.normalizedPhone)
                    continue;
                let customerId = row.existingCustomerId;
                if (row.action === 'create') {
                    const created = await tx.customer.create({
                        data: { businessId, phone: row.normalizedPhone, name: row.name },
                    });
                    customerId = created.id;
                }
                else if (row.action === 'update' && customerId) {
                    const existing = await tx.customer.findUnique({
                        where: { id: customerId },
                    });
                    if (existing && !existing.name.trim()) {
                        await tx.customer.update({
                            where: { id: customerId },
                            data: { name: row.name },
                        });
                    }
                }
                if (row.balance && row.balance > 0 && customerId) {
                    await tx.creditEntry.create({
                        data: {
                            businessId,
                            customerId,
                            kind: 'credit',
                            amount: row.balance,
                            note: 'Opening balance — imported',
                        },
                    });
                }
            }
        });
    }
    stageRows(rawRows, defaultCountry, existingCustomers) {
        const existingByPhone = new Map(existingCustomers.map((c) => [c.phone, c]));
        const seenInBatch = new Set();
        return rawRows.map((row, index) => {
            const rowNumber = index + 1;
            const base = {
                rowNumber,
                name: row.name,
                rawPhone: row.phone,
                balance: row.balance,
            };
            if (!row.name || !row.phone) {
                return {
                    ...base,
                    action: 'skip',
                    reason: 'Missing name or phone',
                };
            }
            const normalizedPhone = (0, phone_util_1.normalizePhoneE164)(row.phone, defaultCountry ?? undefined);
            if (!normalizedPhone) {
                return {
                    ...base,
                    action: 'skip',
                    reason: `Could not parse phone: ${row.phone}`,
                };
            }
            if (seenInBatch.has(normalizedPhone)) {
                return {
                    ...base,
                    normalizedPhone,
                    action: 'skip',
                    reason: 'Duplicate phone within this import',
                };
            }
            seenInBatch.add(normalizedPhone);
            const existing = existingByPhone.get(normalizedPhone);
            if (existing) {
                return {
                    ...base,
                    normalizedPhone,
                    action: 'update',
                    existingCustomerId: existing.id,
                };
            }
            return { ...base, normalizedPhone, action: 'create' };
        });
    }
    computeCounts(staged) {
        return {
            create: staged.filter((r) => r.action === 'create').length,
            update: staged.filter((r) => r.action === 'update').length,
            skip: staged.filter((r) => r.action === 'skip').length,
            totalCredit: staged.reduce((sum, r) => sum + (r.action !== 'skip' ? (r.balance ?? 0) : 0), 0),
        };
    }
    toPreview(batch) {
        const rows = batch.rows;
        return {
            batchId: batch.id,
            status: batch.status,
            counts: batch.counts,
            preview: rows.filter((r) => r.action !== 'skip').slice(0, 50),
            invalid: rows.filter((r) => r.action === 'skip'),
        };
    }
};
exports.CustomerImportService = CustomerImportService;
exports.CustomerImportService = CustomerImportService = __decorate([
    (0, common_1.Injectable)(),
    __param(4, (0, bullmq_1.InjectQueue)(customer_import_constants_1.CUSTOMER_IMPORT_QUEUE)),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        prisma_service_1.PrismaService,
        customer_import_parser_1.CustomerImportParser,
        audit_service_1.AuditService,
        bullmq_2.Queue])
], CustomerImportService);
//# sourceMappingURL=customer-import.service.js.map