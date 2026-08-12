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
var QuotaResetProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.QuotaResetProcessor = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const billing_constants_1 = require("../billing.constants");
function utcMonthStart(at) {
    const start = new Date(at);
    start.setUTCDate(1);
    start.setUTCHours(0, 0, 0, 0);
    return start;
}
let QuotaResetProcessor = QuotaResetProcessor_1 = class QuotaResetProcessor extends bullmq_1.WorkerHost {
    prisma;
    logger = new common_1.Logger(QuotaResetProcessor_1.name);
    constructor(prisma) {
        super();
        this.prisma = prisma;
    }
    async process(job) {
        if (job.name !== 'tick')
            return;
        const now = job.data?.now ? new Date(job.data.now) : new Date();
        return this.runReset(now);
    }
    async runReset(now = new Date()) {
        const monthStart = utcMonthStart(now);
        const due = await this.prisma.business.findMany({
            where: {
                OR: [
                    { msgQuotaResetAt: null },
                    { msgQuotaResetAt: { lt: monthStart } },
                ],
            },
        });
        for (const business of due) {
            await this.prisma.business.update({
                where: { id: business.id },
                data: { msgUsed: 0, msgQuotaResetAt: now },
            });
        }
        this.logger.debug(`Quota reset processed ${due.length} business(es)`);
    }
};
exports.QuotaResetProcessor = QuotaResetProcessor;
exports.QuotaResetProcessor = QuotaResetProcessor = QuotaResetProcessor_1 = __decorate([
    (0, bullmq_1.Processor)(billing_constants_1.QUOTA_RESET_QUEUE),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], QuotaResetProcessor);
//# sourceMappingURL=quota-reset.processor.js.map