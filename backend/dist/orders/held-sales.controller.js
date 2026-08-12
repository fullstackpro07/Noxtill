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
exports.HeldSalesController = void 0;
const common_1 = require("@nestjs/common");
const held_sales_service_1 = require("./held-sales.service");
const hold_sale_dto_1 = require("./dto/hold-sale.dto");
const resume_held_sale_dto_1 = require("./dto/resume-held-sale.dto");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
let HeldSalesController = class HeldSalesController {
    heldSalesService;
    constructor(heldSalesService) {
        this.heldSalesService = heldSalesService;
    }
    list(user) {
        return this.heldSalesService.list(user.businessId);
    }
    hold(user, dto) {
        return this.heldSalesService.hold(user.businessId, dto);
    }
    resume(user, id, dto) {
        return this.heldSalesService.resume(user.businessId, id, dto);
    }
    discard(user, id) {
        return this.heldSalesService.discard(user.businessId, id);
    }
};
exports.HeldSalesController = HeldSalesController;
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], HeldSalesController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, hold_sale_dto_1.HoldSaleDto]),
    __metadata("design:returntype", void 0)
], HeldSalesController.prototype, "hold", null);
__decorate([
    (0, common_1.Post)(':id/resume'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, resume_held_sale_dto_1.ResumeHeldSaleDto]),
    __metadata("design:returntype", void 0)
], HeldSalesController.prototype, "resume", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], HeldSalesController.prototype, "discard", null);
exports.HeldSalesController = HeldSalesController = __decorate([
    (0, common_1.Controller)('sales/held'),
    __metadata("design:paramtypes", [held_sales_service_1.HeldSalesService])
], HeldSalesController);
//# sourceMappingURL=held-sales.controller.js.map