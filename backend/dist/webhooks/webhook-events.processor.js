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
var WebhookEventsProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhookEventsProcessor = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const whatsapp_window_service_1 = require("../whatsapp/whatsapp-window.service");
const webhooks_constants_1 = require("./webhooks.constants");
const prisma_1 = require("../../generated/prisma");
const META_STATUS_MAP = {
    sent: prisma_1.MessageStatus.sent,
    delivered: prisma_1.MessageStatus.delivered,
    read: prisma_1.MessageStatus.read,
    failed: prisma_1.MessageStatus.failed,
};
const TWILIO_STATUS_MAP = {
    sent: prisma_1.MessageStatus.sent,
    delivered: prisma_1.MessageStatus.delivered,
    read: prisma_1.MessageStatus.read,
    failed: prisma_1.MessageStatus.failed,
    undelivered: prisma_1.MessageStatus.failed,
};
const POSTMARK_STATUS_MAP = {
    Delivery: prisma_1.MessageStatus.delivered,
    Open: prisma_1.MessageStatus.read,
    Bounce: prisma_1.MessageStatus.failed,
    SpamComplaint: prisma_1.MessageStatus.failed,
};
let WebhookEventsProcessor = WebhookEventsProcessor_1 = class WebhookEventsProcessor extends bullmq_1.WorkerHost {
    prisma;
    whatsappWindow;
    logger = new common_1.Logger(WebhookEventsProcessor_1.name);
    constructor(prisma, whatsappWindow) {
        super();
        this.prisma = prisma;
        this.whatsappWindow = whatsappWindow;
    }
    async process(job) {
        switch (job.name) {
            case 'meta-status':
                return this.handleMetaStatus(job.data);
            case 'meta-inbound':
                return this.handleMetaInbound(job.data);
            case 'twilio-status':
                return this.handleTwilioStatus(job.data);
            case 'email-event':
                return this.handleEmailEvent(job.data);
            default:
                this.logger.warn(`Unknown webhook job: ${job.name}`);
        }
    }
    async handleMetaStatus(status) {
        const mapped = META_STATUS_MAP[status.status];
        if (!mapped)
            return;
        await this.prisma.message
            .updateMany({
            where: { providerRef: status.id },
            data: { status: mapped },
        })
            .catch(() => undefined);
    }
    async handleMetaInbound(message) {
        const customer = await this.prisma.customer.findFirst({
            where: { phone: message.from },
        });
        if (!customer)
            return;
        await this.whatsappWindow.refresh(customer.businessId, customer.id);
    }
    async handleTwilioStatus(body) {
        const mapped = TWILIO_STATUS_MAP[body.MessageStatus];
        const providerRef = body.MessageSid ?? body.SmsSid;
        if (!mapped || !providerRef)
            return;
        await this.prisma.message
            .updateMany({ where: { providerRef }, data: { status: mapped } })
            .catch(() => undefined);
    }
    async handleEmailEvent(body) {
        if (!body.MessageID || !body.RecordType)
            return;
        const mapped = POSTMARK_STATUS_MAP[body.RecordType];
        if (!mapped)
            return;
        await this.prisma.message
            .updateMany({
            where: { providerRef: body.MessageID },
            data: { status: mapped },
        })
            .catch(() => undefined);
    }
};
exports.WebhookEventsProcessor = WebhookEventsProcessor;
exports.WebhookEventsProcessor = WebhookEventsProcessor = WebhookEventsProcessor_1 = __decorate([
    (0, bullmq_1.Processor)(webhooks_constants_1.WEBHOOK_EVENTS_QUEUE),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        whatsapp_window_service_1.WhatsappWindowService])
], WebhookEventsProcessor);
//# sourceMappingURL=webhook-events.processor.js.map