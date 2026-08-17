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
exports.DepositsController = void 0;
const common_1 = require("@nestjs/common");
const deposits_service_1 = require("./deposits.service");
const create_deposit_dto_1 = require("./dto/create-deposit.dto");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
let DepositsController = class DepositsController {
    depositsService;
    constructor(depositsService) {
        this.depositsService = depositsService;
    }
    create(user, dto) {
        return this.depositsService.create(user.businessId, dto);
    }
    list(appointmentId) {
        return this.depositsService.list(appointmentId);
    }
    capture(user, id) {
        return this.depositsService.capture(user.businessId, id);
    }
    refund(user, id) {
        return this.depositsService.refund(user.businessId, id);
    }
};
exports.DepositsController = DepositsController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, create_deposit_dto_1.CreateDepositDto]),
    __metadata("design:returntype", void 0)
], DepositsController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, common_1.Query)('appointmentId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], DepositsController.prototype, "list", null);
__decorate([
    (0, common_1.Post)(':id/capture'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], DepositsController.prototype, "capture", null);
__decorate([
    (0, common_1.Post)(':id/refund'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], DepositsController.prototype, "refund", null);
exports.DepositsController = DepositsController = __decorate([
    (0, common_1.Controller)('deposits'),
    __metadata("design:paramtypes", [deposits_service_1.DepositsService])
], DepositsController);
//# sourceMappingURL=deposits.controller.js.map