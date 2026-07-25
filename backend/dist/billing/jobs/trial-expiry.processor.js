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
var TrialExpiryProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrialExpiryProcessor = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const plan_assignment_service_1 = require("../plan-assignment.service");
const billing_constants_1 = require("../billing.constants");
let TrialExpiryProcessor = TrialExpiryProcessor_1 = class TrialExpiryProcessor extends bullmq_1.WorkerHost {
    prisma;
    planAssignment;
    logger = new common_1.Logger(TrialExpiryProcessor_1.name);
    constructor(prisma, planAssignment) {
        super();
        this.prisma = prisma;
        this.planAssignment = planAssignment;
    }
    async process(job) {
        if (job.name !== 'tick')
            return;
        const now = job.data?.now ? new Date(job.data.now) : new Date();
        return this.runExpiry(now);
    }
    async runExpiry(now = new Date()) {
        const basic = await this.prisma.plan.findUnique({
            where: { key: billing_constants_1.BASIC_PLAN_KEY },
        });
        const expired = await this.prisma.business.findMany({
            where: {
                trialEndsAt: { lte: now },
                stripeSubscriptionId: null,
                ...(basic ? { planId: { not: basic.id } } : {}),
            },
        });
        for (const business of expired) {
            await this.planAssignment.downgradeToBasic(business.id);
        }
        this.logger.debug(`Trial expiry downgraded ${expired.length} business(es)`);
    }
};
exports.TrialExpiryProcessor = TrialExpiryProcessor;
exports.TrialExpiryProcessor = TrialExpiryProcessor = TrialExpiryProcessor_1 = __decorate([
    (0, bullmq_1.Processor)(billing_constants_1.TRIAL_EXPIRY_QUEUE),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        plan_assignment_service_1.PlanAssignmentService])
], TrialExpiryProcessor);
//# sourceMappingURL=trial-expiry.processor.js.map