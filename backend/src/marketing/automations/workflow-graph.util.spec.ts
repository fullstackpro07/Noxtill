import { WorkflowConditionMode, WorkflowTriggerKey } from '@prisma/client';
import {
  resolveWorkflowGraphPath,
  validateWorkflowGraph,
  WorkflowGraph,
} from './workflow-graph.util';

const branchGraph: WorkflowGraph = {
  schemaVersion: 1,
  nodes: [
    { id: 'trigger', type: 'trigger' },
    {
      id: 'condition',
      type: 'condition',
      conditions: [{ field: 'amount', operator: 'gte', value: 100 }],
      conditionMode: WorkflowConditionMode.all,
    },
    {
      id: 'high-value',
      type: 'action',
      action: { type: 'notify_owner', messageBody: 'High-value sale' },
    },
    { id: 'high-end', type: 'end' },
    {
      id: 'standard',
      type: 'action',
      action: { type: 'notify_owner', messageBody: 'Standard sale' },
    },
    { id: 'standard-end', type: 'end' },
  ],
  edges: [
    { source: 'trigger', target: 'condition', port: 'next' },
    { source: 'condition', target: 'high-value', port: 'true' },
    { source: 'condition', target: 'standard', port: 'false' },
    { source: 'high-value', target: 'high-end', port: 'next' },
    { source: 'standard', target: 'standard-end', port: 'next' },
  ],
};

describe('workflow graph compiler', () => {
  it('validates a connected branch graph and selects only the matching action path', () => {
    expect(
      validateWorkflowGraph(
        branchGraph,
        WorkflowTriggerKey.sale,
        'Sale notice',
      ),
    ).toBeNull();

    expect(
      resolveWorkflowGraphPath(branchGraph, { amount: 125 }),
    ).toMatchObject({
      actionIndexes: [0],
      visitedNodeIds: ['trigger', 'condition', 'high-value', 'high-end'],
      decisions: [{ nodeId: 'condition', result: 'true' }],
    });
    expect(resolveWorkflowGraphPath(branchGraph, { amount: 25 })).toMatchObject(
      {
        actionIndexes: [1],
        visitedNodeIds: ['trigger', 'condition', 'standard', 'standard-end'],
        decisions: [{ nodeId: 'condition', result: 'false' }],
      },
    );
  });

  it('rejects conditions not available to the selected trigger', () => {
    const graph = structuredClone(branchGraph);
    const condition = graph.nodes.find((node) => node.type === 'condition');
    if (condition?.type === 'condition') {
      condition.conditions[0].field = 'supplierSecret';
    }
    expect(
      validateWorkflowGraph(graph, WorkflowTriggerKey.sale, 'Invalid field'),
    ).toContain('not provided by this trigger');
  });

  it('rejects cycles and disconnected nodes before persistence', () => {
    const graph = structuredClone(branchGraph);
    graph.nodes = graph.nodes.filter((node) => node.id !== 'high-end');
    graph.edges = graph.edges.filter(
      (edge) => edge.source !== 'high-value' || edge.target !== 'high-end',
    );
    graph.edges.push({
      source: 'high-value',
      target: 'condition',
      port: 'next',
    });
    expect(
      validateWorkflowGraph(graph, WorkflowTriggerKey.sale, 'Cycle'),
    ).toContain('contains a cycle');

    const disconnected = structuredClone(branchGraph);
    disconnected.edges = disconnected.edges.filter(
      (edge) => edge.target !== 'standard',
    );
    expect(
      validateWorkflowGraph(
        disconnected,
        WorkflowTriggerKey.sale,
        'Disconnected',
      ),
    ).not.toBeNull();
  });

  it('validates approval copy and requires a downstream action on its path', () => {
    const graph: WorkflowGraph = {
      schemaVersion: 1,
      nodes: [
        { id: 'trigger', type: 'trigger' },
        {
          id: 'approval',
          type: 'action',
          action: {
            type: 'request_approval',
            title: 'Review {{customerName}}',
            description: 'Approve this follow-up',
          },
        },
        {
          id: 'notify',
          type: 'action',
          action: { type: 'notify_owner', messageBody: 'Approved' },
        },
        { id: 'end', type: 'end' },
      ],
      edges: [
        { source: 'trigger', target: 'approval', port: 'next' },
        { source: 'approval', target: 'notify', port: 'next' },
        { source: 'notify', target: 'end', port: 'next' },
      ],
    };
    expect(
      validateWorkflowGraph(graph, WorkflowTriggerKey.sale, 'Approval'),
    ).toBeNull();

    graph.edges[1] = { source: 'approval', target: 'end', port: 'next' };
    expect(
      validateWorkflowGraph(graph, WorkflowTriggerKey.sale, 'No next action'),
    ).toContain('must lead to at least one later action');
  });

  it('allows a mapper before downstream actions and rejects a mapper on only one branch', () => {
    const commonMapper: WorkflowGraph = {
      schemaVersion: 1,
      nodes: [
        { id: 'trigger', type: 'trigger' },
        {
          id: 'mapper',
          type: 'action',
          action: {
            type: 'map_data',
            mappings: [
              {
                sourcePath: 'orderTotal',
                targetPath: 'normalized.total',
                transform: 'number',
              },
            ],
          },
        },
        {
          id: 'notify',
          type: 'action',
          action: {
            type: 'notify_owner',
            messageBody: 'Total {{mappedData.normalized.total}}',
          },
        },
        { id: 'end', type: 'end' },
      ],
      edges: [
        { source: 'trigger', target: 'mapper', port: 'next' },
        { source: 'mapper', target: 'notify', port: 'next' },
        { source: 'notify', target: 'end', port: 'next' },
      ],
    };
    expect(
      validateWorkflowGraph(
        commonMapper,
        WorkflowTriggerKey.sale,
        'Mapped notice',
      ),
    ).toBeNull();

    const branchMapper: WorkflowGraph = {
      schemaVersion: 1,
      nodes: [
        { id: 'trigger', type: 'trigger' },
        {
          id: 'condition',
          type: 'condition',
          conditions: [{ field: 'orderTotal', operator: 'gte', value: 100 }],
          conditionMode: WorkflowConditionMode.all,
        },
        {
          id: 'true-map',
          type: 'action',
          action: {
            type: 'map_data',
            mappings: [{ sourcePath: 'orderTotal', targetPath: 'amount' }],
          },
        },
        { id: 'true-end', type: 'end' },
        {
          id: 'false-notify',
          type: 'action',
          action: {
            type: 'notify_owner',
            messageBody: 'Total {{mappedData.amount}}',
          },
        },
        { id: 'false-end', type: 'end' },
      ],
      edges: [
        { source: 'trigger', target: 'condition', port: 'next' },
        { source: 'condition', target: 'true-map', port: 'true' },
        { source: 'condition', target: 'false-notify', port: 'false' },
        { source: 'true-map', target: 'true-end', port: 'next' },
        { source: 'false-notify', target: 'false-end', port: 'next' },
      ],
    };
    expect(
      validateWorkflowGraph(
        branchMapper,
        WorkflowTriggerKey.sale,
        'Unsafe mapped branch',
      ),
    ).toContain('can bypass its mapping action');
  });

  it('requires a variable-read action on every path before a template uses that value', () => {
    const validGraph: WorkflowGraph = {
      schemaVersion: 1,
      nodes: [
        { id: 'trigger', type: 'trigger' },
        {
          id: 'read-variable',
          type: 'action',
          action: {
            type: 'get_variable',
            name: 'supportMessage',
            scope: 'business',
          },
        },
        {
          id: 'notify',
          type: 'action',
          action: {
            type: 'notify_owner',
            messageBody: '{{variables.supportMessage}}',
          },
        },
        { id: 'end', type: 'end' },
      ],
      edges: [
        { source: 'trigger', target: 'read-variable', port: 'next' },
        { source: 'read-variable', target: 'notify', port: 'next' },
        { source: 'notify', target: 'end', port: 'next' },
      ],
    };
    expect(
      validateWorkflowGraph(validGraph, WorkflowTriggerKey.sale, 'Variable use'),
    ).toBeNull();

    const bypassGraph: WorkflowGraph = {
      schemaVersion: 1,
      nodes: [
        { id: 'trigger', type: 'trigger' },
        {
          id: 'condition',
          type: 'condition',
          conditions: [{ field: 'amount', operator: 'gte', value: 100 }],
          conditionMode: WorkflowConditionMode.all,
        },
        {
          id: 'read-variable',
          type: 'action',
          action: {
            type: 'get_variable',
            name: 'supportMessage',
            scope: 'business',
          },
        },
        { id: 'true-end', type: 'end' },
        {
          id: 'notify',
          type: 'action',
          action: {
            type: 'notify_owner',
            messageBody: '{{variables.supportMessage}}',
          },
        },
        { id: 'false-end', type: 'end' },
      ],
      edges: [
        { source: 'trigger', target: 'condition', port: 'next' },
        { source: 'condition', target: 'read-variable', port: 'true' },
        { source: 'condition', target: 'notify', port: 'false' },
        { source: 'read-variable', target: 'true-end', port: 'next' },
        { source: 'notify', target: 'false-end', port: 'next' },
      ],
    };
    expect(
      validateWorkflowGraph(bypassGraph, WorkflowTriggerKey.sale, 'Variable bypass'),
    ).toContain('can bypass its Get workflow variable action');
  });
});
