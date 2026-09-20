import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { BackupService } from './backup.service';
import { BACKUP_QUEUE } from './backup.constants';

@Processor(BACKUP_QUEUE)
export class BackupProcessor extends WorkerHost {
  private readonly logger = new Logger(BackupProcessor.name);

  constructor(private readonly backups: BackupService) {
    super();
  }

  async process(): Promise<void> {
    const { started, purged } = await this.backups.runDue();
    if (started > 0 || purged > 0) this.logger.log(`Backups: started ${started}, purged ${purged}`);
  }
}
