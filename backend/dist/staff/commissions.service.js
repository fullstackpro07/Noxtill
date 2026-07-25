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
exports.CommissionsService = void 0;
const common_1 = require("@nestjs/common");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const prisma_1 = require("../../generated/prisma");
function isPercentRule(rule) {
    return (!!rule &&
        typeof rule === 'object' &&
        rule.type === 'percent');
}
function isPerServiceRule(rule) {
    return (!!rule &&
        typeof rule === 'object' &&
        rule.type === 'per_service');
}
function monthBounds(month) {
    const [year, mon] = month.split('-').map(Number);
    const start = new Date(Date.UTC(year, mon - 1, 1));
    const end = new Date(Date.UTC(year, mon, 1));
    return { start, end };
}
let CommissionsService = class CommissionsService {
    tenantPrisma;
    constructor(tenantPrisma) {
        this.tenantPrisma = tenantPrisma;
    }
    async report(month) {
        const { start, end } = monthBounds(month);
        const staff = await this.tenantPrisma.client.businessUser.findMany({
            where: { role: { in: ['manager', 'staff'] } },
            include: { user: true },
        });
        return Promise.all(staff.map(async (member) => {
            const rule = member.commissionRule;
            const salesTotal = await this.tenantPrisma.client.order.aggregate({
                where: {
                    staffUserId: member.id,
                    status: prisma_1.OrderStatus.completed,
                    isQuotation: false,
                    createdAt: { gte: start, lt: end },
                },
                _sum: { total: true },
            });
            const totalSales = Number(salesTotal._sum.total ?? 0);
            let commission = 0;
            if (isPercentRule(rule)) {
                commission = round2(totalSales * (rule.value / 100));
            }
            else if (isPerServiceRule(rule)) {
                const appointments = await this.tenantPrisma.client.appointment.findMany({
                    where: {
                        staffUserId: member.id,
                        status: prisma_1.AppointmentStatus.completed,
                        startsAt: { gte: start, lt: end },
                    },
                    select: { serviceId: true },
                });
                commission = round2(appointments.reduce((sum, appt) => sum + (rule.amounts[appt.serviceId] ?? 0), 0));
            }
            return {
                businessUserId: member.id,
                name: member.user.name,
                role: member.role,
                totalSales,
                commission,
            };
        }));
    }
};
exports.CommissionsService = CommissionsService;
exports.CommissionsService = CommissionsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService])
], CommissionsService);
function round2(value) {
    return Math.round(value * 100) / 100;
}
//# sourceMappingURL=commissions.service.js.map