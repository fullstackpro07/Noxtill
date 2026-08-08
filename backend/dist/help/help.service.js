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
exports.HelpService = exports.HELP_NOT_FOUND_MESSAGE = void 0;
exports.retrieveHelpPassages = retrieveHelpPassages;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const ai_infra_service_1 = require("../ai/ai-infra.service");
const TOP_K = 3;
const RELEVANCE_THRESHOLD = 0.3;
exports.HELP_NOT_FOUND_MESSAGE = "I couldn't find anything about that in the help docs — try rephrasing, or contact support.";
async function retrieveHelpPassages(prisma, question) {
    const rows = await prisma.$queryRaw `
    SELECT slug, title, url, body,
           (similarity(title, ${question}) * 2 + similarity(body, ${question})) AS score
    FROM help_articles
    ORDER BY score DESC
    LIMIT ${TOP_K}
  `;
    return rows.filter((r) => Number(r.score) > RELEVANCE_THRESHOLD);
}
let HelpService = class HelpService {
    prisma;
    aiInfra;
    constructor(prisma, aiInfra) {
        this.prisma = prisma;
        this.aiInfra = aiInfra;
    }
    async ask(businessId, dto) {
        const passages = await retrieveHelpPassages(this.prisma, dto.question);
        if (passages.length === 0) {
            return { answer: exports.HELP_NOT_FOUND_MESSAGE, sources: [] };
        }
        const passageText = passages
            .map((p, i) => `[${i + 1}] ${p.title} (${p.url})\n${p.body}`)
            .join('\n\n');
        const prompt = [
            `Answer the user's question using ONLY the passages below — never invent information not present here.`,
            `Passages:\n${passageText}`,
            `Question: "${dto.question}"`,
            'Answer in 2-4 short sentences and mention which passage number(s) you used, e.g. "(see [1])".',
            `If none of the passages actually answer the question, reply with EXACTLY: "${exports.HELP_NOT_FOUND_MESSAGE}"`,
        ].join('\n\n');
        const answer = await this.aiInfra.complete(businessId, prompt);
        return {
            answer,
            sources: passages.map((p) => ({ title: p.title, url: p.url })),
        };
    }
};
exports.HelpService = HelpService;
exports.HelpService = HelpService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        ai_infra_service_1.AiInfraService])
], HelpService);
//# sourceMappingURL=help.service.js.map