import { WorkflowTriggerKey } from '@prisma/client';
import { AUTOMATION_TRIGGERS } from './automation.constants';

describe('AUTOMATION_TRIGGERS', () => {
  it('documents a sample payload for every native workflow trigger', () => {
    expect(AUTOMATION_TRIGGERS.map(({ key }) => key).sort()).toEqual(
      Object.values(WorkflowTriggerKey).sort(),
    );
    for (const trigger of AUTOMATION_TRIGGERS) {
      expect(trigger.label.trim()).not.toBe('');
      expect(trigger.samplePayload.description).toEqual(expect.any(String));
    }
  });
});
