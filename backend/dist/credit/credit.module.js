"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreditModule = void 0;
const common_1 = require("@nestjs/common");
const credit_service_1 = require("./credit.service");
const credit_reminder_service_1 = require("./credit-reminder.service");
const credit_statement_service_1 = require("./credit-statement.service");
const installments_service_1 = require("./installments.service");
const public_credit_service_1 = require("./public-credit.service");
const credit_controller_1 = require("./credit.controller");
const installments_controller_1 = require("./installments.controller");
const public_credit_controller_1 = require("./public-credit.controller");
const messaging_module_1 = require("../messaging/messaging.module");
const activity_module_1 = require("../activity/activity.module");
let CreditModule = class CreditModule {
};
exports.CreditModule = CreditModule;
exports.CreditModule = CreditModule = __decorate([
    (0, common_1.Module)({
        imports: [messaging_module_1.MessagingModule, activity_module_1.ActivityModule],
        controllers: [
            credit_controller_1.CreditController,
            installments_controller_1.InstallmentsController,
            public_credit_controller_1.PublicCreditController,
        ],
        providers: [
            credit_service_1.CreditService,
            credit_reminder_service_1.CreditReminderService,
            credit_statement_service_1.CreditStatementService,
            installments_service_1.InstallmentsService,
            public_credit_service_1.PublicCreditService,
        ],
    })
], CreditModule);
//# sourceMappingURL=credit.module.js.map