import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { VOICE_PROVIDER_COST_QUEUE } from '../voice.constants';

/** Hourly (11 past) repeatable tick — Twilio usually has a call's real price within minutes of it ending. */
@Injectable()
export class VoiceProviderCostScheduler implements OnModuleInit {
  private readonly logger = new Logger(VoiceProviderCostScheduler.name);

  constructor(
    @InjectQueue(VOICE_PROVIDER_COST_QUEUE) private readonly queue: Queue,
  ) {}

  onModuleInit() {
    this.queue
      .add(
        'tick',
        {},
        {
          repeat: { pattern: '11 * * * *' },
          jobId: 'voice-provider-cost-hourly-tick',
        },
      )
      .catch((error: Error) =>
        this.logger.error(
          `Failed to register voice-provider-cost tick: ${error.message}`,
        ),
      );
  }
}
