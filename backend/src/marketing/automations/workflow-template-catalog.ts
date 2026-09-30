import { WorkflowTriggerKey } from '@prisma/client';
import type { WorkflowAction } from './workflow-action.util';
import { validateWorkflowDefinition } from './workflow-definition.util';
import { resolveWorkflowMessageTemplate } from './workflow-message-template.util';
import { WORKFLOW_TRIGGER_CATALOG } from './workflow-trigger-catalog';

export type WorkflowTemplate = {
  id: string;
  version: number;
  name: string;
  description: string;
  module: string;
  goal: string;
  triggerKey: WorkflowTriggerKey;
  conditions: [];
  actions: WorkflowAction[];
  requiredSetup: string[];
  testFixture: {
    context: Record<string, string | number>;
    expectedMessage: string;
  };
};

export type WorkflowTemplatePreview = WorkflowTemplate & {
  triggerLabel: string;
  preview: {
    renderedMessages: string[];
    sideEffectsExecuted: false;
    fixtureValid: boolean;
    validationError: string | null;
  };
};

/** Built-in starter definitions; install always creates a paused workflow draft. */
export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'inventory-low-stock-owner-alert',
    version: 1,
    name: 'Low stock owner alert',
    description: 'Notify the owner when Noxtill detects a low-stock event.',
    module: 'Inventory',
    goal: 'Bring a low-stock event to the owner’s attention.',
    triggerKey: WorkflowTriggerKey.low_stock,
    conditions: [],
    actions: [
      {
        type: 'notify_owner',
        messageBody: 'Low-stock alert: {{description}}',
      },
    ],
    requiredSetup: [
      'Configure a usable owner notification channel in Noxtill.',
      'Review the message and test the draft before activating it.',
    ],
    testFixture: {
      context: {
        description: 'Sample item is below its reorder level',
        amount: 4,
      },
      expectedMessage:
        'Low-stock alert: Sample item is below its reorder level',
    },
  },
  {
    id: 'reviews-feedback-owner-alert',
    version: 1,
    name: 'Customer feedback owner alert',
    description:
      'Notify the owner when customer feedback is flagged for attention.',
    module: 'Reviews',
    goal: 'Make customer feedback requiring attention visible to the owner.',
    triggerKey: WorkflowTriggerKey.complaint_received,
    conditions: [],
    actions: [
      {
        type: 'notify_owner',
        messageBody: 'Customer feedback needs attention: {{description}}',
      },
    ],
    requiredSetup: [
      'Configure a usable owner notification channel in Noxtill.',
      'Review the message and test the draft before activating it.',
    ],
    testFixture: {
      context: {
        description: 'Sample customer feedback was flagged for review',
        customerName: 'Sample customer',
        feedbackRating: 2,
      },
      expectedMessage:
        'Customer feedback needs attention: Sample customer feedback was flagged for review',
    },
  },
  {
    id: 'credit-overdue-owner-alert',
    version: 1,
    name: 'Overdue credit owner alert',
    description:
      'Notify the owner when Noxtill detects an overdue credit payment.',
    module: 'Credit',
    goal: 'Bring an overdue credit event to the owner’s attention for review.',
    triggerKey: WorkflowTriggerKey.credit_overdue,
    conditions: [],
    actions: [
      {
        type: 'notify_owner',
        messageBody: 'Overdue credit needs review: {{description}}',
      },
    ],
    requiredSetup: [
      'Configure a usable owner notification channel in Noxtill.',
      'Review the message and test the draft before activating it.',
    ],
    testFixture: {
      context: {
        description: 'Sample credit installment is overdue',
        customerName: 'Sample customer',
        installmentAmount: 25,
      },
      expectedMessage:
        'Overdue credit needs review: Sample credit installment is overdue',
    },
  },
  {
    id: 'sale-owner-alert',
    version: 1,
    name: 'New sale owner alert',
    description: 'Notify the owner when a sale is recorded in Noxtill.',
    module: 'Orders',
    goal: 'Make a newly recorded sale visible to the owner.',
    triggerKey: WorkflowTriggerKey.sale,
    conditions: [],
    actions: [
      {
        type: 'notify_owner',
        messageBody: 'New sale recorded: {{description}}',
      },
    ],
    requiredSetup: [
      'Configure a usable owner notification channel in Noxtill.',
      'Review the message and test the draft before activating it.',
    ],
    testFixture: {
      context: { description: 'Sample sale was recorded', amount: 42 },
      expectedMessage: 'New sale recorded: Sample sale was recorded',
    },
  },
  {
    id: 'delivery-failure-owner-alert',
    version: 1,
    name: 'Failed delivery owner alert',
    description: 'Notify the owner when a delivery fails.',
    module: 'Deliveries',
    goal: 'Bring a failed delivery event to the owner for follow-up.',
    triggerKey: WorkflowTriggerKey.delivery_failed,
    conditions: [],
    actions: [
      {
        type: 'notify_owner',
        messageBody: 'Delivery needs follow-up: {{description}}',
      },
    ],
    requiredSetup: [
      'Configure a usable owner notification channel in Noxtill.',
      'Review the message and test the draft before activating it.',
    ],
    testFixture: {
      context: { description: 'Sample delivery failed' },
      expectedMessage: 'Delivery needs follow-up: Sample delivery failed',
    },
  },
  {
    id: 'seo-issue-owner-alert',
    version: 1,
    name: 'High-priority SEO issue owner alert',
    description: 'Notify the owner when a high-priority SEO issue is detected.',
    module: 'SEO Autopilot',
    goal: 'Bring a high-priority audit issue to the owner for review.',
    triggerKey: WorkflowTriggerKey.seo_issue_detected,
    conditions: [],
    actions: [
      {
        type: 'notify_owner',
        messageBody: 'SEO issue needs review: {{description}}',
      },
    ],
    requiredSetup: [
      'Configure a usable owner notification channel in Noxtill.',
      'Enable an SEO audit schedule or run an audit that can emit issue events.',
      'Review the message and test the draft before activating it.',
    ],
    testFixture: {
      context: { description: 'Sample high-priority SEO issue detected' },
      expectedMessage:
        'SEO issue needs review: Sample high-priority SEO issue detected',
    },
  },
  {
    id: 'commerce-validation-owner-alert',
    version: 1,
    name: 'Product validation owner alert',
    description:
      'Notify the owner when a product validation decision is recorded.',
    module: 'Autonomous Commerce',
    goal: 'Make product validation decisions visible for the next review step.',
    triggerKey: WorkflowTriggerKey.commerce_validation,
    conditions: [],
    actions: [
      {
        type: 'notify_owner',
        messageBody: 'Product validation needs review: {{description}}',
      },
    ],
    requiredSetup: [
      'Configure a usable owner notification channel in Noxtill.',
      'Review the message and test the draft before activating it.',
    ],
    testFixture: {
      context: { description: 'Sample product validation decision recorded' },
      expectedMessage:
        'Product validation needs review: Sample product validation decision recorded',
    },
  },
  {
    id: 'supplier-claim-owner-alert',
    version: 1,
    name: 'Supplier claim owner alert',
    description: 'Notify the owner when a supplier claim is created.',
    module: 'Autonomous Commerce',
    goal: 'Make a new supplier claim visible for owner review.',
    triggerKey: WorkflowTriggerKey.commerce_supplier_claim_created,
    conditions: [],
    actions: [
      {
        type: 'notify_owner',
        messageBody: 'Supplier claim needs review: {{description}}',
      },
    ],
    requiredSetup: [
      'Configure a usable owner notification channel in Noxtill.',
      'Review the message and test the draft before activating it.',
    ],
    testFixture: {
      context: { description: 'Sample supplier claim was created' },
      expectedMessage:
        'Supplier claim needs review: Sample supplier claim was created',
    },
  },
];

export function findWorkflowTemplate(templateId: string) {
  return WORKFLOW_TEMPLATES.find((template) => template.id === templateId);
}

export function buildWorkflowTemplateCatalog(): WorkflowTemplatePreview[] {
  return WORKFLOW_TEMPLATES.map((template) => {
    const definitionError = validateWorkflowDefinition(
      template.triggerKey,
      template.name,
      template.conditions,
      template.actions,
    );
    const renderedMessages = template.actions.flatMap((action) => {
      if (
        action.type !== 'send_customer_message' &&
        action.type !== 'notify_owner'
      ) {
        return [];
      }
      const resolved = resolveWorkflowMessageTemplate(
        action.messageBody,
        template.testFixture.context,
      );
      return resolved.body ? [resolved.body] : [];
    });
    const trigger = WORKFLOW_TRIGGER_CATALOG.find(
      (entry) => entry.key === template.triggerKey,
    );

    return {
      ...template,
      triggerLabel: trigger?.label ?? template.triggerKey,
      preview: {
        renderedMessages,
        sideEffectsExecuted: false,
        fixtureValid:
          definitionError === null &&
          renderedMessages.length > 0 &&
          renderedMessages[0] === template.testFixture.expectedMessage,
        validationError: definitionError,
      },
    };
  });
}
