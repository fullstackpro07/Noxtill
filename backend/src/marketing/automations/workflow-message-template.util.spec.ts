import {
  resolveWorkflowCustomFieldValue,
  resolveWorkflowMessageTemplate,
  workflowMessageTemplateFields,
} from './workflow-message-template.util';

describe('workflow message templates', () => {
  it('renders string and numeric values from a trigger context', () => {
    expect(
      resolveWorkflowMessageTemplate(
        'Hi {{ customerName }}, order #{{orderNo}} totaled {{orderTotal}}.',
        { customerName: 'Ayesha', orderNo: 42, orderTotal: 0 },
      ),
    ).toEqual({
      body: 'Hi Ayesha, order #42 totaled 0.',
      error: null,
      missingFields: [],
    });
  });

  it('reports missing values rather than sending unresolved placeholders', () => {
    expect(resolveWorkflowMessageTemplate('Hi {{customerName}}', {})).toEqual({
      body: null,
      error: 'Message template is missing trigger values: customerName.',
      missingFields: ['customerName'],
    });
  });

  it('rejects malformed placeholders', () => {
    expect(workflowMessageTemplateFields('Hello {{customer-name}}')).toEqual({
      fields: [],
      malformed: true,
    });
    expect(
      resolveWorkflowMessageTemplate('Hello {{customer-name}}', {}),
    ).toMatchObject({ body: null, missingFields: [] });
  });

  it('does not treat object values as renderable template fields', () => {
    expect(
      resolveWorkflowMessageTemplate('Value: {{order}}', {
        order: { id: 'order-1' },
      }),
    ).toMatchObject({
      body: null,
      missingFields: ['order'],
    });
  });

  it('preserves numeric type for an exact trigger token and renders mixed text as text', () => {
    expect(
      resolveWorkflowCustomFieldValue('{{orderTotal}}', { orderTotal: 0 }),
    ).toEqual({ value: 0, error: null, missingFields: [] });
    expect(
      resolveWorkflowCustomFieldValue('Order {{orderNo}}', { orderNo: 42 }),
    ).toEqual({ value: 'Order 42', error: null, missingFields: [] });
  });

  it('does not replace a custom-field value when its event data is missing', () => {
    expect(resolveWorkflowCustomFieldValue('{{customerName}}', {})).toEqual({
      value: null,
      error: 'Customer field template is missing trigger value: customerName.',
      missingFields: ['customerName'],
    });
  });

  it('reads nested values from mapped workflow data without inherited property access', () => {
    const context = {
      mappedData: { customer: { name: 'Mia' } },
    };
    expect(
      resolveWorkflowMessageTemplate(
        'Hi {{mappedData.customer.name}}',
        context,
      ),
    ).toEqual({ body: 'Hi Mia', error: null, missingFields: [] });
    expect(
      resolveWorkflowMessageTemplate(
        'Leak {{mappedData.__proto__.polluted}}',
        context,
      ),
    ).toMatchObject({
      body: null,
      missingFields: ['mappedData.__proto__.polluted'],
    });
  });

  it('reads typed workflow variables from run context without inherited property access', () => {
    const context = {
      variables: { threshold: 84.5, notice: { en: 'Order ready' } },
    };
    expect(
      resolveWorkflowMessageTemplate(
        '{{variables.notice.en}} when the total is {{variables.threshold}}.',
        context,
      ),
    ).toEqual({
      body: 'Order ready when the total is 84.5.',
      error: null,
      missingFields: [],
    });
    expect(
      resolveWorkflowMessageTemplate(
        'Leak {{variables.__proto__.polluted}}',
        context,
      ),
    ).toMatchObject({
      body: null,
      missingFields: ['variables.__proto__.polluted'],
    });
  });
});
