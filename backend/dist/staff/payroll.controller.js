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
exports.PayrollController = void 0;
const common_1 = require("@nestjs/common");
const payroll_service_1 = require("./payroll.service");
const query_payroll_dto_1 = require("./dto/query-payroll.dto");
const require_capability_decorator_1 = require("../common/decorators/require-capability.decorator");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const capabilities_constants_1 = require("../common/capabilities/capabilities.constants");
let PayrollController = class PayrollController {
    payroll;
    constructor(payroll) {
        this.payroll = payroll;
    }
    export(user, query) {
        return this.payroll.export(user.businessId, query.month);
    }
};
exports.PayrollController = PayrollController;
__decorate([
    (0, common_1.Get)('payroll/export.xlsx'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, query_payroll_dto_1.QueryPayrollDto]),
    __metadata("design:returntype", void 0)
], PayrollController.prototype, "export", null);
exports.PayrollController = PayrollController = __decorate([
    (0, common_1.Controller)(),
    (0, require_capability_decorator_1.RequireCapability)(capabilities_constants_1.CAPABILITIES.PAYROLL_EXPORT),
    __metadata("design:paramtypes", [payroll_service_1.PayrollService])
], PayrollController);
//# sourceMappingURL=payroll.controller.js.map