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
exports.AiInfraService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
const prisma_service_1 = require("../prisma/prisma.service");
const app_exception_1 = require("../common/filters/app.exception");
const claude_client_1 = require("./claude.client");
const ai_infra_constants_1 = require("./ai-infra.constants");
let AiInfraService = class AiInfraService {
    prisma;
    claude;
    config;
    constructor(prisma, claude, config) {
        this.prisma = prisma;
        this.claude = claude;
        this.config = config;
    }
    async complete(businessId, prompt, temperature = 0) {
        const result = await this.createMessage(businessId, 'complete', {
            messages: [{ role: 'user', content: prompt }],
            temperature,
        });
        const text = result.content.find((block) => block.type === 'text')?.text;
        return text ?? '';
    }
    async generateImage(businessId, prompt) {
        await this.checkGuardrails(businessId);
        const response = await axios_1.default.post('https://api.openai.com/v1/images/generations', { prompt, n: 1, size: '1024x1024' }, {
            headers: {
                Authorization: `Bearer ${this.config.get('OPENAI_API_KEY') ?? ''}`,
            },
        });
        await this.prisma.aiCallLog.create({
            data: {
                businessId,
                kind: 'generate_image',
                inputTokens: 0,
                outputTokens: 0,
                estimatedCostUsd: ai_infra_constants_1.IMAGE_GENERATION_COST_USD,
            },
        });
        return { url: response.data.data[0].url };
    }
    async createMessage(businessId, kind, params, toolCalls) {
        await this.checkGuardrails(businessId);
        const result = await this.claude.createMessage(params);
        await this.recordUsage(businessId, kind, result, toolCalls);
        return result;
    }
    async checkGuardrails(businessId) {
        if (!businessId)
            return;
        await this.enforceRateLimit(businessId);
        await this.enforceCostCap(businessId);
    }
    async recordUsage(businessId, kind, result, toolCalls) {
        await this.logCall(businessId, kind, result, toolCalls);
    }
    async enforceRateLimit(businessId) {
        const business = await this.prisma.business.findUniqueOrThrow({
            where: { id: businessId },
        });
        const since = new Date(Date.now() - ai_infra_constants_1.RATE_LIMIT_WINDOW_MS);
        const recentCalls = await this.prisma.aiCallLog.count({
            where: { businessId, createdAt: { gte: since } },
        });
        if (recentCalls >= business.aiRateLimitPerMinute) {
            throw new app_exception_1.AppException(ai_infra_constants_1.AI_ERROR_CODES.RATE_LIMITED, 'Too many AI requests — please wait a moment and try again.', common_1.HttpStatus.TOO_MANY_REQUESTS);
        }
    }
    async enforceCostCap(businessId) {
        const business = await this.prisma.business.findUniqueOrThrow({
            where: { id: businessId },
        });
        const monthStart = new Date();
        monthStart.setUTCDate(1);
        monthStart.setUTCHours(0, 0, 0, 0);
        const agg = await this.prisma.aiCallLog.aggregate({
            where: { businessId, createdAt: { gte: monthStart } },
            _sum: { estimatedCostUsd: true },
        });
        const spent = Number(agg._sum.estimatedCostUsd ?? 0);
        if (spent >= Number(business.aiMonthlyCostCapUsd)) {
            throw new app_exception_1.AppException(ai_infra_constants_1.AI_ERROR_CODES.COST_CAP_EXCEEDED, 'This business has reached its monthly AI usage cap.', common_1.HttpStatus.FORBIDDEN);
        }
    }
    async logCall(businessId, kind, result, toolCalls) {
        const cost = result.inputTokens * ai_infra_constants_1.HAIKU_INPUT_COST_PER_TOKEN +
            result.outputTokens * ai_infra_constants_1.HAIKU_OUTPUT_COST_PER_TOKEN;
        await this.prisma.aiCallLog.create({
            data: {
                businessId,
                kind,
                inputTokens: result.inputTokens,
                outputTokens: result.outputTokens,
                estimatedCostUsd: cost,
                toolCalls: toolCalls,
            },
        });
    }
};
exports.AiInfraService = AiInfraService;
exports.AiInfraService = AiInfraService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        claude_client_1.ClaudeClient,
        config_1.ConfigService])
], AiInfraService);
//# sourceMappingURL=ai-infra.service.js.map