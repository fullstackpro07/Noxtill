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
exports.WebhooksController = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const bullmq_1 = require("@nestjs/bullmq");
const bullmq_2 = require("bullmq");
const public_decorator_1 = require("../common/decorators/public.decorator");
const webhook_idempotency_service_1 = require("../common/webhooks/webhook-idempotency.service");
const signature_util_1 = require("../common/webhooks/signature.util");
const webhooks_constants_1 = require("./webhooks.constants");
let WebhooksController = class WebhooksController {
    idempotency;
    config;
    webhookQueue;
    constructor(idempotency, config, webhookQueue) {
        this.idempotency = idempotency;
        this.config = config;
        this.webhookQueue = webhookQueue;
    }
    verifyMeta(query, res) {
        const mode = query['hub.mode'];
        const token = query['hub.verify_token'];
        const challenge = query['hub.challenge'];
        if (mode === 'subscribe' &&
            token === this.config.get('META_WA_VERIFY_TOKEN')) {
            res.status(200).send(challenge);
            return;
        }
        res.status(403).send('Forbidden');
    }
    async meta(req, signature) {
        const appSecret = this.config.get('META_APP_SECRET');
        if (appSecret &&
            !(0, signature_util_1.verifyMetaSignature)(req.rawBody ?? Buffer.from(''), signature, appSecret)) {
            throw new common_1.ForbiddenException('Invalid signature');
        }
        const body = req.body;
        for (const entry of body.entry ?? []) {
            for (const change of entry.changes ?? []) {
                for (const status of change.value?.statuses ?? []) {
                    await this.idempotency.handle('meta', status.id, async () => {
                        await this.webhookQueue.add('meta-status', status, {
                            jobId: `meta-status-${status.id}`,
                        });
                    });
                }
                for (const message of change.value?.messages ?? []) {
                    await this.idempotency.handle('meta', message.id, async () => {
                        await this.webhookQueue.add('meta-inbound', message, {
                            jobId: `meta-inbound-${message.id}`,
                        });
                    });
                }
            }
        }
        return { received: true };
    }
    async twilio(req, signature) {
        const authToken = this.config.get('TWILIO_AUTH_TOKEN');
        const body = req.body;
        if (authToken) {
            const fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
            if (!(0, signature_util_1.verifyTwilioSignature)(fullUrl, body, signature, authToken)) {
                throw new common_1.ForbiddenException('Invalid signature');
            }
        }
        const eventId = body.MessageSid ?? body.SmsSid;
        if (eventId) {
            await this.idempotency.handle('twilio', eventId, async () => {
                await this.webhookQueue.add('twilio-status', body, {
                    jobId: `twilio-status-${eventId}`,
                });
            });
        }
        return { received: true };
    }
    async email(req, token) {
        const expected = this.config.get('EMAIL_WEBHOOK_SECRET');
        if (expected && token !== expected) {
            throw new common_1.ForbiddenException('Invalid webhook token');
        }
        const body = req.body;
        const eventId = body.MessageID
            ? `${body.MessageID}-${body.RecordType ?? 'event'}`
            : undefined;
        if (eventId) {
            await this.idempotency.handle('email', eventId, async () => {
                await this.webhookQueue.add('email-event', body, {
                    jobId: `email-event-${eventId}`,
                });
            });
        }
        return { received: true };
    }
};
exports.WebhooksController = WebhooksController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('meta'),
    __param(0, (0, common_1.Query)()),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], WebhooksController.prototype, "verifyMeta", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('meta'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Headers)('x-hub-signature-256')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], WebhooksController.prototype, "meta", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('twilio'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Headers)('x-twilio-signature')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], WebhooksController.prototype, "twilio", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('email'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Req)()),
    __param(1, (0, common_1.Query)('token')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], WebhooksController.prototype, "email", null);
exports.WebhooksController = WebhooksController = __decorate([
    (0, common_1.Controller)('webhooks'),
    __param(2, (0, bullmq_1.InjectQueue)(webhooks_constants_1.WEBHOOK_EVENTS_QUEUE)),
    __metadata("design:paramtypes", [webhook_idempotency_service_1.WebhookIdempotencyService,
        config_1.ConfigService,
        bullmq_2.Queue])
], WebhooksController);
//# sourceMappingURL=webhooks.controller.js.map