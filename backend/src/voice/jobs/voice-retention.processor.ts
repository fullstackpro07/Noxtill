import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { S3Service } from '../../common/storage/s3.service';
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
 * once it's older than `RECORDING_RETENTION_DAYS`. Runs outside any request context, same
 * per-row try/catch convention as every other background job in this app.
 */
@Processor(VOICE_RETENTION_QUEUE)
export class VoiceRetentionProcessor extends WorkerHost {
  private readonly logger = new Logger(VoiceRetentionProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'tick') return;
    return this.runPurge();
  }

  async runPurge(): Promise<void> {
    const cutoff = new Date(
      Date.now() - RECORDING_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    const expired = await this.prisma.phoneCall.findMany({
      where: { startedAt: { lt: cutoff } },
    });

    let purged = 0;
    for (const call of expired) {
      try {
        const turns = (call.transcript as unknown as CallTurn[]) ?? [];
        for (const turn of turns) {
          if (turn.recordingKey) {
            await this.s3.delete(turn.recordingKey);
          }
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
