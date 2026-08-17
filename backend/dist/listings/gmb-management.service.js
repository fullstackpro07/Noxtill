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
exports.GmbManagementService = void 0;
const common_1 = require("@nestjs/common");
const axios_1 = __importDefault(require("axios"));
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const app_exception_1 = require("../common/filters/app.exception");
const integrations_service_1 = require("../integrations/integrations.service");
const gmb_connector_1 = require("../integrations/connectors/gmb.connector");
const listings_constants_1 = require("./listings.constants");
const prisma_1 = require("../../generated/prisma");
let GmbManagementService = class GmbManagementService {
    tenantPrisma;
    integrations;
    gmbConnector;
    constructor(tenantPrisma, integrations, gmbConnector) {
        this.tenantPrisma = tenantPrisma;
        this.integrations = integrations;
        this.gmbConnector = gmbConnector;
    }
    async listAccounts(businessId) {
        const { tokens } = await this.requireGmbConnection(businessId);
        return this.gmbConnector.sync(tokens);
    }
    async listLocations(businessId, accountName) {
        const { tokens } = await this.requireGmbConnection(businessId);
        return this.gmbConnector.listLocations(tokens, accountName);
    }
    async selectLocation(businessId, locationId) {
        const { meta } = await this.requireGmbConnection(businessId);
        await this.tenantPrisma.client.integration.update({
            where: {
                businessId_provider: { businessId, provider: prisma_1.IntegrationProvider.gmb },
            },
            data: { meta: { ...meta, locationId } },
        });
        return { locationId };
    }
    listPosts(businessId) {
        return this.tenantPrisma.client.gmbPost.findMany({
            where: { businessId },
            orderBy: { createdAt: 'desc' },
        });
    }
    createPost(businessId, dto) {
        return this.tenantPrisma.client.gmbPost.create({
            data: {
                businessId,
                text: dto.text,
                photoUrl: dto.photoUrl,
                buttonType: dto.buttonType,
                scheduledFor: dto.scheduledFor ? new Date(dto.scheduledFor) : undefined,
                status: prisma_1.GmbPostStatus.draft,
            },
        });
    }
    async deletePost(businessId, postId) {
        await this.findPost(businessId, postId);
        await this.tenantPrisma.client.gmbPost.delete({ where: { id: postId } });
    }
    async publishPost(businessId, postId) {
        const post = await this.findPost(businessId, postId);
        const { tokens, meta } = await this.requireGmbConnection(businessId);
        const locationId = meta.locationId;
        if (!locationId) {
            throw new app_exception_1.AppException(listings_constants_1.LISTING_ERROR_CODES.GMB_NOT_CONNECTED, 'No GMB location selected for this business — connect a location before publishing', common_1.HttpStatus.BAD_REQUEST);
        }
        try {
            const response = await axios_1.default.post(`https://mybusiness.googleapis.com/v4/${locationId}/localPosts`, {
                summary: post.text,
                callToAction: post.buttonType
                    ? { actionType: post.buttonType }
                    : undefined,
                media: post.photoUrl
                    ? [{ mediaFormat: 'PHOTO', sourceUrl: post.photoUrl }]
                    : undefined,
            }, { headers: { Authorization: `Bearer ${tokens.accessToken}` } });
            return this.tenantPrisma.client.gmbPost.update({
                where: { id: postId },
                data: {
                    status: prisma_1.GmbPostStatus.published,
                    externalId: response.data.name,
                },
            });
        }
        catch (error) {
            await this.tenantPrisma.client.gmbPost.update({
                where: { id: postId },
                data: { status: prisma_1.GmbPostStatus.failed },
            });
            throw new app_exception_1.AppException(listings_constants_1.LISTING_ERROR_CODES.GMB_NOT_CONNECTED, `Failed to publish to GMB: ${error.message}`, common_1.HttpStatus.BAD_GATEWAY);
        }
    }
    listPhotos(businessId) {
        return this.tenantPrisma.client.gmbPhoto.findMany({
            where: { businessId },
            orderBy: { createdAt: 'desc' },
        });
    }
    addPhoto(businessId, dto) {
        return this.tenantPrisma.client.gmbPhoto.create({
            data: { businessId, url: dto.url, category: dto.category },
        });
    }
    async removePhoto(businessId, photoId) {
        const photo = await this.tenantPrisma.client.gmbPhoto.findUnique({
            where: { id: photoId },
        });
        if (!photo || photo.businessId !== businessId) {
            throw new common_1.NotFoundException('GMB photo not found');
        }
        await this.tenantPrisma.client.gmbPhoto.delete({ where: { id: photoId } });
    }
    listQna(businessId) {
        return this.tenantPrisma.client.gmbQna.findMany({
            where: { businessId },
            orderBy: { createdAt: 'desc' },
        });
    }
    async syncQuestions(businessId) {
        const { tokens, meta } = await this.requireGmbConnection(businessId);
        const locationId = meta.locationId;
        if (!locationId) {
            throw new app_exception_1.AppException(listings_constants_1.LISTING_ERROR_CODES.GMB_NOT_CONNECTED, 'No GMB location selected for this business — connect a location before syncing Q&A', common_1.HttpStatus.BAD_REQUEST);
        }
        const response = await axios_1.default.get(`https://mybusinessqanda.googleapis.com/v1/${locationId}/questions`, { headers: { Authorization: `Bearer ${tokens.accessToken}` } });
        const questions = response.data.questions ?? [];
        for (const question of questions) {
            await this.tenantPrisma.client.gmbQna.upsert({
                where: { externalId: question.name },
                create: {
                    businessId,
                    question: question.text,
                    externalId: question.name,
                },
                update: { question: question.text },
            });
        }
        return questions.length;
    }
    async answerQuestion(businessId, qnaId, answer) {
        const qna = await this.tenantPrisma.client.gmbQna.findUnique({
            where: { id: qnaId },
        });
        if (!qna || qna.businessId !== businessId) {
            throw new common_1.NotFoundException('GMB question not found');
        }
        if (!qna.externalId) {
            throw new app_exception_1.AppException(listings_constants_1.LISTING_ERROR_CODES.GMB_QNA_NOT_FOUND, 'This question has no real GMB externalId to answer against', common_1.HttpStatus.BAD_REQUEST);
        }
        const { tokens } = await this.requireGmbConnection(businessId);
        await axios_1.default.post(`https://mybusinessqanda.googleapis.com/v1/${qna.externalId}/answers:upsert`, { answer: { text: answer } }, { headers: { Authorization: `Bearer ${tokens.accessToken}` } });
        return this.tenantPrisma.client.gmbQna.update({
            where: { id: qnaId },
            data: { answer, answeredAt: new Date() },
        });
    }
    listInsights(businessId) {
        return this.tenantPrisma.client.gmbInsightsSnapshot.findMany({
            where: { businessId },
            orderBy: { date: 'desc' },
            take: 90,
        });
    }
    async pullInsights(businessId) {
        const { tokens, meta } = await this.requireGmbConnection(businessId);
        const locationId = meta.locationId;
        if (!locationId) {
            throw new app_exception_1.AppException(listings_constants_1.LISTING_ERROR_CODES.GMB_NOT_CONNECTED, 'No GMB location selected for this business — connect a location before pulling insights', common_1.HttpStatus.BAD_REQUEST);
        }
        const yesterday = new Date();
        yesterday.setUTCDate(yesterday.getUTCDate() - 1);
        yesterday.setUTCHours(0, 0, 0, 0);
        const response = await axios_1.default.get(`https://businessprofileperformance.googleapis.com/v1/${locationId}:fetchMultiDailyMetricsTimeSeries`, {
            headers: { Authorization: `Bearer ${tokens.accessToken}` },
            params: {
                dailyMetrics: [
                    'BUSINESS_IMPRESSIONS_DESKTOP_MAPS',
                    'BUSINESS_IMPRESSIONS_MOBILE_MAPS',
                    'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH',
                    'BUSINESS_IMPRESSIONS_MOBILE_SEARCH',
                    'CALL_CLICKS',
                    'BUSINESS_DIRECTION_REQUESTS',
                ],
            },
        });
        const metrics = this.extractMetrics(response.data);
        return this.tenantPrisma.client.gmbInsightsSnapshot.upsert({
            where: { businessId_date: { businessId, date: yesterday } },
            create: { businessId, date: yesterday, ...metrics },
            update: metrics,
        });
    }
    extractMetrics(data) {
        const sum = (metric) => (data.multiDailyMetricTimeSeries ?? [])
            .flatMap((series) => series.dailyMetricTimeSeries ?? [])
            .filter((series) => series.dailyMetric === metric)
            .flatMap((series) => series.timeSeries?.datedValues ?? [])
            .reduce((total, entry) => total + Number(entry.value ?? 0), 0);
        return {
            views: sum('BUSINESS_IMPRESSIONS_DESKTOP_MAPS') +
                sum('BUSINESS_IMPRESSIONS_MOBILE_MAPS'),
            searches: sum('BUSINESS_IMPRESSIONS_DESKTOP_SEARCH') +
                sum('BUSINESS_IMPRESSIONS_MOBILE_SEARCH'),
            calls: sum('CALL_CLICKS'),
            directionRequests: sum('BUSINESS_DIRECTION_REQUESTS'),
        };
    }
    async findPost(businessId, postId) {
        const post = await this.tenantPrisma.client.gmbPost.findUnique({
            where: { id: postId },
        });
        if (!post || post.businessId !== businessId) {
            throw new common_1.NotFoundException('GMB post not found');
        }
        return post;
    }
    async requireGmbConnection(businessId) {
        const integration = await this.tenantPrisma.client.integration.findUnique({
            where: {
                businessId_provider: { businessId, provider: prisma_1.IntegrationProvider.gmb },
            },
        });
        const tokens = await this.integrations.getTokens(businessId, prisma_1.IntegrationProvider.gmb);
        if (!integration || !tokens) {
            throw new app_exception_1.AppException(listings_constants_1.LISTING_ERROR_CODES.GMB_NOT_CONNECTED, 'Connect Google Business Profile before managing GMB content', common_1.HttpStatus.BAD_REQUEST);
        }
        return { tokens, meta: integration.meta };
    }
};
exports.GmbManagementService = GmbManagementService;
exports.GmbManagementService = GmbManagementService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        integrations_service_1.IntegrationsService,
        gmb_connector_1.GmbConnector])
], GmbManagementService);
//# sourceMappingURL=gmb-management.service.js.map