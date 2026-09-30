import type { WorkflowAction } from './workflow-action.util';

export type WorkflowActionCatalogEntry = {
  type: WorkflowAction['type'];
  label: string;
  description: string;
  category:
    | 'Messaging'
    | 'Customer data'
    | 'Flow control'
    | 'Human control'
    | 'AI'
    | 'Data transformation';
  effect:
    | 'external write'
    | 'customer record write'
    | 'control'
    | 'AI generation'
    | 'data transformation';
  risk: 'low' | 'medium';
  requiresCustomerContext: boolean;
  provider: string;
  setup: string;
  inputs: Array<{
    name: string;
    type: string;
    required: boolean;
    description: string;
  }>;
  outputs: Array<{
    name: string;
    type: string;
    description: string;
  }>;
  idempotency: string;
  rateLimits: string;
};

/** Describes the workflow action implementations that are currently executable. */
export const WORKFLOW_ACTION_CATALOG: WorkflowActionCatalogEntry[] = [
  {
    type: 'send_customer_message',
    label: 'Message the customer',
    description:
      'Queues a message through the business messaging channel and consent rules.',
    category: 'Messaging',
    effect: 'external write',
    risk: 'medium',
    requiresCustomerContext: true,
    provider: 'Configured business channel',
    setup: 'A customer recipient and a usable channel must be available.',
    inputs: [
      {
        name: 'messageBody',
        type: 'string',
        required: true,
        description:
          'Message text; {{triggerField}} placeholders are resolved from the event.',
      },
    ],
    outputs: [
      {
        name: 'queued',
        type: 'boolean',
        description: 'Whether Noxtill accepted the message for delivery.',
      },
      {
        name: 'messageId',
        type: 'string',
        description: 'The Noxtill message record when queued.',
      },
      {
        name: 'customerId',
        type: 'string',
        description: 'The canonical customer recipient.',
      },
    ],
    idempotency:
      'Uses a stable workflow-run and action-index key when queuing the message.',
    rateLimits:
      'Uses business channel settings, consent checks and SendGate quota rules; provider delivery is tracked on the message record.',
  },
  {
    type: 'notify_owner',
    label: 'Notify the owner',
    description:
      'Queues a notification to the business owner through the configured channel.',
    category: 'Messaging',
    effect: 'external write',
    risk: 'low',
    requiresCustomerContext: false,
    provider: 'Configured business channel',
    setup: 'The business must have an owner with a usable contact method.',
    inputs: [
      {
        name: 'messageBody',
        type: 'string',
        required: true,
        description:
          'Notification text; {{triggerField}} placeholders are resolved from the event.',
      },
    ],
    outputs: [
      {
        name: 'queued',
        type: 'boolean',
        description: 'Whether Noxtill accepted the notification for delivery.',
      },
      {
        name: 'messageId',
        type: 'string',
        description: 'The Noxtill message record when queued.',
      },
    ],
    idempotency:
      'Uses a stable workflow-run and action-index key when queuing the notification.',
    rateLimits:
      'Uses business channel settings and SendGate quota rules; provider delivery is tracked on the message record.',
  },
  {
    type: 'add_customer_tag',
    label: 'Add a customer tag',
    description: 'Adds a tag to the canonical customer record.',
    category: 'Customer data',
    effect: 'customer record write',
    risk: 'low',
    requiresCustomerContext: true,
    provider: 'Noxtill Customers',
    setup: 'The trigger must provide a customer.',
    inputs: [
      {
        name: 'tagName',
        type: 'string',
        required: true,
        description: 'Tag to add to the customer.',
      },
    ],
    outputs: [
      {
        name: 'completed',
        type: 'boolean',
        description: 'Whether the update completed.',
      },
      {
        name: 'added',
        type: 'boolean',
        description: 'False when the customer already had this tag.',
      },
      {
        name: 'customerId',
        type: 'string',
        description: 'The canonical customer that was updated.',
      },
    ],
    idempotency: 'Re-applying an existing tag does not add a duplicate.',
    rateLimits:
      'No external provider call; update is scoped to the business customer record.',
  },
  {
    type: 'set_customer_custom_field',
    label: 'Set a customer field',
    description:
      'Updates a defined custom field on the canonical customer record.',
    category: 'Customer data',
    effect: 'customer record write',
    risk: 'medium',
    requiresCustomerContext: true,
    provider: 'Noxtill Customers',
    setup: 'The trigger must provide a customer and the field must exist.',
    inputs: [
      {
        name: 'fieldName',
        type: 'string',
        required: true,
        description: 'Name of a configured customer custom field.',
      },
      {
        name: 'value',
        type: 'string | number | null',
        required: true,
        description: 'Value must match the configured field type and options.',
      },
    ],
    outputs: [
      {
        name: 'completed',
        type: 'boolean',
        description: 'Whether the update completed.',
      },
      {
        name: 'updated',
        type: 'boolean',
        description: 'False when the field already had this value.',
      },
      {
        name: 'customerId',
        type: 'string',
        description: 'The canonical customer that was updated.',
      },
      {
        name: 'fieldName',
        type: 'string',
        description: 'The configured field that was changed.',
      },
    ],
    idempotency: 'Writing the already-current value is a no-op.',
    rateLimits:
      'No external provider call; update is scoped to the business customer record.',
  },
  {
    type: 'wait',
    label: 'Wait',
    description:
      'Pauses this run for the configured duration before continuing.',
    category: 'Flow control',
    effect: 'control',
    risk: 'low',
    requiresCustomerContext: false,
    provider: 'Noxtill workflow runtime',
    setup:
      'Durable resume requires the workflow queue and Redis configuration.',
    inputs: [
      {
        name: 'durationMinutes',
        type: 'integer',
        required: true,
        description: 'Wait duration from 1 to 10080 minutes.',
      },
    ],
    outputs: [
      {
        name: 'waiting',
        type: 'boolean',
        description: 'True while the run is waiting.',
      },
      {
        name: 'waitingUntil',
        type: 'date-time',
        description: 'The scheduled resume time.',
      },
    ],
    idempotency:
      'Stored against the workflow run; resume is handled by the durable workflow queue.',
    rateLimits:
      'Uses the shared workflow schedule queue; queue and Redis health affect resume.',
  },
  {
    type: 'request_approval',
    label: 'Require human approval',
    description:
      'Pauses this run until an owner or authorized approver decides.',
    category: 'Human control',
    effect: 'control',
    risk: 'low',
    requiresCustomerContext: false,
    provider: 'Noxtill Approvals',
    setup: 'An owner or manager must review the pending run.',
    inputs: [
      {
        name: 'title',
        type: 'string',
        required: true,
        description: 'Approval title shown to the approver.',
      },
      {
        name: 'description',
        type: 'string',
        required: true,
        description: 'Approval context shown to the approver.',
      },
    ],
    outputs: [
      {
        name: 'waiting',
        type: 'boolean',
        description: 'True while the approval is pending.',
      },
      {
        name: 'approvalId',
        type: 'string',
        description: 'The immutable approval record.',
      },
      {
        name: 'approvalStatus',
        type: 'string',
        description: 'Starts as pending; a decision resumes or stops the run.',
      },
    ],
    idempotency:
      'Each workflow run/action has one payload-bound approval record.',
    rateLimits:
      'No external provider call; owner and manager authorization is enforced by the API.',
  },
  {
    type: 'generate_ai_draft',
    label: 'Generate an AI draft',
    description:
      'Generates a text draft from the trigger values explicitly referenced in the prompt.',
    category: 'AI',
    effect: 'AI generation',
    risk: 'medium',
    requiresCustomerContext: false,
    provider: 'Anthropic Claude',
    setup:
      'Requires server-side AI configuration and the business AI feature to be enabled.',
    inputs: [
      {
        name: 'prompt',
        type: 'string',
        required: true,
        description:
          'Task prompt, up to 4000 characters; only explicitly referenced trigger fields are sent.',
      },
    ],
    outputs: [
      {
        name: 'aiGenerated',
        type: 'boolean',
        description: 'Marks this result as AI-generated content.',
      },
      {
        name: 'provider',
        type: 'string',
        description: 'The configured AI provider used for this draft.',
      },
      {
        name: 'output',
        type: 'string',
        description: 'Generated draft saved in workflow run history.',
      },
      {
        name: 'inputTokens',
        type: 'integer',
        description: 'Provider-reported input token count.',
      },
      {
        name: 'outputTokens',
        type: 'integer',
        description: 'Provider-reported output token count, capped at 512.',
      },
    ],
    idempotency:
      'Provider generation is not retried after failure to avoid duplicate paid requests.',
    rateLimits:
      'Uses shared per-business AI rate limit, monthly cost cap, feature toggle and usage logging.',
  },
  {
    type: 'map_data',
    label: 'Map event data',
    description:
      'Transforms selected event JSON fields and stores the result under mappedData for later actions in this run.',
    category: 'Data transformation',
    effect: 'data transformation',
    risk: 'low',
    requiresCustomerContext: false,
    provider: 'Noxtill workflow runtime',
    setup:
      'Add this action before any message or AI draft that references its mappedData fields.',
    inputs: [
      {
        name: 'mappings',
        type: 'WorkflowDataMapping[]',
        required: true,
        description:
          'Safe source and target JSON paths with a supported type/text conversion.',
      },
    ],
    outputs: [
      {
        name: 'mappedData',
        type: 'object',
        description:
          'Merged into workflow-run context and available to later action templates as {{mappedData.path}}.',
      },
      {
        name: 'mappedFields',
        type: 'integer',
        description: 'Number of fields transformed by this action.',
      },
    ],
    idempotency:
      'Deterministic transformation; re-running replaces the same target values in the run context.',
    rateLimits:
      'No provider request. Each action is limited to 100 mappings and bounded JSON payloads.',
  },
  {
    type: 'get_variable',
    label: 'Get workflow variable',
    description:
      'Reads a non-secret business or workflow variable into this run so later actions can use {{variables.name}}.',
    category: 'Data transformation',
    effect: 'data transformation',
    risk: 'low',
    requiresCustomerContext: false,
    provider: 'Noxtill workflow runtime',
    setup:
      'Create the variable in Variables & State under the Production environment and place this action before any step that uses it.',
    inputs: [
      {
        name: 'name',
        type: 'string',
        required: true,
        description: 'The existing variable name to read.',
      },
      {
        name: 'scope',
        type: 'business | workflow',
        required: true,
        description: 'Read a business-wide value or this workflow’s value.',
      },
    ],
    outputs: [
      {
        name: 'variables.name',
        type: 'typed variable value',
        description:
          'Added to this workflow run context for later message, AI and field templates.',
      },
    ],
    idempotency:
      'Read-only action; a retry reads the current Production value again.',
    rateLimits:
      'One tenant-scoped database read per action. Secret-reference variables are never resolved or returned.',
  },
];
