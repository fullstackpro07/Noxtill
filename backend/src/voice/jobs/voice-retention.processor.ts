import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from '../../common/storage/s3.service';
import { VoiceHumanAgentDispatchService } from '../voice-human-agent-dispatch.service';
import {
  VOICE_RETENTION_QUEUE,
  RECORDING_RETENTION_DAYS,
} from '../voice.constants';

interface CallTurn {
  recordingKey?: string;
}

/**
 * Daily recording/transcript purge (UPD-BE-059's "retention tied to Data & Privacy rules") — a
 * call and everything about it (transcript text, every turn's S3 recording) is deleted together
 * when its recorded policy expiry is reached, or after the default retention for legacy rows.
 * Live calls are never deleted. Runs outside any request context, same per-row try/catch
 * convention as every other background job in this app.
 */
@Processor(VOICE_RETENTION_QUEUE)
export class VoiceRetentionProcessor extends WorkerHost {
  private readonly logger = new Logger(VoiceRetentionProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly humanAgentDispatch: VoiceHumanAgentDispatchService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === 'expire-agent-reservations') {
      return this.releaseExpiredAgentReservations();
    }
    if (job.name === 'tick') return this.runPurge();
  }

  async releaseExpiredAgentReservations(): Promise<void> {
    const result = await this.humanAgentDispatch.releaseExpiredOffers();
    if (result.count > 0) {
      this.logger.debug(
        `Released ${result.count} expired human-agent call reservation(s)`,
      );
    }
  }

  async runPurge(): Promise<void> {
    const now = new Date();
    const cutoff = new Date(
      now.getTime() - RECORDING_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    const expired = await this.prisma.phoneCall.findMany({
      where: {
        status: { not: 'in_progress' },
        OR: [
          { recordingExpiresAt: { lte: now } },
          {
            recordingExpiresAt: null,
            startedAt: { lt: cutoff },
          },
        ],
      },
    });

    let purged = 0;
    for (const call of expired) {
      try {
        const turns = (call.transcript as unknown as CallTurn[]) ?? [];
        const recordingKeys = new Set(
          [
            call.recordingKey,
            ...turns.map((turn) => turn.recordingKey ?? null),
          ].filter((key): key is string => Boolean(key)),
        );
        for (const recordingKey of recordingKeys) {
          await this.s3.delete(recordingKey);
        }
        await this.prisma.phoneCall.delete({ where: { id: call.id } });
        purged += 1;
      } catch (error) {
        this.logger.warn(
          `Voice retention purge failed for call ${call.id}: ${(error as Error).message}`,
        );
      }
    }

    this.logger.debug(
      `Voice retention purge removed ${purged}/${expired.length} expired call(s)`,
    );
  }
}
