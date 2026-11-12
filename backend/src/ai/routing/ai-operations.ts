import { HttpStatus } from '@nestjs/common';
import { AppException } from '../../common/filters/app.exception';
import {
  PROVIDER_LABEL,
  routeConfig,
  type AiRouteKey,
  type AiTier,
} from './ai-routing.config';

/**
 * Spec §5.2 — the official operation registry (43 operations). This table is the contract: a
 * model call whose `kind` does not resolve to one of these (or to a §4 specialised service)
 * throws `AI_OPERATION_NOT_REGISTERED` before any provider is contacted.
 */
export const OPERATIONS = {
  // Fast Sale (POS)
  'pos.voice_entry': 'easy',
  // Products & Services
  'products.description': 'easy',
  'products.category': 'easy',
  // Bookings
  'bookings.noshow_predict': 'easy',
  'bookings.smart_schedule': 'medium',
  // Customers (CRM)
  'crm.segment_suggest': 'medium',
  'crm.memory_summary': 'medium',
  // Unified Inbox
  'inbox.classify': 'easy',
  'inbox.suggest_reply': 'easy',
  'inbox.translate': 'easy',
  // Customer Service & Helpdesk
  'helpdesk.classify': 'easy',
  'helpdesk.suggest': 'easy',
  'helpdesk.kb_answer': 'medium',
  // Reviews & Reputation
  'reviews.sentiment': 'easy',
  'reviews.response_draft': 'easy',
  // AI Phone Receptionist
  'phone.call_summary': 'medium',
  // Finance & Accounting
  'finance.categorise': 'easy',
  'finance.anomaly': 'hard',
  // Profit & Analytics
  'profit.insight': 'hard',
  // Inventory
  'inventory.reorder': 'easy',
  'inventory.forecast': 'hard',
  // Projects & Tasks
  'projects.task_breakdown': 'easy',
  // Documents & eSign
  'docs.draft': 'medium',
  'docs.contract_summary': 'medium',
  // Marketing & Campaigns
  'marketing.campaign_copy': 'easy',
  'marketing.audience': 'medium',
  'marketing.agent_run': 'hard',
  // Social Media
  'social.post': 'easy',
  'social.caption': 'easy',
  // Advertising
  'ads.copy_variants': 'easy',
  // Business Listings
  'listings.description': 'easy',
  // SEO Autopilot
  'seo.content_optimise': 'medium',
  'seo.agent_run': 'hard',
  // Competitive Insights
  'competitive.recommend': 'hard',
  // Dashboard
  'dashboard.insights': 'hard',
  'dashboard.nightly_close': 'medium',
  // Business Intelligence
  'bi.business_brain': 'hard',
  'bi.opportunity_radar': 'hard',
  'bi.simulator': 'hard',
  'bi.diagnosis': 'hard',
  'bi.digital_twin': 'hard',
  // AI Assistant
  'assistant.business_chat': 'hard',
  'assistant.help': 'easy',
} as const satisfies Record<string, AiTier>;

export type AiOperationCode = keyof typeof OPERATIONS;

/** Spec §4 specialised services — not a tier, not a language-model operation. */
export const SPECIALISED = { 'service.vision': 'vision' } as const;
export type AiSpecialisedCode = keyof typeof SPECIALISED;

/**
 * Every AI `kind` a call site passes to `AiInfraService` → the official operation it runs as.
 * Call sites the official list does not name individually are folded into the closest
 * operation by nature and tier; `ai_usage.kind` still records the original call site.
 */
export const KIND_TO_AI_OPERATION: Record<
  string,
  AiOperationCode | AiSpecialisedCode
> = {
  // Direct matches
  pos_voice_entry: 'pos.voice_entry',
  commerce_listing: 'products.description',
  segment_persona: 'crm.segment_suggest',
  inbox_draft: 'inbox.suggest_reply',
  inbox_translate: 'inbox.translate',
  review_sentiment: 'reviews.sentiment',
  review_reply: 'reviews.response_draft',
  call_summary: 'phone.call_summary',
  finance_categorise: 'finance.categorise',
  profit_insight: 'profit.insight',
  projects_plan: 'projects.task_breakdown',
  campaign_draft: 'marketing.campaign_copy',
  campaign_copy: 'marketing.campaign_copy',
  marketing_reallocation: 'marketing.agent_run',
  social_post: 'social.post',
  social_caption: 'social.caption',
  ad_copy: 'ads.copy_variants',
  seo_guest_topics: 'seo.content_optimise',
  seo_guest_pitch: 'seo.content_optimise',
  seo_guest_article: 'seo.content_optimise',
  seo_content: 'seo.content_optimise',
  seo_link_building_outreach: 'seo.agent_run',
  competitive_recommendation: 'competitive.recommend',
  ai_insights: 'dashboard.insights',
  bi_insights: 'bi.diagnosis',
  what_if: 'bi.simulator',
  assistant_chat: 'assistant.business_chat',
  help_ask: 'assistant.help',
  // Folded into the closest official operation
  pricing_rationale: 'products.description',
  onboarding_offerings: 'products.description',
  onboarding_description: 'listings.description',
  website_builder: 'listings.description',
  business_type_map: 'products.category',
  marketing_content_ideas: 'marketing.campaign_copy',
  offer_copy: 'marketing.campaign_copy',
  keyword_suggestions: 'seo.content_optimise',
  customer_import: 'crm.segment_suggest',
  inbox_summary: 'crm.memory_summary',
  payments_draft: 'inbox.suggest_reply',
  voice_meeting_summary: 'phone.call_summary',
  voice_quality_assist: 'phone.call_summary',
  voice_safety_review: 'inbox.classify',
  voice_entry: 'helpdesk.kb_answer',
  digitizer_assistant: 'helpdesk.kb_answer',
  branch_advice: 'profit.insight',
  projects_insight: 'bi.diagnosis',
  workflow_agent: 'marketing.agent_run',
  report_builder: 'assistant.help',
  // Spec §4 vision service
  digitizer_scan: 'service.vision',
  assistant_attachment: 'service.vision',
};

export const AI_OPERATION_NOT_REGISTERED = 'AI_OPERATION_NOT_REGISTERED';

export interface ResolvedRoute {
  kind: string;
  operation: AiOperationCode | AiSpecialisedCode;
  route: AiRouteKey;
}

export function resolveRoute(kind: string): ResolvedRoute {
  const operation = KIND_TO_AI_OPERATION[kind];
  if (!operation) {
    throw new AppException(
      AI_OPERATION_NOT_REGISTERED,
      `AI operation "${kind}" is not registered in the model routing table.`,
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
  const route: AiRouteKey =
    operation in SPECIALISED
      ? SPECIALISED[operation as AiSpecialisedCode]
      : OPERATIONS[operation as AiOperationCode];
  return { kind, operation, route };
}

/** Human-readable "primary, fallback" model description of a kind's route, for settings screens. */
export function describeRoute(kind: string): string {
  const cfg = routeConfig(resolveRoute(kind).route);
  const one = (t: { provider: keyof typeof PROVIDER_LABEL; model: string }) =>
    `${PROVIDER_LABEL[t.provider]} ${t.model}`;
  return `${one(cfg.primary)} (fallback: ${one(cfg.fallback)})`;
}
