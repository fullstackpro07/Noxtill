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
exports.PricingController = void 0;
const common_1 = require("@nestjs/common");
const pricing_service_1 = require("./pricing.service");
const bulk_price_dto_1 = require("./dto/bulk-price.dto");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const require_capability_decorator_1 = require("../common/decorators/require-capability.decorator");
const capabilities_constants_1 = require("../common/capabilities/capabilities.constants");
let PricingController = class PricingController {
    pricingService;
    constructor(pricingService) {
        this.pricingService = pricingService;
    }
    bulkPrice(dto) {
        return this.pricingService.bulkPrice(dto);
    }
    priceHistory(id) {
        return this.pricingService.priceHistory(id);
    }
    suggestedPrice(user, id) {
        return this.pricingService.suggestedPrice(user.businessId, id);
    }
};
exports.PricingController = PricingController;
__decorate([
    (0, require_capability_decorator_1.RequireCapability)(capabilities_constants_1.CAPABILITIES.PRICING_MANAGE),
    (0, common_1.Patch)('bulk-price'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [bulk_price_dto_1.BulkPriceDto]),
    __metadata("design:returntype", void 0)
], PricingController.prototype, "bulkPrice", null);
__decorate([
    (0, common_1.Get)(':id/price-history'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], PricingController.prototype, "priceHistory", null);
__decorate([
    (0, common_1.Get)(':id/price-suggestion'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], PricingController.prototype, "suggestedPrice", null);
exports.PricingController = PricingController = __decorate([
    (0, common_1.Controller)('products'),
    __metadata("design:paramtypes", [pricing_service_1.PricingService])
], PricingController);
//# sourceMappingURL=pricing.controller.js.map