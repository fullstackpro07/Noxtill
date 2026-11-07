import { WORKFLOW_ACTION_CATALOG } from './workflow-action-catalog';
import { WorkflowAction } from './workflow-action.util';

describe('WORKFLOW_ACTION_CATALOG', () => {
  it('describes every executable workflow action exactly once', () => {
    const types = WORKFLOW_ACTION_CATALOG.map(({ type }) => type);
    const executableTypes: WorkflowAction['type'][] = [
      'send_customer_message',
      'notify_owner',
      'add_customer_tag',
      'set_customer_custom_field',
      'wait',
      'request_approval',
      'generate_ai_draft',
      'map_data',
      'get_variable',
      'run_workflow',
      'ai_agent',
    ];

    expect([...types].sort()).toEqual([...executableTypes].sort());
    expect(new Set(types).size).toBe(types.length);
  });

  it('has honest implementation and setup details for each action', () => {
    for (const action of WORKFLOW_ACTION_CATALOG) {
      expect(action.label.trim()).not.toBe('');
      expect(action.description.trim()).not.toBe('');
      expect(action.provider.trim()).not.toBe('');
      expect(action.setup.trim()).not.toBe('');
      expect(action.inputs.length).toBeGreaterThan(0);
      expect(action.outputs.length).toBeGreaterThan(0);
      expect(action.idempotency.trim()).not.toBe('');
      expect(action.rateLimits.trim()).not.toBe('');
      for (const field of [...action.inputs, ...action.outputs]) {
        expect(field.name.trim()).not.toBe('');
        expect(field.type.trim()).not.toBe('');
        expect(field.description.trim()).not.toBe('');
      }
    }

    expect(
      WORKFLOW_ACTION_CATALOG.find(({ type }) => type === 'generate_ai_draft'),
    ).toMatchObject({ provider: 'Anthropic Claude', effect: 'AI generation' });
  });
});
