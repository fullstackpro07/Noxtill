import { AppointmentStatus } from '@prisma/client';
import { WidgetContext, findWidget } from '../widgets/widget-registry';
import { AnthropicTool } from '../ai/claude.client';
import { retrieveHelpPassages } from '../help/help.service';

export interface AssistantTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute(ctx: WidgetContext, input: Record<string, unknown>): Promise<unknown>;
}

const EMPTY_SCHEMA = { type: 'object', properties: {}, required: [] };

function fromWidget(
  widgetKey: string,
  name: string,
  description: string,
): AssistantTool {
  return {
    name,
    description,
    inputSchema: EMPTY_SCHEMA,
    async execute(ctx) {
      const widget = findWidget(widgetKey);
      if (!widget) {
        throw new Error(
          `Tool "${name}" references unknown widget "${widgetKey}"`,
        );
      }
      return widget.resolve(ctx);
    },
  };
}

/**
 * Tool-calling registry (BE-074) — 23 read-only tools, every one tenant-locked
 * server-side via WidgetContext.businessId (taken from the authenticated
 * caller, never from model input, so Claude cannot be tricked into reading
 * another business's data). 16 of these simply reuse widget resolvers
 * (BE-067) — same real, tenant-scoped queries, just exposed to the model
 * instead of a dashboard. `search_help_docs` (BE-073) is the odd one out —
 * it queries the global, non-tenant `help_articles` table via `ctx.prisma`
 * rather than `ctx.tenantPrisma`. Five more query the tenant DB directly where
 * no widget gave the model the *names* behind a count or total (a customer lookup
 * by phone, an order lookup by number, top customers, top debtors, which
 * products are low), and `get_bookings_on_date` takes a model-supplied day for
 * "tomorrow"-style questions.
 */
export const ASSISTANT_TOOLS: AssistantTool[] = [
  fromWidget(
    'revenue_today',
    'get_revenue_today',
    "Today's total revenue and order count.",
  ),
  fromWidget(
    'orders_today',
    'get_orders_today',
    'Count of orders placed today.',
  ),
  fromWidget(
    'revenue_this_month',
    'get_revenue_this_month',
    'Revenue and gross profit for the current calendar month.',
  ),
  fromWidget(
    'expenses_this_month',
    'get_expenses_this_month',
    'Total recorded expenses for the current calendar month. Subtract from gross profit for net profit.',
  ),
  fromWidget(
    'top_products_month',
    'get_top_products_month',
    'Top 5 products by revenue this month, each with units sold and revenue.',
  ),
  fromWidget(
    'low_stock_count',
    'get_low_stock_count',
    'Number of products at or below their low-stock threshold.',
  ),
  fromWidget(
    'credit_outstanding',
    'get_credit_outstanding',
    'Total outstanding customer credit balance.',
  ),
  fromWidget(
    'upcoming_appointments',
    'get_upcoming_appointments',
    'Count of booked/confirmed appointments in the next 7 days.',
  ),
  fromWidget(
    'no_show_rate_month',
    'get_no_show_rate',
    "Percentage of this month's appointments that were no-shows.",
  ),
  fromWidget(
    'reviews_average',
    'get_reviews_average',
    'Average public review star rating.',
  ),
  fromWidget(
    'open_complaints',
    'get_open_complaints',
    'Count of unresolved private customer complaints.',
  ),
  fromWidget(
    'campaign_performance_month',
    'get_campaign_performance',
    'Number of marketing campaigns sent this month and total messages sent.',
  ),
  fromWidget(
    'staff_leaderboard_month',
    'get_staff_leaderboard',
    'Top 5 staff by total sales this month.',
  ),
  fromWidget(
    'message_quota_usage',
    'get_message_quota_usage',
    "This business's messaging quota usage.",
  ),
  fromWidget(
    'new_customers_month',
    'get_new_customers_this_month',
    'Count of new customers this month.',
  ),
  fromWidget(
    'pending_appointments_today',
    'get_todays_bookings',
    "Count of today's booked/confirmed appointments.",
  ),
  {
    name: 'search_help_docs',
    description:
      "Search Noxtill's help documentation for how-to and product questions (policies, definitions, how a feature works) — not live business data.",
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
      const passages = await retrieveHelpPassages(prisma!, query);
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
    name: 'get_top_customers',
    description:
      'Top 5 customers by lifetime spend, each with their spend and visit count.',
    inputSchema: EMPTY_SCHEMA,
    async execute({ tenantPrisma }) {
      const customers = await tenantPrisma.client.customer.findMany({
        orderBy: { lifetimeSpend: 'desc' },
        take: 5,
        select: { name: true, lifetimeSpend: true, visitCount: true },
      });
      return customers.map((c) => ({
        name: c.name,
        lifetimeSpend: Number(c.lifetimeSpend),
        visitCount: c.visitCount,
      }));
    },
  },
  {
    name: 'get_top_debtors',
    description:
      'Up to 5 customers who owe the business the most, each with their outstanding balance and how many days it has been outstanding.',
    inputSchema: EMPTY_SCHEMA,
    async execute({ businessId, tenantPrisma }) {
      const rows = await tenantPrisma.client.$queryRaw<
        { name: string; balance: string; days_outstanding: bigint }[]
      >`
        SELECT c.name, v.balance, v.days_outstanding
        FROM v_credit_balances v
        JOIN customers c ON c.id = v.customer_id
        WHERE v.business_id = ${businessId} AND v.balance > 0
        ORDER BY v.balance DESC
        LIMIT 5
      `;
      return rows.map((r) => ({
        name: r.name,
        balance: Number(r.balance),
        daysOutstanding: Number(r.days_outstanding),
      }));
    },
  },
  {
    name: 'get_low_stock_products',
    description:
      'Up to 10 products at or below their low-stock threshold, lowest stock first, each with current stock and its threshold.',
    inputSchema: EMPTY_SCHEMA,
    async execute({ tenantPrisma }) {
      const products = await tenantPrisma.client.product.findMany({
        where: { active: true },
        select: { name: true, stockQty: true, lowStockThreshold: true },
      });
      return products
        .filter((p) => p.stockQty <= p.lowStockThreshold)
        .sort((a, b) => a.stockQty - b.stockQty)
        .slice(0, 10)
        .map((p) => ({
          name: p.name,
          stockQty: p.stockQty,
          lowStockThreshold: p.lowStockThreshold,
        }));
    },
  },
  {
    name: 'get_bookings_on_date',
    description:
      'Count of booked/confirmed appointments starting on one specific calendar day (use for "tomorrow" or any named date; today\'s date is in the system prompt).',
    inputSchema: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: 'The day to check, as YYYY-MM-DD.',
        },
      },
      required: ['date'],
    },
    async execute({ tenantPrisma }, input) {
      const date = typeof input.date === 'string' ? input.date : '';
      const dayStart = new Date(`${date}T00:00:00`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(dayStart.getTime())) {
        return { error: 'date must be a valid YYYY-MM-DD day' };
      }
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000);
      const count = await tenantPrisma.client.appointment.count({
        where: {
          startsAt: { gte: dayStart, lt: dayEnd },
          status: {
            in: [AppointmentStatus.booked, AppointmentStatus.confirmed],
          },
        },
      });
      return { date, count };
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

export function findAssistantTool(name: string): AssistantTool | undefined {
  return ASSISTANT_TOOLS.find((t) => t.name === name);
}

export function toAnthropicTools(): AnthropicTool[] {
  return ASSISTANT_TOOLS.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }));
}
