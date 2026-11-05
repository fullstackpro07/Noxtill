import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  INVENTORY_AGENT_OUTCOMES_JOB,
  INVENTORY_AGENT_OUTCOMES_QUEUE,
} from './inventory-agent-outcomes.constants';

/** Daily follow-up checks advance Inventory actions only after canonical receipt evidence exists. */
@Injectable()
export class InventoryAgentOutcomesScheduler implements OnModuleInit {
  private readonly logger = new Logger(InventoryAgentOutcomesScheduler.name);

  constructor(
    @InjectQueue(INVENTORY_AGENT_OUTCOMES_QUEUE) private readonly queue: Queue,
  ) {}

  onModuleInit() {
    this.queue
      .add(
        INVENTORY_AGENT_OUTCOMES_JOB,
        {},
        {
          repeat: { pattern: '0 3 * * *', tz: 'UTC' },
          jobId: 'inventory-agent-outcomes-daily',
        },
      )
      .catch((error: Error) =>
        this.logger.error(
          `Failed to register Inventory Agent outcome checks: ${error.message}`,
        ),
      );
  }
}
