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
exports.CustomersService = void 0;
const common_1 = require("@nestjs/common");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const audit_service_1 = require("../common/audit/audit.service");
const app_exception_1 = require("../common/filters/app.exception");
const phone_util_1 = require("../common/utils/phone.util");
const customers_constants_1 = require("./customers.constants");
let CustomersService = class CustomersService {
    tenantPrisma;
    auditService;
    constructor(tenantPrisma, auditService) {
        this.tenantPrisma = tenantPrisma;
        this.auditService = auditService;
    }
    async create(businessId, dto) {
        const business = await this.tenantPrisma.client.business.findUniqueOrThrow({
            where: { id: businessId },
        });
        const phone = (0, phone_util_1.normalizePhoneE164)(dto.phone, business.country ?? undefined);
        if (!phone) {
            throw new app_exception_1.AppException(customers_constants_1.CUSTOMER_ERROR_CODES.INVALID_PHONE, `Could not parse phone: ${dto.phone}`, common_1.HttpStatus.BAD_REQUEST);
        }
        return this.tenantPrisma.client.customer.create({
            data: {
                phone,
                name: dto.name,
                email: dto.email,
                address: dto.address,
                birthday: dto.birthday ? new Date(dto.birthday) : undefined,
                notes: dto.notes,
                tags: dto.tags ?? [],
                consentMarketing: dto.consentMarketing ?? true,
            },
        });
    }
    findAll(query) {
        const where = {
            tags: query.tag ? { has: query.tag } : undefined,
            OR: query.q
                ? [
                    { name: { contains: query.q, mode: 'insensitive' } },
                    { phone: { contains: query.q } },
                ]
                : undefined,
        };
        return this.tenantPrisma.client.customer.findMany({
            where,
            orderBy: { name: 'asc' },
        });
    }
    async findOne(id) {
        const customer = await this.tenantPrisma.client.customer.findUnique({
            where: { id },
            include: {
                orders: {
                    orderBy: { createdAt: 'desc' },
                    take: 20,
                    include: { items: true },
                },
                privateFeedback: { orderBy: { createdAt: 'desc' } },
            },
        });
        if (!customer) {
            throw new common_1.NotFoundException('Customer not found');
        }
        return customer;
    }
    async update(id, dto) {
        await this.assertExists(id);
        return this.tenantPrisma.client.customer.update({
            where: { id },
            data: {
                notes: dto.notes,
                tags: dto.tags,
                consentMarketing: dto.consentMarketing,
                name: dto.name,
                address: dto.address,
            },
        });
    }
    async erase(id, confirmPhone) {
        const customer = await this.assertExists(id);
        if (confirmPhone !== customer.phone) {
            throw new app_exception_1.AppException(customers_constants_1.CUSTOMER_ERROR_CODES.CONFIRMATION_MISMATCH, "Confirmation does not match this customer's phone number", common_1.HttpStatus.BAD_REQUEST);
        }
        const before = {
            name: customer.name,
            phone: customer.phone,
            email: customer.email,
            address: customer.address,
        };
        const erased = await this.tenantPrisma.client.customer.update({
            where: { id },
            data: {
                name: 'Erased Customer',
                phone: `erased-${customer.id}`,
                email: null,
                address: null,
                birthday: null,
                notes: null,
                tags: [],
            },
        });
        await this.auditService.log({
            entity: 'Customer',
            entityId: id,
            action: 'customer.erase',
            before,
            after: { erased: true },
        });
        return erased;
    }
    async assertExists(id) {
        const customer = await this.tenantPrisma.client.customer.findUnique({
            where: { id },
        });
        if (!customer) {
            throw new common_1.NotFoundException('Customer not found');
        }
        return customer;
    }
};
exports.CustomersService = CustomersService;
exports.CustomersService = CustomersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        audit_service_1.AuditService])
], CustomersService);
//# sourceMappingURL=customers.service.js.map