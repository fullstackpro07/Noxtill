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
var MessageDeadLetterListener_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageDeadLetterListener = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const bullmq_1 = require("@nestjs/bullmq");
const bullmq_2 = require("bullmq");
const prisma_service_1 = require("../prisma/prisma.service");
const messaging_constants_1 = require("./messaging.constants");
const queue_constants_1 = require("../common/queue/queue.constants");
let MessageDeadLetterListener = MessageDeadLetterListener_1 = class MessageDeadLetterListener {
    messagesQueue;
    messagesDlq;
    prisma;
    config;
    logger = new common_1.Logger(MessageDeadLetterListener_1.name);
    events;
    constructor(messagesQueue, messagesDlq, prisma, config) {
        this.messagesQueue = messagesQueue;
        this.messagesDlq = messagesDlq;
        this.prisma = prisma;
        this.config = config;
    }
    onModuleInit() {
        this.events = new bullmq_2.QueueEvents(messaging_constants_1.MESSAGES_QUEUE, {
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
        const job = await this.messagesQueue.getJob(jobId);
        if (!job)
            return;
        const maxAttempts = job.opts.attempts ?? 1;
        if (job.attemptsMade < maxAttempts)
            return;
        this.logger.warn(`Message job ${jobId} exhausted ${maxAttempts} attempts (${failedReason}) — moving to DLQ`);
        await this.messagesDlq.add(job.name, { originalJobId: jobId, data: job.data, failedReason }, { jobId });
        await this.prisma.message
            .update({ where: { id: job.data.messageId }, data: { status: 'failed' } })
            .catch(() => undefined);
    }
    async onModuleDestroy() {
        await this.events?.close();
    }
};
exports.MessageDeadLetterListener = MessageDeadLetterListener;
exports.MessageDeadLetterListener = MessageDeadLetterListener = MessageDeadLetterListener_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, bullmq_1.InjectQueue)(messaging_constants_1.MESSAGES_QUEUE)),
    __param(1, (0, bullmq_1.InjectQueue)((0, queue_constants_1.dlqName)(messaging_constants_1.MESSAGES_QUEUE))),
    __metadata("design:paramtypes", [bullmq_2.Queue,
        bullmq_2.Queue,
        prisma_service_1.PrismaService,
        config_1.ConfigService])
], MessageDeadLetterListener);
//# sourceMappingURL=message-dead-letter.listener.js.map