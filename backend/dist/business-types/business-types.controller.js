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
exports.BusinessTypesController = void 0;
const common_1 = require("@nestjs/common");
const business_types_service_1 = require("./business-types.service");
const ai_map_business_type_dto_1 = require("./dto/ai-map-business-type.dto");
const public_decorator_1 = require("../common/decorators/public.decorator");
let BusinessTypesController = class BusinessTypesController {
    businessTypesService;
    constructor(businessTypesService) {
        this.businessTypesService = businessTypesService;
    }
    search(q) {
        return this.businessTypesService.search(q);
    }
    aiMap(dto) {
        return this.businessTypesService.aiMap(dto);
    }
};
exports.BusinessTypesController = BusinessTypesController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)('q')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], BusinessTypesController.prototype, "search", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('ai-map'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [ai_map_business_type_dto_1.AiMapBusinessTypeDto]),
    __metadata("design:returntype", void 0)
], BusinessTypesController.prototype, "aiMap", null);
exports.BusinessTypesController = BusinessTypesController = __decorate([
    (0, common_1.Controller)('business-types'),
    __metadata("design:paramtypes", [business_types_service_1.BusinessTypesService])
], BusinessTypesController);
//# sourceMappingURL=business-types.controller.js.map