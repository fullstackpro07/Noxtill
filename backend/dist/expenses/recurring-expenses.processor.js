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
var RecurringExpensesProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecurringExpensesProcessor = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const expenses_service_1 = require("./expenses.service");
const recurring_expenses_constants_1 = require("./recurring-expenses.constants");
let RecurringExpensesProcessor = RecurringExpensesProcessor_1 = class RecurringExpensesProcessor extends bullmq_1.WorkerHost {
    expensesService;
    logger = new common_1.Logger(RecurringExpensesProcessor_1.name);
    constructor(expensesService) {
        super();
        this.expensesService = expensesService;
    }
    async process() {
        const cloned = await this.expensesService.cloneRecurringExpenses();
        this.logger.debug(`Cloned ${cloned} recurring expense(s) for the new month`);
    }
};
exports.RecurringExpensesProcessor = RecurringExpensesProcessor;
exports.RecurringExpensesProcessor = RecurringExpensesProcessor = RecurringExpensesProcessor_1 = __decorate([
    (0, bullmq_1.Processor)(recurring_expenses_constants_1.RECURRING_EXPENSES_QUEUE),
    __metadata("design:paramtypes", [expenses_service_1.ExpensesService])
], RecurringExpensesProcessor);
//# sourceMappingURL=recurring-expenses.processor.js.map