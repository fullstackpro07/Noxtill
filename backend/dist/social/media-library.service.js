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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MediaLibraryService = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = __importDefault(require("axios"));
const crypto_1 = require("crypto");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const s3_service_1 = require("../common/storage/s3.service");
const ai_infra_service_1 = require("../ai/ai-infra.service");
const app_exception_1 = require("../common/filters/app.exception");
const file_validation_util_1 = require("../common/utils/file-validation.util");
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const ALLOWED_MIME_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'video/mp4',
    'video/quicktime',
];
let MediaLibraryService = class MediaLibraryService {
    tenantPrisma;
    s3;
    aiInfra;
    constructor(tenantPrisma, s3, aiInfra) {
        this.tenantPrisma = tenantPrisma;
        this.s3 = s3;
        this.aiInfra = aiInfra;
    }
    async list(businessId, type) {
        const assets = await this.tenantPrisma.client.mediaAsset.findMany({
            where: { businessId, ...(type ? { type } : {}) },
            orderBy: { createdAt: 'desc' },
        });
        return Promise.all(assets.map(async (asset) => ({
            ...asset,
            url: await this.s3.getSignedDownloadUrl(asset.key),
        })));
    }
    async upload(businessId, file) {
        await (0, file_validation_util_1.validateUploadedFile)(file, {
            allowedMimeTypes: ALLOWED_MIME_TYPES,
            maxSizeBytes: MAX_UPLOAD_BYTES,
        });
        const ext = file.mimetype.split('/')[1] ?? 'bin';
        const key = `media/${businessId}/${(0, crypto_1.randomUUID)()}.${ext}`;
        await this.s3.upload(key, file.buffer, file.mimetype);
        return this.tenantPrisma.client.mediaAsset.create({
            data: {
                businessId,
                key,
                type: file.mimetype.startsWith('video') ? 'video' : 'image',
                source: 'upload',
            },
        });
    }
    async generateImage(businessId, dto) {
        let url;
        try {
            ({ url } = await this.aiInfra.generateImage(businessId, dto.prompt));
        }
        catch (error) {
            if (error instanceof app_exception_1.AppException)
                throw error;
            throw new app_exception_1.AppException('AI_UNAVAILABLE', 'The AI image generator is not available right now — please try again later.', common_1.HttpStatus.SERVICE_UNAVAILABLE);
        }
        const response = await axios_1.default.get(url, {
            responseType: 'arraybuffer',
        });
        const buffer = Buffer.from(response.data);
        const key = `media/${businessId}/${(0, crypto_1.randomUUID)()}.png`;
        await this.s3.upload(key, buffer, 'image/png');
        return this.tenantPrisma.client.mediaAsset.create({
            data: {
                businessId,
                key,
                type: 'image',
                source: 'ai_generated',
                prompt: dto.prompt,
                tags: dto.tags ?? [],
            },
        });
    }
    async update(businessId, id, dto) {
        await this.find(businessId, id);
        return this.tenantPrisma.client.mediaAsset.update({
            where: { id },
            data: { tags: dto.tags },
        });
    }
    async remove(businessId, id) {
        await this.find(businessId, id);
        await this.tenantPrisma.client.mediaAsset.delete({ where: { id } });
    }
    async incrementUsage(businessId, key) {
        await this.tenantPrisma.client.mediaAsset.updateMany({
            where: { businessId, key },
            data: { usageCount: { increment: 1 } },
        });
    }
    async find(businessId, id) {
        const asset = await this.tenantPrisma.client.mediaAsset.findUnique({
            where: { id },
        });
        if (!asset || asset.businessId !== businessId) {
            throw new common_1.NotFoundException('Media asset not found');
        }
        return asset;
    }
};
exports.MediaLibraryService = MediaLibraryService;
exports.MediaLibraryService = MediaLibraryService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        s3_service_1.S3Service,
        ai_infra_service_1.AiInfraService])
], MediaLibraryService);
//# sourceMappingURL=media-library.service.js.map