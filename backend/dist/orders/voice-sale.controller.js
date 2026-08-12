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
exports.VoiceSaleController = void 0;
const common_1 = require("@nestjs/common");
const platform_express_1 = require("@nestjs/platform-express");
const voice_sale_service_1 = require("./voice-sale.service");
const create_sale_dto_1 = require("./dto/create-sale.dto");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
let VoiceSaleController = class VoiceSaleController {
    voiceSaleService;
    constructor(voiceSaleService) {
        this.voiceSaleService = voiceSaleService;
    }
    parse(user, file) {
        if (!file)
            throw new common_1.BadRequestException('audio file is required');
        return this.voiceSaleService.parse(user.businessId, file);
    }
    confirm(user, id, dto) {
        return this.voiceSaleService.confirm(user.businessId, id, dto);
    }
};
exports.VoiceSaleController = VoiceSaleController;
__decorate([
    (0, common_1.Post)('parse'),
    (0, common_1.UseInterceptors)((0, platform_express_1.FileInterceptor)('audio')),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.UploadedFile)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], VoiceSaleController.prototype, "parse", null);
__decorate([
    (0, common_1.Post)(':id/confirm'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, create_sale_dto_1.CreateSaleDto]),
    __metadata("design:returntype", void 0)
], VoiceSaleController.prototype, "confirm", null);
exports.VoiceSaleController = VoiceSaleController = __decorate([
    (0, common_1.Controller)('voice/sales'),
    __metadata("design:paramtypes", [voice_sale_service_1.VoiceSaleService])
], VoiceSaleController);
//# sourceMappingURL=voice-sale.controller.js.map