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
exports.VideoTestimonialsService = void 0;
const common_1 = require("@nestjs/common");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const app_exception_1 = require("../common/filters/app.exception");
const send_gate_service_1 = require("../messaging/send-gate.service");
const activity_service_1 = require("../activity/activity.service");
const s3_service_1 = require("../common/storage/s3.service");
const review_token_util_1 = require("./review-token.util");
const video_testimonials_constants_1 = require("./video-testimonials.constants");
const prisma_1 = require("../../generated/prisma");
let VideoTestimonialsService = class VideoTestimonialsService {
    tenantPrisma;
    sendGate;
    activity;
    s3;
    constructor(tenantPrisma, sendGate, activity, s3) {
        this.tenantPrisma = tenantPrisma;
        this.sendGate = sendGate;
        this.activity = activity;
        this.s3 = s3;
    }
    async request(businessId, dto) {
        const customer = await this.tenantPrisma.client.customer.findUnique({
            where: { id: dto.customerId },
        });
        if (!customer) {
            throw new common_1.NotFoundException('Customer not found');
        }
        const token = (0, review_token_util_1.generateReviewToken)();
        const testimonial = await this.tenantPrisma.client.videoTestimonial.create({
            data: {
                businessId,
                customerId: dto.customerId,
                token,
                caption: dto.caption,
            },
        });
        await this.sendGate
            .send({
            businessId,
            customerId: dto.customerId,
            templateKey: 'video_testimonial_request',
            variables: { uploadUrl: `/t/${token}` },
        })
            .catch(() => undefined);
        return testimonial;
    }
    async list(status) {
        const rows = await this.tenantPrisma.client.videoTestimonial.findMany({
            where: { status },
            orderBy: { createdAt: 'desc' },
            include: { customer: true },
        });
        return Promise.all(rows.map((row) => this.withVideoUrl(row)));
    }
    async findOne(id) {
        const row = await this.findRow(id);
        return this.withVideoUrl(row);
    }
    async approve(id, actorUserId) {
        const testimonial = await this.findRow(id);
        if (testimonial.status !== prisma_1.VideoTestimonialStatus.submitted) {
            throw new app_exception_1.AppException(video_testimonials_constants_1.VIDEO_TESTIMONIAL_ERROR_CODES.NOT_SUBMITTED, `Testimonial is "${testimonial.status}", expected "submitted"`, common_1.HttpStatus.CONFLICT);
        }
        const updated = await this.tenantPrisma.client.videoTestimonial.update({
            where: { id },
            data: {
                status: prisma_1.VideoTestimonialStatus.approved,
                approvedByUserId: actorUserId,
            },
        });
        await this.activity.record(testimonial.businessId, {
            type: 'review',
            description: `Video testimonial approved${testimonial.customerId ? '' : ' (anonymous)'}`,
            entityType: 'VideoTestimonial',
            entityId: id,
            actorUserId,
        });
        return this.withVideoUrl(updated);
    }
    async reject(id, dto, actorUserId) {
        const testimonial = await this.findRow(id);
        if (testimonial.status !== prisma_1.VideoTestimonialStatus.submitted) {
            throw new app_exception_1.AppException(video_testimonials_constants_1.VIDEO_TESTIMONIAL_ERROR_CODES.NOT_SUBMITTED, `Testimonial is "${testimonial.status}", expected "submitted"`, common_1.HttpStatus.CONFLICT);
        }
        return this.tenantPrisma.client.videoTestimonial.update({
            where: { id },
            data: {
                status: prisma_1.VideoTestimonialStatus.rejected,
                approvedByUserId: actorUserId,
                caption: dto.reason
                    ? `${testimonial.caption ?? ''}\n\nRejected: ${dto.reason}`.trim()
                    : testimonial.caption,
            },
        });
    }
    async withVideoUrl(row) {
        const videoUrl = row.videoKey
            ? await this.s3.getSignedDownloadUrl(row.videoKey)
            : null;
        return { ...row, videoUrl };
    }
    async findRow(id) {
        const testimonial = await this.tenantPrisma.client.videoTestimonial.findUnique({
            where: { id },
        });
        if (!testimonial) {
            throw new app_exception_1.AppException(video_testimonials_constants_1.VIDEO_TESTIMONIAL_ERROR_CODES.NOT_FOUND, 'Video testimonial not found', common_1.HttpStatus.NOT_FOUND);
        }
        return testimonial;
    }
};
exports.VideoTestimonialsService = VideoTestimonialsService;
exports.VideoTestimonialsService = VideoTestimonialsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        send_gate_service_1.SendGateService,
        activity_service_1.ActivityService,
        s3_service_1.S3Service])
], VideoTestimonialsService);
//# sourceMappingURL=video-testimonials.service.js.map