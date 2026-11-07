import { randomUUID } from 'node:crypto';
import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, ProductKind } from '@prisma/client';
import { AppException } from '../common/filters/app.exception';
import { resolvePolicies } from '../common/policies/policies.service';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { CommerceFulfillmentRouterService } from './commerce-fulfillment-router.service';
import { CommerceRfqsService } from './commerce-rfqs.service';

export type AgentRiskClass =
  | 'READ_ONLY'
  | 'LOW_RISK_WRITE'
  | 'MEDIUM_RISK_WRITE'
  | 'HIGH_RISK_WRITE'
  | 'FINANCIAL'
  | 'IRREVERSIBLE';

/** Spec §11 autonomy levels; stored per business in `commerce.autonomyLevel`. */
export const AUTONOMY_LEVELS = [
  { level: 0, label: 'Disabled', detail: 'No tool may be used by an agent.' },
  { level: 1, label: 'Observe', detail: 'Read-only tools only.' },
  {
    level: 2,
    label: 'Recommend',
    detail: 'Read tools and drafts / recommendations.',
  },
  {
    level: 3,
    label: 'Approval-gated',
    detail: 'Also non-binding workflow writes, each needing approval.',
  },
  {
    level: 4,
    label: 'Limited autonomy',
    detail: 'High-risk writes still need approval.',
  },
  {
    level: 5,
    label: 'Full configured autonomy',
    detail: 'Financial and irreversible actions still need approval.',
  },
] as const;

/** Lowest autonomy level at which an agent may use a tool of this risk class at all. */
const MIN_LEVEL: Record<AgentRiskClass, number> = {
  READ_ONLY: 1,
  LOW_RISK_WRITE: 2,
  MEDIUM_RISK_WRITE: 3,
  HIGH_RISK_WRITE: 4,
  FINANCIAL: 5,
  IRREVERSIBLE: 5,
};
/** Risk classes that always need a person's approval, whatever the level (spec §11.2). */
const ALWAYS_APPROVAL: AgentRiskClass[] = [
  'MEDIUM_RISK_WRITE',
  'HIGH_RISK_WRITE',
  'FINANCIAL',
  'IRREVERSIBLE',
];

export interface AgentToolDef {
  key: string;
  label: string;
  riskClass: AgentRiskClass;
  description: string;
  /** Screen where a person performs this today. */
  screen: string;
  /** Inputs the tool takes (all strings). */
  inputs: string[];
  /** True when the registry can execute it now; write tools stay on their screens for now. */
  executable: boolean;
}

export const COMMERCE_AGENT_TOOLS: AgentToolDef[] = [
  {
    key: 'get_product',
    label: 'Get product',
    riskClass: 'READ_ONLY',
    description: 'Price, cost, stock and status of one product.',
    screen: '/products',
    inputs: ['productId'],
    executable: true,
  },
  {
    key: 'get_inventory',
    label: 'Get low inventory',
    riskClass: 'READ_ONLY',
    description: 'Products at or below their low-stock threshold.',
    screen: '/inventory',
    inputs: [],
    executable: true,
  },
  {
    key: 'get_order',
    label: 'Get order',
    riskClass: 'READ_ONLY',
    description: 'Order status, total and lines.',
    screen: '/orders',
    inputs: ['orderId'],
    executable: true,
  },
  {
    key: 'compare_quotes',
    label: 'Compare RFQ quotes',
    riskClass: 'READ_ONLY',
    description: 'Supplier quotes recorded on one RFQ.',
    screen: '/autonomous-commerce/rfqs',
    inputs: ['rfqId'],
    executable: true,
  },
  {
    key: 'calculate_fulfillment_route',
    label: 'Calculate fulfillment route',
    riskClass: 'READ_ONLY',
    description:
      'Eligible sources and the recommended route for one order (nothing is assigned).',
    screen: '/autonomous-commerce/fulfillment-router',
    inputs: ['orderId'],
    executable: true,
  },
  {
    key: 'create_listing_draft',
    label: 'Create listing draft',
    riskClass: 'LOW_RISK_WRITE',
    description: 'Draft channel listing content from canonical product facts.',
    screen: '/autonomous-commerce/listing-builder',
    inputs: ['productId', 'channel'],
    executable: false,
  },
  {
    key: 'draft_counteroffer',
    label: 'Draft counteroffer',
    riskClass: 'LOW_RISK_WRITE',
    description: 'Draft a counteroffer on a supplier quote.',
    screen: '/autonomous-commerce/rfqs',
    inputs: ['rfqId'],
    executable: false,
  },
  {
    key: 'create_rfq',
    label: 'Create RFQ',
    riskClass: 'MEDIUM_RISK_WRITE',
    description: 'Open a request for quotes with suppliers.',
    screen: '/autonomous-commerce/rfqs',
    inputs: ['productId'],
    executable: false,
  },
  {
    key: 'create_supplier_claim',
    label: 'Create supplier claim',
    riskClass: 'MEDIUM_RISK_WRITE',
    description: 'Start a claim against a supplier with evidence.',
    screen: '/autonomous-commerce/supplier-claims',
    inputs: ['supplierId'],
    executable: false,
  },
  {
    key: 'create_experiment',
    label: 'Create experiment',
    riskClass: 'MEDIUM_RISK_WRITE',
    description: 'Draft a before/after experiment on one product.',
    screen: '/autonomous-commerce/experiment-lab',
    inputs: ['productId'],
    executable: false,
  },
  {
    key: 'create_b2b_reorder_draft',
    label: 'Create B2B reorder draft',
    riskClass: 'MEDIUM_RISK_WRITE',
    description: 'Draft a wholesale reorder for an account.',
    screen: '/autonomous-commerce/b2b',
    inputs: ['accountId'],
    executable: false,
  },
  {
    key: 'publish_listing',
    label: 'Publish listing',
    riskClass: 'HIGH_RISK_WRITE',
    description: 'Send an approved listing to a sales channel.',
    screen: '/autonomous-commerce/channel-listings',
    inputs: ['draftId', 'provider'],
    executable: false,
  },
  {
    key: 'reserve_inventory',
    label: 'Reserve inventory',
    riskClass: 'HIGH_RISK_WRITE',
    description: 'Reserve stock for an order or pre-order.',
    screen: '/autonomous-commerce/subscriptions-preorders',
    inputs: ['productId', 'qty'],
    executable: false,
  },
  {
    key: 'release_inventory',
    label: 'Release inventory',
    riskClass: 'HIGH_RISK_WRITE',
    description: 'Release a stock reservation.',
    screen: '/autonomous-commerce/subscriptions-preorders',
    inputs: ['reservationId'],
    executable: false,
  },
  {
    key: 'hold_order',
    label: 'Hold order',
    riskClass: 'HIGH_RISK_WRITE',
    description: 'Put an order on hold for risk review.',
    screen: '/autonomous-commerce/risk-compliance',
    inputs: ['orderId'],
    executable: false,
  },
  {
    key: 'release_order',
    label: 'Release order',
    riskClass: 'HIGH_RISK_WRITE',
    description: 'Release a held order.',
    screen: '/autonomous-commerce/risk-compliance',
    inputs: ['orderId'],
    executable: false,
  },
  {
    key: 'allocate_preorder',
    label: 'Allocate pre-order',
    riskClass: 'HIGH_RISK_WRITE',
    description: 'Fulfil a reserved pre-order from stock.',
    screen: '/autonomous-commerce/subscriptions-preorders',
    inputs: ['preorderId'],
    executable: false,
  },
  {
    key: 'send_customer_message',
    label: 'Send customer message',
    riskClass: 'HIGH_RISK_WRITE',
    description: 'Message a customer with an approved template and consent.',
    screen: '/unified-inbox',
    inputs: ['customerId', 'templateKey'],
    executable: false,
  },
];

export const COMMERCE_AGENT_ERROR_CODES = {
  UNKNOWN_TOOL: 'COMMERCE_AGENT_UNKNOWN_TOOL',
  INPUT_REQUIRED: 'COMMERCE_AGENT_INPUT_REQUIRED',
} as const;

/**
 * Commerce agent tool registry (backend spec §11.1–11.3). Every tool declares its risk class, inputs
 * and the screen where people do the same job. A run is checked against the business's autonomy
 * level and the commerce kill switch, executed through the existing domain services (read-only tools
 * only for now), and always recorded — including refusals. No commerce agent runs on its own yet;
 * runs today are started by a person from the Agents & Tools screen.
 */
@Injectable()
export class CommerceAgentToolsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly rfqs: CommerceRfqsService,
    private readonly router: CommerceFulfillmentRouterService,
  ) {}

  private get db() {
    return this.tenantPrisma.client;
  }

  private async policy(businessId: string) {
    const business = await this.db.business.findUnique({
      where: { id: businessId },
      select: { policies: true },
    });
    const policies = resolvePolicies(business);
    return {
      level: policies.num('commerce.autonomyLevel') ?? 1,
      paused: policies.bool('commerce.actionsPaused'),
    };
  }

  /** Why a tool may not be used right now, or null when it may. */
  static gate(
    tool: AgentToolDef,
    level: number,
    paused: boolean,
  ): string | null {
    if (level < MIN_LEVEL[tool.riskClass]) {
      return `Autonomy level ${level} (${AUTONOMY_LEVELS[level]?.label ?? 'unknown'}) does not allow ${tool.riskClass.replaceAll('_', ' ').toLowerCase()} tools; level ${MIN_LEVEL[tool.riskClass]} or higher is needed.`;
    }
    if (paused && tool.riskClass !== 'READ_ONLY') {
      return 'Commerce actions are paused for this business.';
    }
    if (!tool.executable) {
      return `This tool is not yet executable by agents — do this on ${tool.screen}.`;
    }
    return null;
  }

  async registry(businessId: string) {
    const { level, paused } = await this.policy(businessId);
    return {
      autonomyLevel: level,
      levels: AUTONOMY_LEVELS,
      paused,
      tools: COMMERCE_AGENT_TOOLS.map((tool) => ({
        ...tool,
        minLevel: MIN_LEVEL[tool.riskClass],
        approvalRequired: ALWAYS_APPROVAL.includes(tool.riskClass),
        blockedReason: CommerceAgentToolsService.gate(tool, level, paused),
      })),
    };
  }

  async runs(businessId: string) {
    return this.db.commerceAgentToolRun.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  private required(input: Record<string, string>, key: string): string {
    const value = input[key]?.trim();
    if (!value) {
      throw new AppException(
        COMMERCE_AGENT_ERROR_CODES.INPUT_REQUIRED,
        `${key} is required.`,
        HttpStatus.BAD_REQUEST,
      );
    }
    return value;
  }

  private async execute(
    businessId: string,
    key: string,
    input: Record<string, string>,
  ): Promise<{ result: unknown; summary: string }> {
    switch (key) {
      case 'get_product': {
        const product = await this.db.product.findFirst({
          where: { id: this.required(input, 'productId'), businessId },
          select: {
            id: true,
            name: true,
            sku: true,
            sellingPrice: true,
            costPrice: true,
            stockQty: true,
            lowStockThreshold: true,
            active: true,
          },
        });
        if (!product) return { result: null, summary: 'Product not found.' };
        return {
          result: product,
          summary: `${product.name}: ${product.stockQty} in stock.`,
        };
      }
      case 'get_inventory': {
        const rows = await this.db.product.findMany({
          where: { businessId, active: true, kind: ProductKind.product },
          select: {
            id: true,
            name: true,
            stockQty: true,
            lowStockThreshold: true,
          },
          orderBy: { stockQty: 'asc' },
          take: 500,
        });
        const low = rows.filter((row) => row.stockQty <= row.lowStockThreshold);
        return {
          result: low,
          summary: `${low.length} product(s) at or below their threshold.`,
        };
      }
      case 'get_order': {
        const order = await this.db.order.findFirst({
          where: { id: this.required(input, 'orderId'), businessId },
          select: {
            id: true,
            orderNo: true,
            status: true,
            total: true,
            createdAt: true,
            items: { select: { name: true, qty: true, price: true } },
          },
        });
        if (!order) return { result: null, summary: 'Order not found.' };
        return {
          result: order,
          summary: `Order #${order.orderNo}: ${order.status}, ${order.items.length} line(s).`,
        };
      }
      case 'compare_quotes': {
        const rfq = await this.rfqs.getOne(
          businessId,
          this.required(input, 'rfqId'),
        );
        return {
          result: rfq,
          summary: 'RFQ with its recorded supplier quotes.',
        };
      }
      case 'calculate_fulfillment_route': {
        const route = await this.router.candidates(
          businessId,
          this.required(input, 'orderId'),
          input.destinationCountry?.trim() || undefined,
        );
        return {
          result: route,
          summary: 'Route candidates computed; nothing was assigned.',
        };
      }
      default:
        return { result: null, summary: 'Not executable.' };
    }
  }

  async run(
    businessId: string,
    actorUserId: string,
    key: string,
    input: Record<string, string>,
  ) {
    const tool = COMMERCE_AGENT_TOOLS.find((row) => row.key === key);
    if (!tool) {
      throw new AppException(
        COMMERCE_AGENT_ERROR_CODES.UNKNOWN_TOOL,
        'That tool is not in the commerce registry.',
        HttpStatus.NOT_FOUND,
      );
    }
    const { level, paused } = await this.policy(businessId);
    const started = Date.now();
    const correlationId = randomUUID();
    const record = (
      outcome: 'succeeded' | 'refused' | 'failed',
      extra: { refusalReason?: string; resultSummary?: string },
    ) =>
      this.db.commerceAgentToolRun.create({
        data: {
          businessId,
          toolKey: tool.key,
          riskClass: tool.riskClass,
          actorUserId,
          autonomyLevel: level,
          input: input as Prisma.InputJsonValue,
          outcome,
          refusalReason: extra.refusalReason ?? null,
          resultSummary: extra.resultSummary ?? null,
          correlationId,
          durationMs: Date.now() - started,
        },
      });

    const blocked = CommerceAgentToolsService.gate(tool, level, paused);
    if (blocked) {
      const run = await record('refused', { refusalReason: blocked });
      return { run, result: null };
    }
    try {
      const { result, summary } = await this.execute(businessId, key, input);
      const run = await record('succeeded', { resultSummary: summary });
      return { run, result };
    } catch (error) {
      const message =
        error instanceof AppException || error instanceof Error
          ? error.message
          : 'Tool failed.';
      await record('failed', { resultSummary: message });
      throw error;
    }
  }
}
