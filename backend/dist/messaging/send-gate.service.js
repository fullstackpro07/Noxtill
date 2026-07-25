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
Object.defineProperty(exports, "__esModule", { value: true });
exports.SendGateService = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq");
const bullmq_2 = require("bullmq");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const app_exception_1 = require("../common/filters/app.exception");
const template_registry_service_1 = require("./templates/template-registry.service");
const channel_resolution_util_1 = require("./channel-resolution.util");
const messaging_constants_1 = require("./messaging.constants");
let SendGateService = class SendGateService {
    tenantPrisma;
    templates;
    messagesQueue;
    constructor(tenantPrisma, templates, messagesQueue) {
        this.tenantPrisma = tenantPrisma;
        this.templates = templates;
        this.messagesQueue = messagesQueue;
    }
    async send(params) {
        const business = await this.tenantPrisma.client.business.findUniqueOrThrow({
            where: { id: params.businessId },
        });
        const customer = params.customerId
            ? await this.tenantPrisma.client.customer.findUnique({
                where: { id: params.customerId },
            })
            : undefined;
        if (params.customerId && !customer) {
            throw new app_exception_1.AppException(messaging_constants_1.MESSAGE_ERROR_CODES.CUSTOMER_NOT_FOUND, 'Customer not found', common_1.HttpStatus.NOT_FOUND);
        }
        const definition = this.templates.get(params.templateKey);
        if (!definition) {
            throw new app_exception_1.AppException(messaging_constants_1.MESSAGE_ERROR_CODES.TEMPLATE_NOT_FOUND, `Unknown template: ${params.templateKey}`, common_1.HttpStatus.BAD_REQUEST);
        }
        if (definition.category === 'marketing' && customer?.optedOut) {
            throw new app_exception_1.AppException(messaging_constants_1.MESSAGE_ERROR_CODES.CUSTOMER_OPTED_OUT, 'Customer has opted out of marketing messages', common_1.HttpStatus.FORBIDDEN);
        }
        if (business.msgUsed >= business.msgQuota) {
            throw new app_exception_1.AppException(messaging_constants_1.MESSAGE_ERROR_CODES.QUOTA_EXCEEDED, `Monthly message quota (${business.msgQuota}) reached`, common_1.HttpStatus.FORBIDDEN);
        }
        if (!this.templates.exists(params.templateKey, business.locale)) {
            throw new app_exception_1.AppException(messaging_constants_1.MESSAGE_ERROR_CODES.TEMPLATE_NOT_FOUND, `No copy for template "${params.templateKey}" in locale "${business.locale}"`, common_1.HttpStatus.BAD_REQUEST);
        }
        const contact = customer
            ? { phone: customer.phone, email: customer.email }
            : { phone: params.to?.phone, email: params.to?.email };
        const channel = (0, channel_resolution_util_1.resolveChannel)(business.channelPref, contact);
        if (!channel) {
            throw new app_exception_1.AppException(messaging_constants_1.MESSAGE_ERROR_CODES.NO_CHANNEL_AVAILABLE, 'Customer has no usable contact channel', common_1.HttpStatus.BAD_REQUEST);
        }
        const payload = {
            ...params.variables,
            __to: contact.phone ?? contact.email ?? '',
        };
        const [message] = await this.tenantPrisma.client.$transaction([
            this.tenantPrisma.client.message.create({
                data: {
                    businessId: params.businessId,
                    customerId: params.customerId,
                    campaignId: params.campaignId,
                    channel,
                    category: definition.category,
                    templateKey: params.templateKey,
                    locale: business.locale,
                    payload,
                    status: 'queued',
                    scheduledFor: params.scheduledFor,
                },
            }),
            this.tenantPrisma.client.business.update({
                where: { id: params.businessId },
                data: { msgUsed: { increment: 1 } },
            }),
        ]);
        const delay = params.scheduledFor
            ? Math.max(0, params.scheduledFor.getTime() - Date.now())
            : 0;
        await this.messagesQueue.add('send', { messageId: message.id }, {
            jobId: message.id,
            delay,
            attempts: 5,
            backoff: { type: 'exponential', delay: 2000 },
        });
        return message;
    }
};
exports.SendGateService = SendGateService;
exports.SendGateService = SendGateService = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, bullmq_1.InjectQueue)(messaging_constants_1.MESSAGES_QUEUE)),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        template_registry_service_1.TemplateRegistryService,
        bullmq_2.Queue])
], SendGateService);
//# sourceMappingURL=send-gate.service.js.map