import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { BACKUP_QUEUE } from './backup.constants';

/** Checks hourly which businesses are due a backup (each gets at most one a day). */
@Injectable()
export class BackupScheduler implements OnModuleInit {
  private readonly logger = new Logger(BackupScheduler.name);

  constructor(@InjectQueue(BACKUP_QUEUE) private readonly queue: Queue) {}

  onModuleInit() {
    this.queue
      .add('check', {}, { repeat: { pattern: '0 * * * *' }, jobId: 'backup-hourly-check' })
      .catch((error: Error) => this.logger.error(`Failed to register the backup check job: ${error.message}`));
  }
}
