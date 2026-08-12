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
var AiInsightsProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiInsightsProcessor = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const ai_insights_service_1 = require("../ai-insights.service");
const dashboard_constants_1 = require("../dashboard.constants");
let AiInsightsProcessor = AiInsightsProcessor_1 = class AiInsightsProcessor extends bullmq_1.WorkerHost {
    prisma;
    aiInsightsService;
    logger = new common_1.Logger(AiInsightsProcessor_1.name);
    constructor(prisma, aiInsightsService) {
        super();
        this.prisma = prisma;
        this.aiInsightsService = aiInsightsService;
    }
    async process(job) {
        if (job.name !== 'tick')
            return;
        return this.runGeneration();
    }
    async runGeneration() {
        const businesses = await this.prisma.business.findMany({
            select: { id: true },
        });
        let totalInsights = 0;
        for (const { id: businessId } of businesses) {
            try {
                totalInsights +=
                    await this.aiInsightsService.generateForBusiness(businessId);
            }
            catch (error) {
                this.logger.warn(`AI insight generation failed for business ${businessId}: ${error.message}`);
            }
        }
        this.logger.debug(`AI insights generated ${totalInsights} insight(s) across ${businesses.length} business(es)`);
    }
};
exports.AiInsightsProcessor = AiInsightsProcessor;
exports.AiInsightsProcessor = AiInsightsProcessor = AiInsightsProcessor_1 = __decorate([
    (0, bullmq_1.Processor)(dashboard_constants_1.AI_INSIGHTS_QUEUE),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        ai_insights_service_1.AiInsightsService])
], AiInsightsProcessor);
//# sourceMappingURL=ai-insights.processor.js.map