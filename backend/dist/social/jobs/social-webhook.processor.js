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
var SocialWebhookProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.SocialWebhookProcessor = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const social_inbox_service_1 = require("../social-inbox.service");
const social_constants_1 = require("../social.constants");
let SocialWebhookProcessor = SocialWebhookProcessor_1 = class SocialWebhookProcessor extends bullmq_1.WorkerHost {
    inbox;
    logger = new common_1.Logger(SocialWebhookProcessor_1.name);
    constructor(inbox) {
        super();
        this.inbox = inbox;
    }
    async process(job) {
        const { platform, body } = job.data;
        const isMetaFamily = social_constants_1.META_FAMILY_PLATFORMS.includes(platform);
        if (isMetaFamily) {
            for (const entry of body.entry ?? []) {
                const externalAccountId = entry.id;
                if (!externalAccountId)
                    continue;
                for (const change of entry.changes ?? []) {
                    const value = change.value;
                    if (!value?.comment_id)
                        continue;
                    const item = {
                        externalId: value.comment_id,
                        kind: 'comment',
                        authorName: value.sender_name,
                        text: value.message ?? '',
                        postExternalId: value.post_id,
                        receivedAt: new Date().toISOString(),
                    };
                    await this.inbox
                        .ingest(platform, externalAccountId, item)
                        .catch((error) => this.logger.warn(`Social inbox ingest failed (${platform}): ${error.message}`));
                }
                for (const message of entry.messaging ?? []) {
                    if (!message.message?.mid)
                        continue;
                    const item = {
                        externalId: message.message.mid,
                        kind: 'dm',
                        authorName: message.sender?.id,
                        text: message.message.text ?? '',
                        receivedAt: message.timestamp
                            ? new Date(message.timestamp).toISOString()
                            : new Date().toISOString(),
                    };
                    await this.inbox
                        .ingest(platform, externalAccountId, item)
                        .catch((error) => this.logger.warn(`Social inbox ingest failed (${platform}): ${error.message}`));
                }
            }
            return;
        }
        if (!body.externalAccountId || !body.externalId || !body.kind || !body.text)
            return;
        const item = {
            externalId: body.externalId,
            kind: body.kind,
            authorName: body.authorName,
            text: body.text,
            postExternalId: body.postExternalId,
            receivedAt: body.receivedAt ?? new Date().toISOString(),
        };
        await this.inbox
            .ingest(platform, body.externalAccountId, item)
            .catch((error) => this.logger.warn(`Social inbox ingest failed (${platform}): ${error.message}`));
    }
};
exports.SocialWebhookProcessor = SocialWebhookProcessor;
exports.SocialWebhookProcessor = SocialWebhookProcessor = SocialWebhookProcessor_1 = __decorate([
    (0, bullmq_1.Processor)(social_constants_1.SOCIAL_WEBHOOK_QUEUE),
    __metadata("design:paramtypes", [social_inbox_service_1.SocialInboxService])
], SocialWebhookProcessor);
//# sourceMappingURL=social-webhook.processor.js.map