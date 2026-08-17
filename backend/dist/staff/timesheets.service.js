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
exports.TimesheetsService = void 0;
const common_1 = require("@nestjs/common");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const prisma_1 = require("../../generated/prisma");
function monthBounds(month) {
    const [year, mon] = month.split('-').map(Number);
    const start = new Date(Date.UTC(year, mon - 1, 1));
    const end = new Date(Date.UTC(year, mon, 1));
    return { start, end };
}
function round2(value) {
    return Math.round(value * 100) / 100;
}
const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_WEEK = 7 * 24 * MS_PER_HOUR;
let TimesheetsService = class TimesheetsService {
    tenantPrisma;
    constructor(tenantPrisma) {
        this.tenantPrisma = tenantPrisma;
    }
    async report(businessId, month) {
        const { start, end } = monthBounds(month);
        const business = await this.tenantPrisma.client.business.findUniqueOrThrow({
            where: { id: businessId },
        });
        const threshold = business.overtimeThresholdHoursPerWeek;
        const staff = await this.tenantPrisma.client.businessUser.findMany({
            where: { role: { in: [prisma_1.Role.manager, prisma_1.Role.staff] } },
            include: { user: true },
        });
        return Promise.all(staff.map(async (member) => {
            const attendance = await this.tenantPrisma.client.attendance.findMany({
                where: {
                    staffUserId: member.id,
                    checkIn: { gte: start, lt: end },
                    checkOut: { not: null },
                },
            });
            const weekHours = new Map();
            let totalHours = 0;
            for (const row of attendance) {
                const hours = (row.checkOut.getTime() - row.checkIn.getTime()) / MS_PER_HOUR;
                totalHours += hours;
                const weekKey = Math.floor(row.checkIn.getTime() / MS_PER_WEEK);
                weekHours.set(weekKey, (weekHours.get(weekKey) ?? 0) + hours);
            }
            let overtimeHours = 0;
            for (const hours of weekHours.values()) {
                overtimeHours += Math.max(0, hours - threshold);
            }
            const scheduledShiftCount = await this.tenantPrisma.client.staffShift.count({
                where: {
                    staffUserId: member.id,
                    startsAt: { gte: start, lt: end },
                },
            });
            const approval = await this.tenantPrisma.client.timesheetApproval.findUnique({
                where: {
                    businessId_staffUserId_month: {
                        businessId,
                        staffUserId: member.id,
                        month,
                    },
                },
            });
            return {
                businessUserId: member.id,
                name: member.user.name,
                role: member.role,
                hoursWorked: round2(totalHours),
                overtimeHours: round2(overtimeHours),
                scheduledShiftCount,
                approved: approval?.approvedAt != null,
                approvedByUserId: approval?.approvedByUserId ?? null,
                approvedAt: approval?.approvedAt ?? null,
            };
        }));
    }
    approve(businessId, staffUserId, month, approvedByUserId) {
        return this.tenantPrisma.client.timesheetApproval.upsert({
            where: {
                businessId_staffUserId_month: { businessId, staffUserId, month },
            },
            create: {
                businessId,
                staffUserId,
                month,
                approvedByUserId,
                approvedAt: new Date(),
            },
            update: { approvedByUserId, approvedAt: new Date() },
        });
    }
};
exports.TimesheetsService = TimesheetsService;
exports.TimesheetsService = TimesheetsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService])
], TimesheetsService);
//# sourceMappingURL=timesheets.service.js.map