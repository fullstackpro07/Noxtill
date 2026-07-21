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
var CrmJobsProcessor_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.CrmJobsProcessor = void 0;
const bullmq_1 = require("@nestjs/bullmq");
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const locale_service_1 = require("../../common/localization/locale.service");
const send_gate_service_1 = require("../../messaging/send-gate.service");
const crm_jobs_constants_1 = require("./crm-jobs.constants");
let CrmJobsProcessor = CrmJobsProcessor_1 = class CrmJobsProcessor extends bullmq_1.WorkerHost {
    prisma;
    locale;
    sendGate;
    logger = new common_1.Logger(CrmJobsProcessor_1.name);
    constructor(prisma, locale, sendGate) {
        super();
        this.prisma = prisma;
        this.locale = locale;
        this.sendGate = sendGate;
    }
    async process(job) {
        const now = job.data?.now ? new Date(job.data.now) : new Date();
        if (job.name === 'tag-rules-tick') {
            return this.runTagRules(now);
        }
        if (job.name === 'birthday-tick') {
            return this.runBirthdayGreetings(now);
        }
    }
    async runTagRules(now = new Date()) {
        const businesses = await this.prisma.business.findMany({
            select: { id: true, timezone: true },
        });
        const lapsedCutoff = new Date(now.getTime() - crm_jobs_constants_1.LAPSED_DAYS * 24 * 60 * 60 * 1000);
        for (const business of businesses) {
            if (this.locale.currentLocalTime(business.timezone, now).slice(0, 2) !==
                crm_jobs_constants_1.TAG_RULES_LOCAL_HOUR)
                continue;
            const customers = await this.prisma.customer.findMany({
                where: { businessId: business.id },
            });
            for (const customer of customers) {
                const shouldBeVip = Number(customer.lifetimeSpend) >= crm_jobs_constants_1.VIP_LIFETIME_SPEND_THRESHOLD;
                const shouldBeLapsed = !customer.lastVisitAt || customer.lastVisitAt < lapsedCutoff;
                let tags = customer.tags;
                tags = shouldBeVip
                    ? Array.from(new Set([...tags, 'VIP']))
                    : tags.filter((t) => t !== 'VIP');
                tags = shouldBeLapsed
                    ? Array.from(new Set([...tags, 'Lapsed']))
                    : tags.filter((t) => t !== 'Lapsed');
                if (tags.length !== customer.tags.length ||
                    tags.some((t, i) => t !== customer.tags[i])) {
                    await this.prisma.customer.update({
                        where: { id: customer.id },
                        data: { tags },
                    });
                }
            }
        }
        this.logger.debug(`Tag rules evaluated for ${businesses.length} business(es)`);
    }
    async runBirthdayGreetings(now = new Date()) {
        const businesses = await this.prisma.business.findMany({
            select: { id: true, name: true, timezone: true },
        });
        for (const business of businesses) {
            if (this.locale.currentLocalTime(business.timezone, now).slice(0, 2) !==
                crm_jobs_constants_1.BIRTHDAY_LOCAL_HOUR)
                continue;
            const todayMonth = now.getUTCMonth() + 1;
            const todayDay = now.getUTCDate();
            const customers = await this.prisma.customer.findMany({
                where: {
                    businessId: business.id,
                    birthday: { not: null },
                    optedOut: false,
                    consentMarketing: true,
                },
            });
            for (const customer of customers) {
                if (!customer.birthday)
                    continue;
                const bMonth = customer.birthday.getUTCMonth() + 1;
                const bDay = customer.birthday.getUTCDate();
                if (bMonth !== todayMonth || bDay !== todayDay)
                    continue;
                await this.sendGate
                    .send({
                    businessId: business.id,
                    customerId: customer.id,
                    templateKey: 'birthday',
                    variables: {
                        customerName: customer.name,
                        businessName: business.name,
                    },
                })
                    .catch(() => undefined);
            }
        }
        this.logger.debug(`Birthday greetings evaluated for ${businesses.length} business(es)`);
    }
};
exports.CrmJobsProcessor = CrmJobsProcessor;
exports.CrmJobsProcessor = CrmJobsProcessor = CrmJobsProcessor_1 = __decorate([
    (0, bullmq_1.Processor)(crm_jobs_constants_1.CRM_JOBS_QUEUE),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        locale_service_1.LocaleService,
        send_gate_service_1.SendGateService])
], CrmJobsProcessor);
//# sourceMappingURL=crm-jobs.processor.js.map