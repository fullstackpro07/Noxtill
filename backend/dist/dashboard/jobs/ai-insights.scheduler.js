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
var AiInsightsScheduler_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AiInsightsScheduler = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq");
const bullmq_2 = require("bullmq");
const dashboard_constants_1 = require("../dashboard.constants");
let AiInsightsScheduler = AiInsightsScheduler_1 = class AiInsightsScheduler {
    queue;
    logger = new common_1.Logger(AiInsightsScheduler_1.name);
    constructor(queue) {
        this.queue = queue;
    }
    onModuleInit() {
        this.queue
            .add('tick', {}, {
            repeat: { pattern: '0 5 * * *' },
            jobId: 'ai-insights-daily-tick',
        })
            .catch((error) => this.logger.error(`Failed to register ai-insights tick: ${error.message}`));
    }
};
exports.AiInsightsScheduler = AiInsightsScheduler;
exports.AiInsightsScheduler = AiInsightsScheduler = AiInsightsScheduler_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, bullmq_1.InjectQueue)(dashboard_constants_1.AI_INSIGHTS_QUEUE)),
    __metadata("design:paramtypes", [bullmq_2.Queue])
], AiInsightsScheduler);
//# sourceMappingURL=ai-insights.scheduler.js.map