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
var DeadLetterListener_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DeadLetterListener = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const bullmq_1 = require("@nestjs/bullmq");
const bullmq_2 = require("bullmq");
const queue_constants_1 = require("./queue.constants");
let DeadLetterListener = DeadLetterListener_1 = class DeadLetterListener {
    demoQueue;
    demoDlq;
    config;
    logger = new common_1.Logger(DeadLetterListener_1.name);
    events;
    constructor(demoQueue, demoDlq, config) {
        this.demoQueue = demoQueue;
        this.demoDlq = demoDlq;
        this.config = config;
    }
    onModuleInit() {
        this.events = new bullmq_2.QueueEvents(queue_constants_1.DEMO_QUEUE, {
            connection: {
                host: this.config.get('REDIS_HOST', 'localhost'),
                port: Number(this.config.get('REDIS_PORT', 6379)),
            },
        });
        this.events.on('failed', ({ jobId, failedReason }) => {
            void this.moveToDlqIfExhausted(jobId, failedReason);
        });
    }
    async moveToDlqIfExhausted(jobId, failedReason) {
        const job = await this.demoQueue.getJob(jobId);
        if (!job)
            return;
        const maxAttempts = job.opts.attempts ?? 1;
        if (job.attemptsMade >= maxAttempts) {
            this.logger.warn(`Job ${jobId} exhausted ${maxAttempts} attempts (${failedReason}) — moving to DLQ`);
            await this.demoDlq.add(job.name, { originalJobId: jobId, data: job.data, failedReason }, { jobId });
        }
    }
    async onModuleDestroy() {
        await this.events?.close();
    }
};
exports.DeadLetterListener = DeadLetterListener;
exports.DeadLetterListener = DeadLetterListener = DeadLetterListener_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, bullmq_1.InjectQueue)(queue_constants_1.DEMO_QUEUE)),
    __param(1, (0, bullmq_1.InjectQueue)((0, queue_constants_1.dlqName)(queue_constants_1.DEMO_QUEUE))),
    __metadata("design:paramtypes", [bullmq_2.Queue,
        bullmq_2.Queue,
        config_1.ConfigService])
], DeadLetterListener);
//# sourceMappingURL=dead-letter.listener.js.map