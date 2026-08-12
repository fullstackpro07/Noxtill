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
exports.AiInsightsController = void 0;
const common_1 = require("@nestjs/common");
const ai_insights_service_1 = require("./ai-insights.service");
const update_insight_status_dto_1 = require("./dto/update-insight-status.dto");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const prisma_1 = require("../../generated/prisma");
let AiInsightsController = class AiInsightsController {
    aiInsightsService;
    constructor(aiInsightsService) {
        this.aiInsightsService = aiInsightsService;
    }
    list(user, category, status) {
        return this.aiInsightsService.list(user.businessId, category, status);
    }
    updateStatus(user, id, dto) {
        return this.aiInsightsService.setStatus(user.businessId, id, dto.status);
    }
};
exports.AiInsightsController = AiInsightsController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)('category')),
    __param(2, (0, common_1.Query)('status')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, String]),
    __metadata("design:returntype", void 0)
], AiInsightsController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(':id/action'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, update_insight_status_dto_1.UpdateInsightStatusDto]),
    __metadata("design:returntype", void 0)
], AiInsightsController.prototype, "updateStatus", null);
exports.AiInsightsController = AiInsightsController = __decorate([
    (0, common_1.Controller)('ai/insights'),
    __metadata("design:paramtypes", [ai_insights_service_1.AiInsightsService])
], AiInsightsController);
//# sourceMappingURL=ai-insights.controller.js.map