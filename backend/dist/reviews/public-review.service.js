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
exports.PublicReviewService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const send_gate_service_1 = require("../messaging/send-gate.service");
const activity_service_1 = require("../activity/activity.service");
const app_exception_1 = require("../common/filters/app.exception");
const review_token_util_1 = require("./review-token.util");
const prisma_1 = require("../../generated/prisma");
const TOKEN_EXPIRY_DAYS = 30;
const QR_DAILY_CAP_PER_BUSINESS = 200;
let PublicReviewService = class PublicReviewService {
    prisma;
    sendGate;
    activity;
    constructor(prisma, sendGate, activity) {
        this.prisma = prisma;
        this.sendGate = sendGate;
        this.activity = activity;
    }
    async mintAnonymousLink(slug) {
        const business = await this.prisma.business.findUnique({ where: { slug } });
        if (!business) {
            throw new common_1.NotFoundException('Business not found');
        }
        const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recentQrCount = await this.prisma.reviewRequest.count({
            where: {
                businessId: business.id,
                source: 'qr',
                createdAt: { gte: since },
            },
        });
        if (recentQrCount >= QR_DAILY_CAP_PER_BUSINESS) {
            throw new app_exception_1.AppException('REVIEW_QR_DAILY_CAP_REACHED', 'Too many review links have been requested today — please try again tomorrow.', common_1.HttpStatus.TOO_MANY_REQUESTS);
        }
        const token = (0, review_token_util_1.generateReviewToken)();
        await this.prisma.reviewRequest.create({
            data: { businessId: business.id, token, source: 'qr' },
        });
        return { token };
    }
    async getWidget(slug) {
        const business = await this.prisma.business.findUnique({ where: { slug } });
        if (!business) {
            throw new common_1.NotFoundException('Business not found');
        }
        const reviews = await this.prisma.externalReview.findMany({
            where: { businessId: business.id, stars: { gte: 4 } },
            orderBy: { createdAt: 'desc' },
            take: 20,
            select: {
                author: true,
                stars: true,
                text: true,
                createdAt: true,
                platform: true,
            },
        });
        return {
            businessName: business.name,
            branding: business.branding,
            reviews,
        };
    }
    async getByToken(token) {
        const reviewRequest = await this.loadValid(token);
        return {
            businessName: reviewRequest.business.name,
            branding: reviewRequest.business.branding,
        };
    }
    async submit(token, dto) {
        const reviewRequest = await this.loadValid(token);
        const routedTo = dto.stars >= 4 ? prisma_1.ReviewRoute.public : prisma_1.ReviewRoute.private;
        await this.prisma.reviewRequest.update({
            where: { id: reviewRequest.id },
            data: {
                stars: dto.stars,
                message: dto.message,
                routedTo,
                respondedAt: new Date(),
            },
        });
        if (routedTo === prisma_1.ReviewRoute.private) {
            const feedback = await this.prisma.privateFeedback.create({
                data: {
                    businessId: reviewRequest.businessId,
                    reviewRequestId: reviewRequest.id,
                    customerId: reviewRequest.customerId,
                    stars: dto.stars,
                    message: dto.message,
                },
            });
            await this.activity.record(reviewRequest.businessId, {
                type: 'review',
                description: `${dto.stars}★ review received`,
                entityType: 'ReviewRequest',
                entityId: reviewRequest.id,
            });
            await this.activity.record(reviewRequest.businessId, {
                type: 'complaint',
                description: `New ${dto.stars}★ private feedback`,
                entityType: 'PrivateFeedback',
                entityId: feedback.id,
            });
            await this.alertOwner(reviewRequest.businessId, dto.stars, dto.message);
            return { thankYou: true };
        }
        await this.activity.record(reviewRequest.businessId, {
            type: 'review',
            description: `${dto.stars}★ review received`,
            entityType: 'ReviewRequest',
            entityId: reviewRequest.id,
        });
        if (reviewRequest.business.publicReviewUrl) {
            return { redirect: reviewRequest.business.publicReviewUrl };
        }
        return { thankYou: true };
    }
    async loadValid(token) {
        const reviewRequest = await this.prisma.reviewRequest.findUnique({
            where: { token },
            include: { business: true },
        });
        if (!reviewRequest) {
            throw new common_1.NotFoundException();
        }
        const ageDays = (Date.now() - reviewRequest.createdAt.getTime()) / (1000 * 60 * 60 * 24);
        if (reviewRequest.respondedAt || ageDays > TOKEN_EXPIRY_DAYS) {
            throw new common_1.NotFoundException();
        }
        return reviewRequest;
    }
    async alertOwner(businessId, stars, message) {
        const owner = await this.prisma.businessUser.findFirst({
            where: { businessId, role: prisma_1.Role.owner },
            include: { user: true },
        });
        if (!owner)
            return;
        await this.sendGate
            .send({
            businessId,
            to: {
                phone: owner.user.phone ?? undefined,
                email: owner.user.email ?? undefined,
            },
            templateKey: 'owner_alert',
            variables: {
                alertTitle: 'New private feedback',
                alertBody: `${stars}★ — ${message ?? 'no comment left'}`,
            },
        })
            .catch(() => undefined);
    }
};
exports.PublicReviewService = PublicReviewService;
exports.PublicReviewService = PublicReviewService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        send_gate_service_1.SendGateService,
        activity_service_1.ActivityService])
], PublicReviewService);
//# sourceMappingURL=public-review.service.js.map