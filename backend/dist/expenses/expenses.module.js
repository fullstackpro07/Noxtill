"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExpensesModule = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq");
const expenses_service_1 = require("./expenses.service");
const expenses_controller_1 = require("./expenses.controller");
const recurring_expenses_scheduler_1 = require("./recurring-expenses.scheduler");
const recurring_expenses_processor_1 = require("./recurring-expenses.processor");
const recurring_expenses_constants_1 = require("./recurring-expenses.constants");
let ExpensesModule = class ExpensesModule {
};
exports.ExpensesModule = ExpensesModule;
exports.ExpensesModule = ExpensesModule = __decorate([
    (0, common_1.Module)({
        imports: [bullmq_1.BullModule.registerQueue({ name: recurring_expenses_constants_1.RECURRING_EXPENSES_QUEUE })],
        controllers: [expenses_controller_1.ExpensesController],
        providers: [
            expenses_service_1.ExpensesService,
            recurring_expenses_scheduler_1.RecurringExpensesScheduler,
            recurring_expenses_processor_1.RecurringExpensesProcessor,
        ],
        exports: [expenses_service_1.ExpensesService],
    })
], ExpensesModule);
//# sourceMappingURL=expenses.module.js.map