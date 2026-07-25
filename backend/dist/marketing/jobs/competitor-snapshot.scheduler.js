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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var CompetitorSnapshotScheduler_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CompetitorSnapshotScheduler = void 0;
const common_1 = require("@nestjs/common");
const bullmq_1 = require("@nestjs/bullmq");
const bullmq_2 = require("bullmq");
const marketing_constants_1 = require("../marketing.constants");
let CompetitorSnapshotScheduler = CompetitorSnapshotScheduler_1 = class CompetitorSnapshotScheduler {
    queue;
    logger = new common_1.Logger(CompetitorSnapshotScheduler_1.name);
    constructor(queue) {
        this.queue = queue;
    }
    onModuleInit() {
        this.queue
            .add('tick', {}, {
            repeat: { pattern: '0 3 * * 1' },
            jobId: 'competitor-snapshot-weekly-tick',
        })
            .catch((error) => this.logger.error(`Failed to register competitor-snapshot tick: ${error.message}`));
    }
};
exports.CompetitorSnapshotScheduler = CompetitorSnapshotScheduler;
exports.CompetitorSnapshotScheduler = CompetitorSnapshotScheduler = CompetitorSnapshotScheduler_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, bullmq_1.InjectQueue)(marketing_constants_1.COMPETITOR_SNAPSHOT_QUEUE)),
    __metadata("design:paramtypes", [bullmq_2.Queue])
], CompetitorSnapshotScheduler);
//# sourceMappingURL=competitor-snapshot.scheduler.js.map