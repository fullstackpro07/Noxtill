"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.StaffService = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
const bcrypt = __importStar(require("bcrypt"));
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const app_exception_1 = require("../common/filters/app.exception");
const staff_constants_1 = require("./staff.constants");
const prisma_1 = require("../../generated/prisma");
const INBOX_APPOINTMENT_WINDOW_DAYS = 14;
const BCRYPT_ROUNDS = 10;
let StaffService = class StaffService {
    tenantPrisma;
    constructor(tenantPrisma) {
        this.tenantPrisma = tenantPrisma;
    }
    list() {
        return this.tenantPrisma.client.businessUser.findMany({
            where: { role: { in: [prisma_1.Role.owner, prisma_1.Role.manager, prisma_1.Role.staff] } },
            include: { user: true },
            orderBy: { createdAt: 'asc' },
        });
    }
    async inbox() {
        const windowEnd = new Date(Date.now() + INBOX_APPOINTMENT_WINDOW_DAYS * 24 * 60 * 60 * 1000);
        const [appointments, complaints, restockProducts] = await Promise.all([
            this.tenantPrisma.client.appointment.findMany({
                where: {
                    status: {
                        in: [prisma_1.AppointmentStatus.booked, prisma_1.AppointmentStatus.confirmed],
                    },
                    startsAt: { lte: windowEnd },
                },
                include: { customer: true, service: true },
                orderBy: { startsAt: 'asc' },
            }),
            this.tenantPrisma.client.privateFeedback.findMany({
                where: { status: { not: prisma_1.FeedbackStatus.resolved } },
                orderBy: { createdAt: 'asc' },
            }),
            this.tenantPrisma.client.product.findMany({
                where: { kind: prisma_1.ProductKind.product, active: true },
            }),
        ]);
        const tasks = [];
        for (const a of appointments) {
            tasks.push({
                id: a.id,
                type: 'appointment',
                title: a.customer.name,
                detail: a.service.name,
                assigneeStaffId: a.staffUserId,
                dueAt: a.startsAt.toISOString(),
            });
        }
        for (const f of complaints) {
            tasks.push({
                id: f.id,
                type: 'complaint',
                title: `${f.stars}★ feedback`,
                detail: f.message ?? 'No comment left',
                assigneeStaffId: f.assignedTo,
                dueAt: f.createdAt.toISOString(),
            });
        }
        for (const p of restockProducts.filter((p) => p.stockQty <= p.lowStockThreshold)) {
            tasks.push({
                id: p.id,
                type: 'restock',
                title: p.name,
                detail: `${p.stockQty} left (threshold ${p.lowStockThreshold})`,
                assigneeStaffId: null,
                dueAt: null,
            });
        }
        return tasks;
    }
    async create(businessId, dto) {
        if (!dto.email && !dto.phone) {
            throw new app_exception_1.AppException(staff_constants_1.STAFF_ERROR_CODES.IDENTITY_REQUIRED, 'An email or phone number is required to invite staff', common_1.HttpStatus.BAD_REQUEST);
        }
        const identityFilters = [];
        if (dto.email)
            identityFilters.push({ email: dto.email });
        if (dto.phone)
            identityFilters.push({ phone: dto.phone });
        let user = await this.tenantPrisma.client.user.findFirst({
            where: { OR: identityFilters },
        });
        let tempPassword;
        if (user) {
            const existingLink = await this.tenantPrisma.client.businessUser.findUnique({
                where: { businessId_userId: { businessId, userId: user.id } },
            });
            if (existingLink) {
                throw new app_exception_1.AppException(staff_constants_1.STAFF_ERROR_CODES.ALREADY_STAFF, 'This person is already staff at this business', common_1.HttpStatus.CONFLICT);
            }
        }
        else {
            tempPassword = (0, crypto_1.randomBytes)(staff_constants_1.TEMP_PASSWORD_BYTES).toString('hex');
            const passwordHash = await bcrypt.hash(tempPassword, BCRYPT_ROUNDS);
            user = await this.tenantPrisma.client.user.create({
                data: {
                    name: dto.name,
                    email: dto.email,
                    phone: dto.phone,
                    passwordHash,
                },
            });
        }
        const businessUser = await this.tenantPrisma.client.businessUser.create({
            data: {
                businessId,
                userId: user.id,
                role: dto.role,
                commissionRule: (dto.commissionRule ?? {}),
            },
            include: { user: true },
        });
        return { ...businessUser, tempPassword };
    }
    async update(id, dto) {
        const existing = await this.loadNonOwner(id);
        if (dto.customRoleId) {
            const customRole = await this.tenantPrisma.client.customRole.findUnique({ where: { id: dto.customRoleId } });
            if (!customRole) {
                throw new common_1.NotFoundException('Custom role not found');
            }
        }
        return this.tenantPrisma.client.businessUser.update({
            where: { id: existing.id },
            data: {
                role: dto.role,
                commissionRule: dto.commissionRule,
                customRoleId: dto.customRoleId === undefined ? undefined : dto.customRoleId,
            },
            include: { user: true },
        });
    }
    async remove(id) {
        const existing = await this.loadNonOwner(id);
        await this.tenantPrisma.client.businessUser.delete({
            where: { id: existing.id },
        });
        return { success: true };
    }
    async loadNonOwner(id) {
        const businessUser = await this.tenantPrisma.client.businessUser.findUnique({
            where: { id },
        });
        if (!businessUser) {
            throw new common_1.NotFoundException('Staff member not found');
        }
        if (businessUser.role === prisma_1.Role.owner) {
            throw new app_exception_1.AppException(staff_constants_1.STAFF_ERROR_CODES.CANNOT_MODIFY_OWNER, "The business owner's role cannot be changed here", common_1.HttpStatus.FORBIDDEN);
        }
        return businessUser;
    }
};
exports.StaffService = StaffService;
exports.StaffService = StaffService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService])
], StaffService);
//# sourceMappingURL=staff.service.js.map