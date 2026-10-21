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
        'monitor-operations',
        {},
        {
          repeat: { pattern: '*/5 * * * *' },
          jobId: 'voice-monitor-operations-every-5-minutes',
        },
      )
      .catch((error: Error) =>
        this.logger.error(
          `Failed to register voice monitoring: ${error.message}`,
        ),
      );
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

    this.queue
      .add(
        'expire-agent-reservations',
        {},
        {
          repeat: { pattern: '* * * * *' },
          jobId: 'voice-agent-reservations-expire-every-minute',
        },
      )
      .catch((error: Error) =>
        this.logger.error(
          `Failed to register human-agent reservation expiry: ${error.message}`,
        ),
      );

    // Approved outbound campaigns start when their schedule arrives.
    this.queue
      .add(
        'start-scheduled-campaigns',
        {},
        {
          repeat: { pattern: '* * * * *' },
          jobId: 'voice-outbound-scheduled-start-every-minute',
        },
      )
      .catch((error: Error) =>
        this.logger.error(
          `Failed to register scheduled campaign start: ${error.message}`,
        ),
      );

    // Post-call transcript redaction for businesses that enabled `voice.redactTranscripts`.
    // External operations alerts (OPS_ALERT_WEBHOOK_URL); each source alert is sent once.
    this.queue
      .add(
        'forward-ops-alerts',
        {},
        {
          repeat: { pattern: '* * * * *' },
          jobId: 'voice-ops-alert-forwarding-every-minute',
        },
      )
      .catch((error: Error) =>
        this.logger.error(
          `Failed to register operations alert forwarding: ${error.message}`,
        ),
      );

    // Phone-number recurring fees: idempotent per number per UTC month, so a daily run is safe.
    this.queue
      .add(
        'record-number-fees',
        {},
        {
          repeat: { pattern: '40 0 * * *' },
          jobId: 'voice-number-fees-daily',
        },
      )
      .catch((error: Error) =>
        this.logger.error(
          `Failed to register phone-number fee metering: ${error.message}`,
        ),
      );

    this.queue
      .add(
        'redact-transcripts',
        {},
        {
          repeat: { pattern: '*/5 * * * *' },
          jobId: 'voice-transcript-redaction-every-5-minutes',
        },
      )
      .catch((error: Error) =>
        this.logger.error(
          `Failed to register transcript redaction: ${error.message}`,
        ),
      );

    // Recover call outcomes if Twilio's terminal status callback was lost.
    this.queue
      .add(
        'reconcile-orphaned-calls',
        {},
        {
          repeat: { pattern: '*/5 * * * *' },
          jobId: 'voice-orphaned-call-reconciliation-every-5-minutes',
        },
      )
      .catch((error: Error) =>
        this.logger.error(
          `Failed to register voice call reconciliation tick: ${error.message}`,
        ),
      );

    this.queue
      .add(
        'retry-provider-webhook-events',
        {},
        {
          repeat: { pattern: '*/5 * * * *' },
          jobId: 'voice-provider-webhook-retry-every-5-minutes',
        },
      )
      .catch((error: Error) =>
        this.logger.error(
          `Failed to register provider webhook retry tick: ${error.message}`,
        ),
      );
  }
}
