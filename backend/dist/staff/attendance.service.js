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
exports.AttendanceService = void 0;
const common_1 = require("@nestjs/common");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
let AttendanceService = class AttendanceService {
    tenantPrisma;
    constructor(tenantPrisma) {
        this.tenantPrisma = tenantPrisma;
    }
    async toggle(businessId, userId) {
        const businessUser = await this.tenantPrisma.client.businessUser.findUnique({
            where: { businessId_userId: { businessId, userId } },
        });
        if (!businessUser) {
            throw new common_1.NotFoundException('Staff record not found for this account');
        }
        const open = await this.tenantPrisma.client.attendance.findFirst({
            where: { staffUserId: businessUser.id, checkOut: null },
            orderBy: { checkIn: 'desc' },
        });
        if (open) {
            return this.tenantPrisma.client.attendance.update({
                where: { id: open.id },
                data: { checkOut: new Date() },
            });
        }
        return this.tenantPrisma.client.attendance.create({
            data: {
                staffUserId: businessUser.id,
                checkIn: new Date(),
            },
        });
    }
};
exports.AttendanceService = AttendanceService;
exports.AttendanceService = AttendanceService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService])
], AttendanceService);
//# sourceMappingURL=attendance.service.js.map