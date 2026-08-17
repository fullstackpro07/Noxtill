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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var EmailCampaignsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailCampaignsService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
const tenant_prisma_service_1 = require("../../common/tenancy/tenant-prisma.service");
const segments_service_1 = require("../../customers/segments.service");
const app_exception_1 = require("../../common/filters/app.exception");
const signed_token_util_1 = require("../signed-token.util");
const prisma_1 = require("../../../generated/prisma");
let EmailCampaignsService = EmailCampaignsService_1 = class EmailCampaignsService {
    tenantPrisma;
    segments;
    config;
    logger = new common_1.Logger(EmailCampaignsService_1.name);
    constructor(tenantPrisma, segments, config) {
        this.tenantPrisma = tenantPrisma;
        this.segments = segments;
        this.config = config;
    }
    async create(businessId, dto) {
        const { members } = await this.segments.getSegment(dto.segment);
        const campaign = await this.tenantPrisma.client.emailCampaign.create({
            data: {
                subject: dto.subject,
                body: dto.body,
                segment: dto.segment,
            },
        });
        const eligible = [];
        for (const member of members) {
            if (!member.email)
                continue;
            const suppressed = await this.isSuppressed(businessId, member.email);
            if (!suppressed)
                eligible.push({ email: member.email });
        }
        let sentCount = 0;
        for (const recipient of eligible) {
            const sent = await this.sendOne(businessId, campaign.id, dto, recipient.email);
            if (sent)
                sentCount += 1;
        }
        return this.tenantPrisma.client.emailCampaign.update({
            where: { id: campaign.id },
            data: { sentCount },
        });
    }
    list(businessId) {
        return this.tenantPrisma.client.emailCampaign.findMany({
            where: { businessId },
            orderBy: { createdAt: 'desc' },
        });
    }
    async funnel(businessId, campaignId) {
        const campaign = await this.tenantPrisma.client.emailCampaign.findFirst({
            where: { id: campaignId, businessId },
        });
        if (!campaign) {
            throw new app_exception_1.AppException('EMAIL_CAMPAIGN_NOT_FOUND', 'Email campaign not found', common_1.HttpStatus.NOT_FOUND);
        }
        const counts = await this.tenantPrisma.client.emailEvent.groupBy({
            by: ['type'],
            where: { emailCampaignId: campaignId },
            _count: { _all: true },
        });
        const byType = new Map(counts.map((c) => [c.type, c._count._all]));
        return {
            campaignId,
            sent: byType.get(prisma_1.EmailEventType.sent) ?? 0,
            delivered: byType.get(prisma_1.EmailEventType.delivered) ?? 0,
            opened: byType.get(prisma_1.EmailEventType.open) ?? 0,
            clicked: byType.get(prisma_1.EmailEventType.click) ?? 0,
            unsubscribed: byType.get(prisma_1.EmailEventType.unsub) ?? 0,
        };
    }
    async listHealth(businessId) {
        const [subscribedCustomers, unsubscribed] = await Promise.all([
            this.tenantPrisma.client.customer.count({
                where: { businessId, email: { not: null }, optedOut: false },
            }),
            this.tenantPrisma.client.emailEvent.count({
                where: { type: prisma_1.EmailEventType.unsub, emailCampaign: { businessId } },
            }),
        ]);
        return { subscribed: subscribedCustomers, unsubscribed, bounced: 0 };
    }
    async unsubscribe(token) {
        const payload = (0, signed_token_util_1.verifyPayload)(token, this.unsubscribeSecret());
        if (!payload) {
            throw new app_exception_1.AppException('INVALID_UNSUBSCRIBE_TOKEN', 'This unsubscribe link is invalid or has expired.', common_1.HttpStatus.BAD_REQUEST);
        }
        await this.tenantPrisma.client.emailEvent.create({
            data: {
                emailCampaignId: payload.campaignId,
                recipient: payload.email,
                type: prisma_1.EmailEventType.unsub,
            },
        });
        return { ok: true };
    }
    async isSuppressed(businessId, email) {
        const priorUnsub = await this.tenantPrisma.client.emailEvent.findFirst({
            where: {
                type: prisma_1.EmailEventType.unsub,
                recipient: email,
                emailCampaign: { businessId },
            },
        });
        return !!priorUnsub;
    }
    async sendOne(businessId, campaignId, dto, email) {
        const unsubscribeToken = (0, signed_token_util_1.signPayload)({ email, businessId, campaignId }, this.unsubscribeSecret());
        const frontendUrl = this.config.get('FRONTEND_URL') ?? 'http://localhost:3000';
        const unsubscribeLink = `${frontendUrl}/unsubscribe?token=${unsubscribeToken}`;
        const textBody = `${dto.body}\n\n---\nUnsubscribe: ${unsubscribeLink}`;
        try {
            await axios_1.default.post('https://api.postmarkapp.com/email', {
                From: this.config.get('EMAIL_FROM_ADDRESS'),
                To: email,
                Subject: dto.subject,
                TextBody: textBody,
            }, {
                headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                    'X-Postmark-Server-Token': this.config.get('EMAIL_PROVIDER_KEY') ?? '',
                },
            });
            await this.tenantPrisma.client.emailEvent.create({
                data: {
                    emailCampaignId: campaignId,
                    recipient: email,
                    type: prisma_1.EmailEventType.sent,
                },
            });
            return true;
        }
        catch (error) {
            this.logger.warn(`Email send failed for campaign ${campaignId}: ${error.message}`);
            return false;
        }
    }
    unsubscribeSecret() {
        return this.config.get('EMAIL_UNSUBSCRIBE_SECRET') ?? '';
    }
};
exports.EmailCampaignsService = EmailCampaignsService;
exports.EmailCampaignsService = EmailCampaignsService = EmailCampaignsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        segments_service_1.SegmentsService,
        config_1.ConfigService])
], EmailCampaignsService);
//# sourceMappingURL=email-campaigns.service.js.map