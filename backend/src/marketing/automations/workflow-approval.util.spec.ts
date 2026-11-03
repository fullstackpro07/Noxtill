import { WorkflowAction } from './workflow-action.util';
import {
  buildWorkflowApprovalSnapshot,
  hashWorkflowApprovalBinding,
  WorkflowApprovalBinding,
} from './workflow-approval.util';

describe('workflow approval snapshot and binding', () => {
  const binding: WorkflowApprovalBinding = {
    businessId: 'business-a',
    workflowId: 'workflow-a',
    workflowRunId: 'run-a',
    workflowVersion: 4,
    triggerKey: 'sale',
    actionIndex: 0,
    approvalAction: {
      type: 'request_approval',
      title: 'Review order {{orderNo}}',
      description: 'Confirm the follow-up for {{customerName}}',
    },
    downstreamActions: [
      { type: 'send_customer_message', messageBody: 'Thanks {{customerName}}' },
      { type: 'add_customer_tag', tagName: 'followed-up' },
    ],
    context: { orderNo: 43, customerName: 'Ayesha', customerId: 'customer-a' },
  };

  it('shows the resolved approval reason and precise downstream actions', () => {
    expect(buildWorkflowApprovalSnapshot(binding)).toEqual({
      workflowId: 'workflow-a',
      workflowVersion: 4,
      triggerKey: 'sale',
      title: 'Review order 43',
      description: 'Confirm the follow-up for Ayesha',
      steps: [
        {
          type: 'send_customer_message',
          summary: 'Send customer message: Thanks Ayesha',
        },
        { type: 'add_customer_tag', summary: 'Add customer tag “followed-up”' },
      ],
    });
  });

  it('binds decisions to exact run context and downstream actions', () => {
    const original = hashWorkflowApprovalBinding(binding);
    const changedContext = {
      ...binding,
      context: { ...binding.context, orderNo: 44 },
    };
    const changedAction = {
      ...binding,
      downstreamActions: [
        { type: 'add_customer_tag', tagName: 'vip' },
      ] as WorkflowAction[],
    };
    expect(hashWorkflowApprovalBinding(changedContext)).not.toBe(original);
    expect(hashWorkflowApprovalBinding(changedAction)).not.toBe(original);
    expect(hashWorkflowApprovalBinding(binding)).toBe(original);
  });
});
