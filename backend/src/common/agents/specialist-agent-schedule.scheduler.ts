import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { SPECIALIST_AGENT_SCHEDULE_QUEUE } from './specialist-agent-schedules.constants';

/** The hourly tick also catches up opt-ins after an application restart. */
@Injectable()
export class SpecialistAgentScheduleScheduler implements OnModuleInit {
  private readonly logger = new Logger(SpecialistAgentScheduleScheduler.name);

  constructor(
    @InjectQueue(SPECIALIST_AGENT_SCHEDULE_QUEUE) private readonly queue: Queue,
  ) {}

  onModuleInit() {
    this.queue
      .add(
        'tick',
        {},
        {
          repeat: { pattern: '0 * * * *', tz: 'UTC' },
          jobId: 'specialist-agent-hourly-tick',
        },
      )
      .catch((error: Error) =>
        this.logger.error(
          `Failed to register specialist-agent schedule tick: ${error.message}`,
        ),
      );
  }
}
