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
exports.BusinessTypesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const ai_infra_service_1 = require("../ai/ai-infra.service");
const app_exception_1 = require("../common/filters/app.exception");
const OTHER_CATEGORY_KEY = 'other';
function slugify(label) {
    return label
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}
let BusinessTypesService = class BusinessTypesService {
    prisma;
    aiInfra;
    constructor(prisma, aiInfra) {
        this.prisma = prisma;
        this.aiInfra = aiInfra;
    }
    async search(query) {
        if (!query) {
            return this.prisma.businessType.findMany({ orderBy: { label: 'asc' } });
        }
        return this.prisma.businessType.findMany({
            where: { label: { contains: query, mode: 'insensitive' } },
            orderBy: { label: 'asc' },
        });
    }
    async aiMap(dto) {
        const existing = await this.prisma.businessType.findMany({
            select: { key: true, label: true },
        });
        const prompt = [
            `A new business signed up describing itself as: "${dto.description}".`,
            `Existing business types: ${existing.map((t) => `${t.key} (${t.label})`).join(', ')}.`,
            "If one of these existing types is a good fit, reply with EXACTLY that type's key and nothing else.",
            'If none fit, reply with EXACTLY: NEW: <a short 2-4 word label for this business type>.',
        ].join('\n\n');
        let response;
        try {
            response = (await this.aiInfra.complete(undefined, prompt)).trim();
        }
        catch (error) {
            if (error instanceof app_exception_1.AppException) {
                throw error;
            }
            throw new app_exception_1.AppException('AI_UNAVAILABLE', 'The AI assistant is not available right now — please try again later.', common_1.HttpStatus.SERVICE_UNAVAILABLE);
        }
        const existingMatch = existing.find((t) => t.key === response);
        if (existingMatch) {
            return this.prisma.businessType.findUniqueOrThrow({
                where: { key: existingMatch.key },
            });
        }
        const newLabel = response.startsWith('NEW:')
            ? response.slice(4).trim()
            : response;
        const key = slugify(newLabel) || `ai_type_${Date.now()}`;
        const otherCategory = await this.prisma.businessCategory.upsert({
            where: { key: OTHER_CATEGORY_KEY },
            create: { key: OTHER_CATEGORY_KEY, name: 'Other' },
            update: {},
        });
        return this.prisma.businessType.upsert({
            where: { key },
            create: {
                key,
                label: newLabel,
                aiGenerated: true,
                categoryId: otherCategory.id,
            },
            update: {},
        });
    }
};
exports.BusinessTypesService = BusinessTypesService;
exports.BusinessTypesService = BusinessTypesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        ai_infra_service_1.AiInfraService])
], BusinessTypesService);
//# sourceMappingURL=business-types.service.js.map