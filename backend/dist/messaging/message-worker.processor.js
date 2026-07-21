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
var MessageWorkerProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageWorkerProcessor = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const template_registry_service_1 = require("./templates/template-registry.service");
const whatsapp_service_1 = require("../whatsapp/whatsapp.service");
const sms_service_1 = require("./channels/sms.service");
const email_service_1 = require("./channels/email.service");
const messaging_constants_1 = require("./messaging.constants");
const prisma_1 = require("../../generated/prisma");
let MessageWorkerProcessor = MessageWorkerProcessor_1 = class MessageWorkerProcessor extends bullmq_1.WorkerHost {
    prisma;
    templates;
    whatsapp;
    sms;
    email;
    logger = new common_1.Logger(MessageWorkerProcessor_1.name);
    constructor(prisma, templates, whatsapp, sms, email) {
        super();
        this.prisma = prisma;
        this.templates = templates;
        this.whatsapp = whatsapp;
        this.sms = sms;
        this.email = email;
    }
    async process(job) {
        const message = await this.prisma.message.findUniqueOrThrow({
            where: { id: job.data.messageId },
        });
        const payload = message.payload;
        const rendered = this.templates.render(message.templateKey, message.locale, payload);
        const to = payload.__to;
        const sender = this.pickSender(message.channel);
        const result = await sender.send({
            to,
            text: rendered.text,
            templateKey: message.templateKey,
            locale: message.locale,
            businessId: message.businessId,
            customerId: message.customerId ?? undefined,
        });
        await this.prisma.message.update({
            where: { id: message.id },
            data: { status: 'sent', providerRef: result.providerRef },
        });
        this.logger.debug(`Message ${message.id} sent via ${message.channel}, provider_ref=${result.providerRef}`);
    }
    pickSender(channel) {
        switch (channel) {
            case prisma_1.MessageChannel.whatsapp:
                return this.whatsapp;
            case prisma_1.MessageChannel.sms:
                return this.sms;
            case prisma_1.MessageChannel.email:
                return this.email;
        }
    }
};
exports.MessageWorkerProcessor = MessageWorkerProcessor;
exports.MessageWorkerProcessor = MessageWorkerProcessor = MessageWorkerProcessor_1 = __decorate([
    (0, bullmq_1.Processor)(messaging_constants_1.MESSAGES_QUEUE),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        template_registry_service_1.TemplateRegistryService,
        whatsapp_service_1.WhatsappService,
        sms_service_1.SmsService,
        email_service_1.EmailService])
], MessageWorkerProcessor);
//# sourceMappingURL=message-worker.processor.js.map