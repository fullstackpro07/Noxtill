import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../common/storage/s3.service';
import { resolvePolicies } from '../common/policies/policies.service';
import { DataExportsService } from './data-exports.service';
import { BACKUP_INTERVAL_MS } from './backup.constants';

/**
 * Scheduled data backups: a full "everything" export, kept for the business's own retention
 * period. It is a portable copy of the business's records, not a database snapshot — Noxtill has
 * no in-app restore, so nothing here claims one.
 */
@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
    private readonly dataExports: DataExportsService,
  ) {}

  /** The person a scheduled backup is recorded against: the business's owner. */
  private async ownerOf(businessId: string): Promise<string | null> {
    const owner = await this.prisma.businessUser.findFirst({ where: { businessId, role: 'owner', active: true } });
    return owner?.userId ?? null;
  }

  async startBackup(businessId: string, requestedByUserId?: string): Promise<{ id: string } | null> {
    const userId = requestedByUserId ?? (await this.ownerOf(businessId));
    if (!userId) return null;
    const job = await this.dataExports.create(businessId, userId, { scope: 'everything', format: 'csv' }, 'backup');
    return { id: job.id };
  }

  /** Called on a schedule: starts a backup for each business that is due, then purges expired ones. */
  async runDue(now = new Date()): Promise<{ started: number; purged: number }> {
    const businesses = await this.prisma.business.findMany({ where: { active: true }, select: { id: true, policies: true } });
    let started = 0;
    let purged = 0;
    for (const b of businesses) {
      const policies = resolvePolicies(b);
      try {
        if (policies.bool('backup.enabled')) {
          const last = await this.prisma.dataExportJob.findFirst({
            where: { businessId: b.id, trigger: 'backup', status: { in: ['ready', 'queued', 'preparing'] } },
            orderBy: { createdAt: 'desc' },
          });
          if (!last || now.getTime() - last.createdAt.getTime() >= BACKUP_INTERVAL_MS) {
            if (await this.startBackup(b.id)) started += 1;
          }
        }
        purged += await this.purgeExpired(b.id, policies.num('backup.retentionDays') ?? 30, now);
      } catch (error) {
        this.logger.error(`Backup run failed for business ${b.id}: ${(error as Error).message}`);
      }
    }
    return { started, purged };
  }

  /** Deletes backups (file and record) older than the retention period. */
  async purgeExpired(businessId: string, retentionDays: number, now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
    const old = await this.prisma.dataExportJob.findMany({ where: { businessId, trigger: 'backup', createdAt: { lt: cutoff } } });
    for (const job of old) {
      if (job.fileKey) await this.s3.delete(job.fileKey).catch(() => undefined);
      await this.prisma.dataExportJob.delete({ where: { id: job.id } });
    }
    return old.length;
  }

  /** A fresh download link for the newest finished backup. Backups outlive the 24-hour link of a normal export. */
  async latestDownload(businessId: string): Promise<{ url: string; createdAt: Date } | null> {
    const job = await this.prisma.dataExportJob.findFirst({
      where: { businessId, trigger: 'backup', status: 'ready', fileKey: { not: null } },
      orderBy: { createdAt: 'desc' },
    });
    if (!job?.fileKey) return null;
    return { url: await this.s3.getSignedDownloadUrl(job.fileKey, 15 * 60), createdAt: job.createdAt };
  }
}
