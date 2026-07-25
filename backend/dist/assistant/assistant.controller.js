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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AssistantController = void 0;
const common_1 = require("@nestjs/common");
const assistant_service_1 = require("./assistant.service");
const assistant_chat_dto_1 = require("./dto/assistant-chat.dto");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
let AssistantController = class AssistantController {
    assistantService;
    constructor(assistantService) {
        this.assistantService = assistantService;
    }
    tools() {
        return this.assistantService.listTools();
    }
    async chat(user, dto, res) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.flushHeaders?.();
        try {
            const result = await this.assistantService.chat(user.businessId, dto.message, (text) => {
                res.write(`event: delta\ndata: ${JSON.stringify({ text })}\n\n`);
            });
            res.write(`event: done\ndata: ${JSON.stringify(result)}\n\n`);
        }
        catch (error) {
            res.write(`event: error\ndata: ${JSON.stringify({ message: error.message })}\n\n`);
        }
        finally {
            res.end();
        }
    }
};
exports.AssistantController = AssistantController;
__decorate([
    (0, common_1.Get)('tools'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AssistantController.prototype, "tools", null);
__decorate([
    (0, common_1.Post)('chat'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, assistant_chat_dto_1.AssistantChatDto, Object]),
    __metadata("design:returntype", Promise)
], AssistantController.prototype, "chat", null);
exports.AssistantController = AssistantController = __decorate([
    (0, common_1.Controller)('assistant'),
    __metadata("design:paramtypes", [assistant_service_1.AssistantService])
], AssistantController);
//# sourceMappingURL=assistant.controller.js.map