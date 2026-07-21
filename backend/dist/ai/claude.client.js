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
let ClaudeClient = ClaudeClient_1 = class ClaudeClient {
    config;
    logger = new common_1.Logger(ClaudeClient_1.name);
    constructor(config) {
        this.config = config;
    }
    async complete(prompt, temperature = 0) {
        const apiKey = this.config.get('ANTHROPIC_API_KEY');
        if (!apiKey) {
            throw new Error('ANTHROPIC_API_KEY is not configured');
        }
        const response = await axios_1.default.post('https://api.anthropic.com/v1/messages', {
            model: DEFAULT_MODEL,
            max_tokens: 512,
            temperature,
            messages: [{ role: 'user', content: prompt }],
        }, {
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': ANTHROPIC_API_VERSION,
                'content-type': 'application/json',
            },
        });
        const text = response.data.content.find((block) => block.type === 'text')?.text;
        if (!text) {
            this.logger.warn('Claude response contained no text block');
        }
        return text ?? '';
    }
};
exports.ClaudeClient = ClaudeClient;
exports.ClaudeClient = ClaudeClient = ClaudeClient_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], ClaudeClient);
//# sourceMappingURL=claude.client.js.map