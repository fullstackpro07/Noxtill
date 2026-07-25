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
const tenant_constants_1 = require("../common/tenancy/tenant.constants");
const REVIEWS_ERROR_CODES = {
    REVIEW_NOT_FOUND: 'reviews.not_found',
};
let ReviewsService = class ReviewsService {
    tenantPrisma;
    aiInfra;
    cls;
    constructor(tenantPrisma, aiInfra, cls) {
        this.tenantPrisma = tenantPrisma;
        this.aiInfra = aiInfra;
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
        const draft = await this.aiInfra.complete(businessId, prompt);
        return { draft };
    }
};
exports.ReviewsService = ReviewsService;
exports.ReviewsService = ReviewsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        ai_infra_service_1.AiInfraService,
        nestjs_cls_1.ClsService])
], ReviewsService);
//# sourceMappingURL=reviews.service.js.map