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
var HealthScoreSnapshotProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.HealthScoreSnapshotProcessor = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const tenant_prisma_service_1 = require("../../common/tenancy/tenant-prisma.service");
const health_score_service_1 = require("../health-score.service");
const dashboard_constants_1 = require("../dashboard.constants");
let HealthScoreSnapshotProcessor = HealthScoreSnapshotProcessor_1 = class HealthScoreSnapshotProcessor extends bullmq_1.WorkerHost {
    prisma;
    tenantPrisma;
    healthScoreService;
    logger = new common_1.Logger(HealthScoreSnapshotProcessor_1.name);
    constructor(prisma, tenantPrisma, healthScoreService) {
        super();
        this.prisma = prisma;
        this.tenantPrisma = tenantPrisma;
        this.healthScoreService = healthScoreService;
    }
    async process(job) {
        if (job.name !== 'tick')
            return;
        return this.runSnapshot();
    }
    async runSnapshot() {
        const businesses = await this.prisma.business.findMany({
            select: { id: true },
        });
        let succeeded = 0;
        for (const { id: businessId } of businesses) {
            try {
                await this.snapshotOne(businessId);
                succeeded += 1;
            }
            catch (error) {
                this.logger.warn(`Health score snapshot failed for business ${businessId}: ${error.message}`);
            }
        }
        this.logger.debug(`Health score snapshot evaluated ${succeeded}/${businesses.length} business(es)`);
    }
    async snapshotOne(businessId) {
        const [weights, raw] = await Promise.all([
            this.healthScoreService.getWeights(businessId),
            this.healthScoreService.computeRawComponents(businessId),
        ]);
        const components = this.healthScoreService.weightComponents(raw, weights);
        const totalScore = components.ratingTrend +
            components.repeatCustomerRate +
            components.margin +
            components.creditRecovery;
        await this.tenantPrisma.client.healthScoreSnapshot.create({
            data: {
                businessId,
                ratingTrendScore: components.ratingTrend,
                repeatCustomerScore: components.repeatCustomerRate,
                marginScore: components.margin,
                creditRecoveryScore: components.creditRecovery,
                totalScore,
            },
        });
    }
};
exports.HealthScoreSnapshotProcessor = HealthScoreSnapshotProcessor;
exports.HealthScoreSnapshotProcessor = HealthScoreSnapshotProcessor = HealthScoreSnapshotProcessor_1 = __decorate([
    (0, bullmq_1.Processor)(dashboard_constants_1.HEALTH_SCORE_SNAPSHOT_QUEUE),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        tenant_prisma_service_1.TenantPrismaService,
        health_score_service_1.HealthScoreService])
], HealthScoreSnapshotProcessor);
//# sourceMappingURL=health-score-snapshot.processor.js.map