import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  SPECIALIST_AGENT_ORCHESTRATION_QUEUE,
  SPECIALIST_AGENT_ORCHESTRATION_RECOVERY_PATTERN,
  SPECIALIST_AGENT_RETENTION_PATTERN,
} from './specialist-agent-orchestration.constants';

@Injectable()
export class SpecialistAgentOrchestrationScheduler implements OnModuleInit {
  private readonly logger = new Logger(
    SpecialistAgentOrchestrationScheduler.name,
  );

  constructor(
    @InjectQueue(SPECIALIST_AGENT_ORCHESTRATION_QUEUE)
    private readonly queue: Queue,
  ) {}

  onModuleInit() {
    this.queue
      .add(
        'recover',
        {},
        {
          repeat: {
            pattern: SPECIALIST_AGENT_ORCHESTRATION_RECOVERY_PATTERN,
            tz: 'UTC',
          },
          jobId: 'specialist-agent-orchestration-recovery',
          removeOnComplete: true,
        },
      )
      .catch((error: Error) =>
        this.logger.error(
          `Failed to register specialist orchestration recovery tick: ${error.message}`,
        ),
      );
    this.queue
      .add(
        'retention',
        {},
        {
          repeat: { pattern: SPECIALIST_AGENT_RETENTION_PATTERN, tz: 'UTC' },
          jobId: 'specialist-agent-retention-daily',
          removeOnComplete: true,
        },
      )
      .catch((error: Error) =>
        this.logger.error(
          `Failed to register specialist-agent retention tick: ${error.message}`,
        ),
      );
  }
}
