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
exports.NightlyCloseService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const locale_service_1 = require("../common/localization/locale.service");
const send_gate_service_1 = require("../messaging/send-gate.service");
const prisma_1 = require("../../generated/prisma");
function dayBounds(date) {
    const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
    return { start, end };
}
let NightlyCloseService = class NightlyCloseService {
    prisma;
    locale;
    sendGate;
    constructor(prisma, locale, sendGate) {
        this.prisma = prisma;
        this.locale = locale;
        this.sendGate = sendGate;
    }
    async composeDayData(businessId, date) {
        const business = await this.prisma.business.findUniqueOrThrow({
            where: { id: businessId },
        });
        const dateStr = date.toISOString().slice(0, 10);
        const { start: dayStart, end: dayEnd } = dayBounds(date);
        const { start: tomorrowStart, end: tomorrowEnd } = dayBounds(new Date(dayEnd));
        const [dailyRows, appointmentsTomorrowCount, newReviewsCount, openFeedbackCount, creditPayments, lowStockRows,] = await Promise.all([
            this.prisma.$queryRaw `SELECT * FROM v_daily_close WHERE business_id = ${businessId} AND close_date = ${dateStr}::date`,
            this.prisma.appointment.count({
                where: {
                    businessId,
                    startsAt: { gte: tomorrowStart, lt: tomorrowEnd },
                },
            }),
            this.prisma.externalReview.count({
                where: { businessId, createdAt: { gte: dayStart, lt: dayEnd } },
            }),
            this.prisma.privateFeedback.count({
                where: { businessId, status: 'open' },
            }),
            this.prisma.creditEntry.findMany({
                where: {
                    businessId,
                    kind: 'payment',
                    createdAt: { gte: dayStart, lt: dayEnd },
                },
            }),
            this.prisma.$queryRaw `SELECT id, name, stock_qty, low_stock_threshold FROM products WHERE business_id = ${businessId} AND active = true AND stock_qty <= low_stock_threshold LIMIT 5`,
        ]);
        const daily = dailyRows[0];
        const creditPaymentsTodayTotal = creditPayments.reduce((sum, entry) => sum + Number(entry.amount), 0);
        return {
            businessId,
            businessName: business.name,
            dateLabel: this.locale.formatDate(date, business),
            ordersCount: Number(daily?.orders_count ?? 0),
            revenue: Number(daily?.revenue ?? 0),
            grossProfit: Number(daily?.gross_profit ?? 0),
            appointmentsTomorrowCount,
            newReviewsCount,
            openFeedbackCount,
            creditPaymentsTodayTotal,
            lowStockProducts: lowStockRows,
        };
    }
    async composeAndSend(businessId, date = new Date()) {
        const business = await this.prisma.business.findUniqueOrThrow({
            where: { id: businessId },
        });
        const data = await this.composeDayData(businessId, date);
        const owner = await this.prisma.businessUser.findFirst({
            where: { businessId, role: prisma_1.Role.owner },
            include: { user: true },
        });
        if (!owner)
            return;
        const alerts = [];
        if (data.lowStockProducts.length > 0)
            alerts.push(`${data.lowStockProducts.length} low-stock item(s)`);
        if (data.openFeedbackCount > 0)
            alerts.push(`${data.openFeedbackCount} open complaint(s)`);
        if (data.appointmentsTomorrowCount > 0)
            alerts.push(`${data.appointmentsTomorrowCount} booking(s) tomorrow`);
        await this.sendGate.send({
            businessId,
            templateKey: 'nightly_close',
            to: {
                phone: owner.user.phone ?? undefined,
                email: owner.user.email ?? undefined,
            },
            variables: {
                businessName: data.businessName,
                dateLabel: data.dateLabel,
                ordersCount: String(data.ordersCount),
                revenue: this.locale.formatCurrency(data.revenue, business),
                grossProfit: this.locale.formatCurrency(data.grossProfit, business),
                alertsSummary: alerts.length ? `${alerts.join(', ')}. ` : '',
                deepLink: `/day/${date.toISOString().slice(0, 10)}`,
            },
        });
    }
    async updateSettings(businessId, time, channel) {
        return this.prisma.business.update({
            where: { id: businessId },
            data: {
                nightlyCloseTime: time,
                channelPref: channel,
            },
        });
    }
};
exports.NightlyCloseService = NightlyCloseService;
exports.NightlyCloseService = NightlyCloseService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        locale_service_1.LocaleService,
        send_gate_service_1.SendGateService])
], NightlyCloseService);
//# sourceMappingURL=nightly-close.service.js.map