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
exports.ReviewRequestsService = void 0;
const common_1 = require("@nestjs/common");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const send_gate_service_1 = require("../messaging/send-gate.service");
const review_token_util_1 = require("./review-token.util");
const REVIEW_REQUEST_DELAY_MS = 2 * 60 * 60 * 1000;
let ReviewRequestsService = class ReviewRequestsService {
    tenantPrisma;
    sendGate;
    constructor(tenantPrisma, sendGate) {
        this.tenantPrisma = tenantPrisma;
        this.sendGate = sendGate;
    }
    async create(businessId, dto) {
        let customerId = dto.customerId;
        if (!customerId && dto.phone) {
            const customer = await this.tenantPrisma.client.customer.findUnique({
                where: { businessId_phone: { businessId, phone: dto.phone } },
            });
            if (!customer) {
                throw new common_1.NotFoundException('No customer found with that phone number');
            }
            customerId = customer.id;
        }
        if (!customerId) {
            throw new common_1.NotFoundException('customerId or phone is required');
        }
        const token = (0, review_token_util_1.generateReviewToken)();
        const reviewRequest = await this.tenantPrisma.client.reviewRequest.create({
            data: {
                businessId,
                customerId,
                token,
                source: dto.source,
                sourceId: dto.sourceId,
            },
        });
        await this.scheduleSend(businessId, customerId, token);
        return reviewRequest;
    }
    async scheduleSend(businessId, customerId, token) {
        await this.sendGate
            .send({
            businessId,
            customerId,
            templateKey: 'review_request',
            scheduledFor: new Date(Date.now() + REVIEW_REQUEST_DELAY_MS),
            variables: { reviewUrl: `/r/${token}` },
        })
            .catch(() => undefined);
    }
};
exports.ReviewRequestsService = ReviewRequestsService;
exports.ReviewRequestsService = ReviewRequestsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        send_gate_service_1.SendGateService])
], ReviewRequestsService);
//# sourceMappingURL=review-requests.service.js.map