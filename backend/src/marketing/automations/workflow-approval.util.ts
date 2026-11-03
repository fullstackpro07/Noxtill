import { createHash } from 'node:crypto';
import { WorkflowAction } from './workflow-action.util';
import { resolveWorkflowMessageTemplate } from './workflow-message-template.util';

export interface WorkflowApprovalBinding {
  businessId: string;
  workflowId: string;
  workflowRunId: string;
  workflowVersion: number;
  triggerKey: string;
  actionIndex: number;
  approvalAction: Extract<WorkflowAction, { type: 'request_approval' }>;
  downstreamActions: WorkflowAction[];
  context: Record<string, unknown>;
}

export interface WorkflowApprovalSnapshot {
  workflowId: string;
  workflowVersion: number;
  triggerKey: string;
  title: string;
  description: string;
  steps: Array<{ type: string; summary: string }>;
}

function resolveText(template: string, context: Record<string, unknown>) {
  const resolved = resolveWorkflowMessageTemplate(template, context);
  return resolved.body ?? `${template} (trigger values unavailable)`;
}

export function buildWorkflowApprovalSnapshot(
  binding: WorkflowApprovalBinding,
): WorkflowApprovalSnapshot {
  const steps = binding.downstreamActions.map((action) => {
    if (action.type === 'send_customer_message') {
      return {
        type: action.type,
        summary: `Send customer message: ${resolveText(action.messageBody, binding.context)}`,
      };
    }
    if (action.type === 'notify_owner') {
      return {
        type: action.type,
        summary: `Notify owner: ${resolveText(action.messageBody, binding.context)}`,
      };
    }
    if (action.type === 'add_customer_tag') {
      return {
        type: action.type,
        summary: `Add customer tag “${action.tagName}”`,
      };
    }
    if (action.type === 'set_customer_custom_field') {
      return {
        type: action.type,
        summary: `Set customer field “${action.fieldName}” to ${JSON.stringify(action.value)}`,
      };
    }
    if (action.type === 'wait') {
      return {
        type: action.type,
        summary: `Wait ${action.durationMinutes} minutes`,
      };
    }
    if (action.type === 'map_data') {
      return {
        type: action.type,
        summary: `Map ${action.mappings.length} field(s) into workflow run data`,
      };
    }
    if (action.type === 'get_variable') {
      return {
        type: action.type,
        summary: `Read ${action.scope} variable “${action.name}”`,
      };
    }
    if (action.type === 'generate_ai_draft') {
      return {
        type: action.type,
        summary: `Generate an AI draft: ${resolveText(action.prompt, binding.context)}`,
      };
    }
    if (action.type === 'ai_agent') {
      return {
        type: action.type,
        summary: `AI agent (read-only, up to ${action.maxSteps} steps): ${resolveText(action.goal, binding.context)}`,
      };
    }
    if (action.type === 'run_workflow') {
      return {
        type: action.type,
        summary: `Run another workflow (${action.workflowId})`,
      };
    }
    if (action.type === 'request_approval') {
      return {
        type: action.type,
        summary: `Request another approval: ${resolveText(action.title, binding.context)}`,
      };
    }
    return {
      type: 'unknown',
      summary: 'Unsupported action (will not be executed)',
    };
  });

  return {
    workflowId: binding.workflowId,
    workflowVersion: binding.workflowVersion,
    triggerKey: binding.triggerKey,
    title: resolveText(binding.approvalAction.title, binding.context).slice(
      0,
      191,
    ),
    description: resolveText(
      binding.approvalAction.description,
      binding.context,
    ).slice(0, 2000),
    steps,
  };
}

export function hashWorkflowApprovalBinding(
  binding: WorkflowApprovalBinding,
): string {
  return createHash('sha256').update(JSON.stringify(binding)).digest('hex');
}
