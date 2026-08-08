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
exports.ReviewsService = void 0;
const common_1 = require("@nestjs/common");
const nestjs_cls_1 = require("nestjs-cls");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const app_exception_1 = require("../common/filters/app.exception");
const ai_infra_service_1 = require("../ai/ai-infra.service");
const send_gate_service_1 = require("../messaging/send-gate.service");
const tenant_constants_1 = require("../common/tenancy/tenant.constants");
const REVIEWS_ERROR_CODES = {
    REVIEW_NOT_FOUND: 'reviews.not_found',
    NO_CUSTOMER_TO_REPLY_TO: 'reviews.no_customer_to_reply_to',
};
const SPARKLINE_WEEKS = 8;
const CONVERSION_WINDOW_DAYS = 30;
function round2(value) {
    return Math.round(value * 100) / 100;
}
let ReviewsService = class ReviewsService {
    tenantPrisma;
    aiInfra;
    sendGate;
    cls;
    constructor(tenantPrisma, aiInfra, sendGate, cls) {
        this.tenantPrisma = tenantPrisma;
        this.aiInfra = aiInfra;
        this.sendGate = sendGate;
        this.cls = cls;
    }
    async list(query) {
        const ratingFilter = query.rating ? { stars: Number(query.rating) } : {};
        const wantsExternal = !query.status && (!query.platform || query.platform !== 'private');
        const wantsPrivate = !query.platform || query.platform === 'private';
        const [external, feedback] = await Promise.all([
            wantsExternal
                ? this.tenantPrisma.client.externalReview.findMany({
                    where: {
                        ...ratingFilter,
                        ...(query.platform ? { platform: query.platform } : {}),
                    },
                    orderBy: { createdAt: 'desc' },
                })
                : Promise.resolve([]),
            wantsPrivate
                ? this.tenantPrisma.client.privateFeedback.findMany({
                    where: {
                        ...ratingFilter,
                        ...(query.status ? { status: query.status } : {}),
                    },
                    orderBy: { createdAt: 'desc' },
                })
                : Promise.resolve([]),
        ]);
        const combined = [
            ...external.map((r) => ({ ...r, source: 'external' })),
            ...feedback.map((r) => ({ ...r, source: 'private' })),
        ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
        return combined;
    }
    async updateFeedback(id, dto) {
        const existing = await this.tenantPrisma.client.privateFeedback.findUnique({
            where: { id },
        });
        if (!existing) {
            throw new common_1.NotFoundException('Feedback not found');
        }
        return this.tenantPrisma.client.privateFeedback.update({
            where: { id },
            data: {
                status: dto.status,
                assignedTo: dto.assignedTo,
                resolutionNote: dto.resolutionNote,
            },
        });
    }
    async reply(id, replyText) {
        const review = await this.tenantPrisma.client.externalReview.findUnique({
            where: { id },
        });
        if (!review) {
            throw new app_exception_1.AppException(REVIEWS_ERROR_CODES.REVIEW_NOT_FOUND, 'Review not found', common_1.HttpStatus.NOT_FOUND);
        }
        return this.tenantPrisma.client.externalReview.update({
            where: { id },
            data: { replyText },
        });
    }
    async aiDraft(id) {
        const review = await this.tenantPrisma.client.externalReview.findUnique({
            where: { id },
        });
        if (!review) {
            throw new app_exception_1.AppException(REVIEWS_ERROR_CODES.REVIEW_NOT_FOUND, 'Review not found', common_1.HttpStatus.NOT_FOUND);
        }
        const prompt = `A customer left this ${review.stars}-star review: "${review.text ?? ''}". ` +
            'Write a short, warm, professional business-owner reply IN THE SAME LANGUAGE the review ' +
            'was written in. No preamble — return only the reply text.';
        const businessId = this.cls.get(tenant_constants_1.CLS_KEY_BUSINESS_ID);
        let draft;
        try {
            draft = await this.aiInfra.complete(businessId, prompt);
        }
        catch (error) {
            if (error instanceof app_exception_1.AppException) {
                throw error;
            }
            throw new app_exception_1.AppException('AI_UNAVAILABLE', 'The AI assistant is not available right now — please try again later.', common_1.HttpStatus.SERVICE_UNAVAILABLE);
        }
        return { draft };
    }
    async replyToFeedback(id, message) {
        const feedback = await this.tenantPrisma.client.privateFeedback.findUnique({ where: { id } });
        if (!feedback) {
            throw new app_exception_1.AppException(REVIEWS_ERROR_CODES.REVIEW_NOT_FOUND, 'Feedback not found', common_1.HttpStatus.NOT_FOUND);
        }
        if (!feedback.customerId) {
            throw new app_exception_1.AppException(REVIEWS_ERROR_CODES.NO_CUSTOMER_TO_REPLY_TO, 'This feedback has no linked customer to reply to', common_1.HttpStatus.BAD_REQUEST);
        }
        return this.sendGate.send({
            businessId: feedback.businessId,
            customerId: feedback.customerId,
            templateKey: 'feedback_reply',
            variables: { message },
        });
    }
    async getSummary() {
        const external = await this.tenantPrisma.client.externalReview.findMany({
            orderBy: { createdAt: 'desc' },
        });
        const averageRating = external.length
            ? round2(external.reduce((sum, r) => sum + r.stars, 0) / external.length)
            : 0;
        const distribution = [5, 4, 3, 2, 1].map((stars) => ({
            stars,
            count: external.filter((r) => r.stars === stars).length,
        }));
        const sparkline = this.buildWeeklySparkline(external);
        const since = new Date(Date.now() - CONVERSION_WINDOW_DAYS * 24 * 60 * 60 * 1000);
        const [requested, received] = await Promise.all([
            this.tenantPrisma.client.reviewRequest.count({
                where: { createdAt: { gte: since } },
            }),
            this.tenantPrisma.client.reviewRequest.count({
                where: { createdAt: { gte: since }, respondedAt: { not: null } },
            }),
        ]);
        const latest = external[0];
        return {
            averageRating,
            distribution,
            sparkline,
            conversion: { requested, received },
            latestReview: latest
                ? {
                    id: latest.id,
                    platform: latest.platform,
                    author: latest.author,
                    stars: latest.stars,
                    text: latest.text,
                    createdAt: latest.createdAt,
                }
                : null,
        };
    }
    buildWeeklySparkline(reviews) {
        const now = Date.now();
        const weekMs = 7 * 24 * 60 * 60 * 1000;
        const buckets = new Map();
        for (const review of reviews) {
            const ageMs = now - review.createdAt.getTime();
            const weekIndex = SPARKLINE_WEEKS - 1 - Math.floor(ageMs / weekMs);
            if (weekIndex < 0 || weekIndex >= SPARKLINE_WEEKS)
                continue;
            const bucket = buckets.get(weekIndex) ?? [];
            bucket.push(review.stars);
            buckets.set(weekIndex, bucket);
        }
        return [...buckets.keys()]
            .sort((a, b) => a - b)
            .map((key) => {
            const bucket = buckets.get(key);
            return round2(bucket.reduce((sum, v) => sum + v, 0) / bucket.length);
        });
    }
};
exports.ReviewsService = ReviewsService;
exports.ReviewsService = ReviewsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        ai_infra_service_1.AiInfraService,
        send_gate_service_1.SendGateService,
        nestjs_cls_1.ClsService])
], ReviewsService);
//# sourceMappingURL=reviews.service.js.map