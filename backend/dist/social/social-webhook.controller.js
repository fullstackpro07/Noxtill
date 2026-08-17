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
exports.SocialWebhookController = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const bullmq_1 = require("@nestjs/bullmq");
const bullmq_2 = require("bullmq");
const public_decorator_1 = require("../common/decorators/public.decorator");
const webhook_idempotency_service_1 = require("../common/webhooks/webhook-idempotency.service");
const signature_util_1 = require("../common/webhooks/signature.util");
const social_constants_1 = require("./social.constants");
let SocialWebhookController = class SocialWebhookController {
    idempotency;
    config;
    queue;
    constructor(idempotency, config, queue) {
        this.idempotency = idempotency;
        this.config = config;
        this.queue = queue;
    }
    verify(platform, query, res) {
        const mode = query['hub.mode'];
        const token = query['hub.verify_token'];
        const challenge = query['hub.challenge'];
        const expected = this.config.get(`SOCIAL_${platform.toUpperCase()}_VERIFY_TOKEN`);
        if (mode === 'subscribe' && expected && (0, signature_util_1.safeEqual)(token ?? '', expected)) {
            res.status(200).send(challenge);
            return;
        }
        res.status(403).send('Forbidden');
    }
    async receive(platform, req, sharedToken) {
        const isMetaFamily = social_constants_1.META_FAMILY_PLATFORMS.includes(platform);
        if (isMetaFamily) {
            const appSecret = this.config.get('FACEBOOK_APP_SECRET');
            if (!appSecret) {
                throw new common_1.ServiceUnavailableException(`${platform} webhook is not configured`);
            }
            const signature = req.headers['x-hub-signature-256'];
            if (!(0, signature_util_1.verifyMetaSignature)(req.rawBody ?? Buffer.from(''), signature, appSecret)) {
                throw new common_1.ForbiddenException('Invalid signature');
            }
            const body = req.body;
            for (const entry of body.entry ?? []) {
                const eventIds = [
                    ...(entry.changes ?? []).flatMap((c) => [c.value?.comment_id, c.value?.message_id].filter((id) => Boolean(id))),
                    ...(entry.messaging ?? [])
                        .map((m) => m.message?.mid)
                        .filter((id) => Boolean(id)),
                ];
                for (const eventId of eventIds) {
                    await this.idempotency.handle(`social:${platform}`, eventId, async () => {
                        await this.queue.add('social-event', { platform, body }, { jobId: `social-${platform}-${eventId}` });
                    });
                }
            }
            return { received: true };
        }
        const expectedToken = this.config.get(`SOCIAL_${platform.toUpperCase()}_VERIFY_TOKEN`);
        if (!expectedToken) {
            throw new common_1.ServiceUnavailableException(`${platform} webhook is not configured`);
        }
        if (!sharedToken || !(0, signature_util_1.safeEqual)(sharedToken, expectedToken)) {
            throw new common_1.ForbiddenException('Invalid webhook token');
        }
        const body = req.body;
        const eventId = body.externalId;
        if (eventId) {
            await this.idempotency.handle(`social:${platform}`, eventId, async () => {
                await this.queue.add('social-event', { platform, body }, { jobId: `social-${platform}-${eventId}` });
            });
        }
        return { received: true };
    }
};
exports.SocialWebhookController = SocialWebhookController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)(':platform'),
    __param(0, (0, common_1.Param)('platform')),
    __param(1, (0, common_1.Query)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", void 0)
], SocialWebhookController.prototype, "verify", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)(':platform'),
    (0, common_1.HttpCode)(200),
    __param(0, (0, common_1.Param)('platform')),
    __param(1, (0, common_1.Req)()),
    __param(2, (0, common_1.Query)('token')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, String]),
    __metadata("design:returntype", Promise)
], SocialWebhookController.prototype, "receive", null);
exports.SocialWebhookController = SocialWebhookController = __decorate([
    (0, common_1.Controller)('webhooks/social'),
    __param(2, (0, bullmq_1.InjectQueue)(social_constants_1.SOCIAL_WEBHOOK_QUEUE)),
    __metadata("design:paramtypes", [webhook_idempotency_service_1.WebhookIdempotencyService,
        config_1.ConfigService,
        bullmq_2.Queue])
], SocialWebhookController);
//# sourceMappingURL=social-webhook.controller.js.map