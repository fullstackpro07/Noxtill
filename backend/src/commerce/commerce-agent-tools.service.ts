import { createHash, randomUUID } from 'node:crypto';
import { HttpStatus, Injectable, Optional } from '@nestjs/common';
import {
  CommerceExperimentMetric,
  CommerceExperimentType,
  CommerceAgentToolRun,
  Prisma,
  ProductKind,
} from '@prisma/client';
import { AppException } from '../common/filters/app.exception';
import {
  PoliciesService,
  resolvePolicies,
} from '../common/policies/policies.service';
import { CAPABILITIES } from '../common/capabilities/capabilities.constants';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import { parseDisabled } from '../business-modules/business-modules.service';
import { BUSINESS_MODULES } from '../business-modules/business-modules.constants';
import { SpecialistAgentPolicyService } from '../common/agents/specialist-agent-policy.service';
import { CommerceFulfillmentRouterService } from './commerce-fulfillment-router.service';
import { CommerceRfqsService } from './commerce-rfqs.service';
import { CommerceListingBuilderService } from './commerce-listing-builder.service';
import { CommerceExperimentsService } from './commerce-experiments.service';
import { CommerceSupplierClaimsService } from './commerce-supplier-claims.service';
import { ProductValidationService } from './product-validation.service';
import { CommerceB2bService } from './commerce-b2b.service';
import { CommerceStoreOptimizerService } from './commerce-store-optimizer.service';
import { CommerceProductionService } from './commerce-production.service';
import { COMMERCE_LISTING_CHANNELS } from './dto/commerce-listing-builder.dto';
import { COMMERCE_RFQ_ERROR_CODES } from './commerce.constants';
import {
  normalizeSpecialistAgentToolInput,
  normalizeSpecialistAgentToolOutput,
  specialistAgentToolInputSchema,
  type SpecialistAgentToolContract,
} from '../common/agents/specialist-agent-tool-contract.util';

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

export interface AgentToolDef extends SpecialistAgentToolContract {
  key: string;
  label: string;
  riskClass: AgentRiskClass;
  /** Screen where a person performs this today. */
  screen: string;
  /** Include this read tool in the AI question flow's registered function catalog. */
  exposedToReadOnlyAssistant?: boolean;
  /** True when the registered, bounded implementation exists in the canonical service. */
  executable: boolean;
  /** A concrete, version-bound approval and canonical execution handler exists. */
  approvalSupported?: boolean;
  /** Source modules checked by the shared specialist-tool gateway. */
  requiredModules?: readonly string[];
}

function isUniqueViolation(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

function asJsonRecord(
  value: Prisma.JsonValue | undefined,
): Prisma.JsonObject | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value;
}

function jsonCount(value: Prisma.JsonValue | undefined): number | null {
  return Array.isArray(value) ? value.length : null;
}

function jsonNumber(value: Prisma.JsonValue | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

const MAX_AGENT_TOOL_INPUT_FIELD_LENGTH = 2_000;
const MAX_AGENT_TOOL_INPUT_BYTES = 8_192;
const MAX_AGENT_INVENTORY_PRODUCTS = 500;
const MAX_AGENT_RFQ_QUOTES = 20;
const MAX_AGENT_RFQ_LINE_ITEMS = 100;

/** Source modules read or changed by each Commerce agent tool, beyond Commerce itself. */
const COMMERCE_AGENT_SOURCE_MODULES: Readonly<
  Record<string, readonly string[]>
> = {
  get_product: ['products'],
  get_inventory: ['inventory', 'products'],
  get_order: ['orders'],
  get_supplier_claim: ['inventory'],
  get_risk_case: ['orders'],
  get_channel_listing: ['products'],
  get_experiment_review: ['products', 'orders'],
  compare_quotes: ['inventory'],
  award_rfq_quote: ['inventory'],
  preview_b2b_quote: ['products'],
  get_b2b_reorder_opportunities: ['orders'],
  get_store_optimizer_review: ['products'],
  get_production_review: ['products', 'inventory'],
  calculate_fulfillment_route: ['orders', 'inventory', 'products'],
  create_listing_draft: ['products'],
  create_rfq: ['products'],
  create_supplier_claim_draft: ['inventory', 'products'],
  create_experiment: ['products'],
};

export function normalizeToolInput(
  tool: AgentToolDef,
  input: unknown,
): Record<string, string> {
  return normalizeSpecialistAgentToolInput(tool, input, {
    errorCode: COMMERCE_AGENT_ERROR_CODES.INPUT_INVALID,
    requiredErrorCode: COMMERCE_AGENT_ERROR_CODES.INPUT_REQUIRED,
    maxFieldLength: MAX_AGENT_TOOL_INPUT_FIELD_LENGTH,
    maxInputBytes: MAX_AGENT_TOOL_INPUT_BYTES,
  });
}

export function commerceAgentToolInputSchema(tool: AgentToolDef) {
  return specialistAgentToolInputSchema(tool);
}

export const COMMERCE_AGENT_TOOLS: AgentToolDef[] = [
  {
    key: 'get_product',
    label: 'Get product',
    riskClass: 'READ_ONLY',
    description: 'Price, cost, stock and status of one product.',
    screen: '/products',
    inputs: ['productId'],
    requiredInputs: ['productId'],
    exposedToReadOnlyAssistant: true,
    executable: true,
  },
  {
    key: 'get_inventory',
    label: 'Get low inventory',
    riskClass: 'READ_ONLY',
    description: 'Products at or below their low-stock threshold.',
    screen: '/inventory',
    inputs: [],
    exposedToReadOnlyAssistant: true,
    executable: true,
  },
  {
    key: 'get_order',
    label: 'Get order',
    riskClass: 'READ_ONLY',
    description: 'Order status, total and lines.',
    screen: '/orders',
    inputs: ['orderId'],
    requiredInputs: ['orderId'],
    exposedToReadOnlyAssistant: true,
    executable: true,
  },
  {
    key: 'get_product_opportunity',
    label: 'Get Product Radar opportunity',
    riskClass: 'READ_ONLY',
    description:
      'Read recorded Product Radar evidence and source freshness for one opportunity. This does not verify research inputs or calculate a success score.',
    screen: '/autonomous-commerce/product-radar',
    inputs: ['opportunityId'],
    requiredInputs: ['opportunityId'],
    exposedToReadOnlyAssistant: true,
    executable: true,
  },
  {
    key: 'get_validation_case',
    label: 'Get product validation evidence',
    riskClass: 'READ_ONLY',
    description:
      'Read one candidate’s validation evidence scorecard and decision history. The scorecard reports evidence coverage, not a pass/fail or launch recommendation.',
    screen: '/autonomous-commerce/product-validation',
    inputs: ['opportunityId'],
    requiredInputs: ['opportunityId'],
    exposedToReadOnlyAssistant: true,
    executable: true,
  },
  {
    key: 'get_supplier_claim',
    label: 'Get supplier claim status',
    riskClass: 'READ_ONLY',
    description:
      'Read one supplier claim’s recorded state, loss totals, evidence count and settlement records. It does not contact the supplier.',
    screen: '/autonomous-commerce/supplier-claims',
    inputs: ['claimId'],
    requiredInputs: ['claimId'],
    exposedToReadOnlyAssistant: true,
    executable: true,
  },
  {
    key: 'get_risk_case',
    label: 'Get Risk & Compliance case status',
    riskClass: 'READ_ONLY',
    description:
      'Read a risk case’s recorded rule, severity, status, signal count and exposure. Raw evidence and resolution notes are not included; a case is a review signal, not a confirmed loss or order hold.',
    screen: '/autonomous-commerce/risk-compliance',
    inputs: ['caseId'],
    requiredInputs: ['caseId'],
    exposedToReadOnlyAssistant: true,
    executable: true,
  },
  {
    key: 'get_channel_listing',
    label: 'Get channel listing sync status',
    riskClass: 'READ_ONLY',
    description:
      'Read a channel listing’s recorded sync status, product and draft version. External provider IDs and provider error text are not included.',
    screen: '/autonomous-commerce/channel-listings',
    inputs: ['listingId'],
    requiredInputs: ['listingId'],
    exposedToReadOnlyAssistant: true,
    executable: true,
  },
  {
    key: 'get_experiment_review',
    label: 'Review Experiment Lab results',
    riskClass: 'READ_ONLY',
    description:
      'Read the canonical bounded Experiment Lab review for running and decided experiments. Before/after changes are observational, not causal or statistically significant; no experiment is changed.',
    screen: '/autonomous-commerce/experiment-lab',
    inputs: [],
    exposedToReadOnlyAssistant: true,
    executable: true,
  },
  {
    key: 'compare_quotes',
    label: 'Compare RFQ quotes',
    riskClass: 'READ_ONLY',
    description: 'Supplier quotes recorded on one RFQ.',
    screen: '/autonomous-commerce/rfqs',
    inputs: ['rfqId'],
    requiredInputs: ['rfqId'],
    exposedToReadOnlyAssistant: true,
    executable: true,
  },
  {
    key: 'award_rfq_quote',
    label: 'Propose RFQ quote award',
    riskClass: 'FINANCIAL',
    description:
      'Submit one current supplier quote for second-person approval. Approval rechecks the canonical RFQ and creates a draft purchase order only; it does not contact the supplier or change stock.',
    screen: '/autonomous-commerce/rfqs',
    inputs: ['rfqId', 'quoteId', 'expectedVersion', 'reason'],
    executable: true,
    approvalSupported: true,
  },
  {
    key: 'submit_supplier_claim',
    label: 'Submit supplier claim',
    riskClass: 'MEDIUM_RISK_WRITE',
    description:
      'Request second-person approval to mark an evidenced supplier claim as submitted for operator follow-up. The canonical claim service checks its current version and evidence; no supplier is contacted.',
    screen: '/autonomous-commerce/supplier-claims',
    inputs: ['claimId', 'expectedVersion', 'reason'],
    executable: true,
    approvalSupported: true,
  },
  {
    key: 'preview_b2b_quote',
    label: 'Preview B2B quote',
    riskClass: 'READ_ONLY',
    description:
      'Calculate the current account price-list or tier price and show recorded minimum-order/credit warnings. Preview only; no order is created.',
    screen: '/autonomous-commerce/b2b',
    inputs: ['accountId', 'productId', 'qty'],
    requiredInputs: ['accountId', 'productId', 'qty'],
    exposedToReadOnlyAssistant: true,
    executable: true,
  },
  {
    key: 'get_b2b_reorder_opportunities',
    label: 'Review B2B reorder timing',
    riskClass: 'READ_ONLY',
    description:
      'Read due B2B reorder timing estimates from recorded account order history. No customer details are exposed and no draft or message is created.',
    screen: '/autonomous-commerce/b2b',
    inputs: [],
    exposedToReadOnlyAssistant: true,
    executable: true,
  },
  {
    key: 'get_store_optimizer_review',
    label: 'Review Store Optimizer findings',
    riskClass: 'READ_ONLY',
    description:
      'Read current Store Optimizer rule counts by issue and impact. Only aggregate counts are provided; no product or customer details are exposed and no opportunity is changed.',
    screen: '/autonomous-commerce/store-optimizer',
    inputs: [],
    exposedToReadOnlyAssistant: true,
    executable: true,
  },
  {
    key: 'get_production_review',
    label: 'Review Production & Assembly status',
    riskClass: 'READ_ONLY',
    description:
      'Read business-wide bill-of-material and work-order counts, recorded status totals, late open orders and completed output units. Product names, demand-source text and cost details are omitted; this does not diagnose causes or infer capacity.',
    screen: '/autonomous-commerce/production',
    inputs: [],
    exposedToReadOnlyAssistant: true,
    executable: true,
  },
  {
    key: 'calculate_fulfillment_route',
    label: 'Calculate fulfillment route',
    riskClass: 'READ_ONLY',
    description:
      'Eligible sources and the recommended route for one order (nothing is assigned).',
    screen: '/autonomous-commerce/fulfillment-router',
    inputs: ['orderId', 'destinationCountry'],
    requiredInputs: ['orderId'],
    exposedToReadOnlyAssistant: true,
    executable: true,
  },
  {
    key: 'create_listing_draft',
    label: 'Create listing draft',
    riskClass: 'LOW_RISK_WRITE',
    description:
      'Create a review-required listing content draft from canonical product facts; never publishes or syncs it.',
    screen: '/autonomous-commerce/listing-builder',
    inputs: ['productId', 'channel'],
    executable: true,
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
    label: 'Create RFQ draft',
    riskClass: 'LOW_RISK_WRITE',
    description:
      'Save an unsent RFQ draft from a selected product and quantity; a person must review it, open it and invite suppliers.',
    screen: '/autonomous-commerce/rfqs',
    inputs: ['productId', 'qty', 'requirement'],
    executable: true,
  },
  {
    key: 'create_supplier_claim_draft',
    label: 'Create supplier claim draft',
    riskClass: 'LOW_RISK_WRITE',
    description:
      'Save a one-line, review-only claim draft from operator-entered loss details; it does not contact or submit to the supplier.',
    screen: '/autonomous-commerce/supplier-claims',
    inputs: [
      'supplierId',
      'purchaseOrderId',
      'reasonCode',
      'reason',
      'productId',
      'purchaseOrderItemId',
      'itemDescription',
      'quantityAffected',
      'productLossAmount',
      'freightLossAmount',
      'otherLossAmount',
    ],
    executable: true,
  },
  {
    key: 'create_experiment',
    label: 'Create experiment draft',
    riskClass: 'LOW_RISK_WRITE',
    description:
      'Save an experiment proposal for one product; it does not change the product or start measurement.',
    screen: '/autonomous-commerce/experiment-lab',
    inputs: [
      'productId',
      'name',
      'type',
      'hypothesis',
      'changeDescription',
      'primaryMetric',
    ],
    executable: true,
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
].map((tool) => ({
  ...tool,
  requiredModules: COMMERCE_AGENT_SOURCE_MODULES[tool.key] ?? [],
}));

export function parseCommerceAgentWriteToolAllowlist(value: unknown): {
  keys: Set<string>;
  invalidEntries: string[];
} {
  if (typeof value !== 'string' || value.length > 1200) {
    return { keys: new Set(), invalidEntries: ['invalid configuration'] };
  }
  const entries = value.trim()
    ? value.split(',').map((item) => item.trim())
    : [];
  const writableKeys = new Set(
    COMMERCE_AGENT_TOOLS.filter((tool) => tool.riskClass !== 'READ_ONLY').map(
      (tool) => tool.key,
    ),
  );
  const invalidEntries: string[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!entry || seen.has(entry) || !writableKeys.has(entry)) {
      invalidEntries.push(entry || '(empty entry)');
    }
    seen.add(entry);
  }
  if (invalidEntries.length) return { keys: new Set(), invalidEntries };
  return { keys: seen, invalidEntries: [] };
}

function writeToolAllowlistBlock(
  tool: AgentToolDef,
  allowedWriteToolKeys: ReadonlySet<string>,
  invalidWriteToolEntries: readonly string[],
): string | null {
  if (tool.riskClass === 'READ_ONLY') return null;
  if (invalidWriteToolEntries.length) {
    return 'The Commerce Agent write-tool allow-list contains an invalid or unregistered key. Correct it in Settings → AI & Governance; all write tools are blocked until then.';
  }
  if (!allowedWriteToolKeys.has(tool.key)) {
    return 'This write tool is not on the business allow-list in Settings → AI & Governance.';
  }
  return null;
}

export const COMMERCE_AGENT_ERROR_CODES = {
  UNKNOWN_TOOL: 'COMMERCE_AGENT_UNKNOWN_TOOL',
  INPUT_REQUIRED: 'COMMERCE_AGENT_INPUT_REQUIRED',
  INPUT_INVALID: 'COMMERCE_AGENT_INPUT_INVALID',
  IDEMPOTENCY_KEY_REQUIRED: 'COMMERCE_AGENT_IDEMPOTENCY_KEY_REQUIRED',
  IDEMPOTENCY_CONFLICT: 'COMMERCE_AGENT_IDEMPOTENCY_CONFLICT',
  PREVIOUS_RUN_FAILED: 'COMMERCE_AGENT_PREVIOUS_RUN_FAILED',
  OUTCOME_UNKNOWN: 'COMMERCE_AGENT_TOOL_OUTCOME_UNKNOWN',
  APPROVAL_INVALID: 'COMMERCE_AGENT_APPROVAL_INVALID',
  APPROVAL_CONFLICT: 'COMMERCE_AGENT_APPROVAL_CONFLICT',
  TOOL_UNAVAILABLE: 'COMMERCE_AGENT_TOOL_UNAVAILABLE',
} as const;

type ToolResultResourceType =
  | 'commerce_listing_draft'
  | 'commerce_rfq'
  | 'commerce_experiment'
  | 'commerce_supplier_claim';

type ExecutedToolResult = {
  result: unknown;
  summary: string;
  resourceType?: ToolResultResourceType;
  resourceId?: string;
};

/**
 * Commerce agent tool registry (backend spec §11.1–11.3). Every tool declares its risk class, inputs
 * and the screen where people do the same job. A run is checked against the business's autonomy
 * level and the commerce kill switch, executed through existing canonical services, and always
 * recorded — including refusals. Write tools are limited to unsent/review-required drafts. No
 * commerce agent runs on its own yet; calls today are started by a person from Agents & Tools.
 */
@Injectable()
export class CommerceAgentToolsService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly rfqs: CommerceRfqsService,
    private readonly router: CommerceFulfillmentRouterService,
    private readonly listingBuilder: CommerceListingBuilderService,
    private readonly experiments: CommerceExperimentsService,
    private readonly claims: CommerceSupplierClaimsService,
    private readonly productValidation: ProductValidationService,
    private readonly b2b: CommerceB2bService,
    private readonly policies: PoliciesService,
    @Optional()
    private readonly storeOptimizer?: CommerceStoreOptimizerService,
    @Optional()
    private readonly production?: CommerceProductionService,
    @Optional()
    private readonly specialistAgentPolicy?: SpecialistAgentPolicyService,
  ) {}

  private get db() {
    return this.tenantPrisma.client;
  }

  private async disabledModulesForBusiness(businessId: string) {
    if (this.specialistAgentPolicy) {
      return new Set(
        await this.specialistAgentPolicy.disabledModulesForBusiness(businessId),
      );
    }

    // Directly constructed services in isolated integrations may not have Nest's global
    // SpecialistAgentPolicyService. Keep the same root-business/branch selection semantics there.
    const business = await this.db.business.findUnique({
      where: { id: businessId },
      select: {
        parentId: true,
        disabledModules: true,
        parent: { select: { disabledModules: true } },
      },
    });
    const disabled = business?.parentId
      ? business.parent?.disabledModules
      : business?.disabledModules;
    return new Set(parseDisabled(disabled));
  }

  private moduleBlockForTool(
    toolKey: string,
    disabledModules: ReadonlySet<string>,
  ): string | null {
    const requiredModules = [
      'autonomous-commerce',
      ...(COMMERCE_AGENT_SOURCE_MODULES[toolKey] ?? []),
    ];
    const disabled = requiredModules.find((key) => disabledModules.has(key));
    if (!disabled) return null;
    const label = BUSINESS_MODULES.find((module) => module.key === disabled)?.label;
    return `This Commerce agent tool is unavailable because ${label ?? disabled} is turned off in Settings → Modules.`;
  }

  private async toolModuleBlock(businessId: string, toolKey: string) {
    return this.moduleBlockForTool(
      toolKey,
      await this.disabledModulesForBusiness(businessId),
    );
  }

  private async assertToolModulesEnabled(businessId: string, toolKey: string) {
    const blocked = await this.toolModuleBlock(businessId, toolKey);
    if (!blocked) return;
    throw new AppException(
      COMMERCE_AGENT_ERROR_CODES.TOOL_UNAVAILABLE,
      blocked,
      HttpStatus.FORBIDDEN,
    );
  }

  private async policy(businessId: string) {
    const business = await this.db.business.findUnique({
      where: { id: businessId },
      select: { policies: true },
    });
    const policies = resolvePolicies(business);
    const writeToolAllowlist = parseCommerceAgentWriteToolAllowlist(
      policies.text('commerce.agentAllowedWriteTools'),
    );
    return {
      level: policies.num('commerce.autonomyLevel') ?? 1,
      paused: policies.bool('commerce.actionsPaused'),
      allowedWriteToolKeys: writeToolAllowlist.keys,
      invalidWriteToolEntries: writeToolAllowlist.invalidEntries,
    };
  }

  /** Why a tool may not be used right now, or null when it may. */
  static gate(
    tool: AgentToolDef,
    level: number,
    paused: boolean,
    allowedWriteToolKeys: ReadonlySet<string>,
    invalidWriteToolEntries: readonly string[],
  ): string | null {
    if (level < MIN_LEVEL[tool.riskClass]) {
      return `Autonomy level ${level} (${AUTONOMY_LEVELS[level]?.label ?? 'unknown'}) does not allow ${tool.riskClass.replaceAll('_', ' ').toLowerCase()} tools; level ${MIN_LEVEL[tool.riskClass]} or higher is needed.`;
    }
    if (paused && tool.riskClass !== 'READ_ONLY') {
      return 'Commerce actions are paused for this business.';
    }
    const allowlistBlock = writeToolAllowlistBlock(
      tool,
      allowedWriteToolKeys,
      invalidWriteToolEntries,
    );
    if (allowlistBlock) return allowlistBlock;
    if (!tool.executable) {
      return `This tool is not yet executable by agents — do this on ${tool.screen}.`;
    }
    if (ALWAYS_APPROVAL.includes(tool.riskClass)) {
      if (tool.approvalSupported) {
        return 'A different authorized user must approve this exact request. No Commerce action occurs until approval.';
      }
      return `This ${tool.riskClass.replaceAll('_', ' ').toLowerCase()} tool requires a human approval workflow, which is not connected to direct agent execution yet — review it on ${tool.screen}.`;
    }
    return null;
  }

  async registry(businessId: string) {
    const { level, paused, allowedWriteToolKeys, invalidWriteToolEntries } =
      await this.policy(businessId);
    const disabledModules = await this.disabledModulesForBusiness(businessId);
    return {
      autonomyLevel: level,
      levels: AUTONOMY_LEVELS,
      paused,
      allowedWriteToolKeys: [...allowedWriteToolKeys],
      writeToolAllowlistValid: invalidWriteToolEntries.length === 0,
      invalidWriteToolEntries,
      tools: COMMERCE_AGENT_TOOLS.map((tool) => ({
        ...tool,
        minLevel: MIN_LEVEL[tool.riskClass],
        approvalRequired: ALWAYS_APPROVAL.includes(tool.riskClass),
        allowedByBusinessAllowlist:
          tool.riskClass === 'READ_ONLY' || allowedWriteToolKeys.has(tool.key),
        blockedReason:
          this.moduleBlockForTool(tool.key, disabledModules) ??
          CommerceAgentToolsService.gate(
            tool,
            level,
            paused,
            allowedWriteToolKeys,
            invalidWriteToolEntries,
          ),
      })),
    };
  }

  async runs(businessId: string, viewerUserId?: string) {
    const rows = await this.db.commerceAgentToolRun.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        toolKey: true,
        riskClass: true,
        actorType: true,
        actorUserId: true,
        autonomyLevel: true,
        input: true,
        outcome: true,
        refusalReason: true,
        resultSummary: true,
        correlationId: true,
        durationMs: true,
        createdAt: true,
      },
    });
    return rows.map((run) => ({
      ...this.runView(run, viewerUserId),
    }));
  }

  private runView(
    run: Pick<
      CommerceAgentToolRun,
      | 'id'
      | 'toolKey'
      | 'riskClass'
      | 'actorType'
      | 'actorUserId'
      | 'autonomyLevel'
      | 'input'
      | 'outcome'
      | 'refusalReason'
      | 'resultSummary'
      | 'correlationId'
      | 'durationMs'
      | 'createdAt'
    >,
    viewerUserId?: string,
  ) {
    const tool = COMMERCE_AGENT_TOOLS.find((item) => item.key === run.toolKey);
    return {
      id: run.id,
      toolKey: run.toolKey,
      riskClass: run.riskClass,
      actorType: run.actorType,
      canApprove:
        viewerUserId !== undefined &&
        tool?.approvalSupported === true &&
        run.outcome === 'pending_approval' &&
        run.actorUserId !== viewerUserId,
      autonomyLevel: run.autonomyLevel,
      input: run.input,
      outcome: run.outcome,
      refusalReason: run.refusalReason,
      resultSummary: run.resultSummary,
      correlationId: run.correlationId,
      durationMs: run.durationMs,
      createdAt: run.createdAt,
    };
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
    actorUserId: string,
    key: string,
    input: Record<string, string>,
  ): Promise<ExecutedToolResult> {
    await this.assertToolModulesEnabled(businessId, key);
    switch (key) {
      case 'get_product': {
        const costHidden = await this.policies.costHidden();
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
        const result = {
          id: product.id,
          name: product.name,
          sku: product.sku,
          sellingPrice: Number(product.sellingPrice),
          ...(costHidden ? {} : { costPrice: Number(product.costPrice) }),
          costPriceAvailable: !costHidden,
          stockQty: product.stockQty,
          lowStockThreshold: product.lowStockThreshold,
          active: product.active,
        };
        return {
          result,
          summary: `${product.name}: ${product.stockQty} in stock.${costHidden ? ' Cost price is hidden by business policy and your permissions.' : ''}`,
        };
      }
      case 'get_inventory': {
        const where = {
          businessId,
          active: true,
          kind: ProductKind.product,
          stockQty: {
            lte: this.db.product.fields.lowStockThreshold,
          },
        };
        const [lowStockCount, low] = await Promise.all([
          this.db.product.count({ where }),
          this.db.product.findMany({
            where,
            select: {
              id: true,
              name: true,
              stockQty: true,
              lowStockThreshold: true,
            },
            orderBy: [{ stockQty: 'asc' }, { id: 'asc' }],
            take: MAX_AGENT_INVENTORY_PRODUCTS,
          }),
        ]);
        const productsTruncated = lowStockCount > low.length;
        return {
          result: {
            lowStockCount,
            productsTruncated,
            products: low,
          },
          summary: `Found ${lowStockCount} active product(s) at or below their threshold; showing ${low.length}${productsTruncated ? ` of the first ${MAX_AGENT_INVENTORY_PRODUCTS}` : ''}.`,
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
            items: {
              orderBy: { id: 'asc' },
              take: MAX_AGENT_RFQ_LINE_ITEMS,
              select: { name: true, qty: true, price: true },
            },
            _count: { select: { items: true } },
          },
        });
        if (!order) return { result: null, summary: 'Order not found.' };
        const result = {
          id: order.id,
          orderNo: order.orderNo,
          status: order.status,
          total: Number(order.total),
          createdAt: order.createdAt,
          itemCount: order._count.items,
          itemsTruncated: order._count.items > MAX_AGENT_RFQ_LINE_ITEMS,
          items: order.items.map((item) => ({
            name: item.name,
            qty: item.qty,
            price: Number(item.price),
          })),
        };
        return {
          result,
          summary: `Order #${order.orderNo}: ${order.status}, ${order._count.items} line(s) recorded${result.itemsTruncated ? `; showing the first ${MAX_AGENT_RFQ_LINE_ITEMS}` : ''}.`,
        };
      }
      case 'get_product_opportunity': {
        const opportunity = await this.db.productOpportunity.findFirst({
          where: {
            id: this.required(input, 'opportunityId'),
            businessId,
          },
          select: {
            id: true,
            title: true,
            source: true,
            category: true,
            market: true,
            status: true,
            risk: true,
            confidence: true,
            demandSignal: true,
            trendVelocity: true,
            competitionScore: true,
            storeFitScore: true,
            observedPrice: true,
            estimatedLandedCost: true,
            marginEstimate: true,
            shippingEstimate: true,
            supplierCount: true,
            sourceFreshAt: true,
            version: true,
            updatedAt: true,
          },
        });
        if (!opportunity) {
          return { result: null, summary: 'Product opportunity not found.' };
        }
        const result = {
          ...opportunity,
          observedPrice:
            opportunity.observedPrice === null
              ? null
              : Number(opportunity.observedPrice),
          estimatedLandedCost:
            opportunity.estimatedLandedCost === null
              ? null
              : Number(opportunity.estimatedLandedCost),
          marginEstimate:
            opportunity.marginEstimate === null
              ? null
              : Number(opportunity.marginEstimate),
          shippingEstimate:
            opportunity.shippingEstimate === null
              ? null
              : Number(opportunity.shippingEstimate),
        };
        return {
          result,
          summary: `Product Radar opportunity ${opportunity.id} is ${opportunity.status}; recorded source: ${opportunity.source}. Research values may be manual and are not independently provider-verified.`,
        };
      }
      case 'get_validation_case': {
        const opportunityId = this.required(input, 'opportunityId');
        const validation = await this.productValidation.getOne(
          businessId,
          opportunityId,
        );
        const history = await this.productValidation.history(
          businessId,
          opportunityId,
          5,
        );
        const result = {
          opportunity: {
            id: validation.id,
            title: validation.title,
            source: validation.source,
            market: validation.market,
            status: validation.status,
            risk: validation.risk,
            confidence: validation.confidence,
            version: validation.version,
            sourceFreshAt: validation.sourceFreshAt,
            updatedAt: validation.updatedAt,
          },
          evidenceReview: {
            factors: validation.evidenceReview.factors,
            evidenceCoverage: validation.evidenceReview.evidenceCoverage,
            scorecard: validation.evidenceReview.scorecard,
          },
          recentDecisions: history.map((item) => ({
            decision: item.decision,
            createdAt: item.createdAt,
          })),
          limitations: [
            'Evidence availability only; no overall score, probability, pass/fail result or launch recommendation is calculated here.',
            'Free-text research notes and decision reasons are omitted; open the canonical Product Validation screen to inspect them.',
          ],
        };
        return {
          result,
          summary: `Validation case ${validation.id} is ${validation.status}; recorded ${validation.evidenceReview.evidenceCoverage.recorded} of ${validation.evidenceReview.evidenceCoverage.total} evidence fields. This is not a pass/fail result.`,
        };
      }
      case 'get_supplier_claim': {
        const result = await this.claims.agentReadView(
          businessId,
          this.required(input, 'claimId'),
        );
        return {
          result,
          summary: `Supplier claim ${result.id} is ${result.status}; ${result.evidenceCount} evidence record(s), with ${result.currency} ${result.outstandingAmount.toFixed(2)} recorded outstanding. No supplier was contacted.`,
        };
      }
      case 'get_risk_case': {
        const riskCase = await this.db.commerceRiskCase.findFirst({
          where: { id: this.required(input, 'caseId'), businessId },
          select: {
            id: true,
            ruleKey: true,
            entityType: true,
            severity: true,
            status: true,
            exposureAmount: true,
            signalCount: true,
            evidence: true,
            firstDetectedAt: true,
            lastDetectedAt: true,
            updatedAt: true,
          },
        });
        if (!riskCase) {
          return { result: null, summary: 'Risk case not found.' };
        }
        const rawEvidence = asJsonRecord(riskCase.evidence);
        const riskEvidence = rawEvidence ?? {};
        const evidenceSummary =
          riskCase.ruleKey === 'repeat_returns'
            ? {
                basis:
                  'Recorded return count compared with the configured threshold and detection window.',
                windowDays: jsonNumber(riskEvidence.windowDays),
                threshold: jsonNumber(riskEvidence.threshold),
                returnCount:
                  jsonNumber(riskEvidence.returnCount) ??
                  jsonCount(riskEvidence.returnIds),
                uniqueOrderCount:
                  jsonNumber(riskEvidence.uniqueOrderCount) ??
                  jsonCount(riskEvidence.orderIds),
              }
            : riskCase.ruleKey === 'over_returned_order'
              ? {
                  basis:
                    'Recorded returned units exceed the units on the order; this is a possible duplicate-refund signal, not a confirmed duplicate.',
                  windowDays: jsonNumber(riskEvidence.windowDays),
                  returnCount:
                    jsonNumber(riskEvidence.returnCount) ??
                    jsonCount(riskEvidence.returnIds),
                  affectedProductCount:
                    jsonNumber(riskEvidence.affectedProductCount) ??
                    jsonCount(riskEvidence.products),
                  excessUnitCount: jsonNumber(riskEvidence.excessUnitCount),
                }
              : {
                  basis:
                    'Recorded coupon-order count compared with the configured threshold and detection window.',
                  windowDays: jsonNumber(riskEvidence.windowDays),
                  threshold: jsonNumber(riskEvidence.threshold),
                  orderCount:
                    jsonNumber(riskEvidence.orderCount) ??
                    jsonCount(riskEvidence.orderIds),
                  uniqueCouponCount:
                    jsonNumber(riskEvidence.uniqueCouponCount) ??
                    jsonCount(riskEvidence.couponCodes),
                };
        const result = {
          id: riskCase.id,
          ruleKey: riskCase.ruleKey,
          entityType: riskCase.entityType,
          severity: riskCase.severity,
          status: riskCase.status,
          recordedExposureAmount: Number(riskCase.exposureAmount),
          signalCount: riskCase.signalCount,
          evidenceSummary,
          firstDetectedAt: riskCase.firstDetectedAt,
          lastDetectedAt: riskCase.lastDetectedAt,
          updatedAt: riskCase.updatedAt,
        };
        return {
          result,
          summary: `Risk case ${riskCase.id} is ${riskCase.status} with ${riskCase.severity} severity and ${riskCase.signalCount} recorded signal(s). Recorded exposure is not confirmed loss and this case does not itself hold an order.`,
        };
      }
      case 'get_channel_listing': {
        const listing = await this.db.commerceChannelListing.findFirst({
          where: { id: this.required(input, 'listingId'), businessId },
          select: {
            id: true,
            provider: true,
            status: true,
            syncedVersion: true,
            sellingPriceAtSync: true,
            lastSyncedAt: true,
            updatedAt: true,
            product: { select: { name: true } },
            draft: {
              select: {
                channel: true,
                market: true,
                status: true,
                currentVersion: true,
              },
            },
          },
        });
        if (!listing) {
          return { result: null, summary: 'Channel listing not found.' };
        }
        const result = {
          id: listing.id,
          productName: listing.product.name,
          provider: listing.provider,
          status: listing.status,
          syncedVersion: listing.syncedVersion,
          sellingPriceAtSync:
            listing.sellingPriceAtSync === null
              ? null
              : Number(listing.sellingPriceAtSync),
          lastSyncedAt: listing.lastSyncedAt,
          draft: listing.draft,
          updatedAt: listing.updatedAt,
          limitations: [
            'This is the saved local provider-sync record. The external provider product ID and provider error details are omitted; open Channel Listings for the full canonical record.',
          ],
        };
        return {
          result,
          summary: `The ${listing.provider} listing for ${listing.product.name} is recorded as ${listing.status}; provider confirmation is represented only by the saved sync status and timestamp.`,
        };
      }
      case 'get_experiment_review': {
        const review = await this.experiments.specialistReview(businessId);
        return {
          result: review,
          summary:
            review.state === 'no_experiments'
              ? 'No running, stopped or decided Experiment Lab records are available for review. Drafts are excluded.'
              : `Reviewed ${review.reviewedCount} of at most ${review.maximumReviewed} recent running or decided experiment(s). Any before/after change is observational, not causal or statistically significant; no experiment was changed.`,
        };
      }
      case 'compare_quotes': {
        const rfq = await this.db.commerceRfq.findFirst({
          where: {
            id: this.required(input, 'rfqId'),
            businessId,
          },
          select: {
            id: true,
            status: true,
            currency: true,
            version: true,
            dueAt: true,
            updatedAt: true,
            items: {
              orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
              take: MAX_AGENT_RFQ_LINE_ITEMS,
              select: { id: true, productId: true, qty: true },
            },
            quotes: {
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              take: MAX_AGENT_RFQ_QUOTES,
              select: {
                id: true,
                supplierId: true,
                status: true,
                revisionNo: true,
                currency: true,
                validUntil: true,
                freight: true,
                duties: true,
                leadTimeDays: true,
                version: true,
                items: {
                  orderBy: { rfqItemId: 'asc' },
                  take: MAX_AGENT_RFQ_LINE_ITEMS,
                  select: {
                    rfqItemId: true,
                    quotedQty: true,
                    minimumQty: true,
                    unitPrice: true,
                  },
                },
                _count: { select: { items: true } },
              },
            },
            _count: { select: { items: true, quotes: true } },
          },
        });
        if (!rfq) {
          throw new AppException(
            COMMERCE_RFQ_ERROR_CODES.NOT_FOUND,
            'RFQ not found.',
            HttpStatus.NOT_FOUND,
          );
        }
        const result = {
          id: rfq.id,
          status: rfq.status,
          currency: rfq.currency,
          version: rfq.version,
          dueAt: rfq.dueAt,
          updatedAt: rfq.updatedAt,
          requestedItemCount: rfq._count.items,
          requestedItemsTruncated: rfq._count.items > MAX_AGENT_RFQ_LINE_ITEMS,
          requestedItems: rfq.items,
          quoteCount: rfq._count.quotes,
          quotesTruncated: rfq._count.quotes > MAX_AGENT_RFQ_QUOTES,
          quotes: rfq.quotes.map((quote) => ({
            id: quote.id,
            supplierId: quote.supplierId,
            status: quote.status,
            revisionNo: quote.revisionNo,
            currency: quote.currency,
            validUntil: quote.validUntil,
            freight: Number(quote.freight),
            duties: Number(quote.duties),
            leadTimeDays: quote.leadTimeDays,
            version: quote.version,
            itemCount: quote._count.items,
            itemsTruncated: quote._count.items > MAX_AGENT_RFQ_LINE_ITEMS,
            items: quote.items.map((item) => ({
              rfqItemId: item.rfqItemId,
              quotedQty: item.quotedQty,
              minimumQty: item.minimumQty,
              unitPrice: Number(item.unitPrice),
            })),
          })),
        };
        return {
          result,
          summary: `Showing ${rfq.quotes.length} of ${rfq._count.quotes} recorded RFQ quote(s). Free-text requirements, supplier contacts, payment terms and notes are omitted; review the canonical RFQ before a decision.`,
        };
      }
      case 'award_rfq_quote': {
        const rfqId = this.required(input, 'rfqId');
        const quoteId = this.required(input, 'quoteId');
        const expectedVersionText = this.required(input, 'expectedVersion');
        const expectedVersion = Number(expectedVersionText);
        const reason = this.required(input, 'reason');
        if (
          !/^\d+$/.test(expectedVersionText) ||
          !Number.isSafeInteger(expectedVersion) ||
          expectedVersion < 1
        ) {
          throw new AppException(
            COMMERCE_AGENT_ERROR_CODES.INPUT_INVALID,
            'Expected RFQ version must be a positive whole number.',
            HttpStatus.BAD_REQUEST,
          );
        }
        if (reason.length < 3 || reason.length > 500) {
          throw new AppException(
            COMMERCE_AGENT_ERROR_CODES.INPUT_INVALID,
            'Provide an award reason between 3 and 500 characters.',
            HttpStatus.BAD_REQUEST,
          );
        }
        const awarded = await this.rfqs.award(businessId, actorUserId, rfqId, {
          quoteId,
          expectedVersion,
          reason,
        });
        const result = {
          rfqId: awarded.id,
          status: awarded.status,
          version: awarded.version,
          awardedQuoteId: awarded.awardedQuoteId,
          purchaseOrder: awarded.purchaseOrder
            ? {
                id: awarded.purchaseOrder.id,
                status: awarded.purchaseOrder.status,
              }
            : null,
        };
        return {
          result,
          summary: `Approved RFQ award is confirmed. A draft purchase order was created; the supplier was not contacted and stock was not changed.`,
          resourceType: 'commerce_rfq',
          resourceId: awarded.id,
        };
      }
      case 'preview_b2b_quote': {
        const accountId = this.required(input, 'accountId');
        const productId = this.required(input, 'productId');
        const qtyText = this.required(input, 'qty');
        const canViewCredit = await this.policies.actorCan(
          CAPABILITIES.CREDIT_RECOVERY_REPORT_VIEW,
        );
        const qty = Number(qtyText);
        if (
          !/^\d+$/.test(qtyText) ||
          !Number.isSafeInteger(qty) ||
          qty < 1 ||
          qty > 2_147_483_647
        ) {
          throw new AppException(
            COMMERCE_AGENT_ERROR_CODES.INPUT_INVALID,
            'Quantity must be a positive whole number within the supported range.',
            HttpStatus.BAD_REQUEST,
          );
        }
        const [quote, business] = await Promise.all([
          this.b2b.previewQuote(
            businessId,
            accountId,
            {
              lines: [{ productId, qty }],
            },
            { includeCredit: canViewCredit },
          ),
          this.db.business.findUnique({
            where: { id: businessId },
            select: { currency: true },
          }),
        ]);
        return {
          result: {
            ...quote,
            currency: business?.currency ?? null,
            pricingNote: 'Line total excludes tax; this is a preview only.',
          },
          summary: `B2B quote previewed for ${quote.lines.length} line(s); no order was created.`,
        };
      }
      case 'get_b2b_reorder_opportunities': {
        const review = await this.b2b.agentReorderReview(businessId);
        return {
          result: review,
          summary:
            review.state === 'due_reorders'
              ? `${review.dueCount} active B2B account(s) are past their estimated reorder date; this is an order-history cadence estimate, not a prediction or customer commitment.`
              : review.state === 'no_active_accounts'
                ? 'No active B2B accounts are recorded; no reorder estimates are available.'
                : 'No active B2B account is currently past its estimated reorder date.',
        };
      }
      case 'get_store_optimizer_review': {
        if (!this.storeOptimizer) {
          throw new AppException(
            COMMERCE_AGENT_ERROR_CODES.TOOL_UNAVAILABLE,
            'Store Optimizer review is not available.',
            HttpStatus.SERVICE_UNAVAILABLE,
          );
        }
        const review = await this.storeOptimizer.agentReview(businessId);
        return {
          result: review,
          summary:
            review.state === 'findings_present'
              ? `${review.findingCount} current Store Optimizer finding(s) across ${Object.keys(review.byRule).length} rule type(s); this is a rule scan, not proof of cause or financial impact.`
              : 'The current Store Optimizer rules found no issues in the records they check; this does not establish that the storefront is healthy.',
        };
      }
      case 'get_production_review': {
        if (!this.production) {
          throw new AppException(
            COMMERCE_AGENT_ERROR_CODES.TOOL_UNAVAILABLE,
            'Production & Assembly review is not available.',
            HttpStatus.SERVICE_UNAVAILABLE,
          );
        }
        const review = await this.production.agentReview(businessId);
        return {
          result: review,
          summary:
            review.state === 'no_production_records'
              ? 'No bills of materials or work orders are recorded for this business.'
              : `${review.workOrders.total} recorded work order(s) across ${Object.keys(review.workOrders.byStatus).length} status(es); late orders are a schedule signal, not a diagnosis of cause or capacity.`,
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
      case 'create_listing_draft': {
        const productId = this.required(input, 'productId');
        const channel = this.required(input, 'channel');
        if (
          !COMMERCE_LISTING_CHANNELS.includes(
            channel as (typeof COMMERCE_LISTING_CHANNELS)[number],
          )
        ) {
          throw new AppException(
            COMMERCE_AGENT_ERROR_CODES.INPUT_INVALID,
            'Choose a supported listing channel.',
            HttpStatus.BAD_REQUEST,
          );
        }
        const draft = await this.listingBuilder.generate(
          businessId,
          actorUserId,
          {
            productId,
            channel: channel as (typeof COMMERCE_LISTING_CHANNELS)[number],
          },
          'commerce_agent',
        );
        return {
          result: draft,
          summary: `Listing draft ${draft.id} is saved as ${draft.status}; human review, approval and provider sync remain separate.`,
          resourceType: 'commerce_listing_draft',
          resourceId: draft.id,
        };
      }
      case 'create_rfq': {
        const productId = this.required(input, 'productId');
        const qtyText = this.required(input, 'qty');
        const requirement = this.required(input, 'requirement');
        const qty = Number(qtyText);
        if (
          !/^\d+$/.test(qtyText) ||
          !Number.isSafeInteger(qty) ||
          qty < 1 ||
          qty > 2_147_483_647
        ) {
          throw new AppException(
            COMMERCE_AGENT_ERROR_CODES.INPUT_INVALID,
            'Quantity must be a positive whole number within the supported range.',
            HttpStatus.BAD_REQUEST,
          );
        }
        if (requirement.length < 3 || requirement.length > 200) {
          throw new AppException(
            COMMERCE_AGENT_ERROR_CODES.INPUT_INVALID,
            'Requirement must be between 3 and 200 characters.',
            HttpStatus.BAD_REQUEST,
          );
        }
        const product = await this.db.product.findFirst({
          where: {
            id: productId,
            businessId,
            active: true,
            kind: ProductKind.product,
          },
          select: { id: true, name: true },
        });
        if (!product) {
          throw new AppException(
            COMMERCE_AGENT_ERROR_CODES.INPUT_INVALID,
            'Choose an active product from this business.',
            HttpStatus.BAD_REQUEST,
          );
        }
        const business = await this.db.business.findUnique({
          where: { id: businessId },
          select: { currency: true },
        });
        if (!business || !/^[A-Z]{3}$/.test(business.currency)) {
          throw new AppException(
            COMMERCE_AGENT_ERROR_CODES.INPUT_INVALID,
            'Set a valid three-letter business currency before creating an RFQ draft.',
            HttpStatus.BAD_REQUEST,
          );
        }
        const draft = await this.rfqs.create(businessId, actorUserId, {
          requirement,
          currency: business.currency,
          items: [{ productId: product.id, description: product.name, qty }],
          supplierIds: [],
        });
        return {
          result: draft,
          summary: `RFQ ${draft.id} saved as a draft in ${business.currency}; it is not open and no suppliers were invited.`,
          resourceType: 'commerce_rfq',
          resourceId: draft.id,
        };
      }
      case 'create_experiment': {
        const productId = this.required(input, 'productId');
        const name = this.required(input, 'name');
        const type = this.required(input, 'type');
        const hypothesis = this.required(input, 'hypothesis');
        const changeDescription = this.required(input, 'changeDescription');
        const primaryMetric = this.required(input, 'primaryMetric');
        if (name.length < 3 || name.length > 160) {
          throw new AppException(
            COMMERCE_AGENT_ERROR_CODES.INPUT_INVALID,
            'Experiment name must be between 3 and 160 characters.',
            HttpStatus.BAD_REQUEST,
          );
        }
        if (hypothesis.length < 5 || hypothesis.length > 200) {
          throw new AppException(
            COMMERCE_AGENT_ERROR_CODES.INPUT_INVALID,
            'Hypothesis must be between 5 and 200 characters.',
            HttpStatus.BAD_REQUEST,
          );
        }
        if (changeDescription.length < 3 || changeDescription.length > 200) {
          throw new AppException(
            COMMERCE_AGENT_ERROR_CODES.INPUT_INVALID,
            'Change description must be between 3 and 200 characters.',
            HttpStatus.BAD_REQUEST,
          );
        }
        if (
          !Object.values(CommerceExperimentType).includes(
            type as CommerceExperimentType,
          ) ||
          !Object.values(CommerceExperimentMetric).includes(
            primaryMetric as CommerceExperimentMetric,
          )
        ) {
          throw new AppException(
            COMMERCE_AGENT_ERROR_CODES.INPUT_INVALID,
            'Choose a supported experiment type and primary metric.',
            HttpStatus.BAD_REQUEST,
          );
        }
        const draft = await this.experiments.create(businessId, actorUserId, {
          productId,
          name,
          type: type as CommerceExperimentType,
          hypothesis,
          changeDescription,
          primaryMetric: primaryMetric as CommerceExperimentMetric,
        });
        return {
          result: draft,
          summary: `Experiment ${draft.id} saved as a draft; the product is unchanged and measurement has not started.`,
          resourceType: 'commerce_experiment',
          resourceId: draft.id,
        };
      }
      case 'submit_supplier_claim': {
        const claimId = this.required(input, 'claimId');
        const expectedVersion = Number(this.required(input, 'expectedVersion'));
        const reason = this.approvalReason(this.required(input, 'reason'));
        const submitted = await this.claims.submit(
          businessId,
          actorUserId,
          claimId,
          { expectedVersion, reason },
        );
        return {
          result: submitted,
          summary: `Supplier claim ${submitted.id} is marked submitted for operator follow-up. No supplier was contacted; use the canonical Supplier Claims communication flow to record or send anything externally.`,
          resourceType: 'commerce_supplier_claim',
          resourceId: submitted.id,
        };
      }
      case 'create_supplier_claim_draft': {
        const supplierId = this.required(input, 'supplierId');
        const reasonCode = this.required(input, 'reasonCode');
        const reason = this.required(input, 'reason');
        const itemDescription = this.required(input, 'itemDescription');
        const quantityText = this.required(input, 'quantityAffected');
        const productLossText = this.required(input, 'productLossAmount');
        const freightLossText = input.freightLossAmount?.trim() || '0';
        const otherLossText = input.otherLossAmount?.trim() || '0';
        const quantityAffected = Number(quantityText);
        const amountPattern = /^\d{1,10}(?:\.\d{1,2})?$/;
        if (
          !/^\d+$/.test(quantityText) ||
          !Number.isSafeInteger(quantityAffected) ||
          quantityAffected < 1 ||
          quantityAffected > 2_147_483_647
        ) {
          throw new AppException(
            COMMERCE_AGENT_ERROR_CODES.INPUT_INVALID,
            'Affected quantity must be a positive whole number.',
            HttpStatus.BAD_REQUEST,
          );
        }
        if (
          !amountPattern.test(productLossText) ||
          !amountPattern.test(freightLossText) ||
          !amountPattern.test(otherLossText)
        ) {
          throw new AppException(
            COMMERCE_AGENT_ERROR_CODES.INPUT_INVALID,
            'Enter non-negative loss amounts with no more than two decimal places.',
            HttpStatus.BAD_REQUEST,
          );
        }
        if (
          reasonCode.length < 2 ||
          reasonCode.length > 80 ||
          reason.length < 3 ||
          reason.length > 200 ||
          itemDescription.length < 1 ||
          itemDescription.length > 200
        ) {
          throw new AppException(
            COMMERCE_AGENT_ERROR_CODES.INPUT_INVALID,
            'Enter a reason code, reason and claim-line description within the supported lengths.',
            HttpStatus.BAD_REQUEST,
          );
        }
        const business = await this.db.business.findUnique({
          where: { id: businessId },
          select: { currency: true },
        });
        if (!business || !/^[A-Z]{3}$/.test(business.currency)) {
          throw new AppException(
            COMMERCE_AGENT_ERROR_CODES.INPUT_INVALID,
            'Set a valid three-letter business currency before creating a claim draft.',
            HttpStatus.BAD_REQUEST,
          );
        }
        const draft = await this.claims.create(businessId, actorUserId, {
          supplierId,
          purchaseOrderId: input.purchaseOrderId?.trim() || undefined,
          reasonCode,
          reason,
          currency: business.currency,
          items: [
            {
              productId: input.productId?.trim() || undefined,
              purchaseOrderItemId:
                input.purchaseOrderItemId?.trim() || undefined,
              description: itemDescription,
              quantityAffected,
              productLossAmount: Number(productLossText),
              freightLossAmount: Number(freightLossText),
              otherLossAmount: Number(otherLossText),
            },
          ],
        });
        return {
          result: draft,
          summary: `Supplier claim ${draft.id} saved as a draft in ${business.currency}; no evidence was attached and no supplier was contacted or sent the claim. Review it on the canonical Supplier Claims screen.`,
          resourceType: 'commerce_supplier_claim',
          resourceId: draft.id,
        };
      }
      default:
        return { result: null, summary: 'Not executable.' };
    }
  }

  private requestHash(
    actorUserId: string,
    toolKey: string,
    input: Record<string, string>,
    actorType = 'user',
  ) {
    return createHash('sha256')
      .update(JSON.stringify({ actorType, actorUserId, toolKey, input }))
      .digest('hex');
  }

  private approvalReason(reason: string) {
    const trimmed = reason.trim();
    if (trimmed.length < 3 || trimmed.length > 500) {
      throw new AppException(
        COMMERCE_AGENT_ERROR_CODES.APPROVAL_INVALID,
        'Enter an approval or rejection reason between 3 and 500 characters.',
        HttpStatus.BAD_REQUEST,
      );
    }
    return trimmed;
  }

  private validateAwardProposal(input: Record<string, string>) {
    const rfqId = this.required(input, 'rfqId');
    const quoteId = this.required(input, 'quoteId');
    const expectedVersionText = this.required(input, 'expectedVersion');
    const expectedVersion = Number(expectedVersionText);
    this.approvalReason(this.required(input, 'reason'));
    if (
      !rfqId ||
      !quoteId ||
      !/^\d+$/.test(expectedVersionText) ||
      !Number.isSafeInteger(expectedVersion) ||
      expectedVersion < 1
    ) {
      throw new AppException(
        COMMERCE_AGENT_ERROR_CODES.INPUT_INVALID,
        'Enter an RFQ, quote, positive current RFQ version and award reason.',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private validateApprovalProposal(
    toolKey: string,
    input: Record<string, string>,
  ) {
    if (toolKey === 'award_rfq_quote') {
      this.validateAwardProposal(input);
      return;
    }
    if (toolKey === 'submit_supplier_claim') {
      const claimId = this.required(input, 'claimId');
      const expectedVersionText = this.required(input, 'expectedVersion');
      const expectedVersion = Number(expectedVersionText);
      this.approvalReason(this.required(input, 'reason'));
      if (
        !claimId ||
        !/^\d+$/.test(expectedVersionText) ||
        !Number.isSafeInteger(expectedVersion) ||
        expectedVersion < 1
      ) {
        throw new AppException(
          COMMERCE_AGENT_ERROR_CODES.INPUT_INVALID,
          'Enter a supplier claim, its positive current version and a submission reason.',
          HttpStatus.BAD_REQUEST,
        );
      }
      return;
    }
    throw new AppException(
      COMMERCE_AGENT_ERROR_CODES.APPROVAL_INVALID,
      'This Commerce tool has no approval execution handler.',
      HttpStatus.CONFLICT,
    );
  }

  private async recordApprovalAudit(
    businessId: string,
    actorUserId: string,
    runId: string,
    action: string,
    before: Prisma.InputJsonObject,
    after: Prisma.InputJsonObject,
  ) {
    await this.db.auditLog.create({
      data: {
        businessId,
        actorUserId,
        action,
        entity: 'CommerceAgentToolRun',
        entityId: runId,
        before,
        after,
      },
    });
  }

  private async findApprovalRun(businessId: string, runId: string) {
    const run = await this.db.commerceAgentToolRun.findFirst({
      where: { id: runId, businessId },
    });
    if (!run) {
      throw new AppException(
        COMMERCE_AGENT_ERROR_CODES.APPROVAL_INVALID,
        'The Commerce agent approval request was not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    if (
      !COMMERCE_AGENT_TOOLS.find(
        (tool) => tool.key === run.toolKey && tool.approvalSupported,
      )
    ) {
      throw new AppException(
        COMMERCE_AGENT_ERROR_CODES.APPROVAL_INVALID,
        'This agent tool does not support approval execution.',
        HttpStatus.CONFLICT,
      );
    }
    return run;
  }

  private assertApprovalRequestIntact(run: CommerceAgentToolRun) {
    if (!run.actorUserId || !run.idempotencyRequestHash) {
      throw new AppException(
        COMMERCE_AGENT_ERROR_CODES.APPROVAL_INVALID,
        'The approval request is missing its original actor or request signature.',
        HttpStatus.CONFLICT,
      );
    }
    const tool = COMMERCE_AGENT_TOOLS.find((item) => item.key === run.toolKey);
    if (!tool) {
      throw new AppException(
        COMMERCE_AGENT_ERROR_CODES.APPROVAL_INVALID,
        'The registered Commerce agent tool is no longer available.',
        HttpStatus.CONFLICT,
      );
    }
    const rawInput = run.input;
    if (
      typeof rawInput !== 'object' ||
      rawInput === null ||
      Array.isArray(rawInput)
    ) {
      throw new AppException(
        COMMERCE_AGENT_ERROR_CODES.APPROVAL_INVALID,
        'The approval request input is invalid.',
        HttpStatus.CONFLICT,
      );
    }
    const normalizedInput = normalizeToolInput(tool, rawInput);
    if (
      this.requestHash(run.actorUserId, run.toolKey, normalizedInput) !==
      run.idempotencyRequestHash
    ) {
      throw new AppException(
        COMMERCE_AGENT_ERROR_CODES.APPROVAL_INVALID,
        'The approval request changed after it was submitted. It cannot be approved.',
        HttpStatus.CONFLICT,
      );
    }
    return normalizedInput;
  }

  private async reconcileAwardRun(
    businessId: string,
    run: CommerceAgentToolRun,
    normalizedInput: Record<string, string>,
    actorUserId: string,
  ) {
    const rfqId = normalizedInput.rfqId;
    const quoteId = normalizedInput.quoteId;
    if (!rfqId || !quoteId) return null;
    let rfq: Awaited<ReturnType<CommerceRfqsService['getOne']>>;
    try {
      rfq = await this.rfqs.getOne(businessId, rfqId);
    } catch {
      return null;
    }
    if (
      rfq.status !== 'awarded' ||
      rfq.awardedQuoteId !== quoteId ||
      !rfq.purchaseOrderId
    ) {
      return null;
    }
    const result = {
      rfqId: rfq.id,
      status: rfq.status,
      version: rfq.version,
      awardedQuoteId: rfq.awardedQuoteId,
      purchaseOrder: rfq.purchaseOrder
        ? { id: rfq.purchaseOrder.id, status: rfq.purchaseOrder.status }
        : null,
    };
    const updated = await this.db.$transaction(async (tx) => {
      const saved = await tx.commerceAgentToolRun.update({
        where: { id: run.id },
        data: {
          outcome: 'succeeded',
          resultSummary:
            'Award reconciled from the canonical RFQ after an interrupted approval request. The canonical RFQ shows the requested quote awarded and a purchase order linked.',
          resultResourceType: 'commerce_rfq',
          resultResourceId: rfq.id,
        },
      });
      await tx.auditLog.create({
        data: {
          businessId,
          actorUserId,
          action: 'commerce.agent_tool_approval_reconciled',
          entity: 'CommerceAgentToolRun',
          entityId: run.id,
          before: { outcome: 'running' },
          after: {
            outcome: 'succeeded',
            rfqId: rfq.id,
            quoteId,
            purchaseOrderId: rfq.purchaseOrderId,
          },
        },
      });
      return saved;
    });
    return {
      run: this.runView(updated, actorUserId),
      result,
      replayed: true,
      reconciled: true,
    };
  }

  private async reconcileApprovalRun(
    businessId: string,
    run: CommerceAgentToolRun,
    normalizedInput: Record<string, string>,
    actorUserId: string,
  ) {
    if (run.toolKey === 'award_rfq_quote') {
      return this.reconcileAwardRun(
        businessId,
        run,
        normalizedInput,
        actorUserId,
      );
    }
    if (run.toolKey !== 'submit_supplier_claim') return null;

    const claimId = normalizedInput.claimId;
    const expectedVersion = Number(normalizedInput.expectedVersion);
    if (!claimId || !Number.isSafeInteger(expectedVersion)) return null;
    let claim: Awaited<ReturnType<CommerceSupplierClaimsService['getOne']>>;
    let history: Awaited<ReturnType<CommerceSupplierClaimsService['history']>>;
    try {
      [claim, history] = await Promise.all([
        this.claims.getOne(businessId, claimId),
        this.claims.history(businessId, claimId),
      ]);
    } catch {
      return null;
    }
    const submission = history.find((entry) => {
      const before = entry.before;
      const after = entry.after;
      return (
        entry.action === 'submitted' &&
        entry.actorUserId === actorUserId &&
        entry.reason === normalizedInput.reason &&
        typeof before === 'object' &&
        before !== null &&
        !Array.isArray(before) &&
        before.status === 'draft' &&
        before.version === expectedVersion &&
        typeof after === 'object' &&
        after !== null &&
        !Array.isArray(after) &&
        after.status === 'submitted' &&
        after.version === expectedVersion + 1
      );
    });
    if (
      claim.id !== claimId ||
      claim.status !== 'submitted' ||
      claim.version !== expectedVersion + 1 ||
      claim.evidence.length === 0 ||
      !submission
    ) {
      return null;
    }

    const result = {
      id: claim.id,
      status: claim.status,
      version: claim.version,
      submittedAt: claim.submittedAt,
      supplier: claim.supplier,
      evidenceCount: claim.evidence.length,
    };
    const updated = await this.db.$transaction(async (tx) => {
      const saved = await tx.commerceAgentToolRun.update({
        where: { id: run.id },
        data: {
          outcome: 'succeeded',
          resultSummary:
            'Supplier claim submission reconciled from the canonical claim after an interrupted approval request. The claim is submitted for operator follow-up; no supplier was contacted.',
          resultResourceType: 'commerce_supplier_claim',
          resultResourceId: claim.id,
        },
      });
      await tx.auditLog.create({
        data: {
          businessId,
          actorUserId,
          action: 'commerce.agent_tool_approval_reconciled',
          entity: 'CommerceAgentToolRun',
          entityId: run.id,
          before: { outcome: 'running' },
          after: {
            outcome: 'succeeded',
            claimId: claim.id,
            claimVersion: claim.version,
            status: claim.status,
          },
        },
      });
      return saved;
    });
    return {
      run: this.runView(updated, actorUserId),
      result,
      replayed: true,
      reconciled: true,
    };
  }

  async approveRun(
    businessId: string,
    approverUserId: string,
    runId: string,
    reason: string,
  ) {
    const decisionReason = this.approvalReason(reason);
    let run = await this.findApprovalRun(businessId, runId);
    const initialModuleBlock = await this.toolModuleBlock(businessId, run.toolKey);
    if (initialModuleBlock && run.outcome === 'pending_approval') {
      await this.db.$transaction(async (tx) => {
        const changed = await tx.commerceAgentToolRun.updateMany({
          where: { id: run.id, businessId, outcome: 'pending_approval' },
          data: {
            outcome: 'refused',
            refusalReason: initialModuleBlock,
          },
        });
        if (changed.count) {
          await tx.auditLog.create({
            data: {
              businessId,
              actorUserId: approverUserId,
              action: 'commerce.agent_tool_module_refused',
              entity: 'CommerceAgentToolRun',
              entityId: run.id,
              before: { outcome: 'pending_approval' },
              after: {
                outcome: 'refused',
                toolKey: run.toolKey,
                reason: initialModuleBlock,
              },
            },
          });
        }
      });
      run = await this.findApprovalRun(businessId, runId);
      return { run: this.runView(run), result: null };
    }
    if (initialModuleBlock && run.outcome === 'succeeded') {
      return { run: this.runView(run), result: null, replayed: true };
    }
    if (initialModuleBlock && run.outcome === 'running') {
      throw new AppException(
        COMMERCE_AGENT_ERROR_CODES.TOOL_UNAVAILABLE,
        initialModuleBlock,
        HttpStatus.FORBIDDEN,
      );
    }
    if (run.outcome === 'succeeded') {
      const result = await this.resolveResult(
        businessId,
        run.resultResourceType,
        run.resultResourceId,
      );
      return {
        run: this.runView(run),
        result,
        replayed: true,
        resourceMissing: result === null,
      };
    }
    if (run.outcome === 'running') {
      const normalizedInput = this.assertApprovalRequestIntact(run);
      const reconciled = await this.reconcileApprovalRun(
        businessId,
        run,
        normalizedInput,
        approverUserId,
      );
      if (reconciled) return reconciled;
      throw new AppException(
        COMMERCE_AGENT_ERROR_CODES.OUTCOME_UNKNOWN,
        run.toolKey === 'award_rfq_quote'
          ? 'This approval may have been interrupted. Check the canonical RFQ and purchase order before taking any further action; Noxtill will not retry the award automatically.'
          : 'This approval may have been interrupted. Check the canonical supplier claim before taking any further action; Noxtill will not retry the submission automatically.',
        HttpStatus.CONFLICT,
      );
    }
    if (run.outcome !== 'pending_approval') {
      throw new AppException(
        COMMERCE_AGENT_ERROR_CODES.APPROVAL_CONFLICT,
        `This approval request is already ${run.outcome} and cannot be approved.`,
        HttpStatus.CONFLICT,
      );
    }
    const tool = COMMERCE_AGENT_TOOLS.find((item) => item.key === run.toolKey)!;
    if (!run.actorUserId || run.actorUserId === approverUserId) {
      throw new AppException(
        COMMERCE_AGENT_ERROR_CODES.APPROVAL_INVALID,
        `A different authorized user must approve this ${tool.label.toLowerCase()} action.`,
        HttpStatus.FORBIDDEN,
      );
    }
    const normalizedInput = this.assertApprovalRequestIntact(run);
    const currentPolicy = await this.policy(businessId);
    const currentModuleBlock = await this.toolModuleBlock(
      businessId,
      run.toolKey,
    );
    const gate =
      currentModuleBlock ??
      (currentPolicy.level < MIN_LEVEL[tool.riskClass]
        ? `Current autonomy level ${currentPolicy.level} no longer permits this ${tool.label.toLowerCase()} tool.`
        : currentPolicy.paused
          ? 'Commerce actions are paused for this business.'
          : writeToolAllowlistBlock(
              tool,
              currentPolicy.allowedWriteToolKeys,
              currentPolicy.invalidWriteToolEntries,
            ));
    if (gate) {
      await this.db.$transaction(async (tx) => {
        const updated = await tx.commerceAgentToolRun.updateMany({
          where: { id: run.id, businessId, outcome: 'pending_approval' },
          data: { outcome: 'refused', refusalReason: gate },
        });
        if (updated.count) {
          await tx.auditLog.create({
            data: {
              businessId,
              actorUserId: approverUserId,
              action: 'commerce.agent_tool_approval_refused',
              entity: 'CommerceAgentToolRun',
              entityId: run.id,
              before: { outcome: 'pending_approval' },
              after: { outcome: 'refused', reason: gate },
            },
          });
        }
      });
      run = await this.findApprovalRun(businessId, runId);
      return { run: this.runView(run), result: null };
    }

    const claimed = await this.db.$transaction(async (tx) => {
      const changed = await tx.commerceAgentToolRun.updateMany({
        where: { id: run.id, businessId, outcome: 'pending_approval' },
        data: {
          outcome: 'running',
          resultSummary: `Approval granted; ${tool.label.toLowerCase()} is being checked by its canonical service.`,
        },
      });
      if (!changed.count) return false;
      await tx.auditLog.create({
        data: {
          businessId,
          actorUserId: approverUserId,
          action: 'commerce.agent_tool_approved',
          entity: 'CommerceAgentToolRun',
          entityId: run.id,
          before: { outcome: 'pending_approval' },
          after: {
            outcome: 'running',
            reason: decisionReason,
            inputHash: run.idempotencyRequestHash,
          },
        },
      });
      return true;
    });
    if (!claimed) {
      throw new AppException(
        COMMERCE_AGENT_ERROR_CODES.APPROVAL_CONFLICT,
        'Another user already decided this approval request.',
        HttpStatus.CONFLICT,
      );
    }
    run = await this.findApprovalRun(businessId, runId);
    try {
      const { result, summary, resourceType, resourceId } = await this.execute(
        businessId,
        approverUserId,
        run.toolKey,
        normalizedInput,
      );
      const safeResult = this.resultForResponse(
        tool,
        result,
        resourceType,
        resourceId,
      );
      run = await this.db.$transaction(async (tx) => {
        const saved = await tx.commerceAgentToolRun.update({
          where: { id: run.id },
          data: {
            outcome: 'succeeded',
            resultSummary: summary,
            resultResourceType: resourceType ?? null,
            resultResourceId: resourceId ?? null,
            durationMs: Date.now() - run.createdAt.getTime(),
          },
        });
        await tx.auditLog.create({
          data: {
            businessId,
            actorUserId: approverUserId,
            action: 'commerce.agent_tool_approval_executed',
            entity: 'CommerceAgentToolRun',
            entityId: run.id,
            before: { outcome: 'running' },
            after: {
              outcome: 'succeeded',
              resourceType: resourceType ?? null,
              resourceId: resourceId ?? null,
              reason: decisionReason,
            },
          },
        });
        return saved;
      });
      return { run: this.runView(run), result: safeResult };
    } catch (error) {
      const latest = await this.findApprovalRun(businessId, runId);
      const moduleBlock = await this.toolModuleBlock(businessId, latest.toolKey);
      if (moduleBlock && latest.outcome === 'running') {
        await this.db.$transaction(async (tx) => {
          const changed = await tx.commerceAgentToolRun.updateMany({
            where: { id: latest.id, businessId, outcome: 'running' },
            data: { outcome: 'refused', refusalReason: moduleBlock },
          });
          if (changed.count) {
            await tx.auditLog.create({
              data: {
                businessId,
                actorUserId: approverUserId,
                action: 'commerce.agent_tool_module_refused',
                entity: 'CommerceAgentToolRun',
                entityId: latest.id,
                before: { outcome: 'running' },
                after: {
                  outcome: 'refused',
                  toolKey: latest.toolKey,
                  reason: moduleBlock,
                },
              },
            });
          }
        });
        const refused = await this.findApprovalRun(businessId, runId);
        return { run: this.runView(refused), result: null };
      }
      const reconciled = await this.reconcileApprovalRun(
        businessId,
        latest,
        normalizedInput,
        approverUserId,
      );
      if (reconciled) return reconciled;
      const message =
        error instanceof Error ? error.message : `${tool.label} failed.`;
      await this.db.commerceAgentToolRun.update({
        where: { id: latest.id },
        data: {
          outcome: 'failed',
          resultSummary: message,
          durationMs: Date.now() - latest.createdAt.getTime(),
        },
      });
      await this.recordApprovalAudit(
        businessId,
        approverUserId,
        latest.id,
        'commerce.agent_tool_approval_failed',
        { outcome: 'running' },
        { outcome: 'failed', message, reason: decisionReason },
      );
      throw error;
    }
  }

  async rejectRun(
    businessId: string,
    actorUserId: string,
    runId: string,
    reason: string,
  ) {
    const decisionReason = this.approvalReason(reason);
    const run = await this.findApprovalRun(businessId, runId);
    if (run.outcome !== 'pending_approval') {
      throw new AppException(
        COMMERCE_AGENT_ERROR_CODES.APPROVAL_CONFLICT,
        `This approval request is already ${run.outcome} and cannot be rejected.`,
        HttpStatus.CONFLICT,
      );
    }
    const changed = await this.db.$transaction(async (tx) => {
      const updated = await tx.commerceAgentToolRun.updateMany({
        where: { id: run.id, businessId, outcome: 'pending_approval' },
        data: { outcome: 'rejected', refusalReason: decisionReason },
      });
      if (!updated.count) return false;
      await tx.auditLog.create({
        data: {
          businessId,
          actorUserId,
          action: 'commerce.agent_tool_rejected',
          entity: 'CommerceAgentToolRun',
          entityId: run.id,
          before: { outcome: 'pending_approval' },
          after: {
            outcome: 'rejected',
            reason: decisionReason,
            inputHash: run.idempotencyRequestHash,
          },
        },
      });
      return true;
    });
    if (!changed) {
      throw new AppException(
        COMMERCE_AGENT_ERROR_CODES.APPROVAL_CONFLICT,
        'Another user already decided this approval request.',
        HttpStatus.CONFLICT,
      );
    }
    const updated = await this.findApprovalRun(businessId, run.id);
    return { run: this.runView(updated), result: null };
  }

  async run(
    businessId: string,
    actorUserId: string,
    key: string,
    input: Record<string, unknown>,
    idempotencyKey?: string,
    actorType = 'user',
    traceCorrelationId?: string,
  ) {
    const tool = COMMERCE_AGENT_TOOLS.find((row) => row.key === key);
    if (!tool) {
      throw new AppException(
        COMMERCE_AGENT_ERROR_CODES.UNKNOWN_TOOL,
        'That tool is not in the commerce registry.',
        HttpStatus.NOT_FOUND,
      );
    }
    const { level, paused, allowedWriteToolKeys, invalidWriteToolEntries } =
      await this.policy(businessId);
    const disabledModules = await this.disabledModulesForBusiness(businessId);
    const moduleBlock = this.moduleBlockForTool(key, disabledModules);
    const started = Date.now();
    const correlationId = traceCorrelationId ?? randomUUID();
    let normalizedInput: Record<string, string>;
    try {
      normalizedInput = normalizeToolInput(tool, input);
    } catch (error) {
      const reason =
        error instanceof Error ? error.message : 'Tool input was rejected.';
      await this.db.commerceAgentToolRun.create({
        data: {
          businessId,
          toolKey: tool.key,
          riskClass: tool.riskClass,
          actorType,
          actorUserId,
          autonomyLevel: level,
          input: { validation: 'rejected' },
          outcome: 'failed',
          resultSummary: reason,
          correlationId,
          durationMs: Date.now() - started,
        },
      });
      throw error;
    }
    if (tool.approvalSupported) {
      this.validateApprovalProposal(tool.key, normalizedInput);
    }
    const isWrite = tool.riskClass !== 'READ_ONLY';
    const normalizedIdempotencyKey = idempotencyKey?.trim();
    if (
      isWrite &&
      (!normalizedIdempotencyKey ||
        normalizedIdempotencyKey.length < 8 ||
        normalizedIdempotencyKey.length > 200)
    ) {
      throw new AppException(
        COMMERCE_AGENT_ERROR_CODES.IDEMPOTENCY_KEY_REQUIRED,
        'A valid Idempotency-Key (8 to 200 characters) is required for Commerce agent write tools.',
        HttpStatus.BAD_REQUEST,
      );
    }

    const idempotencyKeyHash = isWrite
      ? createHash('sha256').update(normalizedIdempotencyKey!).digest('hex')
      : null;
    const idempotencyRequestHash = isWrite
      ? this.requestHash(actorUserId, tool.key, normalizedInput, actorType)
      : null;

    const recordData = (
      outcome:
        | 'running'
        | 'pending_approval'
        | 'rejected'
        | 'succeeded'
        | 'refused'
        | 'failed',
      extra: {
        refusalReason?: string;
        resultSummary?: string;
        resourceType?: ToolResultResourceType;
        resourceId?: string;
      },
    ): Prisma.CommerceAgentToolRunUncheckedCreateInput => ({
      businessId,
      toolKey: tool.key,
      riskClass: tool.riskClass,
      actorType,
      actorUserId,
      autonomyLevel: level,
      input: normalizedInput,
      outcome,
      refusalReason: extra.refusalReason ?? null,
      resultSummary: extra.resultSummary ?? null,
      correlationId,
      idempotencyKeyHash,
      idempotencyRequestHash,
      resultResourceType: extra.resourceType ?? null,
      resultResourceId: extra.resourceId ?? null,
      durationMs: Date.now() - started,
    });

    let reservedRun: { id: string; outcome: string } | null = null;
    if (isWrite) {
      try {
        reservedRun = await this.db.commerceAgentToolRun.create({
          data: recordData('running', {}),
          select: { id: true, outcome: true },
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        const existing = await this.db.commerceAgentToolRun.findUnique({
          where: {
            businessId_idempotencyKeyHash: {
              businessId,
              idempotencyKeyHash: idempotencyKeyHash!,
            },
          },
        });
        if (!existing) throw error;
        if (
          existing.idempotencyRequestHash !== idempotencyRequestHash ||
          existing.actorUserId !== actorUserId ||
          existing.toolKey !== tool.key
        ) {
          throw new AppException(
            COMMERCE_AGENT_ERROR_CODES.IDEMPOTENCY_CONFLICT,
            'This Idempotency-Key was already used for a different actor, tool or input.',
            HttpStatus.CONFLICT,
          );
        }
        if (existing.outcome === 'succeeded') {
          if (moduleBlock) {
            return {
              run: this.runView(existing),
              result: null,
              replayed: true,
            };
          }
          const result = await this.resolveResult(
            businessId,
            existing.resultResourceType,
            existing.resultResourceId,
          );
          const safeResult = this.resultForResponse(
            tool,
            result,
            existing.resultResourceType,
            existing.resultResourceId,
          );
          return {
            run: this.runView(existing),
            result: safeResult,
            replayed: true,
            resourceMissing: result === null,
          };
        }
        if (existing.outcome === 'refused') {
          return { run: this.runView(existing), result: null, replayed: true };
        }
        if (existing.outcome === 'pending_approval') {
          if (moduleBlock) {
            const updated = await this.db.$transaction(async (tx) => {
              const changed = await tx.commerceAgentToolRun.updateMany({
                where: {
                  id: existing.id,
                  businessId,
                  outcome: 'pending_approval',
                },
                data: { outcome: 'refused', refusalReason: moduleBlock },
              });
              if (changed.count) {
                await tx.auditLog.create({
                  data: {
                    businessId,
                    actorUserId,
                    action: 'commerce.agent_tool_module_refused',
                    entity: 'CommerceAgentToolRun',
                    entityId: existing.id,
                    before: { outcome: 'pending_approval' },
                    after: {
                      outcome: 'refused',
                      toolKey: tool.key,
                      reason: moduleBlock,
                    },
                  },
                });
              }
              return tx.commerceAgentToolRun.findFirstOrThrow({
                where: { id: existing.id, businessId },
              });
            });
            return { run: this.runView(updated), result: null, replayed: true };
          }
          return {
            run: this.runView(existing, actorUserId),
            result: null,
            replayed: true,
            pendingApproval: true,
          };
        }
        if (existing.outcome === 'rejected') {
          return { run: this.runView(existing), result: null, replayed: true };
        }
        if (existing.outcome === 'running') {
          const ageMs = Date.now() - existing.createdAt.getTime();
          if (ageMs > 15 * 60 * 1000) {
            throw new AppException(
              COMMERCE_AGENT_ERROR_CODES.OUTCOME_UNKNOWN,
              'This tool call is still marked in progress after 15 minutes. Check the canonical Commerce screen before retrying with a new key; Noxtill will not risk creating a duplicate.',
              HttpStatus.CONFLICT,
            );
          }
          return {
            run: this.runView(existing),
            result: null,
            replayed: true,
            pending: true,
          };
        }
        throw new AppException(
          COMMERCE_AGENT_ERROR_CODES.PREVIOUS_RUN_FAILED,
          'The original tool call failed or ended without a confirmed result. Check the canonical Commerce screen before retrying with a new key.',
          HttpStatus.CONFLICT,
        );
      }
    }

    if (moduleBlock) {
      const run = await this.db.$transaction(async (tx) => {
        const saved = reservedRun
          ? await tx.commerceAgentToolRun.update({
              where: { id: reservedRun.id },
              data: {
                outcome: 'refused',
                refusalReason: moduleBlock,
                durationMs: Date.now() - started,
              },
            })
          : await tx.commerceAgentToolRun.create({
              data: recordData('refused', { refusalReason: moduleBlock }),
            });
        await tx.auditLog.create({
          data: {
            businessId,
            actorUserId,
            action: 'commerce.agent_tool_module_refused',
            entity: 'CommerceAgentToolRun',
            entityId: saved.id,
            before: { outcome: reservedRun ? 'running' : null },
            after: {
              outcome: 'refused',
              toolKey: tool.key,
              reason: moduleBlock,
            },
          },
        });
        return saved;
      });
      return { run: this.runView(run), result: null };
    }

    if (tool.approvalSupported) {
      const unavailableReason =
        level < MIN_LEVEL[tool.riskClass]
          ? `Autonomy level ${level} does not allow this financial tool; level ${MIN_LEVEL[tool.riskClass]} or higher is needed.`
          : paused
            ? 'Commerce actions are paused for this business.'
            : (writeToolAllowlistBlock(
                tool,
                allowedWriteToolKeys,
                invalidWriteToolEntries,
              ) ??
              (!tool.executable
                ? `This tool is not executable by agents — do this on ${tool.screen}.`
                : null));
      if (unavailableReason) {
        const run = reservedRun
          ? await this.db.commerceAgentToolRun.update({
              where: { id: reservedRun.id },
              data: {
                outcome: 'refused',
                refusalReason: unavailableReason,
                durationMs: Date.now() - started,
              },
            })
          : await this.db.commerceAgentToolRun.create({
              data: recordData('refused', { refusalReason: unavailableReason }),
            });
        return { run: this.runView(run), result: null };
      }
      if (!reservedRun) {
        throw new AppException(
          COMMERCE_AGENT_ERROR_CODES.APPROVAL_INVALID,
          'The approval request could not be reserved safely.',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      const run = await this.db.$transaction(async (tx) => {
        const pending = await tx.commerceAgentToolRun.update({
          where: { id: reservedRun.id },
          data: {
            outcome: 'pending_approval',
            resultSummary: `Waiting for a different authorized user to review ${tool.label}. No Commerce action has occurred.`,
            durationMs: Date.now() - started,
          },
        });
        await tx.auditLog.create({
          data: {
            businessId,
            actorUserId,
            action: 'commerce.agent_tool_approval_requested',
            entity: 'CommerceAgentToolRun',
            entityId: pending.id,
            before: { outcome: 'running' },
            after: {
              outcome: 'pending_approval',
              toolKey: tool.key,
              requestHash: idempotencyRequestHash,
              rfqId: normalizedInput.rfqId ?? null,
              claimId: normalizedInput.claimId ?? null,
              quoteId: normalizedInput.quoteId ?? null,
              expectedVersion: normalizedInput.expectedVersion ?? null,
            },
          },
        });
        return pending;
      });
      return {
        run: this.runView(run, actorUserId),
        result: null,
        pendingApproval: true,
      };
    }

    const blocked = CommerceAgentToolsService.gate(
      tool,
      level,
      paused,
      allowedWriteToolKeys,
      invalidWriteToolEntries,
    );
    if (blocked) {
      const run = reservedRun
        ? await this.db.commerceAgentToolRun.update({
            where: { id: reservedRun.id },
            data: {
              outcome: 'refused',
              refusalReason: blocked,
              durationMs: Date.now() - started,
            },
          })
        : await this.db.commerceAgentToolRun.create({
            data: recordData('refused', { refusalReason: blocked }),
          });
      return { run: this.runView(run), result: null };
    }
    try {
      const { result, summary, resourceType, resourceId } = await this.execute(
        businessId,
        actorUserId,
        key,
        normalizedInput,
      );
      const safeResult = this.resultForResponse(
        tool,
        result,
        resourceType,
        resourceId,
      );
      const run = reservedRun
        ? await this.db.commerceAgentToolRun.update({
            where: { id: reservedRun.id },
            data: {
              outcome: 'succeeded',
              resultSummary: summary,
              resultResourceType: resourceType ?? null,
              resultResourceId: resourceId ?? null,
              durationMs: Date.now() - started,
            },
          })
        : await this.db.commerceAgentToolRun.create({
            data: recordData('succeeded', { resultSummary: summary }),
          });
      return { run: this.runView(run), result: safeResult };
    } catch (error) {
      const message =
        error instanceof AppException || error instanceof Error
          ? error.message
          : 'Tool failed.';
      if (reservedRun) {
        await this.db.commerceAgentToolRun.update({
          where: { id: reservedRun.id },
          data: {
            outcome: 'failed',
            resultSummary: message,
            durationMs: Date.now() - started,
          },
        });
      } else {
        await this.db.commerceAgentToolRun.create({
          data: recordData('failed', { resultSummary: message }),
        });
      }
      throw error;
    }
  }

  private async resolveResult(
    businessId: string,
    resourceType: string | null,
    resourceId: string | null,
  ): Promise<unknown> {
    if (!resourceType || !resourceId) return null;
    switch (resourceType) {
      case 'commerce_listing_draft':
        return this.listingBuilder.getOne(businessId, resourceId);
      case 'commerce_rfq':
        return this.rfqs.getOne(businessId, resourceId);
      case 'commerce_experiment':
        return this.db.commerceExperiment.findFirst({
          where: { id: resourceId, businessId },
        });
      case 'commerce_supplier_claim':
        return this.claims.getOne(businessId, resourceId);
      default:
        return null;
    }
  }

  private resultForResponse(
    tool: AgentToolDef,
    result: unknown,
    resourceType: string | null | undefined,
    resourceId: string | null | undefined,
  ): unknown {
    try {
      return normalizeSpecialistAgentToolOutput(tool, result, {
        errorCode: 'COMMERCE_AGENT_TOOL_OUTPUT_INVALID',
      });
    } catch (error) {
      // A canonical write may already have completed. Omit only its response body rather than
      // reporting a confirmed operation as failed; the recorded resource link remains reviewable.
      if (tool.riskClass === 'READ_ONLY') throw error;
      return {
        dataOmitted: true,
        reason:
          'The canonical operation completed, but its result could not be safely serialized. Open the linked Commerce record to review it.',
        resourceType: resourceType ?? null,
        resourceId: resourceId ?? null,
      };
    }
  }
}
