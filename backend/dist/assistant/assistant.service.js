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
var AssistantService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AssistantService = void 0;
const common_1 = require("@nestjs/common");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const prisma_service_1 = require("../prisma/prisma.service");
const claude_client_1 = require("../ai/claude.client");
const ai_infra_service_1 = require("../ai/ai-infra.service");
const app_exception_1 = require("../common/filters/app.exception");
const anthropic_stream_util_1 = require("../ai/anthropic-stream.util");
const assistant_tools_1 = require("./assistant-tools");
const MAX_TOOL_ITERATIONS = 5;
const AI_CALL_KIND = 'assistant_chat';
const SYSTEM_PROMPT = [
    "You are Noxtill's in-product assistant for a small business owner.",
    'Use the provided tools to answer any question involving numbers, counts, or business data — ' +
        'NEVER state a number, count, or fact you did not get from a tool result. If no tool can answer ' +
        'the question, say so honestly rather than guessing.',
    'For "how do I" or product-usage questions (features, policies, definitions), use search_help_docs ' +
        'and cite the passage number(s) you used, e.g. "(see [1])". If search_help_docs finds nothing ' +
        'relevant, say so honestly instead of guessing how the product works.',
    'Keep answers short (2-4 sentences) and plain-language.',
].join(' ');
let AssistantService = AssistantService_1 = class AssistantService {
    tenantPrisma;
    prisma;
    claude;
    aiInfra;
    logger = new common_1.Logger(AssistantService_1.name);
    constructor(tenantPrisma, prisma, claude, aiInfra) {
        this.tenantPrisma = tenantPrisma;
        this.prisma = prisma;
        this.claude = claude;
        this.aiInfra = aiInfra;
    }
    async chat(businessId, message, onTextDelta) {
        const messages = [{ role: 'user', content: message }];
        const toolCallLog = [];
        let finalText = '';
        for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
            await this.aiInfra.checkGuardrails(businessId);
            let stream;
            try {
                stream = await this.claude.streamMessage({
                    system: SYSTEM_PROMPT,
                    messages,
                    tools: (0, assistant_tools_1.toAnthropicTools)(),
                });
            }
            catch (error) {
                this.logger.error(`Assistant Claude call failed: ${error.message}`);
                throw new app_exception_1.AppException('AI_UNAVAILABLE', 'The AI assistant is not available right now — please try again later.', common_1.HttpStatus.SERVICE_UNAVAILABLE);
            }
            const result = await (0, anthropic_stream_util_1.collectAnthropicStream)(stream, onTextDelta);
            const toolUseBlocks = result.content.filter((b) => b.type === 'tool_use');
            const turnToolCalls = toolUseBlocks.map((b) => ({
                name: b.name,
                input: b.input,
            }));
            if (turnToolCalls.length === 0) {
                await this.aiInfra.recordUsage(businessId, AI_CALL_KIND, result, toolCallLog);
                finalText = result.content.find((b) => b.type === 'text')?.text ?? '';
                break;
            }
            messages.push({ role: 'assistant', content: result.content });
            const toolResultBlocks = [];
            for (const block of toolUseBlocks) {
                const output = await this.executeTool(businessId, block.name, block.input ?? {});
                toolCallLog.push({ name: block.name, input: block.input, output });
                toolResultBlocks.push({
                    type: 'tool_result',
                    tool_use_id: block.id,
                    content: JSON.stringify(output),
                });
            }
            messages.push({ role: 'user', content: toolResultBlocks });
            await this.aiInfra.recordUsage(businessId, AI_CALL_KIND, result, turnToolCalls);
        }
        return { text: finalText, toolCalls: toolCallLog };
    }
    async executeTool(businessId, name, input) {
        const tool = (0, assistant_tools_1.findAssistantTool)(name);
        if (!tool) {
            return { error: `Unknown tool: ${name}` };
        }
        try {
            return await tool.execute({ businessId, tenantPrisma: this.tenantPrisma, prisma: this.prisma }, input);
        }
        catch (error) {
            this.logger.error(`Tool "${name}" failed: ${error.message}`);
            return { error: 'Tool execution failed' };
        }
    }
    listTools() {
        return assistant_tools_1.ASSISTANT_TOOLS.map((t) => ({
            name: t.name,
            description: t.description,
        }));
    }
};
exports.AssistantService = AssistantService;
exports.AssistantService = AssistantService = AssistantService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        prisma_service_1.PrismaService,
        claude_client_1.ClaudeClient,
        ai_infra_service_1.AiInfraService])
], AssistantService);
//# sourceMappingURL=assistant.service.js.map