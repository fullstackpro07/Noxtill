import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import {
  INVENTORY_AGENT_OUTCOMES_JOB,
  INVENTORY_AGENT_OUTCOMES_QUEUE,
} from './inventory-agent-outcomes.constants';
import { InventoryIntelligenceService } from './inventory-intelligence.service';

@Processor(INVENTORY_AGENT_OUTCOMES_QUEUE)
@Injectable()
export class InventoryAgentOutcomesProcessor extends WorkerHost {
  private readonly logger = new Logger(InventoryAgentOutcomesProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly inventory: InventoryIntelligenceService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== INVENTORY_AGENT_OUTCOMES_JOB) return;

    const businesses = await this.prisma.specialistAgentAction.findMany({
      where: {
        agentKey: 'inventory_intelligence',
        actionType: 'inventory_reorder_request',
        state: 'outcome_monitoring',
      },
      distinct: ['businessId'],
      orderBy: { businessId: 'asc' },
      select: { businessId: true },
    });
    for (const { businessId } of businesses) {
      try {
        const result =
          await this.inventory.advancePendingActionOutcomes(businessId);
        this.logger.log(
          `Inventory outcomes for ${businessId}: ${result.measured} measured, ${result.inconclusive} inconclusive, ${result.waiting} waiting.`,
        );
      } catch (error) {
        this.logger.error(
          `Inventory outcome check failed for business ${businessId}: ${(error as Error).message}`,
        );
      }
    }
  }
}
