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
var SpeechToTextService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SpeechToTextService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
const app_exception_1 = require("../common/filters/app.exception");
let SpeechToTextService = SpeechToTextService_1 = class SpeechToTextService {
    config;
    logger = new common_1.Logger(SpeechToTextService_1.name);
    constructor(config) {
        this.config = config;
    }
    async transcribe(audioBuffer, mimeType, filename) {
        const apiKey = this.config.get('OPENAI_API_KEY');
        if (!apiKey) {
            throw new app_exception_1.AppException('SPEECH_TO_TEXT_UNAVAILABLE', 'Voice transcription is not available right now — please try again later.', common_1.HttpStatus.SERVICE_UNAVAILABLE);
        }
        const form = new FormData();
        form.append('file', new Blob([new Uint8Array(audioBuffer)], { type: mimeType }), filename);
        form.append('model', 'whisper-1');
        try {
            const response = await axios_1.default.post('https://api.openai.com/v1/audio/transcriptions', form, { headers: { Authorization: `Bearer ${apiKey}` } });
            return response.data.text;
        }
        catch (error) {
            this.logger.warn(`Whisper transcription failed: ${error.message}`);
            throw new app_exception_1.AppException('SPEECH_TO_TEXT_UNAVAILABLE', 'Voice transcription is not available right now — please try again later.', common_1.HttpStatus.SERVICE_UNAVAILABLE);
        }
    }
};
exports.SpeechToTextService = SpeechToTextService;
exports.SpeechToTextService = SpeechToTextService = SpeechToTextService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], SpeechToTextService);
//# sourceMappingURL=speech-to-text.service.js.map