import { Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { ClsService } from 'nestjs-cls';
import { CLS_KEY_BUSINESS_ID } from '../common/tenancy/tenant.constants';
import {
  SPECIALIST_AGENT_ORCHESTRATION_JOB_ATTEMPTS,
  SPECIALIST_AGENT_ORCHESTRATION_QUEUE,
} from './specialist-agent-orchestration.constants';
import { SpecialistAgentRetentionService } from './specialist-agent-retention.service';
import {
  SpecialistAgentOrchestrationJobData,
  SpecialistAgentOrchestrationService,
} from './specialist-agent-orchestration.service';

@Processor(SPECIALIST_AGENT_ORCHESTRATION_QUEUE, { concurrency: 1 })
export class SpecialistAgentOrchestrationProcessor extends WorkerHost {
  private readonly logger = new Logger(
    SpecialistAgentOrchestrationProcessor.name,
  );

  constructor(
    private readonly cls: ClsService,
    private readonly orchestration: SpecialistAgentOrchestrationService,
    private readonly retention: SpecialistAgentRetentionService,
  ) {
    super();
  }

  async process(
    job: Job<SpecialistAgentOrchestrationJobData | Record<string, never>>,
  ): Promise<void> {
    if (job.name === 'recover') {
      await this.orchestration.recoverPendingRuns();
      return;
    }
    if (job.name === 'retention') {
      await this.retention.runDue();
      return;
    }
    if (job.name !== 'run') return;

    const data = job.data as SpecialistAgentOrchestrationJobData;
    await this.cls.run(async () => {
      this.cls.set(CLS_KEY_BUSINESS_ID, data.businessId);
      await this.orchestration.processQueuedRun(data, job.attemptsMade);
    });
  }

  @OnWorkerEvent('failed')
  async onFailed(
    job: Job<SpecialistAgentOrchestrationJobData> | undefined,
    error: Error,
  ) {
    if (!job || job.name !== 'run') return;
    this.logger.warn(
      `Specialist orchestration ${job.data.parentRunId} failed on attempt ${job.attemptsMade}: ${error.message}`,
    );
    if (
      job.attemptsMade <
      (job.opts.attempts ?? SPECIALIST_AGENT_ORCHESTRATION_JOB_ATTEMPTS)
    ) {
      return;
    }
    await this.orchestration.markQueueFailure(
      job.data,
      error,
      job.attemptsMade,
    );
  }

  @OnWorkerEvent('error')
  onWorkerError(error: Error) {
    this.logger.warn(`Specialist orchestration worker error: ${error.message}`);
  }
}
