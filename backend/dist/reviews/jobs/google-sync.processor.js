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
var GoogleSyncProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.GoogleSyncProcessor = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const google_sync_constants_1 = require("./google-sync.constants");
const prisma_1 = require("../../../generated/prisma");
let GoogleSyncProcessor = GoogleSyncProcessor_1 = class GoogleSyncProcessor extends bullmq_1.WorkerHost {
    prisma;
    logger = new common_1.Logger(GoogleSyncProcessor_1.name);
    constructor(prisma) {
        super();
        this.prisma = prisma;
    }
    async process(job) {
        if (job.name !== 'tick')
            return;
        return this.runSync();
    }
    async runSync() {
        const integrations = await this.prisma.integration.findMany({
            where: {
                provider: prisma_1.IntegrationProvider.gmb,
                status: prisma_1.IntegrationStatus.connected,
            },
        });
        for (const integration of integrations) {
            const reviews = await this.fetchReviews(integration.businessId);
            for (const review of reviews) {
                await this.prisma.externalReview.upsert({
                    where: {
                        businessId_platform_externalId: {
                            businessId: integration.businessId,
                            platform: 'gmb',
                            externalId: review.externalId,
                        },
                    },
                    create: {
                        businessId: integration.businessId,
                        platform: 'gmb',
                        externalId: review.externalId,
                        author: review.author,
                        stars: review.stars,
                        text: review.text,
                    },
                    update: {
                        author: review.author,
                        stars: review.stars,
                        text: review.text,
                    },
                });
            }
            const queuedReplies = await this.prisma.externalReview.findMany({
                where: {
                    businessId: integration.businessId,
                    platform: 'gmb',
                    replyText: { not: null },
                    repliedAt: null,
                },
            });
            for (const review of queuedReplies) {
                await this.pushReply(integration.businessId, review.externalId, review.replyText);
                await this.prisma.externalReview.update({
                    where: { id: review.id },
                    data: { repliedAt: new Date() },
                });
            }
        }
        this.logger.debug(`Google sync evaluated ${integrations.length} connected business(es)`);
    }
    fetchReviews(businessId) {
        void businessId;
        return Promise.resolve([]);
    }
    pushReply(businessId, externalId, replyText) {
        void businessId;
        void externalId;
        void replyText;
        return Promise.resolve();
    }
};
exports.GoogleSyncProcessor = GoogleSyncProcessor;
exports.GoogleSyncProcessor = GoogleSyncProcessor = GoogleSyncProcessor_1 = __decorate([
    (0, bullmq_1.Processor)(google_sync_constants_1.GOOGLE_SYNC_QUEUE),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], GoogleSyncProcessor);
//# sourceMappingURL=google-sync.processor.js.map