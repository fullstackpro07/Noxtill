"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ASSISTANT_TOOLS = void 0;
exports.findAssistantTool = findAssistantTool;
exports.toAnthropicTools = toAnthropicTools;
const widget_registry_1 = require("../widgets/widget-registry");
const help_service_1 = require("../help/help.service");
const EMPTY_SCHEMA = { type: 'object', properties: {}, required: [] };
function fromWidget(widgetKey, name, description) {
    return {
        name,
        description,
        inputSchema: EMPTY_SCHEMA,
        async execute(ctx) {
            const widget = (0, widget_registry_1.findWidget)(widgetKey);
            if (!widget) {
                throw new Error(`Tool "${name}" references unknown widget "${widgetKey}"`);
            }
            return widget.resolve(ctx);
        },
    };
}
exports.ASSISTANT_TOOLS = [
    fromWidget('revenue_today', 'get_revenue_today', "Today's total revenue and order count."),
    fromWidget('orders_today', 'get_orders_today', 'Count of orders placed today.'),
    fromWidget('revenue_this_month', 'get_revenue_this_month', 'Revenue and gross profit for the current calendar month.'),
    fromWidget('low_stock_count', 'get_low_stock_count', 'Number of products at or below their low-stock threshold.'),
    fromWidget('credit_outstanding', 'get_credit_outstanding', 'Total outstanding customer credit balance.'),
    fromWidget('upcoming_appointments', 'get_upcoming_appointments', 'Count of booked/confirmed appointments in the next 7 days.'),
    fromWidget('no_show_rate_month', 'get_no_show_rate', "Percentage of this month's appointments that were no-shows."),
    fromWidget('reviews_average', 'get_reviews_average', 'Average public review star rating.'),
    fromWidget('open_complaints', 'get_open_complaints', 'Count of unresolved private customer complaints.'),
    fromWidget('campaign_performance_month', 'get_campaign_performance', 'Number of marketing campaigns sent this month and total messages sent.'),
    fromWidget('staff_leaderboard_month', 'get_staff_leaderboard', 'Top 5 staff by total sales this month.'),
    fromWidget('message_quota_usage', 'get_message_quota_usage', "This business's messaging quota usage."),
    fromWidget('new_customers_month', 'get_new_customers_this_month', 'Count of new customers this month.'),
    fromWidget('pending_appointments_today', 'get_todays_bookings', "Count of today's booked/confirmed appointments."),
    {
        name: 'search_help_docs',
        description: "Search Noxtill's help documentation for how-to and product questions (policies, definitions, how a feature works) — not live business data.",
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'The question or topic to search help docs for.',
                },
            },
            required: ['query'],
        },
        async execute({ prisma }, input) {
            const query = typeof input.query === 'string' ? input.query : '';
            const passages = await (0, help_service_1.retrieveHelpPassages)(prisma, query);
            return passages.length === 0
                ? { found: false }
                : {
                    found: true,
                    passages: passages.map((p, i) => ({
                        n: i + 1,
                        title: p.title,
                        url: p.url,
                        body: p.body,
                    })),
                };
        },
    },
    {
        name: 'find_customer_by_phone',
        description: 'Look up a customer by their exact phone number.',
        inputSchema: {
            type: 'object',
            properties: {
                phone: {
                    type: 'string',
                    description: "The customer's phone number, e.g. +15551234567",
                },
            },
            required: ['phone'],
        },
        async execute({ businessId, tenantPrisma }, input) {
            const phone = typeof input.phone === 'string' ? input.phone : '';
            const customer = await tenantPrisma.client.customer.findUnique({
                where: { businessId_phone: { businessId, phone } },
            });
            return customer
                ? {
                    id: customer.id,
                    name: customer.name,
                    phone: customer.phone,
                    lifetimeSpend: Number(customer.lifetimeSpend),
                    visitCount: customer.visitCount,
                    tags: customer.tags,
                }
                : { found: false };
        },
    },
    {
        name: 'get_order_by_number',
        description: 'Look up a single order by its order number.',
        inputSchema: {
            type: 'object',
            properties: {
                orderNo: {
                    type: 'number',
                    description: 'The order number to look up.',
                },
            },
            required: ['orderNo'],
        },
        async execute({ tenantPrisma }, input) {
            const order = await tenantPrisma.client.order.findFirst({
                where: { orderNo: Number(input.orderNo) },
                include: { items: true },
            });
            return order
                ? {
                    id: order.id,
                    orderNo: order.orderNo,
                    status: order.status,
                    total: Number(order.total),
                    itemCount: order.items.length,
                }
                : { found: false };
        },
    },
];
function findAssistantTool(name) {
    return exports.ASSISTANT_TOOLS.find((t) => t.name === name);
}
function toAnthropicTools() {
    return exports.ASSISTANT_TOOLS.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
    }));
}
//# sourceMappingURL=assistant-tools.js.map