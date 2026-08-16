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
exports.VouchersService = void 0;
const crypto_1 = require("crypto");
const common_1 = require("@nestjs/common");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const app_exception_1 = require("../common/filters/app.exception");
const send_gate_service_1 = require("../messaging/send-gate.service");
const vouchers_constants_1 = require("./vouchers.constants");
const prisma_1 = require("../../generated/prisma");
function round2(value) {
    return Math.round(value * 100) / 100;
}
function generateVoucherCode() {
    return (0, crypto_1.randomBytes)(5).toString('hex').toUpperCase();
}
let VouchersService = class VouchersService {
    tenantPrisma;
    sendGate;
    constructor(tenantPrisma, sendGate) {
        this.tenantPrisma = tenantPrisma;
        this.sendGate = sendGate;
    }
    async issue(businessId, dto) {
        const code = dto.code ?? generateVoucherCode();
        let customer = null;
        if (dto.customerId) {
            customer = await this.tenantPrisma.client.customer.findUnique({
                where: { id: dto.customerId },
            });
            if (!customer) {
                throw new common_1.NotFoundException('Customer not found');
            }
        }
        let voucher;
        try {
            voucher = await this.tenantPrisma.client.voucher.create({
                data: {
                    businessId,
                    code,
                    customerId: dto.customerId,
                    initialValue: dto.value,
                    balance: dto.value,
                    expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
                },
            });
        }
        catch (err) {
            if (err instanceof prisma_1.Prisma.PrismaClientKnownRequestError &&
                err.code === 'P2002') {
                throw new app_exception_1.AppException(vouchers_constants_1.VOUCHER_ERROR_CODES.DUPLICATE_CODE, `Voucher code "${code}" already exists`, common_1.HttpStatus.CONFLICT);
            }
            throw err;
        }
        if (customer) {
            await this.sendGate
                .send({
                businessId,
                customerId: customer.id,
                templateKey: vouchers_constants_1.VOUCHER_ISSUED_TEMPLATE_KEY,
                variables: {
                    customerName: customer.name,
                    amount: dto.value.toFixed(2),
                    code,
                },
            })
                .catch(() => undefined);
        }
        return voucher;
    }
    list() {
        return this.tenantPrisma.client.voucher.findMany({
            orderBy: { createdAt: 'desc' },
        });
    }
    async findOne(id) {
        const voucher = await this.tenantPrisma.client.voucher.findUnique({
            where: { id },
        });
        if (!voucher) {
            throw new common_1.NotFoundException('Voucher not found');
        }
        return voucher;
    }
    async cancel(id) {
        await this.findOne(id);
        return this.tenantPrisma.client.voucher.update({
            where: { id },
            data: { status: prisma_1.VoucherStatus.cancelled },
        });
    }
    async validateAndApply(businessId, code, requestedAmount, orderTotal, tx) {
        const voucher = await tx.voucher.findUnique({
            where: { businessId_code: { businessId, code } },
        });
        if (!voucher) {
            throw new app_exception_1.AppException(vouchers_constants_1.VOUCHER_ERROR_CODES.NOT_FOUND, `Voucher "${code}" not found`, common_1.HttpStatus.BAD_REQUEST);
        }
        if (voucher.status !== prisma_1.VoucherStatus.active) {
            throw new app_exception_1.AppException(vouchers_constants_1.VOUCHER_ERROR_CODES.NOT_ACTIVE, `Voucher is "${voucher.status}", expected "active"`, common_1.HttpStatus.BAD_REQUEST);
        }
        if (voucher.expiresAt && voucher.expiresAt < new Date()) {
            throw new app_exception_1.AppException(vouchers_constants_1.VOUCHER_ERROR_CODES.EXPIRED, 'Voucher has expired', common_1.HttpStatus.BAD_REQUEST);
        }
        if (requestedAmount <= 0) {
            throw new app_exception_1.AppException(vouchers_constants_1.VOUCHER_ERROR_CODES.INVALID_AMOUNT, 'Voucher amount must be greater than zero', common_1.HttpStatus.BAD_REQUEST);
        }
        const balance = Number(voucher.balance);
        const amountApplied = round2(Math.min(requestedAmount, balance, orderTotal));
        const newBalance = round2(balance - amountApplied);
        await tx.voucher.update({
            where: { id: voucher.id },
            data: {
                balance: newBalance,
                status: newBalance <= 0 ? prisma_1.VoucherStatus.redeemed : undefined,
            },
        });
        return { voucherId: voucher.id, amountApplied };
    }
};
exports.VouchersService = VouchersService;
exports.VouchersService = VouchersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        send_gate_service_1.SendGateService])
], VouchersService);
//# sourceMappingURL=vouchers.service.js.map