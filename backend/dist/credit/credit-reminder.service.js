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
exports.CreditReminderService = void 0;
const common_1 = require("@nestjs/common");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const locale_service_1 = require("../common/localization/locale.service");
const send_gate_service_1 = require("../messaging/send-gate.service");
const credit_service_1 = require("./credit.service");
let CreditReminderService = class CreditReminderService {
    tenantPrisma;
    locale;
    sendGate;
    creditService;
    constructor(tenantPrisma, locale, sendGate, creditService) {
        this.tenantPrisma = tenantPrisma;
        this.locale = locale;
        this.sendGate = sendGate;
        this.creditService = creditService;
    }
    async remind(businessId, dto) {
        const business = await this.tenantPrisma.client.business.findUniqueOrThrow({
            where: { id: businessId },
        });
        const targets = dto.all
            ? await this.creditService.listDebtors()
            : [
                {
                    customerId: dto.customerId,
                    balance: await this.creditService.getBalance(dto.customerId),
                },
            ];
        let sent = 0;
        let skipped = 0;
        for (const target of targets) {
            const customer = await this.tenantPrisma.client.customer.findUnique({
                where: { id: target.customerId },
            });
            if (!customer || customer.optedOut || target.balance <= 0) {
                skipped += 1;
                continue;
            }
            await this.sendGate
                .send({
                businessId,
                customerId: customer.id,
                templateKey: 'credit_reminder',
                variables: {
                    customerName: customer.name,
                    balance: this.locale.formatCurrency(target.balance, business),
                },
            })
                .catch(() => undefined);
            sent += 1;
        }
        return { sent, skipped };
    }
};
exports.CreditReminderService = CreditReminderService;
exports.CreditReminderService = CreditReminderService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        locale_service_1.LocaleService,
        send_gate_service_1.SendGateService,
        credit_service_1.CreditService])
], CreditReminderService);
//# sourceMappingURL=credit-reminder.service.js.map