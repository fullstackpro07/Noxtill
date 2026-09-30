import { WorkflowTriggerKey } from '@prisma/client';
import { WORKFLOW_TRIGGER_CATALOG } from './workflow-trigger-catalog';

describe('WORKFLOW_TRIGGER_CATALOG', () => {
  it('describes every persisted trigger exactly once', () => {
    const keys = WORKFLOW_TRIGGER_CATALOG.map(({ key }) => key);

    expect(keys.sort()).toEqual(Object.values(WorkflowTriggerKey).sort());
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('provides labels, owning modules, modes, and real context fields', () => {
    for (const trigger of WORKFLOW_TRIGGER_CATALOG) {
      expect(trigger.label.trim()).not.toBe('');
      expect(trigger.module.trim()).not.toBe('');
      expect(['event', 'scheduled']).toContain(trigger.mode);
      expect(trigger.fields.length).toBeGreaterThan(0);
      expect(new Set(trigger.fields).size).toBe(trigger.fields.length);
    }
    expect(
      WORKFLOW_TRIGGER_CATALOG.find(
        ({ key }) => key === WorkflowTriggerKey.scheduled,
      )?.mode,
    ).toBe('scheduled');
  });
});
