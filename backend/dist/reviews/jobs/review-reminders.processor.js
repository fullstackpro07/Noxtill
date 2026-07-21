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
var ReviewRemindersProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReviewRemindersProcessor = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const locale_service_1 = require("../../common/localization/locale.service");
const send_gate_service_1 = require("../../messaging/send-gate.service");
const review_reminders_constants_1 = require("./review-reminders.constants");
let ReviewRemindersProcessor = ReviewRemindersProcessor_1 = class ReviewRemindersProcessor extends bullmq_1.WorkerHost {
    prisma;
    locale;
    sendGate;
    logger = new common_1.Logger(ReviewRemindersProcessor_1.name);
    constructor(prisma, locale, sendGate) {
        super();
        this.prisma = prisma;
        this.locale = locale;
        this.sendGate = sendGate;
    }
    async process(job) {
        if (job.name !== 'tick')
            return;
        const now = job.data?.now ? new Date(job.data.now) : new Date();
        return this.runReminders(now);
    }
    async runReminders(now = new Date()) {
        const businesses = await this.prisma.business.findMany({
            select: { id: true, timezone: true },
        });
        for (const business of businesses) {
            if (this.locale.currentLocalTime(business.timezone, now).slice(0, 2) !==
                review_reminders_constants_1.REVIEW_REMINDERS_LOCAL_HOUR)
                continue;
            const pending = await this.prisma.reviewRequest.findMany({
                where: {
                    businessId: business.id,
                    respondedAt: null,
                    reminderCount: { lt: review_reminders_constants_1.REVIEW_REMINDER_MAX_COUNT },
                },
            });
            for (const request of pending) {
                const ageDays = (now.getTime() - request.createdAt.getTime()) / (1000 * 60 * 60 * 24);
                const dueOffset = review_reminders_constants_1.REVIEW_REMINDER_DAY_OFFSETS[request.reminderCount];
                if (ageDays < dueOffset)
                    continue;
                await this.sendGate
                    .send({
                    businessId: business.id,
                    customerId: request.customerId ?? undefined,
                    templateKey: 'review_request',
                    variables: { reviewUrl: `/r/${request.token}` },
                })
                    .catch(() => undefined);
                await this.prisma.reviewRequest.update({
                    where: { id: request.id },
                    data: { reminderCount: { increment: 1 } },
                });
            }
        }
        this.logger.debug(`Review reminders evaluated for ${businesses.length} business(es)`);
    }
};
exports.ReviewRemindersProcessor = ReviewRemindersProcessor;
exports.ReviewRemindersProcessor = ReviewRemindersProcessor = ReviewRemindersProcessor_1 = __decorate([
    (0, bullmq_1.Processor)(review_reminders_constants_1.REVIEW_REMINDERS_QUEUE),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        locale_service_1.LocaleService,
        send_gate_service_1.SendGateService])
], ReviewRemindersProcessor);
//# sourceMappingURL=review-reminders.processor.js.map