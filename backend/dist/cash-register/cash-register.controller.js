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
exports.CashRegisterController = void 0;
const common_1 = require("@nestjs/common");
const cash_register_service_1 = require("./cash-register.service");
const open_shift_dto_1 = require("./dto/open-shift.dto");
const record_cash_movement_dto_1 = require("./dto/record-cash-movement.dto");
const reconcile_shift_dto_1 = require("./dto/reconcile-shift.dto");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
let CashRegisterController = class CashRegisterController {
    cashRegisterService;
    constructor(cashRegisterService) {
        this.cashRegisterService = cashRegisterService;
    }
    getCurrentShift(user) {
        return this.cashRegisterService.getCurrentShift(user.businessId);
    }
    openShift(user, dto) {
        return this.cashRegisterService.openShift(user.businessId, dto);
    }
    closeShift(user) {
        return this.cashRegisterService.closeShift(user.businessId);
    }
    recordMovement(user, dto) {
        return this.cashRegisterService.recordMovement(user.businessId, dto);
    }
    reconcile(user, dto) {
        return this.cashRegisterService.reconcile(user.businessId, dto);
    }
};
exports.CashRegisterController = CashRegisterController;
__decorate([
    (0, common_1.Get)('cash/shift/current'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], CashRegisterController.prototype, "getCurrentShift", null);
__decorate([
    (0, common_1.Post)('cash/shift/open'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, open_shift_dto_1.OpenShiftDto]),
    __metadata("design:returntype", void 0)
], CashRegisterController.prototype, "openShift", null);
__decorate([
    (0, common_1.Post)('cash/shift/close'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], CashRegisterController.prototype, "closeShift", null);
__decorate([
    (0, common_1.Post)('cash/movements'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, record_cash_movement_dto_1.RecordCashMovementDto]),
    __metadata("design:returntype", void 0)
], CashRegisterController.prototype, "recordMovement", null);
__decorate([
    (0, common_1.Post)('cash-reconciliation'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, reconcile_shift_dto_1.ReconcileShiftDto]),
    __metadata("design:returntype", void 0)
], CashRegisterController.prototype, "reconcile", null);
exports.CashRegisterController = CashRegisterController = __decorate([
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [cash_register_service_1.CashRegisterService])
], CashRegisterController);
//# sourceMappingURL=cash-register.controller.js.map