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
Object.defineProperty(exports, "__esModule", { value: true });
exports.CampaignsService = void 0;
const common_1 = require("@nestjs/common");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const app_exception_1 = require("../common/filters/app.exception");
const send_gate_service_1 = require("../messaging/send-gate.service");
const segments_service_1 = require("../customers/segments.service");
const marketing_constants_1 = require("./marketing.constants");
const prisma_1 = require("../../generated/prisma");
let CampaignsService = class CampaignsService {
    tenantPrisma;
    sendGate;
    segments;
    constructor(tenantPrisma, sendGate, segments) {
        this.tenantPrisma = tenantPrisma;
        this.sendGate = sendGate;
        this.segments = segments;
    }
    async create(businessId, dto) {
        const business = await this.tenantPrisma.client.business.findUniqueOrThrow({
            where: { id: businessId },
        });
        const { members } = await this.segments.getSegment(dto.segment);
        const eligible = members.filter((m) => !m.optedOut);
        if (eligible.length === 0) {
            throw new app_exception_1.AppException(marketing_constants_1.MARKETING_ERROR_CODES.EMPTY_SEGMENT, `Segment "${dto.segment}" has no reachable (non-opted-out) customers`, common_1.HttpStatus.BAD_REQUEST);
        }
        const remainingQuota = business.msgQuota - business.msgUsed;
        if (eligible.length > remainingQuota) {
            throw new app_exception_1.AppException(marketing_constants_1.MARKETING_ERROR_CODES.QUOTA_EXCEEDED, `This send needs ${eligible.length} messages but only ${remainingQuota} remain this month`, common_1.HttpStatus.FORBIDDEN);
        }
        const campaign = await this.tenantPrisma.client.campaign.create({
            data: {
                segment: dto.segment,
                templateKey: marketing_constants_1.CAMPAIGN_TEMPLATE_KEY,
                body: dto.body,
                scheduledFor: dto.scheduledFor ? new Date(dto.scheduledFor) : undefined,
            },
        });
        let sentCount = 0;
        for (const customer of eligible) {
            const personalizedBody = dto.body.replace(/{{\s*customerName\s*}}/g, customer.name);
            await this.sendGate
                .send({
                businessId,
                customerId: customer.id,
                templateKey: marketing_constants_1.CAMPAIGN_TEMPLATE_KEY,
                variables: { body: personalizedBody },
                scheduledFor: dto.scheduledFor
                    ? new Date(dto.scheduledFor)
                    : undefined,
                campaignId: campaign.id,
            })
                .then(() => {
                sentCount += 1;
            })
                .catch(() => undefined);
        }
        return this.tenantPrisma.client.campaign.update({
            where: { id: campaign.id },
            data: { sentCount },
        });
    }
    list() {
        return this.tenantPrisma.client.campaign.findMany({
            orderBy: { createdAt: 'desc' },
        });
    }
    async report(campaignId) {
        const campaign = await this.tenantPrisma.client.campaign.findUnique({
            where: { id: campaignId },
        });
        if (!campaign) {
            throw new common_1.NotFoundException('Campaign not found');
        }
        const counts = await this.tenantPrisma.client.message.groupBy({
            by: ['status'],
            where: { campaignId },
            _count: { _all: true },
        });
        const byStatus = new Map(counts.map((c) => [c.status, c._count._all]));
        return {
            campaignId,
            segment: campaign.segment,
            sent: campaign.sentCount,
            delivered: byStatus.get(prisma_1.MessageStatus.delivered) ?? 0,
            read: byStatus.get(prisma_1.MessageStatus.read) ?? 0,
            failed: byStatus.get(prisma_1.MessageStatus.failed) ?? 0,
        };
    }
};
exports.CampaignsService = CampaignsService;
exports.CampaignsService = CampaignsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        send_gate_service_1.SendGateService,
        segments_service_1.SegmentsService])
], CampaignsService);
//# sourceMappingURL=campaigns.service.js.map