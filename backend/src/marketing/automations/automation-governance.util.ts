import { HttpStatus } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { AppException } from '../../common/filters/app.exception';
import { resolvePolicies } from '../../common/policies/policies.service';
import type { WorkflowGraph } from './workflow-graph.util';

export const AUTOMATION_GOVERNANCE_CODES = {
  ACTIVE_LIMIT: 'AUTOMATION_ACTIVE_LIMIT_REACHED',
  APPROVAL_REQUIRED: 'AUTOMATION_APPROVAL_REQUIRED_BEFORE_MESSAGE',
} as const;

interface Db {
  business: {
    findUnique(args: {
      where: { id: string };
      select: { policies: true };
    }): Promise<{ policies: Prisma.JsonValue } | null>;
  };
  workflow: {
    count(args: { where: Prisma.WorkflowWhereInput }): Promise<number>;
  };
}

interface ActionLike {
  type: string;
}

/**
 * True when some path from the trigger reaches a customer-message step without first passing a
 * "request approval" step. Graphs are acyclic (validated on save), so a plain DFS terminates.
 */
export function messageWithoutApproval(
  actions: ActionLike[],
  graph: WorkflowGraph | null,
): boolean {
  if (!graph) {
    let approved = false;
    for (const action of actions) {
      if (action.type === 'request_approval') approved = true;
      if (action.type === 'send_customer_message' && !approved) return true;
    }
    return false;
  }
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const trigger = graph.nodes.find((node) => node.type === 'trigger');
  if (!trigger) return false;
  const walk = (id: string, approved: boolean, depth: number): boolean => {
    if (depth > graph.nodes.length) return false;
    const node = byId.get(id);
    if (!node) return false;
    let seen = approved;
    if (node.type === 'action') {
      const type = (node.action as ActionLike).type;
      if (type === 'request_approval') seen = true;
      if (type === 'send_customer_message' && !seen) return true;
    }
    return graph.edges
      .filter((edge) => edge.source === id)
      .some((edge) => walk(edge.target, seen, depth + 1));
  };
  return walk(trigger.id, false, 0);
}

/**
 * Governance rules from Settings → Automations (`Business.policies`), enforced wherever a workflow is
 * switched on or an active workflow's steps change: the workflow editor, version restore and the
 * Settings on/off toggle.
 */
export async function assertAutomationGovernance(
  db: Db,
  input: {
    businessId: string;
    workflowId: string;
    /** True when this change turns the workflow on (off → on). */
    activating: boolean;
    /** True when the workflow will be on after the change. */
    activeAfter: boolean;
    actions: ActionLike[];
    graph: WorkflowGraph | null;
  },
): Promise<void> {
  if (!input.activeAfter) return;
  const business = await db.business.findUnique({
    where: { id: input.businessId },
    select: { policies: true },
  });
  const policies = resolvePolicies(business);
  const limit = policies.num('automations.maxActiveWorkflows');
  if (input.activating && limit !== null) {
    const active = await db.workflow.count({
      where: {
        businessId: input.businessId,
        active: true,
        archivedAt: null,
        id: { not: input.workflowId },
      },
    });
    if (active >= limit) {
      throw new AppException(
        AUTOMATION_GOVERNANCE_CODES.ACTIVE_LIMIT,
        `Your automation limit allows ${limit} active workflow(s). Pause another workflow or raise the limit in Settings → Automations.`,
        HttpStatus.CONFLICT,
      );
    }
  }
  if (
    policies.bool('automations.requireApprovalBeforeCustomerMessages') &&
    messageWithoutApproval(input.actions, input.graph)
  ) {
    throw new AppException(
      AUTOMATION_GOVERNANCE_CODES.APPROVAL_REQUIRED,
      'Your settings require a "Request approval" step before any customer message. Add one before the message step, or change the rule in Settings → Automations.',
      HttpStatus.CONFLICT,
    );
  }
}
