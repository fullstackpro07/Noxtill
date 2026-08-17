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
exports.AiContentStudioService = void 0;
const common_1 = require("@nestjs/common");
const ai_infra_service_1 = require("../ai/ai-infra.service");
const media_library_service_1 = require("./media-library.service");
const app_exception_1 = require("../common/filters/app.exception");
const CAPTION_MAX_CHARS = 280;
let AiContentStudioService = class AiContentStudioService {
    aiInfra;
    mediaLibrary;
    constructor(aiInfra, mediaLibrary) {
        this.aiInfra = aiInfra;
        this.mediaLibrary = mediaLibrary;
    }
    async generateCaption(businessId, dto) {
        const prompt = `Write a single social media caption about: "${dto.topic}". Tone: ${dto.tone ?? 'friendly and engaging'}. Keep it under ${CAPTION_MAX_CHARS} characters, no hashtags unless natural, no surrounding quote marks.`;
        let caption;
        try {
            caption = await this.aiInfra.complete(businessId, prompt);
        }
        catch (error) {
            if (error instanceof app_exception_1.AppException)
                throw error;
            throw new app_exception_1.AppException('AI_UNAVAILABLE', 'The AI assistant is not available right now — please try again later.', common_1.HttpStatus.SERVICE_UNAVAILABLE);
        }
        return { caption: caption.trim() };
    }
    generateImage(businessId, dto) {
        return this.mediaLibrary.generateImage(businessId, dto);
    }
};
exports.AiContentStudioService = AiContentStudioService;
exports.AiContentStudioService = AiContentStudioService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [ai_infra_service_1.AiInfraService,
        media_library_service_1.MediaLibraryService])
], AiContentStudioService);
//# sourceMappingURL=ai-content-studio.service.js.map