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
exports.ExpensesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
function monthBounds(month) {
    const [year, mon] = month.split('-').map(Number);
    const start = new Date(Date.UTC(year, mon - 1, 1));
    const end = new Date(Date.UTC(year, mon, 1));
    return { start, end };
}
let ExpensesService = class ExpensesService {
    tenantPrisma;
    prisma;
    constructor(tenantPrisma, prisma) {
        this.tenantPrisma = tenantPrisma;
        this.prisma = prisma;
    }
    create(dto) {
        return this.tenantPrisma.client.expense.create({
            data: {
                description: dto.description,
                category: dto.category,
                amount: dto.amount,
                recurring: dto.recurring ?? false,
                incurredOn: new Date(dto.incurredOn),
            },
        });
    }
    findAll(query) {
        const where = { category: query.category };
        if (query.month) {
            const { start, end } = monthBounds(query.month);
            where.incurredOn = { gte: start, lt: end };
        }
        return this.tenantPrisma.client.expense.findMany({
            where,
            orderBy: { incurredOn: 'desc' },
        });
    }
    async findOne(id) {
        const expense = await this.tenantPrisma.client.expense.findUnique({
            where: { id },
        });
        if (!expense) {
            throw new common_1.NotFoundException('Expense not found');
        }
        return expense;
    }
    async update(id, dto) {
        await this.findOne(id);
        return this.tenantPrisma.client.expense.update({
            where: { id },
            data: {
                description: dto.description,
                category: dto.category,
                amount: dto.amount,
                recurring: dto.recurring,
                incurredOn: dto.incurredOn ? new Date(dto.incurredOn) : undefined,
            },
        });
    }
    async remove(id) {
        await this.findOne(id);
        await this.tenantPrisma.client.expense.delete({ where: { id } });
    }
    async cloneRecurringExpenses(referenceDate = new Date()) {
        const currentMonthStart = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth(), 1));
        const previousMonthStart = new Date(Date.UTC(referenceDate.getUTCFullYear(), referenceDate.getUTCMonth() - 1, 1));
        const recurringLastMonth = await this.prisma.expense.findMany({
            where: {
                recurring: true,
                incurredOn: { gte: previousMonthStart, lt: currentMonthStart },
            },
        });
        let cloned = 0;
        for (const expense of recurringLastMonth) {
            const alreadyCloned = await this.prisma.expense.findFirst({
                where: {
                    businessId: expense.businessId,
                    description: expense.description,
                    category: expense.category,
                    amount: expense.amount,
                    recurring: true,
                    incurredOn: { gte: currentMonthStart },
                },
            });
            if (alreadyCloned)
                continue;
            await this.prisma.expense.create({
                data: {
                    businessId: expense.businessId,
                    description: expense.description,
                    category: expense.category,
                    amount: expense.amount,
                    recurring: true,
                    incurredOn: currentMonthStart,
                },
            });
            cloned += 1;
        }
        return cloned;
    }
};
exports.ExpensesService = ExpensesService;
exports.ExpensesService = ExpensesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        prisma_service_1.PrismaService])
], ExpensesService);
//# sourceMappingURL=expenses.service.js.map