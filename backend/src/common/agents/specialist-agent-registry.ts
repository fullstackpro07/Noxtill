import { HttpStatus } from '@nestjs/common';
import { AppException } from '../filters/app.exception';

/**
 * Canonical identity and trigger contract for the five persisted specialist agents.
 * Module ids and policy names mirror the specialist-agent specification and the
 * existing owner controls; keep consumers on this registry instead of copying maps.
 */
export const SPECIALIST_AGENT_REGISTRY = [
  {
    agentKey: 'inventory_intelligence',
    policyAgentKey: 'inventory',
    moduleId: '13',
    moduleKey: 'inventory',
    name: 'Inventory Intelligence',
    label: 'Inventory Intelligence Agent',
    enabledPolicy: 'agents.inventoryEnabled',
    schedulePolicy: 'agents.inventoryDailyReviewEnabled',
    featureToggleKey: 'inventoryAgent',
    allowedTriggers: ['manual', 'event', 'scheduled'],
  },
  {
    agentKey: 'financial_intelligence',
    policyAgentKey: 'finance',
    moduleId: '30',
    moduleKey: 'profit',
    name: 'Financial Intelligence',
    label: 'Financial Intelligence Agent',
    enabledPolicy: 'agents.financeEnabled',
    schedulePolicy: 'agents.financeDailyReviewEnabled',
    featureToggleKey: 'financeAgent',
    allowedTriggers: ['manual', 'event', 'scheduled'],
  },
  {
    agentKey: 'customer_intelligence',
    policyAgentKey: 'customer',
    moduleId: '7',
    moduleKey: 'customers',
    name: 'Customer Intelligence',
    label: 'Customer Intelligence Agent',
    enabledPolicy: 'agents.customerEnabled',
    schedulePolicy: 'agents.customerDailyReviewEnabled',
    featureToggleKey: 'customerAgent',
    allowedTriggers: ['manual', 'event', 'scheduled'],
  },
  {
    agentKey: 'seo_autopilot',
    policyAgentKey: 'seo',
    moduleId: '28',
    moduleKey: 'marketing',
    name: 'SEO Autopilot',
    label: 'SEO Autopilot Agent',
    enabledPolicy: 'agents.seoEnabled',
    schedulePolicy: 'agents.seoDailyReviewEnabled',
    featureToggleKey: 'seoAgent',
    allowedTriggers: ['manual', 'event', 'scheduled'],
  },
  {
    agentKey: 'autonomous_commerce',
    policyAgentKey: 'commerce',
    moduleId: '29',
    moduleKey: 'autonomous-commerce',
    name: 'Autonomous Commerce',
    label: 'Autonomous Commerce Agent',
    enabledPolicy: 'agents.commerceEnabled',
    schedulePolicy: 'agents.commerceDailyReviewEnabled',
    featureToggleKey: 'commerceAgent',
    allowedTriggers: ['manual', 'event', 'scheduled'],
  },
] as const;

export const SPECIALIST_AGENT_ORCHESTRATOR = {
  agentKey: 'specialist_agent_orchestrator',
  moduleId: 'shared',
  allowedTriggers: ['manual'],
} as const;

export type SpecialistAgentDefinition =
  (typeof SPECIALIST_AGENT_REGISTRY)[number];
export type SpecialistAgentPersistedKey = SpecialistAgentDefinition['agentKey'];
export type SpecialistAgentPolicyKey =
  SpecialistAgentDefinition['policyAgentKey'];
type RegisteredSpecialistRunKey =
  SpecialistAgentPersistedKey | typeof SPECIALIST_AGENT_ORCHESTRATOR.agentKey;

export function specialistAgentByPolicyKey(
  policyAgentKey: SpecialistAgentPolicyKey,
): SpecialistAgentDefinition {
  const definition = SPECIALIST_AGENT_REGISTRY.find(
    (agent) => agent.policyAgentKey === policyAgentKey,
  );
  if (!definition) {
    // The argument is a compile-time union, so this indicates a code defect.
    throw new AppException(
      'SPECIALIST_AGENT_REGISTRY_INVALID',
      'The specialist agent registry is missing a required policy mapping.',
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
  return definition;
}

/** Reject unregistered persisted identities and trigger types before writing a run. */
export function assertSpecialistAgentRunContract(
  agentKey: unknown,
  moduleId: unknown,
  triggerType: unknown,
): asserts agentKey is RegisteredSpecialistRunKey {
  const definition =
    SPECIALIST_AGENT_REGISTRY.find((agent) => agent.agentKey === agentKey) ??
    (agentKey === SPECIALIST_AGENT_ORCHESTRATOR.agentKey
      ? SPECIALIST_AGENT_ORCHESTRATOR
      : null);
  if (!definition) {
    throw new AppException(
      'SPECIALIST_AGENT_KEY_INVALID',
      'This specialist agent is not registered for execution.',
      HttpStatus.BAD_REQUEST,
    );
  }
  if (moduleId !== definition.moduleId) {
    const agentLabel = typeof agentKey === 'string' ? agentKey : 'unknown';
    throw new AppException(
      'SPECIALIST_AGENT_MODULE_MISMATCH',
      `Module ID does not match the registered module for ${agentLabel}.`,
      HttpStatus.BAD_REQUEST,
    );
  }
  const resolvedTrigger = triggerType ?? 'manual';
  if (
    typeof resolvedTrigger !== 'string' ||
    !(definition.allowedTriggers as readonly string[]).includes(resolvedTrigger)
  ) {
    const triggerLabel =
      typeof resolvedTrigger === 'string' ? resolvedTrigger : 'invalid';
    const agentLabel = typeof agentKey === 'string' ? agentKey : 'unknown';
    throw new AppException(
      'SPECIALIST_AGENT_TRIGGER_NOT_ALLOWED',
      `Trigger "${triggerLabel}" is not allowed for ${agentLabel}.`,
      HttpStatus.BAD_REQUEST,
    );
  }
}
