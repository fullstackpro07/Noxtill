import type { PolicyKey } from '../common/policies/policies.constants';

/** Shared policy and AI-kind mapping for enforcement and owner-facing usage reporting. */
export const SPECIALIST_AGENT_BUDGETS: Record<
  string,
  { policy: PolicyKey; spendPolicy: PolicyKey; label: string; kind: string }
> = {
  inventory_intelligence: {
    policy: 'agents.inventoryMaxRequestsPerMonth',
    spendPolicy: 'agents.inventoryMaxSpendUsdPerMonth',
    label: 'Inventory Intelligence Agent',
    kind: 'inventory_agent',
  },
  financial_intelligence: {
    policy: 'agents.financeMaxRequestsPerMonth',
    spendPolicy: 'agents.financeMaxSpendUsdPerMonth',
    label: 'Financial Intelligence Agent',
    kind: 'finance_agent',
  },
  customer_intelligence: {
    policy: 'agents.customerMaxRequestsPerMonth',
    spendPolicy: 'agents.customerMaxSpendUsdPerMonth',
    label: 'Customer Intelligence Agent',
    kind: 'customer_agent',
  },
  seo_autopilot: {
    policy: 'agents.seoMaxRequestsPerMonth',
    spendPolicy: 'agents.seoMaxSpendUsdPerMonth',
    label: 'SEO Autopilot Agent',
    kind: 'seo_agent',
  },
  autonomous_commerce: {
    policy: 'agents.commerceMaxRequestsPerMonth',
    spendPolicy: 'agents.commerceMaxSpendUsdPerMonth',
    label: 'Autonomous Commerce Agent',
    kind: 'commerce_agent',
  },
};
