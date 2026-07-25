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
var PlanAssignmentService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanAssignmentService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const billing_constants_1 = require("./billing.constants");
let PlanAssignmentService = PlanAssignmentService_1 = class PlanAssignmentService {
    prisma;
    logger = new common_1.Logger(PlanAssignmentService_1.name);
    constructor(prisma) {
        this.prisma = prisma;
    }
    async assignByStripePriceId(businessId, stripePriceId) {
        const plan = await this.prisma.plan.findUnique({
            where: { stripePriceId },
        });
        if (!plan) {
            this.logger.warn(`No plan matches Stripe price ${stripePriceId} — leaving business as-is`);
            return;
        }
        await this.prisma.business.update({
            where: { id: businessId },
            data: { planId: plan.id, msgQuota: plan.msgQuota },
        });
    }
    async downgradeToBasic(businessId) {
        const basic = await this.prisma.plan.findUnique({
            where: { key: billing_constants_1.BASIC_PLAN_KEY },
        });
        if (!basic) {
            this.logger.error(`Basic plan (key="${billing_constants_1.BASIC_PLAN_KEY}") is not seeded — cannot downgrade`);
            return;
        }
        await this.prisma.business.update({
            where: { id: businessId },
            data: { planId: basic.id, msgQuota: basic.msgQuota },
        });
    }
};
exports.PlanAssignmentService = PlanAssignmentService;
exports.PlanAssignmentService = PlanAssignmentService = PlanAssignmentService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], PlanAssignmentService);
//# sourceMappingURL=plan-assignment.service.js.map