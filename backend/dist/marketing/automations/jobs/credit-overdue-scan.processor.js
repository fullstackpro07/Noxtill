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
var CreditOverdueScanProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CreditOverdueScanProcessor = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
const workflow_trigger_service_1 = require("../workflow-trigger.service");
const workflows_constants_1 = require("../workflows.constants");
const prisma_1 = require("../../../../generated/prisma");
let CreditOverdueScanProcessor = CreditOverdueScanProcessor_1 = class CreditOverdueScanProcessor extends bullmq_1.WorkerHost {
    prisma;
    workflowTrigger;
    logger = new common_1.Logger(CreditOverdueScanProcessor_1.name);
    constructor(prisma, workflowTrigger) {
        super();
        this.prisma = prisma;
        this.workflowTrigger = workflowTrigger;
    }
    async process() {
        const businesses = await this.prisma.business.findMany({
            select: { id: true },
        });
        for (const business of businesses) {
            await this.scanBusiness(business.id).catch((error) => this.logger.error(`Credit-overdue scan failed for business ${business.id}: ${error.message}`));
        }
    }
    async scanBusiness(businessId) {
        const now = new Date();
        const overdueInstallments = await this.prisma.installment.findMany({
            where: {
                businessId,
                status: prisma_1.InstallmentStatus.pending,
                dueDate: { lt: now },
            },
        });
        for (const installment of overdueInstallments) {
            if (await this.alreadyFlaggedToday(businessId, installment.id))
                continue;
            const event = await this.prisma.activityEvent.create({
                data: {
                    businessId,
                    type: prisma_1.ActivityEventType.credit_overdue,
                    description: `Installment #${installment.seq} overdue (${Number(installment.amount)})`,
                    amount: installment.amount,
                    entityType: 'Installment',
                    entityId: installment.id,
                },
            });
            void this.workflowTrigger
                .dispatch(businessId, event.type, {
                description: event.description,
                entityType: event.entityType,
                entityId: event.entityId,
                amount: event.amount ? Number(event.amount) : undefined,
            })
                .catch((error) => this.logger.warn(`Workflow dispatch failed for credit_overdue event ${event.id}: ${error.message}`));
        }
    }
    async alreadyFlaggedToday(businessId, installmentId) {
        const startOfDay = new Date();
        startOfDay.setUTCHours(0, 0, 0, 0);
        const count = await this.prisma.activityEvent.count({
            where: {
                businessId,
                type: prisma_1.ActivityEventType.credit_overdue,
                entityId: installmentId,
                createdAt: { gte: startOfDay },
            },
        });
        return count > 0;
    }
};
exports.CreditOverdueScanProcessor = CreditOverdueScanProcessor;
exports.CreditOverdueScanProcessor = CreditOverdueScanProcessor = CreditOverdueScanProcessor_1 = __decorate([
    (0, bullmq_1.Processor)(workflows_constants_1.CREDIT_OVERDUE_SCAN_QUEUE),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        workflow_trigger_service_1.WorkflowTriggerService])
], CreditOverdueScanProcessor);
//# sourceMappingURL=credit-overdue-scan.processor.js.map