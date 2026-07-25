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
exports.AdminService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const ACTIVATION_FUNNEL_EVENTS = [
    'signup_started',
    'signup_completed',
    'first_sale_recorded',
    'first_review_request_sent',
];
let AdminService = class AdminService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async activationFunnel(sinceDays = 30) {
        const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
        const counts = await Promise.all(ACTIVATION_FUNNEL_EVENTS.map(async (name) => ({
            name,
            count: await this.prisma.event.count({
                where: { name, createdAt: { gte: since } },
            }),
        })));
        return counts;
    }
    async events(name, limit = 100) {
        return this.prisma.event.findMany({
            where: name ? { name } : undefined,
            orderBy: { createdAt: 'desc' },
            take: limit,
        });
    }
    async businessesSummary() {
        const [total, byPlan] = await Promise.all([
            this.prisma.business.count(),
            this.prisma.business.groupBy({ by: ['planId'], _count: { _all: true } }),
        ]);
        return { total, byPlan };
    }
};
exports.AdminService = AdminService;
exports.AdminService = AdminService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AdminService);
//# sourceMappingURL=admin.service.js.map