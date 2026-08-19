import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { VOICE_RETENTION_QUEUE } from '../voice.constants';

/** Daily (03:30) repeatable tick — before the marketing/dashboard weekly ticks so retention runs consistently early. */
@Injectable()
export class VoiceRetentionScheduler implements OnModuleInit {
  private readonly logger = new Logger(VoiceRetentionScheduler.name);

  constructor(
    @InjectQueue(VOICE_RETENTION_QUEUE) private readonly queue: Queue,
  ) {}

  onModuleInit() {
    this.queue
      .add(
        'tick',
        {},
        {
          repeat: { pattern: '30 3 * * *' },
          jobId: 'voice-retention-daily-tick',
        },
      )
      .catch((error: Error) =>
        this.logger.error(
          `Failed to register voice-retention tick: ${error.message}`,
        ),
      );
  }
}
