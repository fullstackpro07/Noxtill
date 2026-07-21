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
var NightlyCloseProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.NightlyCloseProcessor = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const bullmq_2 = require("@nestjs/bullmq");
const bullmq_3 = require("bullmq");
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const locale_service_1 = require("../common/localization/locale.service");
const nightly_close_service_1 = require("./nightly-close.service");
const nightly_close_constants_1 = require("./nightly-close.constants");
let NightlyCloseProcessor = NightlyCloseProcessor_1 = class NightlyCloseProcessor extends bullmq_1.WorkerHost {
    queue;
    prisma;
    locale;
    nightlyClose;
    logger = new common_1.Logger(NightlyCloseProcessor_1.name);
    constructor(queue, prisma, locale, nightlyClose) {
        super();
        this.queue = queue;
        this.prisma = prisma;
        this.locale = locale;
        this.nightlyClose = nightlyClose;
    }
    async process(job) {
        if (job.name === 'tick') {
            return this.handleTick();
        }
        if (job.name === 'run' && job.data.businessId) {
            return this.nightlyClose.composeAndSend(job.data.businessId);
        }
    }
    async handleTick() {
        const businesses = await this.prisma.business.findMany({
            select: { id: true, timezone: true, nightlyCloseTime: true },
        });
        const now = new Date();
        const today = now.toISOString().slice(0, 10);
        for (const business of businesses) {
            const currentHour = this.locale
                .currentLocalTime(business.timezone)
                .slice(0, 2);
            const configuredHour = business.nightlyCloseTime.slice(0, 2);
            if (currentHour !== configuredHour)
                continue;
            await this.queue.add('run', { businessId: business.id }, { jobId: `nightly-close-run-${business.id}-${today}` });
        }
        this.logger.debug(`Nightly close tick evaluated ${businesses.length} business(es)`);
    }
};
exports.NightlyCloseProcessor = NightlyCloseProcessor;
exports.NightlyCloseProcessor = NightlyCloseProcessor = NightlyCloseProcessor_1 = __decorate([
    (0, bullmq_1.Processor)(nightly_close_constants_1.NIGHTLY_CLOSE_QUEUE),
    __param(0, (0, bullmq_2.InjectQueue)(nightly_close_constants_1.NIGHTLY_CLOSE_QUEUE)),
    __metadata("design:paramtypes", [bullmq_3.Queue,
        prisma_service_1.PrismaService,
        locale_service_1.LocaleService,
        nightly_close_service_1.NightlyCloseService])
], NightlyCloseProcessor);
//# sourceMappingURL=nightly-close.processor.js.map