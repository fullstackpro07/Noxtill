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
exports.NotificationsService = void 0;
const common_1 = require("@nestjs/common");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const LIST_LIMIT = 50;
let NotificationsService = class NotificationsService {
    tenantPrisma;
    constructor(tenantPrisma) {
        this.tenantPrisma = tenantPrisma;
    }
    async list(userId) {
        return this.tenantPrisma.client.notification.findMany({
            where: { userId },
            orderBy: { createdAt: 'desc' },
            take: LIST_LIMIT,
        });
    }
    async create(businessId, userId, input) {
        return this.tenantPrisma.client.notification.create({
            data: { businessId, userId, ...input },
        });
    }
    async markRead(userId, id) {
        const notification = await this.tenantPrisma.client.notification.findUnique({
            where: { id },
        });
        if (!notification || notification.userId !== userId) {
            throw new common_1.NotFoundException('Notification not found');
        }
        return this.tenantPrisma.client.notification.update({
            where: { id },
            data: { read: true },
        });
    }
};
exports.NotificationsService = NotificationsService;
exports.NotificationsService = NotificationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService])
], NotificationsService);
//# sourceMappingURL=notifications.service.js.map