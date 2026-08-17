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
exports.CreditController = void 0;
const common_1 = require("@nestjs/common");
const credit_service_1 = require("./credit.service");
const credit_reminder_service_1 = require("./credit-reminder.service");
const credit_statement_service_1 = require("./credit-statement.service");
const record_payment_dto_1 = require("./dto/record-payment.dto");
const remind_dto_1 = require("./dto/remind.dto");
const create_installment_plan_dto_1 = require("./dto/create-installment-plan.dto");
const write_off_credit_dto_1 = require("./dto/write-off-credit.dto");
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
const require_capability_decorator_1 = require("../common/decorators/require-capability.decorator");
const capabilities_constants_1 = require("../common/capabilities/capabilities.constants");
let CreditController = class CreditController {
    creditService;
    reminderService;
    statementService;
    constructor(creditService, reminderService, statementService) {
        this.creditService = creditService;
        this.reminderService = reminderService;
        this.statementService = statementService;
    }
    listDebtors() {
        return this.creditService.listDebtors();
    }
    entries(customerId) {
        return this.creditService.getLedger(customerId);
    }
    recordPayment(dto) {
        return this.creditService.recordPayment(dto);
    }
    remind(user, dto) {
        return this.reminderService.remind(user.businessId, dto);
    }
    statement(user, customerId) {
        return this.statementService.generate(user.businessId, customerId);
    }
    createInstallmentPlan(customerId, dto) {
        return this.creditService.createInstallmentPlan(customerId, dto);
    }
    listInstallmentPlans(customerId) {
        return this.creditService.listInstallmentPlans(customerId);
    }
    createShareLink(customerId) {
        return this.creditService.createShareLink(customerId);
    }
    listShareLinks(customerId) {
        return this.creditService.listShareLinks(customerId);
    }
    revokeShareLink(id) {
        return this.creditService.revokeShareLink(id);
    }
    writeOff(customerId, dto) {
        return this.creditService.writeOff(customerId, dto);
    }
};
exports.CreditController = CreditController;
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], CreditController.prototype, "listDebtors", null);
__decorate([
    (0, common_1.Get)(':customer/entries'),
    __param(0, (0, common_1.Param)('customer')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], CreditController.prototype, "entries", null);
__decorate([
    (0, common_1.Post)('payments'),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [record_payment_dto_1.RecordPaymentDto]),
    __metadata("design:returntype", void 0)
], CreditController.prototype, "recordPayment", null);
__decorate([
    (0, common_1.Post)('remind'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, remind_dto_1.RemindDto]),
    __metadata("design:returntype", void 0)
], CreditController.prototype, "remind", null);
__decorate([
    (0, common_1.Get)(':customer/statement'),
    __param(0, (0, current_user_decorator_1.CurrentUser)()),
    __param(1, (0, common_1.Param)('customer')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], CreditController.prototype, "statement", null);
__decorate([
    (0, common_1.Post)(':customer/installment-plan'),
    __param(0, (0, common_1.Param)('customer')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_installment_plan_dto_1.CreateInstallmentPlanDto]),
    __metadata("design:returntype", void 0)
], CreditController.prototype, "createInstallmentPlan", null);
__decorate([
    (0, common_1.Get)(':customer/installment-plans'),
    __param(0, (0, common_1.Param)('customer')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], CreditController.prototype, "listInstallmentPlans", null);
__decorate([
    (0, common_1.Post)(':customer/share-link'),
    __param(0, (0, common_1.Param)('customer')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], CreditController.prototype, "createShareLink", null);
__decorate([
    (0, common_1.Get)(':customer/share-links'),
    __param(0, (0, common_1.Param)('customer')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], CreditController.prototype, "listShareLinks", null);
__decorate([
    (0, common_1.Post)('share-link/:id/revoke'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], CreditController.prototype, "revokeShareLink", null);
__decorate([
    (0, require_capability_decorator_1.RequireCapability)(capabilities_constants_1.CAPABILITIES.CREDIT_WRITE_OFF),
    (0, common_1.Post)(':customer/write-off'),
    __param(0, (0, common_1.Param)('customer')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, write_off_credit_dto_1.WriteOffCreditDto]),
    __metadata("design:returntype", void 0)
], CreditController.prototype, "writeOff", null);
exports.CreditController = CreditController = __decorate([
    (0, common_1.Controller)('credit'),
    __metadata("design:paramtypes", [credit_service_1.CreditService,
        credit_reminder_service_1.CreditReminderService,
        credit_statement_service_1.CreditStatementService])
], CreditController);
//# sourceMappingURL=credit.controller.js.map