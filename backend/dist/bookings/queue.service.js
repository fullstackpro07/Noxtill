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
exports.QueueService = void 0;
const common_1 = require("@nestjs/common");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const app_exception_1 = require("../common/filters/app.exception");
const send_gate_service_1 = require("../messaging/send-gate.service");
const bookings_constants_1 = require("./bookings.constants");
const prisma_1 = require("../../generated/prisma");
function todayStart() {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    return d;
}
let QueueService = class QueueService {
    tenantPrisma;
    sendGate;
    constructor(tenantPrisma, sendGate) {
        this.tenantPrisma = tenantPrisma;
        this.sendGate = sendGate;
    }
    async join(businessId, dto) {
        const [{ next }] = await this.tenantPrisma.client.$queryRaw `
      SELECT COALESCE(MAX(number), 0) + 1 AS next FROM queue_tokens
      WHERE business_id = ${businessId} AND created_at >= ${todayStart()}
    `;
        return this.tenantPrisma.client.queueToken.create({
            data: {
                businessId,
                number: next,
                customerId: dto.customerId,
                customerName: dto.customerName,
                serviceId: dto.serviceId,
            },
        });
    }
    list() {
        return this.tenantPrisma.client.queueToken.findMany({
            where: { createdAt: { gte: todayStart() } },
            orderBy: { number: 'asc' },
            include: { customer: true, service: true },
        });
    }
    async call(businessId, id) {
        await this.findWithStatus(id, [prisma_1.QueueTokenStatus.waiting]);
        const updated = await this.tenantPrisma.client.queueToken.update({
            where: { id },
            data: { status: prisma_1.QueueTokenStatus.called, calledAt: new Date() },
        });
        if (updated.customerId) {
            await this.sendGate
                .send({
                businessId,
                customerId: updated.customerId,
                templateKey: 'queue_called',
                variables: { number: String(updated.number) },
            })
                .catch(() => undefined);
        }
        return updated;
    }
    async serve(id) {
        await this.findWithStatus(id, [
            prisma_1.QueueTokenStatus.waiting,
            prisma_1.QueueTokenStatus.called,
        ]);
        return this.tenantPrisma.client.queueToken.update({
            where: { id },
            data: { status: prisma_1.QueueTokenStatus.served, servedAt: new Date() },
        });
    }
    async skip(id) {
        await this.findWithStatus(id, [
            prisma_1.QueueTokenStatus.waiting,
            prisma_1.QueueTokenStatus.called,
        ]);
        return this.tenantPrisma.client.queueToken.update({
            where: { id },
            data: { status: prisma_1.QueueTokenStatus.skipped },
        });
    }
    async findWithStatus(id, allowed) {
        const token = await this.tenantPrisma.client.queueToken.findUnique({
            where: { id },
        });
        if (!token) {
            throw new common_1.NotFoundException('Queue token not found');
        }
        if (!allowed.includes(token.status)) {
            throw new app_exception_1.AppException(bookings_constants_1.QUEUE_ERROR_CODES.INVALID_TRANSITION, `Token is "${token.status}", expected one of: ${allowed.join(', ')}`, common_1.HttpStatus.CONFLICT);
        }
        return token;
    }
};
exports.QueueService = QueueService;
exports.QueueService = QueueService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        send_gate_service_1.SendGateService])
], QueueService);
//# sourceMappingURL=queue.service.js.map