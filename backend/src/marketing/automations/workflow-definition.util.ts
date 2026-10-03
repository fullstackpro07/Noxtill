import { WorkflowTriggerKey } from '@prisma/client';
import { WORKFLOW_TRIGGER_CATALOG } from './workflow-trigger-catalog';
import { workflowMessageTemplateFields } from './workflow-message-template.util';
import {
  MAX_WORKFLOW_AI_DRAFT_PROMPT_LENGTH,
  MAX_WORKFLOW_WAIT_MINUTES,
} from './workflows.constants';
import { validateScheduleConfiguration } from './workflow-schedule.util';
import { validateWorkflowDataMappings } from './workflow-data-mapper.util';

const CONDITION_OPERATORS = new Set([
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
]);

const MESSAGE_ACTION_TYPES = new Set(['send_customer_message', 'notify_owner']);
const RESERVED_VARIABLE_NAMES = new Set([
  '__proto__',
  'prototype',
  'constructor',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Return a human-readable validation error for the current workflow definition, if any. */
export function validateWorkflowDefinition(
  triggerKey: WorkflowTriggerKey,
  name: unknown,
  conditions: unknown,
  actions: unknown,
  scheduleEveryMinutes?: unknown,
  scheduleCronExpression?: unknown,
  scheduleTimezone: unknown = 'UTC',
  allowForwardMappedDataReferences = false,
): string | null {
  if (typeof name !== 'string' || name.trim().length === 0) {
    return 'Workflow name is required.';
  }

  if (triggerKey === WorkflowTriggerKey.scheduled) {
    const scheduleError = validateScheduleConfiguration(
      scheduleEveryMinutes,
      scheduleCronExpression,
      scheduleTimezone,
    );
    if (scheduleError) return scheduleError;
  } else if (scheduleEveryMinutes != null || scheduleCronExpression != null) {
    return 'Only scheduled workflows can have a schedule.';
  }

  if (!Array.isArray(conditions)) {
    return 'Workflow conditions must be a list.';
  }

  const catalogFields = new Set(
    WORKFLOW_TRIGGER_CATALOG.find((trigger) => trigger.key === triggerKey)
      ?.fields ?? [],
  );
  // Inbound webhooks also expose each top-level body value as `body_<key>` (see inboundBodyFields).
  const supportedFields = {
    has: (field: string) =>
      catalogFields.has(field) ||
      (triggerKey === WorkflowTriggerKey.inbound_webhook &&
        /^body_[A-Za-z0-9_]{1,60}$/.test(field)),
  };

  for (const [index, condition] of conditions.entries()) {
    if (!isRecord(condition)) {
      return `Condition ${index + 1} must be an object.`;
    }
    if (
      typeof condition.field !== 'string' ||
      condition.field.trim().length === 0
    ) {
      return `Condition ${index + 1} needs a field.`;
    }
    if (!supportedFields.has(condition.field)) {
      return `Condition ${index + 1} uses a field not provided by this trigger.`;
    }
    if (
      typeof condition.operator !== 'string' ||
      !CONDITION_OPERATORS.has(condition.operator)
    ) {
      return `Condition ${index + 1} has an unsupported operator.`;
    }
    if (
      typeof condition.value !== 'string' &&
      (typeof condition.value !== 'number' || !Number.isFinite(condition.value))
    ) {
      return `Condition ${index + 1} needs a text or numeric value.`;
    }
  }

  if (!Array.isArray(actions)) {
    return 'Workflow actions must be a list.';
  }

  const supportsCustomerActions = supportedFields.has('customerId');
  const mappedTemplateFields = new Set<string>();
  const workflowVariableFields = new Set<string>();
  if (allowForwardMappedDataReferences) {
    for (const action of actions) {
      if (!isRecord(action)) continue;
      if (action.type === 'map_data' && Array.isArray(action.mappings)) {
        for (const mapping of action.mappings) {
          if (isRecord(mapping) && typeof mapping.targetPath === 'string') {
            mappedTemplateFields.add(`mappedData.${mapping.targetPath}`);
          }
        }
      } else if (
        action.type === 'get_variable' &&
        typeof action.name === 'string' &&
        /^[A-Za-z_][A-Za-z0-9_]{0,99}$/.test(action.name) &&
        !RESERVED_VARIABLE_NAMES.has(action.name)
      ) {
        workflowVariableFields.add(`variables.${action.name}`);
      }
    }
  }
  const isSupportedTemplateField = (field: string) =>
    supportedFields.has(field) ||
    workflowVariableFields.has(field) ||
    [...workflowVariableFields].some((variableField) =>
      field.startsWith(`${variableField}.`),
    ) ||
    [...mappedTemplateFields].some(
      (mappedField) =>
        field === mappedField || field.startsWith(`${mappedField}.`),
    );
  const ownerOnlyTrigger =
    triggerKey === WorkflowTriggerKey.commerce_validation ||
    triggerKey === WorkflowTriggerKey.seo_issue_detected ||
    triggerKey === WorkflowTriggerKey.commerce_rfq_created ||
    triggerKey === WorkflowTriggerKey.commerce_rfq_response_received ||
    triggerKey === WorkflowTriggerKey.commerce_rfq_awarded ||
    triggerKey === WorkflowTriggerKey.commerce_supplier_claim_created ||
    triggerKey === WorkflowTriggerKey.commerce_supplier_claim_settled ||
    triggerKey === WorkflowTriggerKey.scheduled;

  for (const [index, action] of actions.entries()) {
    if (!isRecord(action)) {
      return `Action ${index + 1} must be an object.`;
    }
    if (
      typeof action.type !== 'string' ||
      (action.type === 'wait'
        ? typeof action.durationMinutes !== 'number' ||
          !Number.isInteger(action.durationMinutes) ||
          action.durationMinutes < 1 ||
          action.durationMinutes > MAX_WORKFLOW_WAIT_MINUTES
        : action.type === 'request_approval'
          ? false
          : action.type === 'add_customer_tag'
            ? !supportsCustomerActions
            : action.type === 'set_customer_custom_field'
              ? !supportsCustomerActions
              : action.type === 'map_data'
                ? validateWorkflowDataMappings(action.mappings) !== null
                : action.type === 'get_variable'
                  ? typeof action.name !== 'string' ||
                    !/^[A-Za-z_][A-Za-z0-9_]{0,99}$/.test(action.name) ||
                    RESERVED_VARIABLE_NAMES.has(action.name) ||
                    (action.scope !== 'business' && action.scope !== 'workflow')
                  : action.type === 'generate_ai_draft'
                    ? typeof action.prompt !== 'string' ||
                      action.prompt.trim().length === 0 ||
                      Array.from(action.prompt).length >
                        MAX_WORKFLOW_AI_DRAFT_PROMPT_LENGTH
                    : !MESSAGE_ACTION_TYPES.has(action.type) ||
                      (ownerOnlyTrigger && action.type !== 'notify_owner'))
    ) {
      return action.type === 'wait'
        ? `Action ${index + 1} needs a wait from 1 to ${MAX_WORKFLOW_WAIT_MINUTES} minutes.`
        : action.type === 'generate_ai_draft'
          ? `Action ${index + 1} needs a non-empty AI prompt of ${MAX_WORKFLOW_AI_DRAFT_PROMPT_LENGTH} characters or fewer.`
          : action.type === 'map_data'
            ? `Action ${index + 1} has an invalid data mapping configuration.`
            : action.type === 'get_variable'
              ? `Action ${index + 1} needs a valid variable name and business or workflow scope.`
              : `Action ${index + 1} has an unsupported type.`;
    }

    if (action.type === 'wait') continue;
    if (action.type === 'map_data') {
      for (const mapping of action.mappings as Array<Record<string, unknown>>) {
        if (
          !allowForwardMappedDataReferences &&
          typeof mapping.targetPath === 'string'
        ) {
          mappedTemplateFields.add(`mappedData.${mapping.targetPath}`);
        }
      }
      continue;
    }
    if (action.type === 'get_variable') {
      if (!allowForwardMappedDataReferences) {
        workflowVariableFields.add(`variables.${action.name}`);
      }
      continue;
    }
    if (action.type === 'request_approval') {
      if (
        index === actions.length - 1 ||
        typeof action.title !== 'string' ||
        action.title.trim().length === 0 ||
        Array.from(action.title.trim()).length > 191 ||
        typeof action.description !== 'string' ||
        action.description.trim().length === 0 ||
        Array.from(action.description.trim()).length > 2000
      ) {
        return `Action ${index + 1} needs a title and description and must be followed by at least one action.`;
      }
      const titleTemplate = workflowMessageTemplateFields(action.title);
      const descriptionTemplate = workflowMessageTemplateFields(
        action.description,
      );
      if (
        titleTemplate.malformed ||
        descriptionTemplate.malformed ||
        [...titleTemplate.fields, ...descriptionTemplate.fields].some(
          (field) => !isSupportedTemplateField(field),
        )
      ) {
        return `Action ${index + 1} uses an invalid or unsupported approval template field.`;
      }
      continue;
    }
    if (action.type === 'add_customer_tag') {
      if (
        typeof action.tagName !== 'string' ||
        action.tagName.trim().length === 0 ||
        Array.from(action.tagName.trim()).length > 191
      ) {
        return `Action ${index + 1} needs a tag name of 191 characters or fewer.`;
      }
      continue;
    }
    if (action.type === 'set_customer_custom_field') {
      if (
        typeof action.fieldName !== 'string' ||
        action.fieldName.trim().length === 0 ||
        Array.from(action.fieldName.trim()).length > 191
      ) {
        return `Action ${index + 1} needs a customer custom-field name of 191 characters or fewer.`;
      }
      if (
        !Object.prototype.hasOwnProperty.call(action, 'value') ||
        (action.value !== null &&
          typeof action.value !== 'string' &&
          (typeof action.value !== 'number' ||
            !Number.isFinite(action.value))) ||
        (typeof action.value === 'string' &&
          Array.from(action.value).length > 5000)
      ) {
        return `Action ${index + 1} needs a text, number, or null custom-field value.`;
      }
      if (typeof action.value === 'string') {
        const template = workflowMessageTemplateFields(action.value);
        if (
          template.malformed ||
          template.fields.some((field) => !isSupportedTemplateField(field))
        ) {
          return `Action ${index + 1} uses an invalid or unsupported customer-field template value.`;
        }
      }
      continue;
    }
    if (action.type === 'generate_ai_draft') {
      if (typeof action.prompt !== 'string') {
        return `Action ${index + 1} needs an AI prompt.`;
      }
      const template = workflowMessageTemplateFields(action.prompt);
      if (
        template.malformed ||
        template.fields.some((field) => !isSupportedTemplateField(field))
      ) {
        return `Action ${index + 1} uses an invalid or unsupported AI prompt field.`;
      }
      continue;
    }
    if (
      typeof action.messageBody !== 'string' ||
      action.messageBody.trim().length === 0
    ) {
      return `Action ${index + 1} needs a message.`;
    }
    const template = workflowMessageTemplateFields(action.messageBody);
    if (template.malformed) {
      return `Action ${index + 1} has invalid message template syntax.`;
    }
    if (template.fields.some((field) => !isSupportedTemplateField(field))) {
      return `Action ${index + 1} uses a message field not provided by this trigger.`;
    }
  }

  return null;
}
