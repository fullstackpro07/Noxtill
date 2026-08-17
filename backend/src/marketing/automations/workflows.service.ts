import { HttpStatus, Injectable } from '@nestjs/common';
import { TenantPrismaService } from '../../common/tenancy/tenant-prisma.service';
import { AppException } from '../../common/filters/app.exception';
import {
  CreateWorkflowDto,
  UpdateWorkflowDto,
} from './dto/create-workflow.dto';
import { WORKFLOW_ERROR_CODES } from './workflows.constants';
import {
  evaluateConditions,
  WorkflowCondition,
} from './workflow-condition.util';
import { buildTriggerContext } from './workflow-context.util';
import { mapActivityEventToTriggerKey } from './workflow-trigger-map.util';
import { Prisma, WorkflowTriggerKey } from '@prisma/client';

/** Automations engine (UPD-BE-028) — authoring/CRUD half. Real dispatch lives in `WorkflowTriggerService`. */
@Injectable()
export class WorkflowsService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  create(businessId: string, dto: CreateWorkflowDto) {
    return this.tenantPrisma.client.workflow.create({
      data: {
        businessId,
        name: dto.name,
        triggerKey: dto.triggerKey,
        conditions: (dto.conditions ?? []) as Prisma.InputJsonValue,
        actions: (dto.actions ?? []) as Prisma.InputJsonValue,
      },
    });
  }

  list(triggerKey?: WorkflowTriggerKey) {
    return this.tenantPrisma.client.workflow.findMany({
      where: { triggerKey },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const workflow = await this.tenantPrisma.client.workflow.findUnique({
      where: { id },
    });
    if (!workflow) {
      throw new AppException(
        WORKFLOW_ERROR_CODES.NOT_FOUND,
        'Workflow not found',
        HttpStatus.NOT_FOUND,
      );
    }
    return workflow;
  }

  async update(id: string, dto: UpdateWorkflowDto) {
    await this.findOne(id);
    return this.tenantPrisma.client.workflow.update({
      where: { id },
      data: {
        name: dto.name,
        conditions:
          dto.conditions !== undefined
            ? (dto.conditions as Prisma.InputJsonValue)
            : undefined,
        actions:
          dto.actions !== undefined
            ? (dto.actions as Prisma.InputJsonValue)
            : undefined,
        active: dto.active,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.tenantPrisma.client.workflow.delete({ where: { id } });
  }

  async listRuns(workflowId: string) {
    await this.findOne(workflowId);
    return this.tenantPrisma.client.workflowRun.findMany({
      where: { workflowId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /**
   * Dry run (UPD-BE-028 acceptance criteria: "runs against real recent data without side
   * effects") — finds the most recent real `ActivityEvent` matching this workflow's trigger,
   * evaluates real conditions against it, and reports which actions WOULD run. Never calls
   * `SendGateService`, never writes a `WorkflowRun` row.
   */
  async test(id: string) {
    const workflow = await this.findOne(id);

    const recentEvents = await this.tenantPrisma.client.activityEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const matchingEvent = recentEvents.find(
      (event) =>
        mapActivityEventToTriggerKey(event.type, event.description) ===
        workflow.triggerKey,
    );

    if (!matchingEvent) {
      return {
        workflowId: workflow.id,
        triggerKey: workflow.triggerKey,
        foundRecentEvent: false,
        matched: false,
        context: null,
        wouldExecuteActions: [],
      };
    }

    const context = await buildTriggerContext(
      this.tenantPrisma.client,
      workflow.triggerKey,
      {
        description: matchingEvent.description,
        entityType: matchingEvent.entityType,
        entityId: matchingEvent.entityId,
        amount: matchingEvent.amount ? Number(matchingEvent.amount) : undefined,
      },
    );

    const conditions = (workflow.conditions ??
      []) as unknown as WorkflowCondition[];
    const matched = evaluateConditions(conditions, context);

    return {
      workflowId: workflow.id,
      triggerKey: workflow.triggerKey,
      foundRecentEvent: true,
      sourceEventId: matchingEvent.id,
      matched,
      context,
      wouldExecuteActions: matched ? workflow.actions : [],
    };
  }
}
