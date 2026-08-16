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
exports.PublicCreditService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const credit_types_1 = require("./credit.types");
let PublicCreditService = class PublicCreditService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getByToken(token) {
        const link = await this.prisma.creditShareLink.findUnique({
            where: { token },
        });
        if (!link || link.revoked) {
            throw new common_1.NotFoundException('Link not found');
        }
        const [business, customer, entries] = await Promise.all([
            this.prisma.business.findUniqueOrThrow({
                where: { id: link.businessId },
            }),
            this.prisma.customer.findUniqueOrThrow({
                where: { id: link.customerId },
            }),
            this.prisma.creditEntry.findMany({
                where: { customerId: link.customerId },
                orderBy: { createdAt: 'asc' },
            }),
        ]);
        const rows = (0, credit_types_1.buildLedgerRows)(entries);
        return {
            businessName: business.name,
            customerName: customer.name,
            balance: rows.length ? rows[rows.length - 1].runningBalance : 0,
            entries: rows,
        };
    }
};
exports.PublicCreditService = PublicCreditService;
exports.PublicCreditService = PublicCreditService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], PublicCreditService);
//# sourceMappingURL=public-credit.service.js.map