import { WorkflowConditionMode } from '@prisma/client';
import {
  evaluateConditions,
  WorkflowCondition,
} from './workflow-condition.util';

describe('evaluateConditions', () => {
  const conditions: WorkflowCondition[] = [
    { field: 'amount', operator: 'gt', value: 100 },
    { field: 'customerName', operator: 'eq', value: 'VIP' },
  ];

  it('keeps the existing all-conditions behavior by default', () => {
    expect(
      evaluateConditions(conditions, { amount: 250, customerName: 'New' }),
    ).toBe(false);
    expect(
      evaluateConditions(conditions, { amount: 250, customerName: 'VIP' }),
    ).toBe(true);
  });

  it('matches any condition when configured and safely handles missing fields', () => {
    expect(
      evaluateConditions(
        conditions,
        { amount: 250, customerName: 'New' },
        WorkflowConditionMode.any,
      ),
    ).toBe(true);
    expect(
      evaluateConditions(
        conditions,
        { customerName: 'New' },
        WorkflowConditionMode.any,
      ),
    ).toBe(false);
  });

  it('treats an empty all-list as unconditional and an empty any-list as false', () => {
    expect(evaluateConditions([], {})).toBe(true);
    expect(evaluateConditions([], {}, WorkflowConditionMode.any)).toBe(false);
  });
});
