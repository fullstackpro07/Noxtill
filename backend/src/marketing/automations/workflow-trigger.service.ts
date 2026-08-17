import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { SendGateService } from '../../messaging/send-gate.service';
import {
  evaluateConditions,
  WorkflowCondition,
} from './workflow-condition.util';
import { WorkflowAction } from './workflow-action.util';
import { buildTriggerContext, TriggerEvent } from './workflow-context.util';
import { mapActivityEventToTriggerKey } from './workflow-trigger-map.util';
import { AUTOMATION_MESSAGE_TEMPLATE_KEY } from './workflows.constants';
import {
  ActivityEventType,
  Prisma,
  Role,
  WorkflowRunStatus,
} from '../../../generated/prisma';

/**
 * Automations engine (UPD-BE-028) trigger dispatch — real, synchronous, in-process (deliberately
 * NOT queue/pub-sub based, unlike every notification send in this codebase): this codebase's
 * message queue retries indefinitely against an unreachable Redis, which would make an
 * automation trigger silently never fire rather than fail fast. Callers must never `await` this
 * (see `ActivityService.record()`), since the `send_customer_message`/`notify_owner` actions it
 * may run internally go through `SendGateService`, which CAN still hang on that same Redis
 * condition — dispatch fires and forgets so a business's custom automation can never block the
 * real mutation (sale/booking/review/...) that triggered it.
 */
@Injectable()
export class WorkflowTriggerService {
  private readonly logger = new Logger(WorkflowTriggerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly sendGate: SendGateService,
  ) {}

  async dispatch(
    businessId: string,
    type: ActivityEventType,
    event: TriggerEvent,
  ): Promise<void> {
    const triggerKey = mapActivityEventToTriggerKey(type, event.description);
    if (!triggerKey) return;

    const workflows = await this.prisma.workflow.findMany({
      where: { businessId, triggerKey, active: true },
    });
    if (workflows.length === 0) return;

    const context = await buildTriggerContext(this.prisma, triggerKey, event);

    for (const workflow of workflows) {
      await this.runWorkflow(businessId, workflow, context).catch(
        (error: Error) =>
          this.logger.warn(
            `Workflow ${workflow.id} run failed for business ${businessId}: ${error.message}`,
          ),
      );
    }
  }

  private async runWorkflow(
    businessId: string,
    workflow: {
      id: string;
      conditions: Prisma.JsonValue;
      actions: Prisma.JsonValue;
    },
    context: Record<string, unknown>,
  ): Promise<void> {
    const conditions = (workflow.conditions ??
      []) as unknown as WorkflowCondition[];
    const matched = evaluateConditions(conditions, context);

    if (!matched) {
      await this.prisma.workflowRun.create({
        data: {
          workflowId: workflow.id,
          businessId,
          status: WorkflowRunStatus.skipped,
          context: context as Prisma.InputJsonValue,
        },
      });
      return;
    }

    const actions = (workflow.actions ?? []) as unknown as WorkflowAction[];
    try {
      const result = await this.executeActions(businessId, actions, context);
      await this.prisma.workflowRun.create({
        data: {
          workflowId: workflow.id,
          businessId,
          status: WorkflowRunStatus.success,
          context: context as Prisma.InputJsonValue,
          result: result as unknown as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      await this.prisma.workflowRun.create({
        data: {
          workflowId: workflow.id,
          businessId,
          status: WorkflowRunStatus.failed,
          context: context as Prisma.InputJsonValue,
          error: (error as Error).message,
        },
      });
    }
  }

  private async executeActions(
    businessId: string,
    actions: WorkflowAction[],
    context: Record<string, unknown>,
  ): Promise<Array<Record<string, unknown>>> {
    const results: Array<Record<string, unknown>> = [];

    for (const action of actions) {
      if (action.type === 'send_customer_message') {
        const customerId = context.customerId as string | undefined;
        if (!customerId) {
          results.push({
            type: action.type,
            skipped: true,
            reason: 'no customer in context',
          });
          continue;
        }
        try {
          await this.sendGate.send({
            businessId,
            customerId,
            templateKey: AUTOMATION_MESSAGE_TEMPLATE_KEY,
            variables: { body: action.messageBody },
          });
          results.push({ type: action.type, sent: true, customerId });
        } catch (error) {
          results.push({
            type: action.type,
            sent: false,
            error: (error as Error).message,
          });
        }
      } else if (action.type === 'notify_owner') {
        const owner = await this.prisma.businessUser.findFirst({
          where: { businessId, role: Role.owner },
          include: { user: true },
        });
        if (!owner) {
          results.push({
            type: action.type,
            skipped: true,
            reason: 'no owner found',
          });
          continue;
        }
        try {
          await this.sendGate.send({
            businessId,
            templateKey: AUTOMATION_MESSAGE_TEMPLATE_KEY,
            to: {
              phone: owner.user.phone ?? undefined,
              email: owner.user.email ?? undefined,
            },
            variables: { body: action.messageBody },
          });
          results.push({ type: action.type, sent: true });
        } catch (error) {
          results.push({
            type: action.type,
            sent: false,
            error: (error as Error).message,
          });
        }
      }
    }

    return results;
  }
}
