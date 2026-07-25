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
var ClaudeClient_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClaudeClient = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
const ANTHROPIC_API_VERSION = '2023-06-01';
const DEFAULT_MODEL = 'claude-3-5-haiku-20241022';
const DEFAULT_MAX_TOKENS = 1024;
let ClaudeClient = ClaudeClient_1 = class ClaudeClient {
    config;
    logger = new common_1.Logger(ClaudeClient_1.name);
    constructor(config) {
        this.config = config;
    }
    apiKey() {
        const apiKey = this.config.get('ANTHROPIC_API_KEY');
        if (!apiKey) {
            throw new Error('ANTHROPIC_API_KEY is not configured');
        }
        return apiKey;
    }
    async complete(prompt, temperature = 0) {
        const result = await this.createMessage({
            messages: [{ role: 'user', content: prompt }],
            temperature,
        });
        const text = result.content.find((block) => block.type === 'text')?.text;
        if (!text) {
            this.logger.warn('Claude response contained no text block');
        }
        return text ?? '';
    }
    async createMessage(params) {
        const response = await axios_1.default.post('https://api.anthropic.com/v1/messages', {
            model: DEFAULT_MODEL,
            max_tokens: params.maxTokens ?? DEFAULT_MAX_TOKENS,
            temperature: params.temperature ?? 0,
            system: params.system,
            messages: params.messages,
            tools: params.tools,
        }, {
            headers: {
                'x-api-key': this.apiKey(),
                'anthropic-version': ANTHROPIC_API_VERSION,
                'content-type': 'application/json',
            },
        });
        return {
            content: response.data.content,
            stopReason: response.data.stop_reason,
            inputTokens: response.data.usage.input_tokens,
            outputTokens: response.data.usage.output_tokens,
        };
    }
    async streamMessage(params) {
        const response = await axios_1.default.post('https://api.anthropic.com/v1/messages', {
            model: DEFAULT_MODEL,
            max_tokens: params.maxTokens ?? DEFAULT_MAX_TOKENS,
            temperature: params.temperature ?? 0,
            system: params.system,
            messages: params.messages,
            tools: params.tools,
            stream: true,
        }, {
            headers: {
                'x-api-key': this.apiKey(),
                'anthropic-version': ANTHROPIC_API_VERSION,
                'content-type': 'application/json',
            },
            responseType: 'stream',
        });
        return response.data;
    }
};
exports.ClaudeClient = ClaudeClient;
exports.ClaudeClient = ClaudeClient = ClaudeClient_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], ClaudeClient);
//# sourceMappingURL=claude.client.js.map