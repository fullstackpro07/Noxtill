import { HttpStatus, Injectable } from '@nestjs/common';
import {
  Prisma,
  VoiceIvrFlowStatus,
  VoiceIvrFlowVersionStatus,
} from '@prisma/client';
import { AuditService } from '../common/audit/audit.service';
import { AppException } from '../common/filters/app.exception';
import { TenantPrismaService } from '../common/tenancy/tenant-prisma.service';
import {
  CreateVoiceIvrFlowDto,
  PublishVoiceIvrFlowDto,
  RollbackVoiceIvrFlowDto,
  SaveVoiceIvrDraftDto,
  SimulateVoiceIvrFlowDto,
  VOICE_IVR_NODE_TYPES,
} from './dto/voice-ivr.dto';

type IvrNodeType = (typeof VOICE_IVR_NODE_TYPES)[number];
export interface VoiceIvrNode {
  id: string;
  type: IvrNodeType;
  label: string;
  config?: Record<string, unknown>;
}
export interface VoiceIvrEdge {
  id: string;
  from: string;
  to: string;
  condition: string;
}
export interface VoiceIvrGraph {
  nodes: VoiceIvrNode[];
  edges: VoiceIvrEdge[];
}

const DEFAULT_GRAPH: VoiceIvrGraph = {
  nodes: [
    { id: 'start', type: 'start', label: 'Start', config: {} },
    { id: 'end', type: 'end', label: 'End', config: {} },
  ],
  edges: [
    { id: 'start-to-end', from: 'start', to: 'end', condition: 'default' },
  ],
};
const BRANCHING_TYPES = new Set<IvrNodeType>([
  'get_dtmf',
  'speech_intent',
  'business_hours',
  'branch',
  'condition',
  'lookup',
]);

@Injectable()
export class VoiceIvrService {
  constructor(
    private readonly tenantPrisma: TenantPrismaService,
    private readonly audit: AuditService,
  ) {}

  list(businessId: string) {
    return this.tenantPrisma.client.voiceIvrFlow.findMany({
      where: { businessId },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
      include: {
        versions: {
          orderBy: { version: 'desc' },
          take: 1,
          select: { version: true, publishedAt: true, changeSummary: true },
        },
      },
    });
  }

  async detail(businessId: string, flowId: string) {
    const flow = await this.findFlow(businessId, flowId);
    const versions =
      await this.tenantPrisma.client.voiceIvrFlowVersion.findMany({
        where: { businessId, flowId },
        orderBy: { version: 'desc' },
        take: 30,
        select: {
          id: true,
          version: true,
          status: true,
          changeSummary: true,
          rollbackSourceVersion: true,
          publishedAt: true,
          createdByUserId: true,
        },
      });
    return { ...flow, versions };
  }

  async create(
    businessId: string,
    actorUserId: string,
    dto: CreateVoiceIvrFlowDto,
  ) {
    const flow = await this.tenantPrisma.client.voiceIvrFlow.create({
      data: {
        businessId,
        name: dto.name.trim(),
        draftGraph: DEFAULT_GRAPH as unknown as Prisma.InputJsonValue,
        createdByUserId: actorUserId,
      },
    });
    await this.audit.log({
      entity: 'VoiceIvrFlow',
      entityId: flow.id,
      action: 'voice.ivr.flow_created',
      after: { name: flow.name, graphNodeCount: 2, actorUserId },
    });
    return flow;
  }

  async saveDraft(
    businessId: string,
    actorUserId: string,
    flowId: string,
    dto: SaveVoiceIvrDraftDto,
  ) {
    const flow = await this.findFlow(businessId, flowId);
    this.assertRevision(flow.revision, dto.expectedRevision);
    const graph = this.normalizeGraph(dto.graph);
    const updated = await this.tenantPrisma.client.voiceIvrFlow.updateMany({
      where: {
        id: flowId,
        businessId,
        revision: dto.expectedRevision,
        status: {
          in: [VoiceIvrFlowStatus.draft, VoiceIvrFlowStatus.published],
        },
      },
      data: {
        draftGraph: graph as unknown as Prisma.InputJsonValue,
        revision: { increment: 1 },
        status: VoiceIvrFlowStatus.draft,
      },
    });
    if (updated.count !== 1) this.throwConflict();
    await this.audit.log({
      entity: 'VoiceIvrFlow',
      entityId: flowId,
      action: 'voice.ivr.draft_saved',
      before: { revision: flow.revision },
      after: {
        revision: flow.revision + 1,
        nodeCount: graph.nodes.length,
        edgeCount: graph.edges.length,
        actorUserId,
      },
    });
    return this.findFlow(businessId, flowId);
  }

  async validate(businessId: string, actorUserId: string, flowId: string) {
    const flow = await this.findFlow(businessId, flowId);
    const result = this.validateGraph(this.asGraph(flow.draftGraph));
    await this.audit.log({
      entity: 'VoiceIvrFlow',
      entityId: flowId,
      action: 'voice.ivr.graph_validated',
      after: {
        valid: result.valid,
        errors: result.errors.map((issue) => issue.code),
        actorUserId,
      },
    });
    return result;
  }

  async simulate(
    businessId: string,
    actorUserId: string,
    flowId: string,
    input: SimulateVoiceIvrFlowDto,
  ) {
    const flow = await this.findFlow(businessId, flowId);
    const graph = this.asGraph(flow.draftGraph);
    const validation = this.validateGraph(graph);
    if (!validation.valid) {
      const result = {
        valid: false,
        validation,
        trace: [],
        outcome: 'not_simulated',
      };
      await this.audit.log({
        entity: 'VoiceIvrFlow',
        entityId: flowId,
        action: 'voice.ivr.simulation_run',
        after: { outcome: result.outcome, actorUserId },
      });
      return result;
    }
    const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
    const edgesByFrom = new Map<string, VoiceIvrEdge[]>();
    for (const edge of graph.edges) {
      edgesByFrom.set(edge.from, [...(edgesByFrom.get(edge.from) ?? []), edge]);
    }
    const trace: Array<{ nodeId: string; type: IvrNodeType; label: string }> =
      [];
    let current = graph.nodes.find((node) => node.type === 'start')!;
    for (let step = 0; step <= graph.nodes.length; step += 1) {
      trace.push({
        nodeId: current.id,
        type: current.type,
        label: current.label,
      });
      if (current.type === 'end') {
        return this.recordSimulation(businessId, actorUserId, flowId, {
          valid: true,
          validation,
          trace,
          outcome: 'reached_end',
        });
      }
      const outgoing = edgesByFrom.get(current.id) ?? [];
      if (outgoing.length === 0) {
        return this.recordSimulation(businessId, actorUserId, flowId, {
          valid: true,
          validation,
          trace,
          outcome: 'no_matching_route',
        });
      }
      const selected = this.selectEdge(current.type, outgoing, input);
      if (!selected) {
        return this.recordSimulation(businessId, actorUserId, flowId, {
          valid: true,
          validation,
          trace,
          outcome: 'no_matching_route',
        });
      }
      current = nodes.get(selected.to)!;
    }
    return this.recordSimulation(businessId, actorUserId, flowId, {
      valid: true,
      validation,
      trace,
      outcome: 'step_limit_reached',
    });
  }

  async publish(
    businessId: string,
    actorUserId: string,
    flowId: string,
    dto: PublishVoiceIvrFlowDto,
  ) {
    const flow = await this.findFlow(businessId, flowId);
    this.assertRevision(flow.revision, dto.expectedRevision);
    const graph = this.asGraph(flow.draftGraph);
    const validation = this.validateGraph(graph);
    if (!validation.valid) {
      throw new AppException(
        'VOICE_IVR_GRAPH_INVALID',
        `Cannot publish this IVR graph: ${validation.errors.map((issue) => issue.message).join(' ')}`,
        HttpStatus.BAD_REQUEST,
      );
    }
    const latest = await this.tenantPrisma.client.voiceIvrFlowVersion.aggregate(
      {
        where: { businessId, flowId },
        _max: { version: true },
      },
    );
    const version = (latest._max.version ?? 0) + 1;
    await this.persistPublishedVersion({
      businessId,
      actorUserId,
      flowId,
      expectedRevision: dto.expectedRevision,
      graph,
      version,
      status: VoiceIvrFlowVersionStatus.published,
      changeSummary: dto.changeSummary.trim(),
    });
    return this.detail(businessId, flowId);
  }

  async rollback(
    businessId: string,
    actorUserId: string,
    flowId: string,
    dto: RollbackVoiceIvrFlowDto,
  ) {
    const flow = await this.findFlow(businessId, flowId);
    this.assertRevision(flow.revision, dto.expectedRevision);
    const target = await this.tenantPrisma.client.voiceIvrFlowVersion.findFirst(
      {
        where: { businessId, flowId, version: dto.version },
      },
    );
    if (!target) {
      throw new AppException(
        'VOICE_IVR_VERSION_NOT_FOUND',
        'That published IVR version was not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    const graph = this.asGraph(target.graph);
    const validation = this.validateGraph(graph);
    if (!validation.valid) {
      throw new AppException(
        'VOICE_IVR_GRAPH_INVALID',
        'That historical version no longer passes current validation.',
        HttpStatus.CONFLICT,
      );
    }
    const latest = await this.tenantPrisma.client.voiceIvrFlowVersion.aggregate(
      {
        where: { businessId, flowId },
        _max: { version: true },
      },
    );
    const version = (latest._max.version ?? 0) + 1;
    const result = await this.persistPublishedVersion({
      businessId,
      actorUserId,
      flowId,
      expectedRevision: dto.expectedRevision,
      graph,
      version,
      status: VoiceIvrFlowVersionStatus.rollback,
      changeSummary: dto.reason.trim(),
      rollbackSourceVersion: target.version,
      updateDraft: true,
    });
    return result;
  }

  private async persistPublishedVersion(input: {
    businessId: string;
    actorUserId: string;
    flowId: string;
    expectedRevision: number;
    graph: VoiceIvrGraph;
    version: number;
    status: VoiceIvrFlowVersionStatus;
    changeSummary: string;
    rollbackSourceVersion?: number;
    updateDraft?: boolean;
  }) {
    await this.tenantPrisma.client.$transaction(async (tx) => {
      const updated = await tx.voiceIvrFlow.updateMany({
        where: {
          id: input.flowId,
          businessId: input.businessId,
          revision: input.expectedRevision,
        },
        data: {
          status: VoiceIvrFlowStatus.published,
          publishedVersion: input.version,
          revision: { increment: 1 },
          ...(input.updateDraft
            ? {
                draftGraph: input.graph as unknown as Prisma.InputJsonValue,
              }
            : {}),
        },
      });
      if (updated.count !== 1) this.throwConflict();
      await tx.voiceIvrFlowVersion.create({
        data: {
          businessId: input.businessId,
          flowId: input.flowId,
          version: input.version,
          graph: input.graph as unknown as Prisma.InputJsonValue,
          status: input.status,
          changeSummary: input.changeSummary,
          rollbackSourceVersion: input.rollbackSourceVersion ?? null,
          createdByUserId: input.actorUserId,
        },
      });
    });
    await this.audit.log({
      entity: 'VoiceIvrFlow',
      entityId: input.flowId,
      action:
        input.status === VoiceIvrFlowVersionStatus.rollback
          ? 'voice.ivr.version_rolled_back'
          : 'voice.ivr.version_published',
      after: {
        version: input.version,
        rollbackSourceVersion: input.rollbackSourceVersion ?? null,
        changeSummary: input.changeSummary,
        runtimeActivated: true,
        appliesTo: 'new_inbound_calls_only',
        actorUserId: input.actorUserId,
      },
    });
    return this.detail(input.businessId, input.flowId);
  }

  private validateGraph(graph: VoiceIvrGraph) {
    const errors: Array<{ code: string; message: string; nodeId?: string }> =
      [];
    const ids = new Set<string>();
    for (const node of graph.nodes) {
      if (ids.has(node.id)) {
        errors.push({
          code: 'duplicate_node_id',
          message: `Duplicate node id: ${node.id}`,
          nodeId: node.id,
        });
      }
      ids.add(node.id);
    }
    const startNodes = graph.nodes.filter((node) => node.type === 'start');
    if (startNodes.length !== 1) {
      errors.push({
        code: 'start_node_count',
        message: 'The flow must contain exactly one Start node.',
      });
    }
    const edgeIds = new Set<string>();
    const outgoing = new Map<string, VoiceIvrEdge[]>();
    const incoming = new Map<string, number>();
    for (const edge of graph.edges) {
      if (edgeIds.has(edge.id)) {
        errors.push({
          code: 'duplicate_edge_id',
          message: `Duplicate edge id: ${edge.id}`,
        });
      }
      edgeIds.add(edge.id);
      if (!ids.has(edge.from) || !ids.has(edge.to)) {
        errors.push({
          code: 'invalid_edge_target',
          message: `Route ${edge.id} points to a node that does not exist.`,
        });
        continue;
      }
      outgoing.set(edge.from, [...(outgoing.get(edge.from) ?? []), edge]);
      incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
      if (edge.from === edge.to) {
        errors.push({
          code: 'unbounded_cycle',
          message: 'A route cannot loop to itself.',
          nodeId: edge.from,
        });
      }
    }
    if (startNodes.length === 1 && (incoming.get(startNodes[0].id) ?? 0) > 0) {
      errors.push({
        code: 'start_has_incoming_route',
        message: 'The Start node cannot have an incoming route.',
        nodeId: startNodes[0].id,
      });
    }
    for (const node of graph.nodes) {
      const routes = outgoing.get(node.id) ?? [];
      if (
        BRANCHING_TYPES.has(node.type) &&
        !routes.some((edge) => edge.condition === 'default')
      ) {
        errors.push({
          code: 'fallback_missing',
          message: `${node.label} needs a default/fallback route.`,
          nodeId: node.id,
        });
      }
    }
    if (startNodes.length === 1) {
      const reachable = new Set<string>();
      const visit = (nodeId: string, active: Set<string>) => {
        if (active.has(nodeId)) {
          errors.push({
            code: 'unbounded_cycle',
            message: 'The flow contains a cycle without a bounded exit.',
            nodeId,
          });
          return;
        }
        if (reachable.has(nodeId)) return;
        reachable.add(nodeId);
        const nextActive = new Set(active).add(nodeId);
        for (const edge of outgoing.get(nodeId) ?? [])
          visit(edge.to, nextActive);
      };
      visit(startNodes[0].id, new Set());
      for (const node of graph.nodes) {
        if (!reachable.has(node.id)) {
          errors.push({
            code:
              node.type === 'disclosure' && node.config?.required === true
                ? 'mandatory_disclosure_unreachable'
                : 'unreachable_node',
            message:
              node.type === 'disclosure' && node.config?.required === true
                ? `Required disclosure “${node.label}” cannot be reached from Start.`
                : `${node.label} cannot be reached from Start.`,
            nodeId: node.id,
          });
        }
      }
    }
    return { valid: errors.length === 0, errors, warnings: [] as string[] };
  }

  private selectEdge(
    type: IvrNodeType,
    outgoing: VoiceIvrEdge[],
    input: SimulateVoiceIvrFlowDto,
  ) {
    let condition: string | undefined;
    if (type === 'get_dtmf' && input.dtmf) condition = `dtmf:${input.dtmf}`;
    else if (type === 'speech_intent' && input.intent)
      condition = `intent:${input.intent}`;
    else if (type === 'business_hours' && input.businessHours)
      condition = `business_hours:${input.businessHours}`;
    else if (['branch', 'condition', 'lookup'].includes(type) && input.value)
      condition = `value:${input.value}`;
    return (
      outgoing.find((edge) => edge.condition === condition) ??
      outgoing.find((edge) => edge.condition === 'default')
    );
  }

  private async recordSimulation<
    T extends { outcome: string; trace: unknown[] },
  >(
    businessId: string,
    actorUserId: string,
    flowId: string,
    result: T,
  ): Promise<T> {
    await this.audit.log({
      entity: 'VoiceIvrFlow',
      entityId: flowId,
      action: 'voice.ivr.simulation_run',
      after: {
        outcome: result.outcome,
        traversedNodeIds: result.trace.map(
          (item) => (item as { nodeId: string }).nodeId,
        ),
        actorUserId,
        runtimeActivated: false,
      },
    });
    void businessId;
    return result;
  }

  private normalizeGraph(input: SaveVoiceIvrDraftDto['graph']): VoiceIvrGraph {
    const graph = input;
    if (
      !Array.isArray(graph.nodes) ||
      !Array.isArray(graph.edges) ||
      graph.nodes.length === 0 ||
      graph.nodes.length > 100 ||
      graph.edges.length > 200
    ) {
      throw new AppException(
        'VOICE_IVR_GRAPH_SIZE_INVALID',
        'An IVR draft needs 1–100 nodes and no more than 200 routes.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const allowed = new Set<string>(VOICE_IVR_NODE_TYPES);
    for (const node of graph.nodes) {
      if (!node.id?.trim() || !allowed.has(node.type) || !node.label?.trim()) {
        throw new AppException(
          'VOICE_IVR_NODE_INVALID',
          'Each IVR node needs a supported type, id and label.',
          HttpStatus.BAD_REQUEST,
        );
      }
    }
    return {
      nodes: graph.nodes.map((node) => ({
        ...node,
        id: node.id.trim(),
        label: node.label.trim(),
        config: node.config ?? {},
      })),
      edges: graph.edges.map((edge) => ({
        ...edge,
        id: edge.id.trim(),
        from: edge.from.trim(),
        to: edge.to.trim(),
        condition: edge.condition.trim(),
      })),
    };
  }

  private asGraph(value: Prisma.JsonValue): VoiceIvrGraph {
    return value as unknown as VoiceIvrGraph;
  }

  private async findFlow(businessId: string, flowId: string) {
    const flow = await this.tenantPrisma.client.voiceIvrFlow.findFirst({
      where: { id: flowId, businessId },
    });
    if (!flow) {
      throw new AppException(
        'VOICE_IVR_FLOW_NOT_FOUND',
        'IVR flow not found.',
        HttpStatus.NOT_FOUND,
      );
    }
    return flow;
  }

  private assertRevision(actual: number, expected: number) {
    if (actual !== expected) this.throwConflict();
  }

  private throwConflict(): never {
    throw new AppException(
      'VOICE_IVR_REVISION_CONFLICT',
      'This IVR draft changed since you opened it. Reload the latest version and try again.',
      HttpStatus.CONFLICT,
    );
  }
}
