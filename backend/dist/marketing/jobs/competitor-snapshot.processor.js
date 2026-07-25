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
var CompetitorSnapshotProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompetitorSnapshotProcessor = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const marketing_constants_1 = require("../marketing.constants");
let CompetitorSnapshotProcessor = CompetitorSnapshotProcessor_1 = class CompetitorSnapshotProcessor extends bullmq_1.WorkerHost {
    prisma;
    logger = new common_1.Logger(CompetitorSnapshotProcessor_1.name);
    constructor(prisma) {
        super();
        this.prisma = prisma;
    }
    async process(job) {
        if (job.name !== 'tick')
            return;
        return this.runSnapshot();
    }
    async runSnapshot() {
        const competitors = await this.prisma.competitor.findMany();
        for (const competitor of competitors) {
            const snapshot = await this.fetchPlaceSnapshot(competitor.platformRef);
            if (!snapshot)
                continue;
            await this.prisma.competitor.update({
                where: { id: competitor.id },
                data: {
                    lastRating: snapshot.rating,
                    lastReviewsCount: snapshot.reviewsCount,
                },
            });
        }
        this.logger.debug(`Competitor snapshot evaluated ${competitors.length} competitor(s)`);
    }
    fetchPlaceSnapshot(platformRef) {
        void platformRef;
        return Promise.resolve(null);
    }
};
exports.CompetitorSnapshotProcessor = CompetitorSnapshotProcessor;
exports.CompetitorSnapshotProcessor = CompetitorSnapshotProcessor = CompetitorSnapshotProcessor_1 = __decorate([
    (0, bullmq_1.Processor)(marketing_constants_1.COMPETITOR_SNAPSHOT_QUEUE),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], CompetitorSnapshotProcessor);
//# sourceMappingURL=competitor-snapshot.processor.js.map