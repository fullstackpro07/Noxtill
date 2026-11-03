import { validateWorkflowDefinition } from './workflow-definition.util';
import { WorkflowTriggerKey } from '@prisma/client';

describe('validateWorkflowDefinition', () => {
  it('requires exactly one valid interval or cron schedule', () => {
    expect(
      validateWorkflowDefinition(
        WorkflowTriggerKey.scheduled,
        'Daily owner summary',
        [],
        [{ type: 'notify_owner', messageBody: 'Scheduled at {{scheduledAt}}' }],
      ),
    ).toMatch(/exactly one scheduled interval or cron expression/);

    expect(
      validateWorkflowDefinition(
        WorkflowTriggerKey.scheduled,
        'Hourly owner summary',
        [],
        [{ type: 'notify_owner', messageBody: 'Scheduled at {{scheduledAt}}' }],
        60,
      ),
    ).toBeNull();

    expect(
      validateWorkflowDefinition(
        WorkflowTriggerKey.scheduled,
        'Hourly owner summary',
        [],
        [{ type: 'notify_owner', messageBody: 'Scheduled at {{scheduledAt}}' }],
        10_081,
      ),
    ).toMatch(/interval between 15 minutes and 10080 minutes/);

    expect(
      validateWorkflowDefinition(
        WorkflowTriggerKey.scheduled,
        'Weekday owner summary',
        [],
        [{ type: 'notify_owner', messageBody: 'Scheduled at {{scheduledAt}}' }],
        null,
        '0 9 * * 1-5',
        'Asia/Karachi',
      ),
    ).toBeNull();

    expect(
      validateWorkflowDefinition(
        WorkflowTriggerKey.scheduled,
        'Invalid timezone',
        [],
        [{ type: 'notify_owner', messageBody: 'Scheduled' }],
        null,
        '0 9 * * 1-5',
        'Mars/Olympus',
      ),
    ).toMatch(/invalid/);

    expect(
      validateWorkflowDefinition(
        WorkflowTriggerKey.scheduled,
        'Two schedule modes',
        [],
        [{ type: 'notify_owner', messageBody: 'Scheduled' }],
        60,
        '0 9 * * *',
        'UTC',
      ),
    ).toMatch(/exactly one/);
  });

  it('only permits owner-directed actions for scheduled triggers', () => {
    expect(
      validateWorkflowDefinition(
        WorkflowTriggerKey.scheduled,
        'Unsafe scheduled customer message',
        [],
        [{ type: 'send_customer_message', messageBody: 'Hello' }],
        60,
      ),
    ).toBe('Action 1 has an unsupported type.');
  });

  it('accepts a supported condition and supported action', () => {
    expect(
      validateWorkflowDefinition(
        WorkflowTriggerKey.sale,
        'Thank high-value customers',
        [{ field: 'orderTotal', operator: 'gte', value: 100 }],
        [
          {
            type: 'send_customer_message',
            messageBody: 'Thanks for your order!',
          },
        ],
      ),
    ).toBeNull();
  });

  it('accepts mapped-data references after their mapping action and rejects unmapped fields', () => {
    expect(
      validateWorkflowDefinition(
        WorkflowTriggerKey.sale,
        'Map sale total before notification',
        [],
        [
          {
            type: 'map_data',
            mappings: [
              {
                sourcePath: 'orderTotal',
                targetPath: 'normalized.total',
                transform: 'number',
              },
            ],
          },
          {
            type: 'notify_owner',
            messageBody: 'Normalized total: {{mappedData.normalized.total}}',
          },
        ],
      ),
    ).toBeNull();

    expect(
      validateWorkflowDefinition(
        WorkflowTriggerKey.sale,
        'Reject unmapped variable',
        [],
        [
          {
            type: 'notify_owner',
            messageBody: 'Unknown value: {{mappedData.secret}}',
          },
        ],
      ),
    ).toBe('Action 1 uses a message field not provided by this trigger.');
  });

  it('requires a get-variable action before a workflow variable is used', () => {
    expect(
      validateWorkflowDefinition(
        WorkflowTriggerKey.sale,
        'Personalized variable message',
        [],
        [
          {
            type: 'get_variable',
            name: 'supportMessage',
            scope: 'business',
          },
          {
            type: 'notify_owner',
            messageBody: '{{variables.supportMessage}}',
          },
        ],
      ),
    ).toBeNull();

    expect(
      validateWorkflowDefinition(
        WorkflowTriggerKey.sale,
        'Variable read is missing',
        [],
        [
          {
            type: 'notify_owner',
            messageBody: '{{variables.supportMessage}}',
          },
        ],
      ),
    ).toBe('Action 1 uses a message field not provided by this trigger.');

    expect(
      validateWorkflowDefinition(
        WorkflowTriggerKey.sale,
        'Reserved variable name',
        [],
        [
          { type: 'get_variable', name: '__proto__', scope: 'business' },
          { type: 'notify_owner', messageBody: 'Hello' },
        ],
      ),
    ).toBe('Action 1 needs a valid variable name and business or workflow scope.');
  });

  it('accepts an AI draft prompt using only fields from the selected trigger', () => {
    expect(
      validateWorkflowDefinition(
        WorkflowTriggerKey.sale,
        'AI thank-you draft',
        [],
        [
          {
            type: 'generate_ai_draft',
            prompt: 'Draft a thank-you note for {{customerName}}.',
          },
        ],
      ),
    ).toBeNull();

    expect(
      validateWorkflowDefinition(
        WorkflowTriggerKey.sale,
        'AI draft with unsupported field',
        [],
        [
          {
            type: 'generate_ai_draft',
            prompt: 'Use {{apiKey}} in the draft.',
          },
        ],
      ),
    ).toBe('Action 1 uses an invalid or unsupported AI prompt field.');

    expect(
      validateWorkflowDefinition(
        WorkflowTriggerKey.sale,
        'AI draft prompt too long',
        [],
        [{ type: 'generate_ai_draft', prompt: 'x'.repeat(4_001) }],
      ),
    ).toBe('Action 1 needs a non-empty AI prompt of 4000 characters or fewer.');
  });

  it('accepts message templates only for fields supplied by the selected trigger', () => {
    expect(
      validateWorkflowDefinition(
        WorkflowTriggerKey.sale,
        'Personalized sale message',
        [],
        [
          {
            type: 'send_customer_message',
            messageBody: 'Hi {{customerName}}, order #{{orderNo}} is ready.',
          },
        ],
      ),
    ).toBeNull();

    expect(
      validateWorkflowDefinition(
        WorkflowTriggerKey.sale,
        'Unsupported variable',
        [],
        [
          {
            type: 'send_customer_message',
            messageBody: 'Your secret is {{apiKey}}.',
          },
        ],
      ),
    ).toBe('Action 1 uses a message field not provided by this trigger.');

    expect(
      validateWorkflowDefinition(
        WorkflowTriggerKey.sale,
        'Malformed variable',
        [],
        [
          {
            type: 'send_customer_message',
            messageBody: 'Hi {{customer-name}}.',
          },
        ],
      ),
    ).toBe('Action 1 has invalid message template syntax.');
  });

  it('accepts mapped customer-field values only from the selected trigger schema', () => {
    expect(
      validateWorkflowDefinition(
        WorkflowTriggerKey.sale,
        'Save sale total to customer',
        [],
        [
          {
            type: 'set_customer_custom_field',
            fieldName: 'Last sale total',
            value: '{{orderTotal}}',
          },
        ],
      ),
    ).toBeNull();

    expect(
      validateWorkflowDefinition(
        WorkflowTriggerKey.sale,
        'Reject unsupported mapped field',
        [],
        [
          {
            type: 'set_customer_custom_field',
            fieldName: 'Last sale total',
            value: '{{apiKey}}',
          },
        ],
      ),
    ).toBe(
      'Action 1 uses an invalid or unsupported customer-field template value.',
    );
  });

  it('accepts a customer tag action for a customer-aware trigger', () => {
    expect(
      validateWorkflowDefinition(
        WorkflowTriggerKey.sale,
        'Tag high-value customers',
        [{ field: 'orderTotal', operator: 'gte', value: 100 }],
        [{ type: 'add_customer_tag', tagName: 'high value' }],
      ),
    ).toBeNull();
  });

  it('accepts a bound approval gate only when it has a valid explanation and later action', () => {
    expect(
      validateWorkflowDefinition(
        WorkflowTriggerKey.sale,
        'Guarded follow-up',
        [],
        [
          {
            type: 'request_approval',
            title: 'Review order {{orderNo}}',
            description: 'Approve the message for {{customerName}}',
          },
          {
            type: 'notify_owner',
            messageBody: 'Approved follow-up continued.',
          },
        ],
      ),
    ).toBeNull();

    expect(
      validateWorkflowDefinition(
        WorkflowTriggerKey.sale,
        'Unbounded template',
        [],
        [
          {
            type: 'request_approval',
            title: 'Review {{apiKey}}',
            description: 'Check this action',
          },
          { type: 'notify_owner', messageBody: 'Continue' },
        ],
      ),
    ).toMatch(/unsupported approval template field/);

    expect(
      validateWorkflowDefinition(
        WorkflowTriggerKey.sale,
        'No action after approval',
        [],
        [
          {
            type: 'request_approval',
            title: 'Review this action',
            description: 'It has no later action',
          },
        ],
      ),
    ).toMatch(/must be followed by at least one action/);
  });

  it('requires a valid tag name and a trigger with a customer context', () => {
    expect(
      validateWorkflowDefinition(
        WorkflowTriggerKey.sale,
        'Blank tag',
        [],
        [{ type: 'add_customer_tag', tagName: '   ' }],
      ),
    ).toBe('Action 1 needs a tag name of 191 characters or fewer.');

    expect(
      validateWorkflowDefinition(
        WorkflowTriggerKey.low_stock,
        'Tag without customer context',
        [],
        [{ type: 'add_customer_tag', tagName: 'low stock alert' }],
      ),
    ).toBe('Action 1 has an unsupported type.');

    expect(
      validateWorkflowDefinition(
        WorkflowTriggerKey.commerce_validation,
        'Tag product validation event',
        [],
        [{ type: 'add_customer_tag', tagName: 'launch' }],
      ),
    ).toBe('Action 1 has an unsupported type.');
  });

  it('validates a typed customer custom-field update only on customer-aware triggers', () => {
    expect(
      validateWorkflowDefinition(
        WorkflowTriggerKey.sale,
        'Set the customer preference',
        [],
        [
          {
            type: 'set_customer_custom_field',
            fieldName: 'Preferred channel',
            value: 'Email',
          },
        ],
      ),
    ).toBeNull();

    expect(
      validateWorkflowDefinition(
        WorkflowTriggerKey.sale,
        'Missing field name',
        [],
        [
          {
            type: 'set_customer_custom_field',
            fieldName: '  ',
            value: 'Email',
          },
        ],
      ),
    ).toBe(
      'Action 1 needs a customer custom-field name of 191 characters or fewer.',
    );

    expect(
      validateWorkflowDefinition(
        WorkflowTriggerKey.low_stock,
        'No customer context',
        [],
        [
          {
            type: 'set_customer_custom_field',
            fieldName: 'Preferred channel',
            value: 'Email',
          },
        ],
      ),
    ).toBe('Action 1 has an unsupported type.');
  });

  it('allows a workflow with no conditions or actions', () => {
    expect(
      validateWorkflowDefinition(
        WorkflowTriggerKey.sale,
        'Record a trigger',
        [],
        [],
      ),
    ).toBeNull();
  });

  it('rejects condition fields the selected trigger never provides', () => {
    expect(
      validateWorkflowDefinition(
        WorkflowTriggerKey.sale,
        'Unsupported field',
        [{ field: 'customer.favoriteColor', operator: 'eq', value: 'blue' }],
        [],
      ),
    ).toBe('Condition 1 uses a field not provided by this trigger.');
  });

  it('rejects an unsupported condition operator', () => {
    expect(
      validateWorkflowDefinition(
        WorkflowTriggerKey.sale,
        'Invalid operator',
        [{ field: 'orderTotal', operator: 'matches', value: 100 }],
        [],
      ),
    ).toBe('Condition 1 has an unsupported operator.');
  });

  it('rejects non-finite condition values', () => {
    expect(
      validateWorkflowDefinition(
        WorkflowTriggerKey.sale,
        'Invalid number',
        [{ field: 'orderTotal', operator: 'gt', value: Number.NaN }],
        [],
      ),
    ).toBe('Condition 1 needs a text or numeric value.');
  });

  it('validates wait durations and accepts supported durable waits', () => {
    expect(
      validateWorkflowDefinition(
        WorkflowTriggerKey.sale,
        'Wait before follow-up',
        [],
        [{ type: 'wait', durationMinutes: 60 }],
      ),
    ).toBeNull();
    expect(
      validateWorkflowDefinition(
        WorkflowTriggerKey.sale,
        'Invalid wait',
        [],
        [{ type: 'wait', durationMinutes: 0 }],
      ),
    ).toBe('Action 1 needs a wait from 1 to 10080 minutes.');
  });

  it('rejects unknown action types and blank messages', () => {
    expect(
      validateWorkflowDefinition(
        WorkflowTriggerKey.sale,
        'Invalid action',
        [],
        [{ type: 'run_arbitrary_code', messageBody: 'hello' }],
      ),
    ).toBe('Action 1 has an unsupported type.');

    expect(
      validateWorkflowDefinition(
        WorkflowTriggerKey.sale,
        'Blank message',
        [],
        [{ type: 'notify_owner', messageBody: '   ' }],
      ),
    ).toBe('Action 1 needs a message.');
  });

  it('only allows owner notifications for commerce validation workflows', () => {
    expect(
      validateWorkflowDefinition(
        WorkflowTriggerKey.commerce_validation,
        'Alert owner about launch decision',
        [
          {
            field: 'validationDecision',
            operator: 'eq',
            value: 'approve_launch',
          },
        ],
        [{ type: 'notify_owner', messageBody: 'A launch was approved' }],
      ),
    ).toBeNull();

    expect(
      validateWorkflowDefinition(
        WorkflowTriggerKey.commerce_validation,
        'Message a customer about product validation',
        [],
        [{ type: 'send_customer_message', messageBody: 'New product' }],
      ),
    ).toBe('Action 1 has an unsupported type.');
  });

  it('only allows owner notifications for SEO issue workflows', () => {
    expect(
      validateWorkflowDefinition(
        WorkflowTriggerKey.seo_issue_detected,
        'Notify owner about critical SEO findings',
        [
          {
            field: 'criticalIssueCount',
            operator: 'gt',
            value: 0,
          },
        ],
        [{ type: 'notify_owner', messageBody: 'An SEO issue needs review' }],
      ),
    ).toBeNull();

    expect(
      validateWorkflowDefinition(
        WorkflowTriggerKey.seo_issue_detected,
        'Do not message a customer about an audit finding',
        [],
        [{ type: 'send_customer_message', messageBody: 'Page needs a fix' }],
      ),
    ).toBe('Action 1 has an unsupported type.');
  });

  it('only allows owner notifications for RFQ award workflows', () => {
    expect(
      validateWorkflowDefinition(
        WorkflowTriggerKey.commerce_rfq_awarded,
        'Notify owner after supplier award',
        [{ field: 'quoteCount', operator: 'gte', value: 1 }],
        [
          {
            type: 'notify_owner',
            messageBody: 'An RFQ award created a draft purchase order',
          },
        ],
      ),
    ).toBeNull();

    expect(
      validateWorkflowDefinition(
        WorkflowTriggerKey.commerce_rfq_awarded,
        'Do not message a customer about supplier sourcing',
        [],
        [
          {
            type: 'send_customer_message',
            messageBody: 'Supplier was selected',
          },
        ],
      ),
    ).toBe('Action 1 has an unsupported type.');
  });

  it('only allows owner notifications for supplier response workflows', () => {
    expect(
      validateWorkflowDefinition(
        WorkflowTriggerKey.commerce_rfq_response_received,
        'Notify owner about a new supplier response',
        [{ field: 'quoteCount', operator: 'gte', value: 1 }],
        [{ type: 'notify_owner', messageBody: 'A supplier sent a quote' }],
      ),
    ).toBeNull();
    expect(
      validateWorkflowDefinition(
        WorkflowTriggerKey.commerce_rfq_response_received,
        'Do not message a customer about a supplier response',
        [],
        [{ type: 'send_customer_message', messageBody: 'A supplier replied' }],
      ),
    ).toBe('Action 1 has an unsupported type.');
  });

  it('only allows owner notifications for supplier-claim lifecycle workflows', () => {
    expect(
      validateWorkflowDefinition(
        WorkflowTriggerKey.commerce_supplier_claim_created,
        'Notify owner when a supplier claim is drafted',
        [{ field: 'claimRequestedAmount', operator: 'gt', value: 0 }],
        [{ type: 'notify_owner', messageBody: 'A supplier claim was created' }],
      ),
    ).toBeNull();
    expect(
      validateWorkflowDefinition(
        WorkflowTriggerKey.commerce_supplier_claim_settled,
        'Do not message customers about supplier recoveries',
        [],
        [
          {
            type: 'send_customer_message',
            messageBody: 'A claim was recovered',
          },
        ],
      ),
    ).toBe('Action 1 has an unsupported type.');
  });
});
