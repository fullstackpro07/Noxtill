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
var ProfitService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProfitService = void 0;
const common_1 = require("@nestjs/common");
const nestjs_cls_1 = require("nestjs-cls");
const tenant_prisma_service_1 = require("../common/tenancy/tenant-prisma.service");
const ai_infra_service_1 = require("../ai/ai-infra.service");
const tenant_constants_1 = require("../common/tenancy/tenant.constants");
const WEEKDAY_NAMES = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
];
const LOW_MARGIN_THRESHOLD = 10;
const TOP_PRODUCTS_COUNT = 3;
const CO_PURCHASE_MIN_COUNT = 2;
const BUNDLE_SUGGESTION_LIMIT = 5;
const BUNDLE_DISCOUNT_RATE = 0.1;
function round2(value) {
    return Math.round(value * 100) / 100;
}
let ProfitService = ProfitService_1 = class ProfitService {
    tenantPrisma;
    cls;
    aiInfra;
    logger = new common_1.Logger(ProfitService_1.name);
    constructor(tenantPrisma, cls, aiInfra) {
        this.tenantPrisma = tenantPrisma;
        this.cls = cls;
        this.aiInfra = aiInfra;
    }
    async byProduct(windowDays = 30) {
        const businessId = this.cls.get(tenant_constants_1.CLS_KEY_BUSINESS_ID);
        const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
        const rows = await this.tenantPrisma.client.$queryRaw `
      SELECT oi.product_id, p.name, SUM(oi.qty) AS units, SUM(oi.price * oi.qty) AS revenue, SUM(oi.cost * oi.qty) AS cost
      FROM order_items oi
      JOIN orders o ON o.id = oi.order_id
      JOIN products p ON p.id = oi.product_id
      WHERE o.business_id = ${businessId} AND o.status = 'completed' AND o.is_quotation = false AND o.created_at >= ${since}
      GROUP BY oi.product_id, p.name
      ORDER BY revenue DESC
    `;
        const products = rows.map((row) => {
            const revenue = Number(row.revenue);
            const cost = Number(row.cost);
            const profit = round2(revenue - cost);
            const margin = revenue > 0 ? round2((profit / revenue) * 100) : 0;
            return {
                productId: row.product_id,
                name: row.name,
                units: Number(row.units),
                revenue: round2(revenue),
                cost: round2(cost),
                profit,
                margin,
                reviewPricing: margin < LOW_MARGIN_THRESHOLD,
                isTopPerformer: false,
            };
        });
        const topIds = new Set([...products]
            .sort((a, b) => b.profit - a.profit)
            .slice(0, TOP_PRODUCTS_COUNT)
            .map((p) => p.productId));
        for (const product of products) {
            product.isTopPerformer = topIds.has(product.productId);
        }
        return { windowDays, products };
    }
    async byTime() {
        const businessId = this.cls.get(tenant_constants_1.CLS_KEY_BUSINESS_ID);
        const [hourlyRows, weekdayRows] = await Promise.all([
            this.tenantPrisma.client.$queryRaw `
        SELECT EXTRACT(HOUR FROM created_at)::int AS hour, SUM(total) AS revenue
        FROM orders
        WHERE business_id = ${businessId} AND status = 'completed' AND is_quotation = false
        GROUP BY hour
        ORDER BY hour
      `,
            this.tenantPrisma.client.$queryRaw `
        SELECT EXTRACT(DOW FROM created_at)::int AS dow, SUM(total) AS revenue
        FROM orders
        WHERE business_id = ${businessId} AND status = 'completed' AND is_quotation = false
        GROUP BY dow
        ORDER BY dow
      `,
        ]);
        const hourly = hourlyRows.map((row) => ({
            hour: row.hour,
            revenue: round2(Number(row.revenue)),
        }));
        const weekday = weekdayRows.map((row) => ({
            day: WEEKDAY_NAMES[row.dow],
            revenue: round2(Number(row.revenue)),
        }));
        return { hourly, weekday, insight: this.buildInsight(hourly, weekday) };
    }
    buildInsight(hourly, weekday) {
        const total = hourly.reduce((sum, h) => sum + h.revenue, 0);
        if (total === 0)
            return 'Not enough sales data yet for a time-of-day insight.';
        let bestWindowStart = 0;
        let bestWindowRevenue = -1;
        for (let start = 0; start < 24; start++) {
            const windowRevenue = [0, 1, 2].reduce((sum, offset) => {
                const hour = (start + offset) % 24;
                return sum + (hourly.find((h) => h.hour === hour)?.revenue ?? 0);
            }, 0);
            if (windowRevenue > bestWindowRevenue) {
                bestWindowRevenue = windowRevenue;
                bestWindowStart = start;
            }
        }
        const pct = Math.round((bestWindowRevenue / total) * 100);
        const end = (bestWindowStart + 3) % 24;
        const slowest = weekday.length
            ? weekday.reduce((min, w) => (w.revenue < min.revenue ? w : min))
            : undefined;
        const slowestNote = slowest ? ` ${slowest.day} is your slowest day.` : '';
        return `${pct}% of sales happen between ${bestWindowStart}:00–${end}:00.${slowestNote}`;
    }
    async pnl(month) {
        const [year, mon] = month.split('-').map(Number);
        const start = new Date(Date.UTC(year, mon - 1, 1));
        const end = new Date(Date.UTC(year, mon, 1));
        const [orderTotals, expensesByCategory] = await Promise.all([
            this.tenantPrisma.client.order.aggregate({
                where: {
                    status: 'completed',
                    isQuotation: false,
                    createdAt: { gte: start, lt: end },
                },
                _sum: { total: true, cogs: true },
            }),
            this.tenantPrisma.client.expense.groupBy({
                by: ['category'],
                where: { incurredOn: { gte: start, lt: end } },
                _sum: { amount: true },
            }),
        ]);
        const revenue = round2(Number(orderTotals._sum.total ?? 0));
        const cogs = round2(Number(orderTotals._sum.cogs ?? 0));
        const expenseBreakdown = expensesByCategory.map((row) => ({
            category: row.category,
            amount: round2(Number(row._sum.amount ?? 0)),
        }));
        const totalExpenses = round2(expenseBreakdown.reduce((sum, row) => sum + row.amount, 0));
        const netProfit = round2(revenue - cogs - totalExpenses);
        return {
            month,
            revenue,
            cogs,
            expenses: expenseBreakdown,
            totalExpenses,
            netProfit,
        };
    }
    async bundleSuggestions() {
        const businessId = this.cls.get(tenant_constants_1.CLS_KEY_BUSINESS_ID);
        const [pairs, existingBundles] = await Promise.all([
            this.tenantPrisma.client.$queryRaw `
        SELECT a.product_id AS product_a, b.product_id AS product_b, pa.name AS name_a, pb.name AS name_b,
               COUNT(DISTINCT a.order_id) AS together_count
        FROM order_items a
        JOIN order_items b ON a.order_id = b.order_id AND a.product_id < b.product_id
        JOIN orders o ON o.id = a.order_id
        JOIN products pa ON pa.id = a.product_id
        JOIN products pb ON pb.id = b.product_id
        WHERE o.business_id = ${businessId} AND o.status = 'completed' AND o.is_quotation = false
        GROUP BY a.product_id, b.product_id, pa.name, pb.name
        HAVING COUNT(DISTINCT a.order_id) >= ${CO_PURCHASE_MIN_COUNT}
        ORDER BY together_count DESC
        LIMIT ${BUNDLE_SUGGESTION_LIMIT * 3}
      `,
            this.tenantPrisma.client.bundle.findMany({
                include: { items: true },
            }),
        ]);
        const alreadyBundled = new Set(existingBundles.map((b) => [...b.items.map((i) => i.productId)].sort().join('|')));
        const productIds = [
            ...new Set(pairs.flatMap((p) => [p.product_a, p.product_b])),
        ];
        const products = await this.tenantPrisma.client.product.findMany({
            where: { id: { in: productIds } },
        });
        const priceById = new Map(products.map((p) => [p.id, Number(p.sellingPrice)]));
        const candidates = pairs
            .filter((pair) => !alreadyBundled.has([pair.product_a, pair.product_b].sort().join('|')))
            .slice(0, BUNDLE_SUGGESTION_LIMIT)
            .map((pair) => {
            const priceA = priceById.get(pair.product_a) ?? 0;
            const priceB = priceById.get(pair.product_b) ?? 0;
            const combinedPrice = round2(priceA + priceB);
            const suggestedPrice = round2(combinedPrice * (1 - BUNDLE_DISCOUNT_RATE));
            return {
                productAId: pair.product_a,
                productBId: pair.product_b,
                nameA: pair.name_a,
                nameB: pair.name_b,
                togetherCount: Number(pair.together_count),
                combinedPrice,
                suggestedPrice,
                pitch: `${pair.name_a} + ${pair.name_b} — bought together ${Number(pair.together_count)} times.`,
            };
        });
        if (candidates.length === 0)
            return [];
        try {
            const pitches = await this.phrasePitches(businessId, candidates);
            return candidates.map((c, i) => ({ ...c, pitch: pitches[i] || c.pitch }));
        }
        catch (error) {
            this.logger.warn(`Bundle-suggestion phrasing skipped for business ${businessId}: ${error.message}`);
            return candidates;
        }
    }
    async phrasePitches(businessId, candidates) {
        const factLines = candidates
            .map((c, i) => `${i + 1}. "${c.nameA}" + "${c.nameB}", bought together ${c.togetherCount} times, suggested bundle price ${c.suggestedPrice}`)
            .join('\n');
        const prompt = [
            'You write short, upbeat one-sentence retail bundle pitches from real numbers a system has already computed.',
            'Here are the numbered candidates:',
            factLines,
            'For each numbered candidate, write exactly one short sentence (max ~20 words) suggesting the bundle,',
            'mentioning the suggested price already given.',
            'Use ONLY the numbers already given — never introduce a new number or price of your own.',
            'Reply with ONLY a JSON array of strings, one per candidate, in the same order. No other text.',
        ].join('\n');
        const raw = await this.aiInfra.complete(businessId, prompt);
        const jsonStart = raw.indexOf('[');
        const jsonEnd = raw.lastIndexOf(']');
        if (jsonStart === -1 || jsonEnd === -1 || jsonEnd < jsonStart) {
            throw new Error('AI response had no JSON array');
        }
        const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
        if (!Array.isArray(parsed) ||
            parsed.length !== candidates.length ||
            !parsed.every((item) => typeof item === 'string' && item.trim().length > 0)) {
            throw new Error('AI response array shape mismatch');
        }
        return parsed;
    }
};
exports.ProfitService = ProfitService;
exports.ProfitService = ProfitService = ProfitService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [tenant_prisma_service_1.TenantPrismaService,
        nestjs_cls_1.ClsService,
        ai_infra_service_1.AiInfraService])
], ProfitService);
//# sourceMappingURL=profit.service.js.map