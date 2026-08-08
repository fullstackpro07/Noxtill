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
var KeywordRankProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.KeywordRankProcessor = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const serp_rank_service_1 = require("../serp-rank.service");
const marketing_constants_1 = require("../marketing.constants");
let KeywordRankProcessor = KeywordRankProcessor_1 = class KeywordRankProcessor extends bullmq_1.WorkerHost {
    prisma;
    serpRank;
    logger = new common_1.Logger(KeywordRankProcessor_1.name);
    constructor(prisma, serpRank) {
        super();
        this.prisma = prisma;
        this.serpRank = serpRank;
    }
    async process(job) {
        if (job.name !== 'tick')
            return;
        return this.runCheck();
    }
    async runCheck() {
        const keywords = await this.prisma.trackedKeyword.findMany({
            include: { business: true },
        });
        for (const keyword of keywords) {
            try {
                await this.checkOne(keyword.businessId, keyword.id, keyword.keyword, keyword.business.name);
            }
            catch (error) {
                this.logger.warn(`Keyword rank check failed for keyword=${keyword.id}: ${error.message}`);
            }
        }
        this.logger.debug(`Keyword rank check evaluated ${keywords.length} keyword(s)`);
    }
    async checkOne(businessId, keywordId, keyword, businessNameOverride) {
        const businessName = businessNameOverride ??
            (await this.prisma.business.findUniqueOrThrow({ where: { id: businessId } })).name;
        const rank = await this.serpRank.fetchRank(keyword, businessName);
        await this.prisma.keywordRankSnapshot.create({
            data: { keywordId, rank },
        });
    }
};
exports.KeywordRankProcessor = KeywordRankProcessor;
exports.KeywordRankProcessor = KeywordRankProcessor = KeywordRankProcessor_1 = __decorate([
    (0, bullmq_1.Processor)(marketing_constants_1.KEYWORD_RANK_QUEUE),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        serp_rank_service_1.SerpRankService])
], KeywordRankProcessor);
//# sourceMappingURL=keyword-rank.processor.js.map