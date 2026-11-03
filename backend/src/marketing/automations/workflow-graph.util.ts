import { WorkflowConditionMode, WorkflowTriggerKey } from '@prisma/client';
import {
  evaluateConditions,
  WorkflowCondition,
} from './workflow-condition.util';
import { WorkflowAction } from './workflow-action.util';
import { validateWorkflowDefinition } from './workflow-definition.util';
import { workflowMessageTemplateFields } from './workflow-message-template.util';

export type WorkflowGraphPort = 'next' | 'true' | 'false';

export type WorkflowGraphNode =
  | { id: string; type: 'trigger' }
  | { id: string; type: 'action'; action: WorkflowAction }
  | {
      id: string;
      type: 'condition';
      conditions: WorkflowCondition[];
      conditionMode: WorkflowConditionMode;
    }
  | { id: string; type: 'end' };

export interface WorkflowGraphEdge {
  source: string;
  target: string;
  port: WorkflowGraphPort;
}

export interface WorkflowGraph {
  schemaVersion: 1;
  nodes: WorkflowGraphNode[];
  edges: WorkflowGraphEdge[];
}

export interface WorkflowGraphExecutionPlan {
  schemaVersion: 1;
  actionIndexes: number[];
  visitedNodeIds: string[];
  decisions: Array<{ nodeId: string; result: 'true' | 'false' }>;
}

const MAX_NODES = 100;
const MAX_EDGES = 200;
const NODE_ID = /^[A-Za-z0-9_-]{1,80}$/;
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nodeShapeError(value: unknown, index: number): string | null {
  if (!isRecord(value)) return `Node ${index + 1} must be an object.`;
  if (typeof value.id !== 'string' || !NODE_ID.test(value.id)) {
    return `Node ${index + 1} needs a valid id.`;
  }
  if (
    value.type !== 'trigger' &&
    value.type !== 'action' &&
    value.type !== 'condition' &&
    value.type !== 'end'
  ) {
    return `Node ${index + 1} has an unsupported type.`;
  }
  if (value.type === 'action' && !isRecord(value.action)) {
    return `Action node ${index + 1} needs an action definition.`;
  }
  if (
    value.type === 'condition' &&
    (!Array.isArray(value.conditions) ||
      (value.conditionMode !== WorkflowConditionMode.all &&
        value.conditionMode !== WorkflowConditionMode.any))
  ) {
    return `Condition node ${index + 1} needs conditions and a match mode.`;
  }
  return null;
}

function graphActions(graph: WorkflowGraph): WorkflowAction[] {
  return graph.nodes.flatMap((node) =>
    node.type === 'action' ? [node.action] : [],
  );
}

function mappedDataDependencies(action: WorkflowAction): string[] {
  const templates: string[] = [];
  const sources: string[] = [];
  if (
    action.type === 'send_customer_message' ||
    action.type === 'notify_owner'
  ) {
    templates.push(action.messageBody);
  } else if (action.type === 'generate_ai_draft') {
    templates.push(action.prompt);
  } else if (action.type === 'request_approval') {
    templates.push(action.title, action.description);
  } else if (action.type === 'set_customer_custom_field') {
    if (typeof action.value === 'string') templates.push(action.value);
  } else if (action.type === 'map_data') {
    sources.push(...action.mappings.map((mapping) => mapping.sourcePath));
  }
  return [
    ...templates.flatMap((template) =>
      workflowMessageTemplateFields(template).fields.filter((field) =>
        field.startsWith('mappedData.'),
      ),
    ),
    ...sources.filter((source) => source.startsWith('mappedData.')),
  ];
}

function canReachWithoutNodes(
  startId: string,
  targetId: string,
  excluded: Set<string>,
  outgoing: Map<string, WorkflowGraphEdge[]>,
): boolean {
  const queue = [startId];
  const reached = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (id === targetId) return true;
    if (reached.has(id) || excluded.has(id)) continue;
    reached.add(id);
    for (const edge of outgoing.get(id) ?? []) queue.push(edge.target);
  }
  return false;
}

function validateMappedDataDependencies(
  graph: WorkflowGraph,
  triggerId: string,
  outgoing: Map<string, WorkflowGraphEdge[]>,
): string | null {
  const mapperNodes = graph.nodes.filter(
    (node) => node.type === 'action' && node.action.type === 'map_data',
  );
  for (const node of graph.nodes) {
    if (node.type !== 'action') continue;
    for (const field of mappedDataDependencies(node.action)) {
      const path = field.slice('mappedData.'.length);
      const providers = mapperNodes.filter(
        (mapper) =>
          mapper.type === 'action' &&
          mapper.action.type === 'map_data' &&
          mapper.id !== node.id &&
          mapper.action.mappings.some(
            (mapping) =>
              mapping.targetPath === path ||
              path.startsWith(`${mapping.targetPath}.`),
          ),
      );
      if (providers.length === 0) {
        return `Action node "${node.id}" uses "${field}" without a prior Map event data action.`;
      }
      const providerIds = new Set(providers.map((provider) => provider.id));
      if (canReachWithoutNodes(triggerId, node.id, providerIds, outgoing)) {
        return `Action node "${node.id}" uses "${field}" on a path that can bypass its mapping action.`;
      }
    }
  }
  return null;
}

function workflowVariableDependencies(action: WorkflowAction): string[] {
  const templates: string[] = [];
  if (
    action.type === 'send_customer_message' ||
    action.type === 'notify_owner'
  ) {
    templates.push(action.messageBody);
  } else if (action.type === 'generate_ai_draft') {
    templates.push(action.prompt);
  } else if (action.type === 'request_approval') {
    templates.push(action.title, action.description);
  } else if (action.type === 'set_customer_custom_field') {
    if (typeof action.value === 'string') templates.push(action.value);
  }
  return templates
    .flatMap((template) => workflowMessageTemplateFields(template).fields)
    .filter((field) => field.startsWith('variables.'));
}

function validateWorkflowVariableDependencies(
  graph: WorkflowGraph,
  triggerId: string,
  outgoing: Map<string, WorkflowGraphEdge[]>,
): string | null {
  const variableActions = graph.nodes.filter(
    (node) => node.type === 'action' && node.action.type === 'get_variable',
  );
  for (const node of graph.nodes) {
    if (node.type !== 'action') continue;
    for (const field of workflowVariableDependencies(node.action)) {
      const name = field.slice('variables.'.length).split('.')[0];
      const providers = variableActions.filter(
        (provider) =>
          provider.type === 'action' &&
          provider.action.type === 'get_variable' &&
          provider.action.name === name &&
          provider.id !== node.id,
      );
      if (providers.length === 0) {
        return `Action node "${node.id}" uses "${field}" without a Get workflow variable action.`;
      }
      const providerIds = new Set(providers.map((provider) => provider.id));
      if (canReachWithoutNodes(triggerId, node.id, providerIds, outgoing)) {
        return `Action node "${node.id}" uses "${field}" on a path that can bypass its Get workflow variable action.`;
      }
    }
  }
  return null;
}

/** Validate a bounded, acyclic trigger/action/condition/end graph before persistence or publish. */
export function validateWorkflowGraph(
  input: unknown,
  triggerKey: WorkflowTriggerKey,
  workflowName = 'Graph workflow',
  scheduleEveryMinutes?: number | null,
  scheduleCronExpression?: string | null,
  scheduleTimezone = 'UTC',
): string | null {
  if (!isRecord(input) || input.schemaVersion !== 1) {
    return 'Workflow graph schema version is unsupported.';
  }
  if (
    !Array.isArray(input.nodes) ||
    input.nodes.length < 2 ||
    input.nodes.length > MAX_NODES
  ) {
    return `Workflow graphs need 2 to ${MAX_NODES} nodes.`;
  }
  if (!Array.isArray(input.edges) || input.edges.length > MAX_EDGES) {
    return `Workflow graphs can contain at most ${MAX_EDGES} connections.`;
  }
  const graph = input as unknown as WorkflowGraph;
  const nodeIds = new Set<string>();
  for (const [index, node] of graph.nodes.entries()) {
    const error = nodeShapeError(node, index);
    if (error) return error;
    if (nodeIds.has(node.id)) return `Node id "${node.id}" is duplicated.`;
    nodeIds.add(node.id);
  }

  const triggers = graph.nodes.filter((node) => node.type === 'trigger');
  const ends = graph.nodes.filter((node) => node.type === 'end');
  if (triggers.length !== 1)
    return 'A workflow graph needs exactly one trigger node.';
  if (ends.length === 0) return 'A workflow graph needs at least one end node.';
  const trigger = triggers[0];
  const nodesById = new Map(graph.nodes.map((node) => [node.id, node]));
  const outgoing = new Map<string, WorkflowGraphEdge[]>();
  const incomingCount = new Map<string, number>();
  const edgeKeys = new Set<string>();

  for (const [index, edge] of graph.edges.entries()) {
    if (
      !isRecord(edge) ||
      typeof edge.source !== 'string' ||
      typeof edge.target !== 'string' ||
      !nodeIds.has(edge.source) ||
      !nodeIds.has(edge.target)
    ) {
      return `Connection ${index + 1} points to a missing node.`;
    }
    if (edge.port !== 'next' && edge.port !== 'true' && edge.port !== 'false') {
      return `Connection ${index + 1} has an unsupported output port.`;
    }
    const source = nodesById.get(edge.source)!;
    const expectedPort = source.type === 'condition' ? edge.port : 'next';
    if (edge.port !== expectedPort) {
      return `Connection ${index + 1} uses a port not available on its source node.`;
    }
    const key = `${edge.source}:${edge.port}:${edge.target}`;
    if (edgeKeys.has(key)) return `Connection ${index + 1} is duplicated.`;
    edgeKeys.add(key);
    const sourceEdges = outgoing.get(edge.source) ?? [];
    sourceEdges.push(edge);
    outgoing.set(edge.source, sourceEdges);
    incomingCount.set(edge.target, (incomingCount.get(edge.target) ?? 0) + 1);
  }

  if ((incomingCount.get(trigger.id) ?? 0) !== 0) {
    return 'The trigger node cannot have an incoming connection.';
  }

  for (const node of graph.nodes) {
    const edges = outgoing.get(node.id) ?? [];
    if (node.type === 'end' && edges.length > 0) {
      return `End node "${node.id}" cannot have outgoing connections.`;
    }
    if (node.type === 'condition') {
      if (
        node.conditionMode !== WorkflowConditionMode.all &&
        node.conditionMode !== WorkflowConditionMode.any
      ) {
        return `Condition node "${node.id}" has an unsupported match mode.`;
      }
      if (!Array.isArray(node.conditions) || node.conditions.length === 0) {
        return `Condition node "${node.id}" needs at least one condition.`;
      }
      if (
        edges.length !== 2 ||
        new Set(edges.map((edge) => edge.port)).size !== 2 ||
        !edges.some((edge) => edge.port === 'true') ||
        !edges.some((edge) => edge.port === 'false')
      ) {
        return `Condition node "${node.id}" needs one true and one false connection.`;
      }
    } else if (node.type !== 'end' && edges.length !== 1) {
      return `Node "${node.id}" needs exactly one outgoing connection.`;
    }
  }

  // Reuse the established trigger/action validator for action nodes, including customer-context
  // restrictions, message templates, custom-field values, approval copy and schedule rules.
  const actions = graphActions(graph);
  const nonApprovalActions = actions.filter(
    (action) => isRecord(action) && action.type !== 'request_approval',
  );
  const actionError = validateWorkflowDefinition(
    triggerKey,
    workflowName,
    [],
    nonApprovalActions,
    triggerKey === WorkflowTriggerKey.scheduled
      ? (scheduleEveryMinutes ?? 15)
      : undefined,
    scheduleCronExpression,
    scheduleTimezone,
    true,
  );
  if (actionError) return actionError;

  // Validate graph conditions against the catalog's actual trigger fields via the same validator.
  for (const node of graph.nodes) {
    if (node.type !== 'condition') continue;
    const conditionError = validateWorkflowDefinition(
      triggerKey,
      workflowName,
      node.conditions,
      [],
      triggerKey === WorkflowTriggerKey.scheduled
        ? (scheduleEveryMinutes ?? 15)
        : undefined,
      scheduleCronExpression,
      scheduleTimezone,
    );
    if (conditionError) return conditionError;
  }

  // Request-approval nodes bind to the actual downstream action path at runtime.
  for (const node of graph.nodes) {
    if (node.type !== 'action' || node.action.type !== 'request_approval')
      continue;
    const approval = node.action;
    if (
      typeof approval.title !== 'string' ||
      approval.title.trim().length === 0 ||
      Array.from(approval.title.trim()).length > 191 ||
      typeof approval.description !== 'string' ||
      approval.description.trim().length === 0 ||
      Array.from(approval.description.trim()).length > 2000
    ) {
      return `Approval node "${node.id}" needs a title and description.`;
    }
    const approvalError = validateWorkflowDefinition(
      triggerKey,
      workflowName,
      [],
      [
        ...actions.filter(
          (action) =>
            action.type === 'map_data' || action.type === 'get_variable',
        ),
        approval,
        { type: 'notify_owner', messageBody: 'Approval accepted' },
      ],
      triggerKey === WorkflowTriggerKey.scheduled
        ? (scheduleEveryMinutes ?? 15)
        : undefined,
      scheduleCronExpression,
      scheduleTimezone,
      true,
    );
    if (approvalError) return approvalError;
    const downstream = reachableNodeIds(
      outgoing,
      (outgoing.get(node.id) ?? []).map((edge) => edge.target),
    );
    if (
      !graph.nodes.some(
        (candidate) =>
          candidate.type === 'action' && downstream.has(candidate.id),
      )
    ) {
      return `Approval node "${node.id}" must lead to at least one later action.`;
    }
  }

  const visited = reachableNodeIds(outgoing, [trigger.id]);
  if (visited.size !== graph.nodes.length) {
    return 'Every graph node must be reachable from the trigger.';
  }
  if (
    ends.some((node) => !visited.has(node.id)) ||
    graph.nodes.some(
      (node) => node.type !== 'end' && !canReachEnd(node.id, outgoing, ends),
    )
  ) {
    return 'Every path through the workflow graph must lead to an end node.';
  }

  // Acyclic graphs are deterministic; future loop nodes must declare explicit bounds.
  const indegrees = new Map(
    graph.nodes.map((node) => [node.id, incomingCount.get(node.id) ?? 0]),
  );
  const queue = graph.nodes
    .filter((node) => indegrees.get(node.id) === 0)
    .map((node) => node.id);
  let visitedCount = 0;
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    visitedCount += 1;
    for (const edge of outgoing.get(nodeId) ?? []) {
      const degree = (indegrees.get(edge.target) ?? 0) - 1;
      indegrees.set(edge.target, degree);
      if (degree === 0) queue.push(edge.target);
    }
  }
  if (visitedCount !== graph.nodes.length) {
    return 'Workflow graph contains a cycle; loops must use a bounded loop node.';
  }
  const mappingDependencyError = validateMappedDataDependencies(
    graph,
    trigger.id,
    outgoing,
  );
  if (mappingDependencyError) return mappingDependencyError;
  const variableDependencyError = validateWorkflowVariableDependencies(
    graph,
    trigger.id,
    outgoing,
  );
  if (variableDependencyError) return variableDependencyError;
  return null;
}

function reachableNodeIds(
  outgoing: Map<string, WorkflowGraphEdge[]>,
  startIds: string[],
): Set<string> {
  const queue = [...startIds];
  const reached = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (reached.has(id)) continue;
    reached.add(id);
    for (const edge of outgoing.get(id) ?? []) queue.push(edge.target);
  }
  return reached;
}

function canReachEnd(
  startId: string,
  outgoing: Map<string, WorkflowGraphEdge[]>,
  ends: WorkflowGraphNode[],
): boolean {
  if (ends.some((end) => end.id === startId)) return true;
  const queue = [startId];
  const seen = new Set<string>();
  while (queue.length > 0) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    if (ends.some((end) => end.id === id)) return true;
    for (const edge of outgoing.get(id) ?? []) queue.push(edge.target);
  }
  return false;
}

export function workflowGraphActions(graph: WorkflowGraph): WorkflowAction[] {
  return graphActions(graph);
}

/** Resolve a deterministic path and preserve the exact action indexes for waits/retries. */
export function resolveWorkflowGraphPath(
  graph: WorkflowGraph,
  context: Record<string, unknown>,
): WorkflowGraphExecutionPlan {
  const actionIndexByNode = new Map<string, number>();
  let nextActionIndex = 0;
  for (const node of graph.nodes) {
    if (node.type === 'action')
      actionIndexByNode.set(node.id, nextActionIndex++);
  }
  const outgoing = new Map<string, WorkflowGraphEdge[]>();
  for (const edge of graph.edges) {
    const edges = outgoing.get(edge.source) ?? [];
    edges.push(edge);
    outgoing.set(edge.source, edges);
  }
  const trigger = graph.nodes.find((node) => node.type === 'trigger');
  if (!trigger) throw new Error('Workflow graph has no trigger node.');

  const actionIndexes: number[] = [];
  const visitedNodeIds: string[] = [];
  const decisions: WorkflowGraphExecutionPlan['decisions'] = [];
  const seen = new Set<string>();
  let currentId = trigger.id;
  while (true) {
    if (seen.has(currentId))
      throw new Error('Workflow graph contains a cycle.');
    seen.add(currentId);
    visitedNodeIds.push(currentId);
    const node = graph.nodes.find((candidate) => candidate.id === currentId);
    if (!node)
      throw new Error(`Workflow graph node "${currentId}" is missing.`);
    if (node.type === 'end') break;
    if (node.type === 'condition') {
      const matched = evaluateConditions(
        node.conditions,
        context,
        node.conditionMode,
      );
      const port = matched ? 'true' : 'false';
      decisions.push({ nodeId: node.id, result: port });
      const edge = (outgoing.get(node.id) ?? []).find(
        (candidate) => candidate.port === port,
      );
      if (!edge)
        throw new Error(
          `Workflow graph condition "${node.id}" has no ${port} path.`,
        );
      currentId = edge.target;
      continue;
    }
    if (node.type === 'action') {
      const actionIndex = actionIndexByNode.get(node.id);
      if (actionIndex === undefined)
        throw new Error('Workflow graph action index is missing.');
      actionIndexes.push(actionIndex);
    }
    const edge = (outgoing.get(node.id) ?? [])[0];
    if (!edge)
      throw new Error(`Workflow graph node "${node.id}" has no continuation.`);
    currentId = edge.target;
  }
  return { schemaVersion: 1, actionIndexes, visitedNodeIds, decisions };
}

export function parseWorkflowGraphExecutionPlan(
  value: unknown,
  actionCount: number,
): WorkflowGraphExecutionPlan | null {
  if (!isRecord(value) || value.schemaVersion !== 1) return null;
  if (
    !Array.isArray(value.actionIndexes) ||
    value.actionIndexes.some(
      (index) =>
        !Number.isInteger(index) ||
        Number(index) < 0 ||
        Number(index) >= actionCount,
    ) ||
    new Set(value.actionIndexes).size !== value.actionIndexes.length ||
    !Array.isArray(value.visitedNodeIds) ||
    !Array.isArray(value.decisions)
  ) {
    return null;
  }
  return value as unknown as WorkflowGraphExecutionPlan;
}
