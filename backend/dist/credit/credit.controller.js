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
const current_user_decorator_1 = require("../common/decorators/current-user.decorator");
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
exports.CreditController = CreditController = __decorate([
    (0, common_1.Controller)('credit'),
    __metadata("design:paramtypes", [credit_service_1.CreditService,
        credit_reminder_service_1.CreditReminderService,
        credit_statement_service_1.CreditStatementService])
], CreditController);
//# sourceMappingURL=credit.controller.js.map