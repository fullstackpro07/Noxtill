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
exports.PublicVideoTestimonialService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const s3_service_1 = require("../common/storage/s3.service");
const file_validation_util_1 = require("../common/utils/file-validation.util");
const video_testimonials_constants_1 = require("./video-testimonials.constants");
const prisma_1 = require("../../generated/prisma");
const EXTENSION_BY_MIME = {
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
};
let PublicVideoTestimonialService = class PublicVideoTestimonialService {
    prisma;
    s3;
    constructor(prisma, s3) {
        this.prisma = prisma;
        this.s3 = s3;
    }
    async getByToken(token) {
        const testimonial = await this.loadValid(token);
        return {
            businessName: testimonial.business.name,
            branding: testimonial.business.branding,
            caption: testimonial.caption,
        };
    }
    async upload(token, file) {
        const testimonial = await this.loadValid(token);
        await (0, file_validation_util_1.validateUploadedFile)(file, {
            allowedMimeTypes: video_testimonials_constants_1.ALLOWED_VIDEO_MIME_TYPES,
            maxSizeBytes: video_testimonials_constants_1.MAX_VIDEO_SIZE_BYTES,
        });
        const ext = EXTENSION_BY_MIME[file.mimetype] ?? 'mp4';
        const key = `video-testimonials/${testimonial.businessId}/${token}.${ext}`;
        await this.s3.upload(key, file.buffer, file.mimetype);
        await this.prisma.videoTestimonial.update({
            where: { id: testimonial.id },
            data: { videoKey: key, status: prisma_1.VideoTestimonialStatus.submitted },
        });
        return { thankYou: true };
    }
    async loadValid(token) {
        const testimonial = await this.prisma.videoTestimonial.findUnique({
            where: { token },
            include: { business: true },
        });
        if (!testimonial) {
            throw new common_1.NotFoundException();
        }
        if (testimonial.status !== prisma_1.VideoTestimonialStatus.requested) {
            throw new common_1.NotFoundException();
        }
        const ageDays = (Date.now() - testimonial.createdAt.getTime()) / (1000 * 60 * 60 * 24);
        if (ageDays > video_testimonials_constants_1.VIDEO_TESTIMONIAL_TOKEN_EXPIRY_DAYS) {
            throw new common_1.NotFoundException();
        }
        return testimonial;
    }
};
exports.PublicVideoTestimonialService = PublicVideoTestimonialService;
exports.PublicVideoTestimonialService = PublicVideoTestimonialService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        s3_service_1.S3Service])
], PublicVideoTestimonialService);
//# sourceMappingURL=public-video-testimonial.service.js.map