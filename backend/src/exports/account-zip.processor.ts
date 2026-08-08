import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { ZipArchive } from 'archiver';
import { PassThrough } from 'stream';
import { ExportsService } from './exports.service';
import { S3Service } from '../common/storage/s3.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EXPORT_KINDS, EXPORTS_QUEUE } from './exports.constants';

interface AccountZipJobData {
  businessId: string;
  userId: string;
}

function buildZipBuffer(entries: { name: string; buffer: Buffer }[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = new ZipArchive({ zlib: { level: 9 } });
    const chunks: Buffer[] = [];
    const stream = new PassThrough();

    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);

    archive.pipe(stream);
    for (const entry of entries) {
      archive.append(entry.buffer, { name: entry.name });
    }
    void archive.finalize();
  });
}

/**
 * "Export everything" (BE-077, owner-only): the one genuinely large/slow
 * export operation, so it's the one that's actually queued — every other
 * export/report in this ticket generates synchronously like every existing
 * PDF/xlsx service in the codebase.
 */
@Processor(EXPORTS_QUEUE)
export class AccountZipProcessor extends WorkerHost {
  private readonly logger = new Logger(AccountZipProcessor.name);

  constructor(
    private readonly exportsService: ExportsService,
    private readonly s3: S3Service,
    private readonly notifications: NotificationsService,
  ) {
    super();
  }

  async process(job: Job<AccountZipJobData>): Promise<void> {
    const { businessId, userId } = job.data;

    const entries = await Promise.all(
      EXPORT_KINDS.map(async (kind) => ({
        name: `${kind}.xlsx`,
        buffer: await this.exportsService.buildXlsxBuffer(businessId, kind),
      })),
    );

    const zip = await buildZipBuffer(entries);
    const key = `exports/${businessId}/account-${Date.now()}.zip`;
    const url = await this.s3.uploadAndSign(key, zip, 'application/zip');

    await this.notifications.create(businessId, userId, {
      title: 'Export ready',
      body: 'Your full account export is ready to download.',
      link: url,
    });

    this.logger.debug(`Account zip export ready for business ${businessId}`);
  }
}
