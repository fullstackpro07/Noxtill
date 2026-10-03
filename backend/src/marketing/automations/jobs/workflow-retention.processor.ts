import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import {
  WorkflowApprovalStatus,
  WorkflowDeadLetterStatus,
  WorkflowRunStatus,
} from '@prisma/client';
import { Job } from 'bullmq';
import { resolvePolicies } from '../../../common/policies/policies.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { WORKFLOW_RETENTION_QUEUE } from '../workflows.constants';

/**
 * Nightly cleanup runs without request CLS, so every query carries its explicit business id.
 * Active/waiting work, pending approvals and open Recovery items are intentionally protected.
 */
@Processor(WORKFLOW_RETENTION_QUEUE)
@Injectable()
export class WorkflowRetentionProcessor extends WorkerHost {
  private readonly logger = new Logger(WorkflowRetentionProcessor.name);

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== 'cleanup') return;
    const businesses = await this.prisma.business.findMany({
      select: { id: true, policies: true },
      orderBy: { id: 'asc' },
    });

    for (const business of businesses) {
      const retentionDays = resolvePolicies(business).num(
        'automations.runRetentionDays',
      );
      if (retentionDays === null) continue;
      try {
        const result = await this.cleanupBusiness(business.id, retentionDays);
        this.logger.log(
          `Run-history retention for business ${business.id}: ${result.deletedRuns} deleted, ${retentionDays} days`,
        );
      } catch (error) {
        this.logger.error(
          `Run-history retention failed for business ${business.id}: ${(error as Error).message}`,
        );
      }
    }
  }

  async cleanupBusiness(
    businessId: string,
    retentionDays: number,
    now = new Date(),
  ): Promise<{ deletedRuns: number; cutoffAt: Date; cleanedAt: Date }> {
    const cutoffAt = new Date(
      now.getTime() - retentionDays * 24 * 60 * 60 * 1000,
    );
    const cleanedAt = now;
    return this.prisma.$transaction(async (tx) => {
      const deleted = await tx.workflowRun.deleteMany({
        where: {
          businessId,
          status: {
            in: [
              WorkflowRunStatus.success,
              WorkflowRunStatus.failed,
              WorkflowRunStatus.skipped,
              WorkflowRunStatus.cancelled,
            ],
          },
          createdAt: { lt: cutoffAt },
          approvals: { none: { status: WorkflowApprovalStatus.pending } },
          deadLetter: {
            isNot: { status: WorkflowDeadLetterStatus.open },
          },
        },
      });
      await tx.workflowRetentionCleanup.create({
        data: {
          businessId,
          retentionDays,
          deletedRuns: deleted.count,
          cutoffAt,
          cleanedAt,
        },
      });
      return { deletedRuns: deleted.count, cutoffAt, cleanedAt };
    });
  }
}
