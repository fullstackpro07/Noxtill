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
var RecurringExpensesScheduler_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecurringExpensesScheduler = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq");
const bullmq_2 = require("bullmq");
const recurring_expenses_constants_1 = require("./recurring-expenses.constants");
let RecurringExpensesScheduler = RecurringExpensesScheduler_1 = class RecurringExpensesScheduler {
    queue;
    logger = new common_1.Logger(RecurringExpensesScheduler_1.name);
    constructor(queue) {
        this.queue = queue;
    }
    onModuleInit() {
        this.queue
            .add('clone', {}, {
            repeat: { pattern: '0 0 1 * *' },
            jobId: 'recurring-expenses-monthly-clone',
        })
            .catch((error) => this.logger.error(`Failed to register monthly clone job: ${error.message}`));
    }
};
exports.RecurringExpensesScheduler = RecurringExpensesScheduler;
exports.RecurringExpensesScheduler = RecurringExpensesScheduler = RecurringExpensesScheduler_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, bullmq_1.InjectQueue)(recurring_expenses_constants_1.RECURRING_EXPENSES_QUEUE)),
    __metadata("design:paramtypes", [bullmq_2.Queue])
], RecurringExpensesScheduler);
//# sourceMappingURL=recurring-expenses.scheduler.js.map