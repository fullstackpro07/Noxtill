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
exports.KeywordsService = void 0;
const common_1 = require("@nestjs/common");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const app_exception_1 = require("../common/filters/app.exception");
const marketing_constants_1 = require("./marketing.constants");
const keyword_rank_processor_1 = require("./jobs/keyword-rank.processor");
const HISTORY_CHECKS = 12;
let KeywordsService = class KeywordsService {
    tenantPrisma;
    rankProcessor;
    constructor(tenantPrisma, rankProcessor) {
        this.tenantPrisma = tenantPrisma;
        this.rankProcessor = rankProcessor;
    }
    async list() {
        const keywords = await this.tenantPrisma.client.trackedKeyword.findMany({
            orderBy: { createdAt: 'asc' },
            include: { snapshots: { orderBy: { capturedAt: 'desc' }, take: 1 } },
        });
        return keywords.map((k) => ({
            id: k.id,
            keyword: k.keyword,
            latestRank: k.snapshots[0]?.rank ?? null,
            lastCheckedAt: k.snapshots[0]?.capturedAt.toISOString() ?? null,
        }));
    }
    async create(businessId, dto) {
        const count = await this.tenantPrisma.client.trackedKeyword.count();
        if (count >= marketing_constants_1.MAX_TRACKED_KEYWORDS) {
            throw new app_exception_1.AppException(marketing_constants_1.MARKETING_ERROR_CODES.KEYWORD_LIMIT_REACHED, `You can track at most ${marketing_constants_1.MAX_TRACKED_KEYWORDS} keywords`, common_1.HttpStatus.FORBIDDEN);
        }
        const existing = await this.tenantPrisma.client.trackedKeyword.findFirst({
            where: { keyword: dto.keyword },
        });
        if (existing) {
            throw new app_exception_1.AppException(marketing_constants_1.MARKETING_ERROR_CODES.KEYWORD_ALREADY_TRACKED, 'This keyword is already being tracked', common_1.HttpStatus.CONFLICT);
        }
        return this.tenantPrisma.client.trackedKeyword.create({
            data: { businessId, keyword: dto.keyword },
        });
    }
    async remove(id) {
        const existing = await this.tenantPrisma.client.trackedKeyword.findUnique({
            where: { id },
        });
        if (!existing) {
            throw new common_1.NotFoundException('Tracked keyword not found');
        }
        await this.tenantPrisma.client.trackedKeyword.delete({ where: { id } });
        return { success: true };
    }
    async history(id) {
        const keyword = await this.tenantPrisma.client.trackedKeyword.findUnique({
            where: { id },
        });
        if (!keyword) {
            throw new common_1.NotFoundException('Tracked keyword not found');
        }
        const snapshots = await this.tenantPrisma.client.keywordRankSnapshot.findMany({
            where: { keywordId: id },
            orderBy: { capturedAt: 'desc' },
            take: HISTORY_CHECKS,
        });
        return snapshots
            .reverse()
            .map((s) => ({ rank: s.rank, capturedAt: s.capturedAt.toISOString() }));
    }
    async triggerCheck(businessId, id) {
        const keyword = await this.tenantPrisma.client.trackedKeyword.findUnique({
            where: { id },
        });
        if (!keyword) {
            throw new common_1.NotFoundException('Tracked keyword not found');
        }
        await this.rankProcessor.checkOne(businessId, keyword.id, keyword.keyword);
        return this.history(id);
    }
};
exports.KeywordsService = KeywordsService;
exports.KeywordsService = KeywordsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        keyword_rank_processor_1.KeywordRankProcessor])
], KeywordsService);
//# sourceMappingURL=keywords.service.js.map